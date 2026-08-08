const crypto = require('crypto');
const fetch = require('node-fetch');

const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const useRazorpay = Boolean(KEY_ID && KEY_SECRET);

/**
 * Creates a payment "order". If Razorpay TEST MODE keys are configured in
 * .env, a real (sandbox) order is created via Razorpay's free test API.
 * Otherwise, falls back to an internal mock gateway so the entire payment
 * flow (create -> pay -> verify) still works end-to-end for local/demo use
 * without requiring any signup.
 */
async function createOrder({ amountInRupees, receipt }) {
  const amountPaise = Math.round(amountInRupees * 100);

  if (useRazorpay) {
    const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString('base64');
    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }),
    });
    if (!res.ok) throw new Error('Razorpay order creation failed.');
    const order = await res.json();
    return { gateway: 'razorpay', orderId: order.id, amount: amountInRupees, keyId: KEY_ID };
  }

  // Mock gateway fallback
  const orderId = `mock_order_${crypto.randomBytes(8).toString('hex')}`;
  return { gateway: 'mock', orderId, amount: amountInRupees, keyId: null };
}

/**
 * Verifies a completed payment. For Razorpay this checks the HMAC signature.
 * For the mock gateway, any payment id supplied by the mock client checkout
 * is accepted (since no money actually moves in TEST/mock mode).
 */
function verifyPayment({ gateway, orderId, paymentId, signature }) {
  if (gateway === 'razorpay') {
    const expected = crypto
      .createHmac('sha256', KEY_SECRET)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    return expected === signature;
  }
  return Boolean(paymentId); // mock: any non-empty id is treated as success
}

module.exports = { createOrder, verifyPayment, useRazorpay };
