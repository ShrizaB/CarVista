const express = require('express');
const db = require('../db');
const { authRequired, activeOnly } = require('../middleware/auth');
const { getRoute, haversineKm } = require('../utils/maps');
const { notifyUser } = require('../utils/notify');

const router = express.Router();
router.use(authRequired);

// ---------------------------------------------------------
// POST /api/rides  -- "Offer a Ride"
// ---------------------------------------------------------
router.post('/', activeOnly, async (req, res) => {
  const {
    vehicleId, pickupAddress, pickupLat, pickupLng,
    destinationAddress, destinationLat, destinationLng,
    travelDate, travelTime, availableSeats, farePerSeat,
    isRecurring, recurringDays, recurringWeeks,
  } = req.body;

  if (!vehicleId || !pickupAddress || !destinationAddress || !travelDate || !travelTime || !availableSeats || !farePerSeat) {
    return res.status(400).json({ error: 'Missing required fields to publish a ride.' });
  }

  try {
    const vehicleRes = await db.query('SELECT * FROM vehicles WHERE id = $1 AND owner_id = $2 AND is_active = TRUE', [
      vehicleId, req.user.id,
    ]);
    if (!vehicleRes.rows.length) {
      return res.status(404).json({ error: 'Vehicle not found. Please register a vehicle before publishing a ride.' });
    }
    const vehicle = vehicleRes.rows[0];
    if (availableSeats > vehicle.seating_capacity) {
      return res.status(400).json({ error: `This vehicle can seat at most ${vehicle.seating_capacity} passengers.` });
    }

    // Edge case: duplicate publish (e.g. double-tap on "Confirm & Publish").
    // If an identical published/full ride already exists for this exact
    // route/date/time, return it instead of inserting a clashing duplicate.
    const dupe = await db.query(
      `SELECT * FROM rides WHERE driver_id = $1 AND vehicle_id = $2
         AND pickup_lat = $3 AND pickup_lng = $4
         AND destination_lat = $5 AND destination_lng = $6
         AND travel_date = $7 AND travel_time = $8
         AND status IN ('published','full')
       LIMIT 1`,
      [req.user.id, vehicleId, pickupLat, pickupLng, destinationLat, destinationLng, travelDate, travelTime]
    );
    if (dupe.rows.length) {
      return res.status(200).json({ ride: dupe.rows[0], duplicate: true });
    }

    const route = await getRoute(
      { lat: pickupLat, lng: pickupLng },
      { lat: destinationLat, lng: destinationLng }
    );

    const recurring = Boolean(isRecurring) && Array.isArray(recurringDays) && recurringDays.length > 0;

    if (!recurring) {
      const result = await db.query(
        `INSERT INTO rides (
           driver_id, vehicle_id, organization_id,
           pickup_address, pickup_lat, pickup_lng,
           destination_address, destination_lat, destination_lng,
           route_geometry, distance_km, duration_min,
           travel_date, travel_time, is_recurring, recurring_days,
           available_seats, total_seats, fare_per_seat
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17,$18)
         RETURNING *`,
        [
          req.user.id, vehicleId, req.user.organizationId,
          pickupAddress, pickupLat, pickupLng,
          destinationAddress, destinationLat, destinationLng,
          JSON.stringify(route.geometry), route.distanceKm, route.durationMin,
          travelDate, travelTime, false, null,
          availableSeats, farePerSeat,
        ]
      );
      return res.status(201).json({ ride: result.rows[0], route });
    }

    // ---- Recurring ride: generate one occurrence row per matching weekday
    // for the next N weeks (default 8). Every occurrence shares a
    // recurring_group_id so a driver can later cancel "just this ride" (a
    // single occurrence) or "all future rides" (the whole group).
    const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    const weeks = Math.min(Math.max(parseInt(recurringWeeks || '8', 10), 1), 26);
    const groupRes = await db.query('SELECT gen_random_uuid() AS id');
    const groupId = groupRes.rows[0].id;

    const startDate = new Date(`${travelDate}T00:00:00`);
    const occurrenceDates = [];
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      if (recurringDays.includes(WEEKDAY_CODES[d.getDay()])) {
        occurrenceDates.push(d.toISOString().slice(0, 10));
      }
    }
    if (!occurrenceDates.length) {
      return res.status(400).json({ error: 'No matching recurring days found on/after the selected date.' });
    }

    const inserted = [];
    for (let i = 0; i < occurrenceDates.length; i++) {
      const occDate = occurrenceDates[i];
      const result = await db.query(
        `INSERT INTO rides (
           driver_id, vehicle_id, organization_id,
           pickup_address, pickup_lat, pickup_lng,
           destination_address, destination_lat, destination_lng,
           route_geometry, distance_km, duration_min,
           travel_date, travel_time, is_recurring, recurring_days,
           recurring_group_id, is_series_parent,
           available_seats, total_seats, fare_per_seat
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$19,$20)
         RETURNING *`,
        [
          req.user.id, vehicleId, req.user.organizationId,
          pickupAddress, pickupLat, pickupLng,
          destinationAddress, destinationLat, destinationLng,
          JSON.stringify(route.geometry), route.distanceKm, route.durationMin,
          occDate, travelTime, true, recurringDays,
          groupId, i === 0,
          availableSeats, farePerSeat,
        ]
      );
      inserted.push(result.rows[0]);
    }

    res.status(201).json({ ride: inserted[0], occurrences: inserted.length, recurringGroupId: groupId, route });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not publish ride.' });
  }
});

