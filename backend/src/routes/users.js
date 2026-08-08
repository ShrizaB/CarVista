const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();
router.use(authRequired);

// ---- Profile ----
router.put('/me', async (req, res) => {
  const { fullName, phone, gender, avatarUrl } = req.body;
  const result = await db.query(
    `UPDATE users SET full_name = COALESCE($1, full_name), phone = COALESCE($2, phone),
       gender = COALESCE($3, gender), avatar_url = COALESCE($4, avatar_url), updated_at = now()
     WHERE id = $5 RETURNING *`,
    [fullName, phone, gender, avatarUrl, req.user.id]
  );
  const { password_hash, ...user } = result.rows[0];
  res.json({ user });
});

// ---- Saved Places ----
router.get('/me/saved-places', async (req, res) => {
  const result = await db.query('SELECT * FROM saved_places WHERE user_id = $1 ORDER BY created_at DESC', [
    req.user.id,
  ]);
  res.json({ places: result.rows });
});

router.post('/me/saved-places', async (req, res) => {
  const { label, address, latitude, longitude } = req.body;
  if (!label || !address || latitude == null || longitude == null) {
    return res.status(400).json({ error: 'label, address, latitude and longitude are required.' });
  }
  const result = await db.query(
    `INSERT INTO saved_places (user_id, label, address, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [req.user.id, label, address, latitude, longitude]
  );
  res.status(201).json({ place: result.rows[0] });
});

router.delete('/me/saved-places/:id', async (req, res) => {
  await db.query('DELETE FROM saved_places WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.status(204).end();
});

// ---- Notifications ----
router.get('/me/notifications', async (req, res) => {
  const result = await db.query(
    'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
    [req.user.id]
  );
  res.json({ notifications: result.rows });
});

router.put('/me/notifications/:id/read', async (req, res) => {
  await db.query('UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2', [
    req.params.id,
    req.user.id,
  ]);
  res.status(204).end();
});

module.exports = router;
