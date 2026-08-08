const jwt = require('jsonwebtoken');
const db = require('../db');

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication token missing.' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload; // { id, organizationId, role, email }
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'company_admin') {
    return res.status(403).json({ error: 'Company Administrator access required.' });
  }
  next();
}

// Edge case: when an admin deactivates an employee mid-cycle, an already-booked
// upcoming trip is allowed to complete, but the employee can no longer start new
// searches or publish new rides. Apply this only to those "start something new"
// routes, not to trip lifecycle/history/payment routes for existing bookings.
async function activeOnly(req, res, next) {
  try {
    const result = await db.query('SELECT is_active FROM users WHERE id = $1', [req.user.id]);
    if (!result.rows.length || !result.rows[0].is_active) {
      return res.status(403).json({ error: 'Your account has been deactivated by your organization. Existing trips remain valid, but new rides cannot be searched or published.' });
    }
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify account status.' });
  }
}

module.exports = { authRequired, adminOnly, activeOnly };
