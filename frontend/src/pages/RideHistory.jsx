import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import StatusBadge from '../components/StatusBadge';

export default function RideHistory() {
  const { user } = useAuth();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/trips/history').then((res) => { setTrips(res.data.trips); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Ride History</div>
          <h1 className="page-title">Completed & cancelled trips</h1>
        </div>
      </div>

      {loading && <div className="spinner" />}
      {!loading && trips.length === 0 && <div className="card empty-state">No past trips yet.</div>}

      <div style={{ display: 'grid', gap: 12 }}>
        {trips.map((t) => (
          <div key={t.booking_id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontWeight: 700 }}>{t.pickup_address.split(',')[0]} → {t.destination_address.split(',')[0]}</div>
                <div style={{ fontSize: 12.5, color: 'var(--slate)', marginTop: 4 }}>
                  {t.travel_date} · {t.travel_time?.slice(0, 5)} · {t.driver_id === user.id ? `Passenger: ${t.passenger_name}` : `Driver: ${t.driver_name}`}
                  {' · '}{t.vehicle_model} ({t.registration_number})
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <StatusBadge status={t.trip_status} />
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, marginTop: 6 }}>₹{t.fare_total}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
