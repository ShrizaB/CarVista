const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { createOrder, verifyPayment, useRazorpay } = require('../utils/payments');
const { notifyUser } = require('../utils/notify');

const router = express.Router();
router.use(authRequired);

// Info endpoint the frontend can use to know whether to load the real
// Razorpay checkout script or use the built-in mock checkout modal.
router.get('/config', (req, res) => {
  res.json({ gateway: useRazorpay ? 'razorpay' : 'mock', keyId: process.env.RAZORPAY_KEY_ID || null });
});

// Step 1: create an order for a booking's fare (card/UPI only; cash & wallet skip this)
router.post('/:bookingId/order', async (req, res) => {
  const method = ['card', 'upi'].includes(req.body?.method) ? req.body.method : 'card';

  const bookingRes = await db.query('SELECT * FROM bookings WHERE id = $1 AND passenger_id = $2', [
    req.params.bookingId, req.user.id,
  ]);
  if (!bookingRes.rows.length) return res.status(404).json({ error: 'Booking not found.' });
  const booking = bookingRes.rows[0];
  if (booking.payment_status === 'completed') {
    return res.status(400).json({ error: 'This trip has already been paid for.' });
  }

  try {
    const order = await createOrder({ amountInRupees: Number(booking.fare_total), receipt: `booking_${booking.id}` });
    await db.query(
      `INSERT INTO payments (booking_id, payer_id, amount, method, gateway, gateway_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,'created')`,
      [booking.id, req.user.id, booking.fare_total, method, order.gateway, order.orderId]
    );
    res.json({ order, method });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not create payment order.' });
  }
});

// Step 2: pay via cash, wallet, or confirm a card/UPI gateway payment
router.post('/:bookingId/pay', async (req, res) => {
  const { method, gateway, orderId, paymentId, signature } = req.body; // method: cash|card|upi|wallet
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND passenger_id = $2 FOR UPDATE',
      [req.params.bookingId, req.user.id]
    );
    if (!bookingRes.rows.length) throw { status: 404, message: 'Booking not found.' };
    const booking = bookingRes.rows[0];
    if (booking.payment_status === 'completed') throw { status: 400, message: 'This trip has already been paid for.' };

    const amount = Number(booking.fare_total);

    if (method === 'wallet') {
      const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [req.user.id]);
      const wallet = walletRes.rows[0];
      if (Number(wallet.balance) < amount) throw { status: 400, message: 'Insufficient wallet balance.' };
      const newBalance = Number(wallet.balance) - amount;
      await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [newBalance, wallet.id]);
      await client.query(
        `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, balance_after)
         VALUES ($1,'debit',$2,$3,$4)`,
        [wallet.id, amount, booking.id, newBalance]
      );
      await client.query(
        `INSERT INTO payments (booking_id, payer_id, amount, method, gateway, status)
         VALUES ($1,$2,$3,'wallet','wallet_internal','paid')`,
        [booking.id, req.user.id, amount]
      );
    } else if (method === 'cash') {
      await client.query(
        `INSERT INTO payments (booking_id, payer_id, amount, method, gateway, status)
         VALUES ($1,$2,$3,'cash','cash','paid')`,
        [booking.id, req.user.id, amount]
      );
    } else {
      // card / upi via gateway (Razorpay test mode or mock)
      const ok = verifyPayment({ gateway, orderId, paymentId, signature });
      if (!ok) throw { status: 400, message: 'Payment verification failed.' };
      await client.query(
        `UPDATE payments SET gateway_payment_id = $1, status = 'paid' WHERE booking_id = $2 AND gateway_order_id = $3`,
        [paymentId, booking.id, orderId]
      );
    }

    await client.query(`UPDATE bookings SET payment_status = 'completed' WHERE id = $1`, [booking.id]);
    await client.query('COMMIT');

    const rideRes = await db.query('SELECT driver_id FROM rides WHERE id = $1', [booking.ride_id]);
    await notifyUser(rideRes.rows[0].driver_id, 'Payment received', 'Your passenger has completed the fare payment.', 'payment_received');

    res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    console.error(err.message || err);
    res.status(status).json({ error: err.message || 'Payment failed.' });
  } finally {
    client.release();
  }
});

