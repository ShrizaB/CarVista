import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function MyTrips() {
  const { user } = useAuth();
  const [trips, setTrips] = useState({ asPassenger: [], asDriver: [] });
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [tripsRes, ridesRes] = await Promise.all([api.get('/trips/mine'), api.get('/rides/mine')]);
      setTrips(tripsRes.data);
      setRides(ridesRes.data.rides);
      setLoading(false);
    })();
  }, []);

  const startTrip = async (rideId) => {
    await api.put(`/trips/ride/${rideId}/start`);
    location.reload();
  };
  const cancelRide = async (rideId) => {
    if (!confirm('Cancel this published ride? All passengers will be notified.')) return;
    await api.put(`/rides/${rideId}/cancel`);
    location.reload();
  };

  const all = [...trips.asPassenger, ...trips.asDriver];

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Trip Management</div>
          <h1 className="page-title">My Trips</h1>
        </div>
      </div>

      {loading && <div className="spinner" />}

      {!loading && (
        <>
          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Active bookings</h3>
          {all.length === 0 && <div className="card empty-state">No active trips.</div>}
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {all.map((t) => (
              <div key={t.booking_id} className="card card-hover">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{t.pickup_address.split(',')[0]} → {t.destination_address.split(',')[0]}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                      {t.travel_date} · {t.travel_time?.slice(0, 5)} · {t.driver_id === user.id ? `Passenger: ${t.passenger_name}` : `Driver: ${t.driver_name}`}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={t.trip_status} />
                    <StatusBadge status={t.payment_status} />
                    <Link to={`/trips/${t.booking_id}`} className="btn btn-outline btn-sm">Open</Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <h3 style={{ fontSize: 15, marginBottom: 10 }}>Rides I'm offering</h3>
          {rides.filter((r) => r.status !== 'cancelled' && r.status !== 'completed').length === 0 && (
            <div className="card empty-state">You haven't published any upcoming rides.</div>
          )}
          <div style={{ display: 'grid', gap: 12 }}>
            {rides.filter((r) => r.status !== 'cancelled' && r.status !== 'completed').map((r) => (
              <div key={r.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.pickup_address.split(',')[0]} → {r.destination_address.split(',')[0]}</div>
                    <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                      {r.travel_date} · {r.travel_time?.slice(0, 5)} · {r.booked_count}/{r.total_seats} seats booked · {r.vehicle_model}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <StatusBadge status={r.status} />
                    {r.status === 'published' || r.status === 'full' ? (
                      <>
                        <button className="btn btn-primary btn-sm" onClick={() => startTrip(r.id)} disabled={Number(r.booked_count) === 0}>Start trip</button>
                        <button className="btn btn-danger btn-sm" onClick={() => cancelRide(r.id)}>Cancel</button>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
