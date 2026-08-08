import { useState } from 'react';

/**
 * A lightweight in-app checkout used for both wallet recharges and trip
 * fare payments. When Razorpay TEST MODE keys are configured on the
 * backend, this would be swapped for the real Razorpay Checkout.js
 * widget (see README) — the calling code and API contract are identical,
 * so switching gateways later needs no changes elsewhere in the app.
 */
export default function CheckoutModal({ amount, onClose, onSuccess }) {
  const [processing, setProcessing] = useState(false);

  const pay = () => {
    setProcessing(true);
    setTimeout(() => {
      onSuccess(`pay_${Math.random().toString(36).slice(2, 12)}`);
      setProcessing(false);
    }, 900);
  };

  return (
    <div style={overlay}>
      <div style={modal} className="card">
        <div className="eyebrow">Secure Checkout · Test Mode</div>
        <h3 style={{ marginTop: 6, marginBottom: 4 }}>Pay ₹{Number(amount).toFixed(2)}</h3>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, marginBottom: 18 }}>
          Sandbox payment — no real money is transferred.
        </p>
        <div className="route-line" style={{ marginBottom: 18 }} />
        <button className="btn btn-primary btn-block" disabled={processing} onClick={pay}>
          {processing ? <span className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> : 'Confirm Payment'}
        </button>
        <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={onClose} disabled={processing}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(18,20,28,0.5)', display: 'flex',
  alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16,
};
const modal = { width: 360, maxWidth: '100%' };