// Edge case: wallet balance insufficient at payment time. Instead of forcing
// a separate recharge flow, this does an inline "Top up & Pay" -- confirms the
// top-up gateway payment, credits the wallet, then immediately debits the
// booking fare from that same wallet, all in one atomic transaction.
router.post('/:bookingId/topup-and-pay', async (req, res) => {
  const { gateway, orderId, paymentId, signature, topupAmount } = req.body;
  const ok = verifyPayment({ gateway, orderId, paymentId, signature });
  if (!ok) return res.status(400).json({ error: 'Top-up payment verification failed.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const bookingRes = await client.query(
      'SELECT * FROM bookings WHERE id = $1 AND passenger_id = $2 FOR UPDATE',
      [req.params.bookingId, req.user.id]
    );
    if (!bookingRes.rows.length) throw { status: 404, message: 'Booking not found.' };
    const booking = bookingRes.rows[0];
    if (booking.payment_status === 'completed') throw { status: 400, message: 'This trip has already been paid for.' };

    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [req.user.id]);
    const wallet = walletRes.rows[0];
    const afterTopup = Number(wallet.balance) + Number(topupAmount);
    const fare = Number(booking.fare_total);
    if (afterTopup < fare) throw { status: 400, message: 'Top-up amount is not enough to cover the fare.' };

    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, balance_after)
       VALUES ($1,'recharge',$2,$3,$4)`,
      [wallet.id, topupAmount, paymentId, afterTopup]
    );
    const afterPay = afterTopup - fare;
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, balance_after)
       VALUES ($1,'debit',$2,$3,$4)`,
      [wallet.id, fare, booking.id, afterPay]
    );
    await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [afterPay, wallet.id]);
    await client.query(
      `INSERT INTO payments (booking_id, payer_id, amount, method, gateway, status)
       VALUES ($1,$2,$3,'wallet','wallet_internal','paid')`,
      [booking.id, req.user.id, fare]
    );
    await client.query(`UPDATE bookings SET payment_status = 'completed' WHERE id = $1`, [booking.id]);
    await client.query('COMMIT');

    const rideRes = await db.query('SELECT driver_id FROM rides WHERE id = $1', [booking.ride_id]);
    await notifyUser(rideRes.rows[0].driver_id, 'Payment received', 'Your passenger has completed the fare payment.', 'payment_received');

    res.json({ ok: true, balance: afterPay });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = err.status || 500;
    console.error(err.message || err);
    res.status(status).json({ error: err.message || 'Top-up & pay failed.' });
  } finally {
    client.release();
  }
});

// Get the payment record(s) for a single booking (driver or passenger can view)
router.get('/:bookingId', async (req, res) => {
  const bookingRes = await db.query('SELECT b.*, r.driver_id FROM bookings b JOIN rides r ON r.id = b.ride_id WHERE b.id = $1', [req.params.bookingId]);
  if (!bookingRes.rows.length) return res.status(404).json({ error: 'Booking not found.' });
  const booking = bookingRes.rows[0];
  if (booking.passenger_id !== req.user.id && booking.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'You do not have access to this booking.' });
  }
  const payments = await db.query('SELECT * FROM payments WHERE booking_id = $1 ORDER BY created_at DESC', [req.params.bookingId]);
  res.json({ payments: payments.rows });
});

// Edge case: payment failure post-trip keeps a booking in "Payment Pending"
// (not "Completed") until it succeeds or falls back to cash. This gives a
// driver's earnings dashboard a "pending" vs "settled" split so unpaid trips
// don't get counted as real income yet.
router.get('/earnings/summary', async (req, res) => {
  const result = await db.query(
    `SELECT
       COALESCE(SUM(b.fare_total) FILTER (WHERE b.payment_status = 'completed'), 0) AS settled,
       COALESCE(SUM(b.fare_total) FILTER (WHERE b.payment_status = 'pending' AND b.trip_status = 'completed'), 0) AS pending,
       COUNT(*) FILTER (WHERE b.payment_status = 'completed') AS settled_trips,
       COUNT(*) FILTER (WHERE b.payment_status = 'pending' AND b.trip_status = 'completed') AS pending_trips
     FROM bookings b
     JOIN rides r ON r.id = b.ride_id
     WHERE r.driver_id = $1`,
    [req.user.id]
  );
  res.json({ earnings: result.rows[0] });
});

// Full payment history for the logged-in user (as payer), across all trips
router.get('/', async (req, res) => {
  const result = await db.query(
    `SELECT p.*, r.pickup_address, r.destination_address, r.travel_date
     FROM payments p
     JOIN bookings b ON b.id = p.booking_id
     JOIN rides r ON r.id = b.ride_id
     WHERE p.payer_id = $1
     ORDER BY p.created_at DESC LIMIT 50`,
    [req.user.id]
  );
  res.json({ payments: result.rows });
});

module.exports = router;
