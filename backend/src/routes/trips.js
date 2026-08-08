const express = require('express');
const db = require('../db');
const { authRequired, activeOnly } = require('../middleware/auth');
const { notifyUser } = require('../utils/notify');

const router = express.Router();
router.use(authRequired);

// ---------------------------------------------------------
// POST /api/trips/book -- passenger books seats on a ride
// ---------------------------------------------------------
router.post('/book', activeOnly, async (req, res) => {
  const { rideId, seats } = req.body;
  const seatsBooked = parseInt(seats || '1', 10);
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const rideRes = await client.query('SELECT * FROM rides WHERE id = $1 FOR UPDATE', [rideId]);
    if (!rideRes.rows.length) throw { status: 404, message: 'Ride not found.' };
    const ride = rideRes.rows[0];

    if (ride.status !== 'published') throw { status: 400, message: 'This ride is no longer available.' };
    if (ride.driver_id === req.user.id) throw { status: 400, message: 'You cannot book your own ride.' };
    if (ride.available_seats < seatsBooked) throw { status: 400, message: 'Not enough seats available.' };

    const fareTotal = Number(ride.fare_per_seat) * seatsBooked;

    const bookingRes = await client.query(
      `INSERT INTO bookings (ride_id, passenger_id, seats_booked, fare_total)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [rideId, req.user.id, seatsBooked, fareTotal]
    );

    const newAvailable = ride.available_seats - seatsBooked;
    await client.query(
      `UPDATE rides SET available_seats = $1, status = CASE WHEN $1 = 0 THEN 'full' ELSE status END WHERE id = $2`,
      [newAvailable, rideId]
    );

    await client.query('COMMIT');
    await notifyUser(ride.driver_id, 'New booking', 'A passenger has booked seats on your ride.', 'ride_booked');
    res.status(201).json({ booking: bookingRes.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    console.error(err.message || err);
    res.status(status).json({ error: err.message || 'Booking failed.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------
// GET /api/trips/mine -- "My Trips": bookings I made as passenger
//                        + rides I'm driving with active bookings
// ---------------------------------------------------------
router.get('/mine', async (req, res) => {
  const asPassenger = await db.query(
    `SELECT * FROM trip_details WHERE passenger_id = $1 AND trip_status NOT IN ('completed','cancelled')
     ORDER BY travel_date, travel_time`,
    [req.user.id]
  );
  const asDriver = await db.query(
    `SELECT * FROM trip_details WHERE driver_id = $1 AND trip_status NOT IN ('completed','cancelled')
     ORDER BY travel_date, travel_time`,
    [req.user.id]
  );
  res.json({ asPassenger: asPassenger.rows, asDriver: asDriver.rows });
});

// ---------------------------------------------------------
// GET /api/trips/history -- Ride History (completed / cancelled)
// ---------------------------------------------------------
router.get('/history', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM trip_details WHERE (passenger_id = $1 OR driver_id = $1) AND trip_status IN ('completed','cancelled')
     ORDER BY travel_date DESC, travel_time DESC`,
    [req.user.id]
  );
  res.json({ trips: result.rows });
});

router.get('/:bookingId', async (req, res) => {
  const result = await db.query('SELECT * FROM trip_details WHERE booking_id = $1', [req.params.bookingId]);
  if (!result.rows.length) return res.status(404).json({ error: 'Trip not found.' });
  const trip = result.rows[0];
  if (trip.driver_id !== req.user.id && trip.passenger_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not have access to this trip.' });
  }
  res.json({ trip });
});

// ---------------------------------------------------------
// Trip lifecycle: started -> in_progress -> completed (driver-controlled)
// ---------------------------------------------------------
router.put('/ride/:rideId/start', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.rideId, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });

  const result = await db.query(
    `UPDATE bookings SET trip_status = 'started', trip_started_at = now()
     WHERE ride_id = $1 AND trip_status = 'booked' RETURNING *, (SELECT passenger_id FROM bookings WHERE id = bookings.id)`,
    [req.params.rideId]
  );
  for (const b of result.rows) {
    await notifyUser(b.passenger_id, 'Trip started', 'Your driver has started the trip. Track it live in My Trips.', 'trip_started');
  }
  res.json({ ok: true, updated: result.rows.length });
});

router.put('/ride/:rideId/in-progress', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.rideId, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });
  await db.query(`UPDATE bookings SET trip_status = 'in_progress' WHERE ride_id = $1 AND trip_status = 'started'`, [req.params.rideId]);
  res.json({ ok: true });
});

router.put('/ride/:rideId/complete', async (req, res) => {
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.rideId, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });

  const result = await db.query(
    `UPDATE bookings SET trip_status = 'completed', trip_completed_at = now()
     WHERE ride_id = $1 AND trip_status IN ('started','in_progress') RETURNING *`,
    [req.params.rideId]
  );
  await db.query(`UPDATE rides SET status = 'completed' WHERE id = $1`, [req.params.rideId]);
  for (const b of result.rows) {
    await notifyUser(b.passenger_id, 'Trip completed', 'You have arrived. Please complete your payment.', 'trip_completed');
  }
  res.json({ ok: true, updated: result.rows.length });
});