// ---------------------------------------------------------
// GET /api/rides/search -- "Find a Ride"
// Matches rides in the same organization whose pickup & destination are
// within a proximity radius of the searcher's requested points, on the
// requested date, with enough available seats.
// ---------------------------------------------------------
router.get('/search', activeOnly, async (req, res) => {
  const { pickupLat, pickupLng, destinationLat, destinationLng, date, seats, radiusKm } = req.query;
  if (!pickupLat || !destinationLat || !date) {
    return res.status(400).json({ error: 'pickupLat/pickupLng, destinationLat/destinationLng and date are required.' });
  }
  const requestedSeats = parseInt(seats || '1', 10);
  const radius = parseFloat(radiusKm || '3'); // km

  try {
    const result = await db.query(
      `SELECT r.*, u.full_name AS driver_name, u.phone AS driver_phone, u.rating AS driver_rating,
              v.model AS vehicle_model, v.registration_number, v.color AS vehicle_color
       FROM rides r
       JOIN users u ON u.id = r.driver_id
       JOIN vehicles v ON v.id = r.vehicle_id
       WHERE r.organization_id = $1
         AND r.status = 'published'
         AND r.travel_date = $2
         AND r.available_seats >= $3
         AND r.driver_id != $4`,
      [req.user.organizationId, date, requestedSeats, req.user.id]
    );

    const pickup = { lat: parseFloat(pickupLat), lng: parseFloat(pickupLng) };
    const destination = { lat: parseFloat(destinationLat), lng: parseFloat(destinationLng) };

    const matches = result.rows
      .map((ride) => {
        const pickupDistance = haversineKm(pickup, { lat: ride.pickup_lat, lng: ride.pickup_lng });
        const destDistance = haversineKm(destination, { lat: ride.destination_lat, lng: ride.destination_lng });
        return { ...ride, pickupDistanceKm: Number(pickupDistance.toFixed(2)), destinationDistanceKm: Number(destDistance.toFixed(2)) };
      })
      .filter((r) => r.pickupDistanceKm <= radius && r.destinationDistanceKm <= radius)
      .sort((a, b) => (a.pickupDistanceKm + a.destinationDistanceKm) - (b.pickupDistanceKm + b.destinationDistanceKm));

    res.json({ rides: matches });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Ride search failed.' });
  }
});

