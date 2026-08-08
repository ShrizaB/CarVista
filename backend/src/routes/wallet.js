const express = require('express');
const db = require('../db');
const { authRequired } = require('../middleware/auth');
const { createOrder, verifyPayment } = require('../utils/payments');

const router = express.Router();
router.use(authRequired);

router.get('/', async (req, res) => {
  const result = await db.query('SELECT * FROM wallets WHERE user_id = $1', [req.user.id]);
  const wallet = result.rows[0];
  const txns = await db.query(
    'SELECT * FROM wallet_transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT 30',
    [wallet.id]
  );
  res.json({ wallet, transactions: txns.rows });
});

// Step 1: create a recharge order (Razorpay test mode, or mock fallback)
router.post('/recharge/order', async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'A valid amount is required.' });
  try {
    const order = await createOrder({ amountInRupees: amount, receipt: `wallet_${req.user.id}_${Date.now()}` });
    res.json({ order });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: 'Could not create payment order.' });
  }
});

// Step 2: confirm the recharge after the client-side checkout completes
router.post('/recharge/confirm', async (req, res) => {
  const { gateway, orderId, paymentId, signature, amount } = req.body;
  const ok = verifyPayment({ gateway, orderId, paymentId, signature });
  if (!ok) return res.status(400).json({ error: 'Payment verification failed.' });

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const walletRes = await client.query('SELECT * FROM wallets WHERE user_id = $1 FOR UPDATE', [req.user.id]);
    const wallet = walletRes.rows[0];
    const newBalance = Number(wallet.balance) + Number(amount);

    await client.query('UPDATE wallets SET balance = $1, updated_at = now() WHERE id = $2', [newBalance, wallet.id]);
    await client.query(
      `INSERT INTO wallet_transactions (wallet_id, type, amount, reference, balance_after)
       VALUES ($1,'recharge',$2,$3,$4)`,
      [wallet.id, amount, paymentId, newBalance]
    );
    await client.query('COMMIT');
    res.json({ ok: true, balance: newBalance });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Wallet recharge failed.' });
  } finally {
    client.release();
  }
});

module.exports = router;
