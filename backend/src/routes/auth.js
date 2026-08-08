const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const db = require('../db');
const { authRequired } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign(
    { id: user.id, organizationId: user.organization_id, role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

const registerSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(6),
  password: z.string().min(6),
  organizationDomain: z.string().min(2), // e.g. "acme.com" - identifies the registered org
});

// Register a new employee. The organization must already exist (created by
// a Company Administrator) and the email domain must match it.
router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { fullName, email, phone, password, organizationDomain } = parsed.data;

  try {
    const orgRes = await db.query('SELECT * FROM organizations WHERE domain = $1 AND is_active = TRUE', [
      organizationDomain,
    ]);
    if (!orgRes.rows.length) {
      return res.status(404).json({ error: 'No registered organization found for that domain.' });
    }
    const org = orgRes.rows[0];

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'An account with this email already exists.' });

    const password_hash = await bcrypt.hash(password, 10);
    const userRes = await db.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'employee') RETURNING *`,
      [org.id, fullName, email, phone, password_hash]
    );
    const user = userRes.rows[0];
    await db.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0)', [user.id]);

    const token = signToken(user);
    res.status(201).json({ token, user: sanitize(user), organization: org });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed.' });
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1) });

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Email and password are required.' });
  const { email, password } = parsed.data;

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = result.rows[0];
    if (!user || !user.is_active) return res.status(401).json({ error: 'Invalid credentials.' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials.' });

    const orgRes = await db.query('SELECT * FROM organizations WHERE id = $1', [user.organization_id]);
    const token = signToken(user);
    res.json({ token, user: sanitize(user), organization: orgRes.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

const registerOrgSchema = z.object({
  organizationName: z.string().min(2),
  organizationDomain: z.string().min(2),
  adminName: z.string().min(2),
  adminEmail: z.string().email(),
  adminPhone: z.string().min(6),
  adminPassword: z.string().min(6),
});

// Onboard a brand-new organization onto CarVista along with its first
// Company Administrator account.
router.post('/register-organization', async (req, res) => {
  const parsed = registerOrgSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.errors[0].message });
  const { organizationName, organizationDomain, adminName, adminEmail, adminPhone, adminPassword } = parsed.data;

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const orgRes = await client.query(
      `INSERT INTO organizations (name, domain) VALUES ($1,$2) RETURNING *`,
      [organizationName, organizationDomain]
    );
    const org = orgRes.rows[0];
    const password_hash = await bcrypt.hash(adminPassword, 10);
    const userRes = await client.query(
      `INSERT INTO users (organization_id, full_name, email, phone, password_hash, role)
       VALUES ($1,$2,$3,$4,$5,'company_admin') RETURNING *`,
      [org.id, adminName, adminEmail, adminPhone, password_hash]
    );
    const user = userRes.rows[0];
    await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1,0)', [user.id]);
    await client.query('COMMIT');

    const token = signToken(user);
    res.status(201).json({ token, user: sanitize(user), organization: org });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(409).json({ error: 'Organization domain or admin email already registered.' });
    console.error(err);
    res.status(500).json({ error: 'Organization registration failed.' });
  } finally {
    client.release();
  }
});

router.get('/me', authRequired, async (req, res) => {
  const result = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
  if (!result.rows.length) return res.status(404).json({ error: 'User not found.' });
  const orgRes = await db.query('SELECT * FROM organizations WHERE id = $1', [req.user.organizationId]);
  res.json({ user: sanitize(result.rows[0]), organization: orgRes.rows[0] });
});

function sanitize(user) {
  const { password_hash, ...rest } = user;
  return rest;
}

module.exports = router;