// ---------------------------------------------------------
// GET /api/rides/mine -- rides I've published as driver
// ---------------------------------------------------------
router.get('/mine', async (req, res) => {
  const result = await db.query(
    `SELECT r.*, v.model AS vehicle_model, v.registration_number,
       (SELECT COUNT(*) FROM bookings b WHERE b.ride_id = r.id AND b.trip_status != 'cancelled') AS booked_count
     FROM rides r JOIN vehicles v ON v.id = r.vehicle_id
     WHERE r.driver_id = $1 ORDER BY r.travel_date DESC, r.travel_time DESC`,
    [req.user.id]
  );
  res.json({ rides: result.rows });
});

router.get('/:id', async (req, res) => {
  const result = await db.query(
    `SELECT r.*, u.full_name AS driver_name, u.phone AS driver_phone, u.rating AS driver_rating,
            v.model AS vehicle_model, v.registration_number, v.color AS vehicle_color
     FROM rides r JOIN users u ON u.id = r.driver_id JOIN vehicles v ON v.id = r.vehicle_id
     WHERE r.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Ride not found.' });
  res.json({ ride: result.rows[0] });
});

// ---------------------------------------------------------
// GET /api/rides/:id/passengers -- driver's view of everyone booked on a ride
// (Trip Management needs the full passenger list, not just one booking.)
// ---------------------------------------------------------
router.get('/:id/passengers', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.id, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });

  const result = await db.query(
    `SELECT b.id AS booking_id, b.seats_booked, b.fare_total, b.trip_status, b.payment_status, b.created_at,
            u.id AS passenger_id, u.full_name AS passenger_name, u.phone AS passenger_phone, u.rating AS passenger_rating
     FROM bookings b JOIN users u ON u.id = b.passenger_id
     WHERE b.ride_id = $1 ORDER BY b.created_at ASC`,
    [req.params.id]
  );
  res.json({ passengers: result.rows });
});

// Cancel just this single occurrence (works for both one-off and recurring rides).
router.put('/:id/cancel', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.id, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });

  await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = $1`, [req.params.id]);
  const bookings = await db.query(
    `UPDATE bookings SET trip_status = 'cancelled', cancel_reason = 'Driver cancelled the ride', cancelled_at = now()
     WHERE ride_id = $1 AND trip_status IN ('booked') RETURNING *`,
    [req.params.id]
  );
  for (const b of bookings.rows) {
    await notifyUser(b.passenger_id, 'Ride cancelled', 'Your driver has cancelled this ride. Please find another ride.', 'ride_cancelled');
  }
  res.json({ ok: true, cancelledBookings: bookings.rows.length });
});

// Edge case: cancelling a single occurrence of a recurring ride must not
// cancel the whole series. This endpoint is the explicit "Cancel all future
// rides" choice — it cancels this occurrence AND every future occurrence in
// the same recurring_group_id, leaving past/completed occurrences untouched.
router.put('/:id/cancel-series', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.id, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });
  const ride = rideRes.rows[0];
  if (!ride.is_recurring || !ride.recurring_group_id) {
    return res.status(400).json({ error: 'This ride is not part of a recurring series.' });
  }

  const seriesRides = await db.query(
    `SELECT id FROM rides WHERE recurring_group_id = $1 AND driver_id = $2
       AND status IN ('published','full') AND travel_date >= $3`,
    [ride.recurring_group_id, req.user.id, ride.travel_date]
  );
  const rideIds = seriesRides.rows.map((r) => r.id);
  if (!rideIds.length) return res.json({ ok: true, cancelledRides: 0, cancelledBookings: 0 });

  await db.query(`UPDATE rides SET status = 'cancelled' WHERE id = ANY($1::uuid[])`, [rideIds]);
  const bookings = await db.query(
    `UPDATE bookings SET trip_status = 'cancelled', cancel_reason = 'Driver cancelled all future rides in this series', cancelled_at = now()
     WHERE ride_id = ANY($1::uuid[]) AND trip_status = 'booked' RETURNING *`,
    [rideIds]
  );
  for (const b of bookings.rows) {
    await notifyUser(b.passenger_id, 'Recurring ride series cancelled', 'Your driver has cancelled all future rides in this series. Please find another ride.', 'ride_cancelled');
  }
  res.json({ ok: true, cancelledRides: rideIds.length, cancelledBookings: bookings.rows.length });
});

module.exports = router;
