import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function Dashboard() {
  const { user, organization } = useAuth();
  const [trips, setTrips] = useState({ asPassenger: [], asDriver: [] });
  const [wallet, setWallet] = useState(null);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [tripsRes, walletRes, reportsRes] = await Promise.all([
        api.get('/trips/mine'),
        api.get('/wallet'),
        api.get('/reports/me'),
      ]);
      setTrips(tripsRes.data);
      setWallet(walletRes.data.wallet);
      setReports(reportsRes.data);
      setLoading(false);
    })();
  }, []);

  const activeTrips = [...trips.asPassenger, ...trips.asDriver];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">{organization?.name}</div>
          <h1 className="page-title">Hi {user?.full_name?.split(' ')[0]}, where to today?</h1>
          <p className="page-subtitle">Your commute overview and active trips.</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/find-ride" className="btn btn-primary">Find a Ride</Link>
          <Link to="/offer-ride" className="btn btn-secondary">Offer a Ride</Link>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 22 }}>
        <div className="card">
          <div className="stat-label">Wallet balance</div>
          <div className="stat-value">₹{Number(wallet?.balance || 0).toFixed(2)}</div>
          <Link to="/wallet" className="btn btn-ghost btn-sm" style={{ paddingLeft: 0, marginTop: 6 }}>Manage wallet →</Link>
        </div>
        <div className="card">
          <div className="stat-label">Completed trips</div>
          <div className="stat-value">{reports?.totals?.total_trips || 0}</div>
          <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 6 }}>All-time</div>
        </div>
        <div className="card">
          <div className="stat-label">Distance travelled</div>
          <div className="stat-value">{Number(reports?.totals?.total_distance_km || 0).toFixed(0)} km</div>
          <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 6 }}>All-time</div>
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 17 }}>Active trips</h3>
          <Link to="/trips" className="btn btn-ghost btn-sm">View all →</Link>
        </div>
        {loading && <div className="spinner" />}
        {!loading && activeTrips.length === 0 && (
          <div className="empty-state">
            No active trips yet. <Link to="/find-ride" style={{ color: 'var(--route-dark)', fontWeight: 600 }}>Find a ride</Link> or{' '}
            <Link to="/offer-ride" style={{ color: 'var(--route-dark)', fontWeight: 600 }}>offer one</Link>.
          </div>
        )}
        {activeTrips.map((t) => (
          <div key={t.booking_id} style={{ padding: '14px 0', borderBottom: '1px solid var(--mist)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{t.pickup_address.split(',')[0]} → {t.destination_address.split(',')[0]}</div>
                <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 3 }}>
                  {t.travel_date} · {t.travel_time?.slice(0, 5)} · {t.driver_id === user.id ? 'You are driving' : `Driver: ${t.driver_name}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <StatusBadge status={t.trip_status} />
                <Link to={`/trips/${t.booking_id}`} className="btn btn-outline btn-sm">Open</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
