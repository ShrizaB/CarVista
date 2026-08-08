const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// Personal reports for the logged-in employee
router.get('/me', async (req, res) => {
  const userId = req.user.id;

  const totals = await db.query(
    `SELECT
       COUNT(*) FILTER (WHERE trip_status = 'completed') AS total_trips,
       COALESCE(SUM(distance_km) FILTER (WHERE trip_status = 'completed'), 0) AS total_distance_km,
       COALESCE(SUM(fare_total) FILTER (WHERE trip_status = 'completed' AND passenger_id = $1), 0) AS total_spent
     FROM trip_details WHERE (passenger_id = $1 OR driver_id = $1)`,
    [userId]
  );

  const orgRes = await db.query('SELECT avg_fuel_efficiency, fuel_cost_per_litre FROM organizations WHERE id = $1', [
    req.user.organizationId,
  ]);
  const { avg_fuel_efficiency, fuel_cost_per_litre } = orgRes.rows[0];

  const asDriver = await db.query(
    `SELECT COALESCE(SUM(distance_km),0) AS distance_km FROM trip_details
     WHERE driver_id = $1 AND trip_status = 'completed'`,
    [userId]
  );
  const distanceAsDriver = Number(asDriver.rows[0].distance_km);
  const fuelConsumedLitres = distanceAsDriver / Number(avg_fuel_efficiency || 15);
  const fuelCost = fuelConsumedLitres * Number(fuel_cost_per_litre || 100);

  const monthly = await db.query(
    `SELECT to_char(travel_date, 'YYYY-MM') AS month,
            COUNT(*) FILTER (WHERE trip_status = 'completed') AS trips,
            COALESCE(SUM(distance_km) FILTER (WHERE trip_status='completed'),0) AS distance_km
     FROM trip_details WHERE (passenger_id = $1 OR driver_id = $1)
     GROUP BY month ORDER BY month DESC LIMIT 12`,
    [userId]
  );

  res.json({
    totals: totals.rows[0],
    fuel: {
      distanceAsDriverKm: distanceAsDriver,
      litresConsumed: Number(fuelConsumedLitres.toFixed(2)),
      estimatedFuelCost: Number(fuelCost.toFixed(2)),
      avgFuelEfficiencyKmpl: Number(avg_fuel_efficiency),
    },
    monthlyTrend: monthly.rows,
  });
});

// Vehicle-wise cost analysis for the logged-in driver's own vehicles
router.get('/me/vehicles', async (req, res) => {
  const result = await db.query(
    `SELECT v.id, v.model, v.registration_number,
            COUNT(td.*) FILTER (WHERE td.trip_status='completed') AS trips,
            COALESCE(SUM(td.distance_km) FILTER (WHERE td.trip_status='completed'),0) AS distance_km,
            COALESCE(SUM(td.fare_total) FILTER (WHERE td.trip_status='completed'),0) AS revenue
     FROM vehicles v
     LEFT JOIN rides r ON r.vehicle_id = v.id
     LEFT JOIN trip_details td ON td.ride_id = r.id
     WHERE v.owner_id = $1
     GROUP BY v.id ORDER BY v.created_at DESC`,
    [req.user.id]
  );
  res.json({ vehicles: result.rows });
});

