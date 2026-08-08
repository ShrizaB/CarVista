import { useEffect, useState } from 'react';
import api from '../api/client';
import CheckoutModal from '../components/CheckoutModal';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [amount, setAmount] = useState(500);
  const [showCheckout, setShowCheckout] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await api.get('/wallet');
    setWallet(res.data.wallet);
    setTransactions(res.data.transactions);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onSuccess = async (paymentId) => {
    const orderRes = await api.post('/wallet/recharge/order', { amount });
    await api.post('/wallet/recharge/confirm', {
      gateway: orderRes.data.order.gateway, orderId: orderRes.data.order.orderId, paymentId, amount,
    });
    setShowCheckout(false);
    load();
  };

  if (loading) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Wallet & Payments</div>
          <h1 className="page-title">Your CarVista Wallet</h1>
        </div>
      </div>

      <div className="card" style={{ background: 'var(--dusk)', color: '#fff', marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Available balance</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 40, fontWeight: 600, margin: '6px 0 18px' }}>
          ₹{Number(wallet.balance).toFixed(2)}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            type="number" min={50} value={amount} onChange={(e) => setAmount(Number(e.target.value))}
            style={{ width: 130, padding: '10px 12px', borderRadius: 10, border: 'none' }}
          />
          <button className="btn btn-primary" onClick={() => setShowCheckout(true)}>Recharge wallet</button>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 12 }}>Recent transactions</h3>
        {transactions.length === 0 && <div className="empty-state">No transactions yet.</div>}
        {transactions.map((t) => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--mist)' }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{t.type}</div>
              <div style={{ fontSize: 12, color: 'var(--slate)' }}>{new Date(t.created_at).toLocaleString()}</div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: t.type === 'debit' ? 'var(--danger)' : 'var(--leaf)' }}>
              {t.type === 'debit' ? '-' : '+'}₹{Number(t.amount).toFixed(2)}
            </div>
          </div>
        ))}
      </div>

      {showCheckout && <CheckoutModal amount={amount} onClose={() => setShowCheckout(false)} onSuccess={onSuccess} />}
    </div>
  );
}
