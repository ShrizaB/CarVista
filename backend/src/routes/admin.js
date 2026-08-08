const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { authRequired, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired, adminOnly);

// ---- Organization settings ----
router.get('/organization', async (req, res) => {
  const result = await db.query('SELECT * FROM organizations WHERE id = $1', [req.user.organizationId]);
  res.json({ organization: result.rows[0] });
});

router.put('/organization', async (req, res) => {
  const { name, fuelCostPerLitre, avgFuelEfficiency, defaultFarePerKm } = req.body;
  const result = await db.query(
    `UPDATE organizations SET
       name = COALESCE($1, name),
       fuel_cost_per_litre = COALESCE($2, fuel_cost_per_litre),
       avg_fuel_efficiency = COALESCE($3, avg_fuel_efficiency),
       default_fare_per_km = COALESCE($4, default_fare_per_km)
     WHERE id = $5 RETURNING *`,
    [name, fuelCostPerLitre, avgFuelEfficiency, defaultFarePerKm, req.user.organizationId]
  );
  res.json({ organization: result.rows[0] });
});

// ---- Employee management ----
router.get('/employees', async (req, res) => {
  const result = await db.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.employee_code, u.role, u.is_active, u.rating, u.created_at,
            (SELECT COUNT(*) FROM vehicles v WHERE v.owner_id = u.id) AS vehicle_count,
            (SELECT COUNT(*) FROM trip_details td WHERE (td.passenger_id = u.id OR td.driver_id = u.id) AND td.trip_status='completed') AS trips_taken
     FROM users u WHERE u.organization_id = $1 ORDER BY u.created_at DESC`,
    [req.user.organizationId]
  );
  res.json({ employees: result.rows });
});

router.post('/employees', async (req, res) => {
  const { fullName, email, phone, employeeCode, password } = req.body;
  if (!fullName || !email || !password) return res.status(400).json({ error: 'fullName, email and password are required.' });
  try {
    const password_hash = await bcrypt.hash(password, 10);
    const result = await db.query(
      `INSERT INTO users (organization_id, full_name, email, phone, employee_code, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,$6,'employee') RETURNING id, full_name, email, phone, employee_code, role, created_at`,
      [req.user.organizationId, fullName, email, phone, employeeCode, password_hash]
    );
    await db.query('INSERT INTO wallets (user_id, balance) VALUES ($1,0)', [result.rows[0].id]);
    res.status(201).json({ employee: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An employee with this email already exists.' });
    console.error(err);
    res.status(500).json({ error: 'Could not add employee.' });
  }
});

router.put('/employees/:id/status', async (req, res) => {
  const { isActive } = req.body;
  const result = await db.query(
    `UPDATE users SET is_active = $1 WHERE id = $2 AND organization_id = $3 RETURNING id, is_active`,
    [isActive, req.params.id, req.user.organizationId]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Employee not found.' });
  res.json({ employee: result.rows[0] });
});

// ---- Vehicle oversight ----
router.get('/vehicles', async (req, res) => {
  const result = await db.query(
    `SELECT v.*, u.full_name AS owner_name, u.email AS owner_email
     FROM vehicles v JOIN users u ON u.id = v.owner_id
     WHERE u.organization_id = $1 ORDER BY v.created_at DESC`,
    [req.user.organizationId]
  );
  res.json({ vehicles: result.rows });
});

module.exports = router;