// Organization-wide reports (Company Administrator dashboard)
router.get('/organization', authRequired, async (req, res) => {
  if (req.user.role !== 'company_admin') return res.status(403).json({ error: 'Administrator access required.' });
  const orgId = req.user.organizationId;

  const orgRes = await db.query('SELECT avg_fuel_efficiency, fuel_cost_per_litre FROM organizations WHERE id = $1', [orgId]);
  const { avg_fuel_efficiency, fuel_cost_per_litre } = orgRes.rows[0];

  const summary = await db.query(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE organization_id = $1 AND role='employee') AS total_employees,
       (SELECT COUNT(*) FROM vehicles v JOIN users u ON u.id = v.owner_id WHERE u.organization_id = $1) AS total_vehicles,
       (SELECT COUNT(*) FROM rides WHERE organization_id = $1 AND status='completed') AS completed_rides,
       (SELECT COALESCE(SUM(distance_km),0) FROM rides WHERE organization_id = $1 AND status='completed') AS total_distance_km,
       (SELECT COALESCE(SUM(fare_total),0) FROM trip_details WHERE organization_id = $1 AND trip_status='completed') AS total_fare_collected
    `,
    [orgId]
  );

  const row = summary.rows[0];
  const totalDistanceKm = Number(row.total_distance_km);
  const litresConsumed = totalDistanceKm / Number(avg_fuel_efficiency || 15);
  const estimatedFuelCost = litresConsumed * Number(fuel_cost_per_litre || 100);
  const costPerKm = totalDistanceKm > 0 ? estimatedFuelCost / totalDistanceKm : 0;

  const trend = await db.query(
    `SELECT to_char(travel_date,'YYYY-MM') AS month, COUNT(*) AS rides,
            COALESCE(SUM(distance_km),0) AS distance_km
     FROM rides WHERE organization_id = $1 AND status = 'completed'
     GROUP BY month ORDER BY month DESC LIMIT 12`,
    [orgId]
  );

  // Fuel efficiency trend: litres consumed & cost per month, derived from the
  // org's configured average efficiency and fuel price.
  const fuelTrend = trend.rows.map((m) => {
    const km = Number(m.distance_km);
    const litres = km / Number(avg_fuel_efficiency || 15);
    return {
      month: m.month,
      distanceKm: km,
      litresConsumed: Number(litres.toFixed(2)),
      fuelCost: Number((litres * Number(fuel_cost_per_litre || 100)).toFixed(2)),
    };
  });

  res.json({
    summary: {
      ...row,
      fuel_consumption_litres: Number(litresConsumed.toFixed(2)),
      estimated_fuel_cost: Number(estimatedFuelCost.toFixed(2)),
      cost_per_km: Number(costPerKm.toFixed(2)),
      avg_fuel_efficiency_kmpl: Number(avg_fuel_efficiency),
      fuel_cost_per_litre: Number(fuel_cost_per_litre),
    },
    monthlyTrend: trend.rows,
    fuelEfficiencyTrend: fuelTrend,
  });
});

// Organization-wide vehicle-wise cost analysis (Company Administrator)
router.get('/organization/vehicles', authRequired, async (req, res) => {
  if (req.user.role !== 'company_admin') return res.status(403).json({ error: 'Administrator access required.' });
  const orgId = req.user.organizationId;

  const orgRes = await db.query('SELECT avg_fuel_efficiency, fuel_cost_per_litre FROM organizations WHERE id = $1', [orgId]);
  const { avg_fuel_efficiency, fuel_cost_per_litre } = orgRes.rows[0];

  const result = await db.query(
    `SELECT v.id, v.model, v.registration_number, u.full_name AS owner_name,
            COUNT(td.*) FILTER (WHERE td.trip_status='completed') AS trips,
            COALESCE(SUM(td.distance_km) FILTER (WHERE td.trip_status='completed'),0) AS distance_km,
            COALESCE(SUM(td.fare_total) FILTER (WHERE td.trip_status='completed'),0) AS revenue
     FROM vehicles v
     JOIN users u ON u.id = v.owner_id
     LEFT JOIN rides r ON r.vehicle_id = v.id AND r.organization_id = $1
     LEFT JOIN trip_details td ON td.ride_id = r.id
     WHERE u.organization_id = $1
     GROUP BY v.id, u.full_name ORDER BY distance_km DESC`,
    [orgId]
  );

  const vehicles = result.rows.map((v) => {
    const km = Number(v.distance_km);
    const litres = km / Number(avg_fuel_efficiency || 15);
    const fuelCost = litres * Number(fuel_cost_per_litre || 100);
    return {
      ...v,
      litresConsumed: Number(litres.toFixed(2)),
      estimatedFuelCost: Number(fuelCost.toFixed(2)),
      costPerKm: km > 0 ? Number((fuelCost / km).toFixed(2)) : 0,
    };
  });

  res.json({ vehicles });
});

module.exports = router;