// ---------------------------------------------------------
// Edge case: passenger no-show. Available to the driver once a grace period
// (default 10 min) has elapsed after the ride's scheduled pickup time.
// Marks the booking, no manual dispute/chat required, and dents the
// passenger's reliability rating directly.
// ---------------------------------------------------------
const NO_SHOW_GRACE_MINUTES = 10;

router.put('/:bookingId/no-show', async (req, res) => {
  const bookingRes = await db.query(
    `SELECT b.*, r.driver_id, r.travel_date, r.travel_time
     FROM bookings b JOIN rides r ON r.id = b.ride_id
     WHERE b.id = $1`,
    [req.params.bookingId]
  );
  if (!bookingRes.rows.length) return res.status(404).json({ error: 'Booking not found.' });
  const booking = bookingRes.rows[0];

  if (booking.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the driver can mark a passenger as a no-show.' });
  }
  if (!['booked', 'started'].includes(booking.trip_status)) {
    return res.status(400).json({ error: 'This trip is no longer eligible to be marked no-show.' });
  }

  const scheduledAt = new Date(`${booking.travel_date.toISOString().slice(0, 10)}T${booking.travel_time}`);
  const graceExpiresAt = new Date(scheduledAt.getTime() + NO_SHOW_GRACE_MINUTES * 60 * 1000);
  if (new Date() < graceExpiresAt) {
    return res.status(400).json({
      error: `Please wait until ${NO_SHOW_GRACE_MINUTES} minutes after the scheduled pickup time before marking a no-show.`,
      graceExpiresAt,
    });
  }

  const result = await db.query(
    `UPDATE bookings SET trip_status = 'no_show', no_show_at = now() WHERE id = $1 RETURNING *`,
    [req.params.bookingId]
  );

  // Reliability rating impact -- applied automatically, no dispute step needed.
  await db.query(
    `INSERT INTO ratings (booking_id, rater_id, ratee_id, stars, comment)
     VALUES ($1,$2,$3,2,'Automatic: marked as no-show')`,
    [req.params.bookingId, req.user.id, booking.passenger_id]
  );
  const avgRes = await db.query('SELECT AVG(stars)::numeric(3,2) AS avg FROM ratings WHERE ratee_id = $1', [booking.passenger_id]);
  await db.query('UPDATE users SET rating = $1 WHERE id = $2', [avgRes.rows[0].avg, booking.passenger_id]);

  await notifyUser(booking.passenger_id, 'Marked as no-show', 'You were marked as a no-show for a scheduled ride.', 'no_show');
  res.json({ ok: true, booking: result.rows[0] });
});

router.put('/:bookingId/cancel', async (req, res) => {
  const result = await db.query(
    `UPDATE bookings SET trip_status = 'cancelled', cancel_reason = $1, cancelled_at = now()
     WHERE id = $2 AND passenger_id = $3 AND trip_status = 'booked' RETURNING *`,
    [req.body.reason || 'Cancelled by passenger', req.params.bookingId, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Booking not found or cannot be cancelled.' });
  const booking = result.rows[0];
  await db.query(
    `UPDATE rides SET available_seats = available_seats + $1, status = 'published' WHERE id = $2`,
    [booking.seats_booked, booking.ride_id]
  );
  res.json({ ok: true });
});

// ---------------------------------------------------------
// Live Trip Tracking
// ---------------------------------------------------------
router.post('/ride/:rideId/location', async (req, res) => {
  const { latitude, longitude, heading, speedKmph } = req.body;
  const rideRes = await db.query('SELECT * FROM rides WHERE id = $1 AND driver_id = $2', [req.params.rideId, req.user.id]);
  if (!rideRes.rows.length) return res.status(404).json({ error: 'Ride not found.' });

  const result = await db.query(
    `INSERT INTO trip_locations (ride_id, latitude, longitude, heading, speed_kmph)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.rideId, latitude, longitude, heading, speedKmph]
  );
  res.status(201).json({ location: result.rows[0] });
});

router.get('/ride/:rideId/location', async (req, res) => {
  const result = await db.query(
    `SELECT * FROM trip_locations WHERE ride_id = $1 ORDER BY recorded_at DESC LIMIT 1`,
    [req.params.rideId]
  );
  res.json({ location: result.rows[0] || null });
});

// ---------------------------------------------------------
// Chat (REST history; live delivery happens over Socket.IO)
// ---------------------------------------------------------
router.get('/ride/:rideId/messages', async (req, res) => {
  const result = await db.query(
    `SELECT cm.*, u.full_name AS sender_name FROM chat_messages cm
     JOIN users u ON u.id = cm.sender_id WHERE ride_id = $1 ORDER BY created_at ASC`,
    [req.params.rideId]
  );
  res.json({ messages: result.rows });
});

// ---------------------------------------------------------
// Ratings
// ---------------------------------------------------------
router.post('/:bookingId/rate', async (req, res) => {
  const { rateeId, stars, comment } = req.body;
  const result = await db.query(
    `INSERT INTO ratings (booking_id, rater_id, ratee_id, stars, comment) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.params.bookingId, req.user.id, rateeId, stars, comment]
  );
  const avgRes = await db.query('SELECT AVG(stars)::numeric(3,2) AS avg FROM ratings WHERE ratee_id = $1', [rateeId]);
  await db.query('UPDATE users SET rating = $1 WHERE id = $2', [avgRes.rows[0].avg, rateeId]);
  res.status(201).json({ rating: result.rows[0] });
});

module.exports = router;
