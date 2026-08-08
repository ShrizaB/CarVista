import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminVehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/vehicles').then((res) => { setVehicles(res.data.vehicles); setLoading(false); });
  }, []);

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Company Administration</div>
          <h1 className="page-title">Registered vehicles</h1>
        </div>
      </div>

      {loading ? <div className="spinner" /> : (
        <div className="grid-2">
          {vehicles.map((v) => (
            <div key={v.id} className="card">
              <div style={{ fontWeight: 700 }}>{v.model}</div>
              <div style={{ fontSize: 13, color: 'var(--slate)', margin: '4px 0 10px' }}>{v.registration_number} · {v.seating_capacity} seats</div>
              <div style={{ fontSize: 13 }}>Owner: {v.owner_name} ({v.owner_email})</div>
            </div>
          ))}
          {vehicles.length === 0 && <div className="card empty-state">No vehicles registered yet.</div>}
        </div>
      )}
    </div>
  );
}
