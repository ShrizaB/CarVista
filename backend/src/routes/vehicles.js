const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM vehicles WHERE owner_id = $1 ORDER BY created_at DESC',
    [req.user.id]
  );
  res.json({ vehicles: result.rows });
});

router.post('/', async (req, res) => {
  const { model, registrationNumber, color, seatingCapacity, vehicleType } = req.body;
  if (!model || !registrationNumber || !seatingCapacity) {
    return res.status(400).json({ error: 'model, registrationNumber and seatingCapacity are required.' });
  }
  try {
    const result = await db.query(
      `INSERT INTO vehicles (owner_id, model, registration_number, color, seating_capacity, vehicle_type)
       VALUES ($1,$2,$3,$4,$5,COALESCE($6,'car')) RETURNING *`,
      [req.user.id, model, registrationNumber.toUpperCase(), color, seatingCapacity, vehicleType]
    );
    res.status(201).json({ vehicle: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'This registration number is already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Could not register vehicle.' });
  }
});

router.put('/:id', async (req, res) => {
  const { model, color, seatingCapacity, vehicleType, isActive } = req.body;
  const result = await db.query(
    `UPDATE vehicles SET model = COALESCE($1, model), color = COALESCE($2, color),
       seating_capacity = COALESCE($3, seating_capacity), vehicle_type = COALESCE($4, vehicle_type),
       is_active = COALESCE($5, is_active)
     WHERE id = $6 AND owner_id = $7 RETURNING *`,
    [model, color, seatingCapacity, vehicleType, isActive, req.params.id, req.user.id]
  );
  if (!result.rows.length) return res.status(404).json({ error: 'Vehicle not found.' });
  res.json({ vehicle: result.rows[0] });
});

router.delete('/:id', async (req, res) => {
  const owned = await db.query('SELECT id FROM vehicles WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  if (!owned.rows.length) return res.status(404).json({ error: 'Vehicle not found.' });

  // Edge case: block deletion of a vehicle currently attached to an active or
  // upcoming published ride, with an inline reason instead of a silent failure.
  const inUse = await db.query(
    `SELECT id FROM rides WHERE vehicle_id = $1
       AND status IN ('published','full')
       AND (travel_date > CURRENT_DATE OR (travel_date = CURRENT_DATE AND travel_time >= CURRENT_TIME))
     LIMIT 1`,
    [req.params.id]
  );
  if (inUse.rows.length) {
    return res.status(409).json({ error: 'Vehicle in use by an upcoming trip.' });
  }

  await db.query('DELETE FROM vehicles WHERE id = $1 AND owner_id = $2', [req.params.id, req.user.id]);
  res.status(204).end();
});

module.exports = router;
