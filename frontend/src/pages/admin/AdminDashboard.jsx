import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';

export default function AdminDashboard() {
  const { organization } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get('/reports/organization').then((res) => setData(res.data));
  }, []);

  if (!data) return <div className="spinner" />;

  const trend = [...data.monthlyTrend].reverse().map((m) => ({ month: m.month, rides: Number(m.rides), km: Number(m.distance_km) }));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Company Administration</div>
          <h1 className="page-title">{organization?.name} overview</h1>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Total employees</div><div className="stat-value">{data.summary.total_employees}</div></div>
        <div className="card"><div className="stat-label">Registered vehicles</div><div className="stat-value">{data.summary.total_vehicles}</div></div>
        <div className="card"><div className="stat-label">Completed rides</div><div className="stat-value">{data.summary.completed_rides}</div></div>
      </div>
      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Total distance travelled</div><div className="stat-value">{Number(data.summary.total_distance_km).toFixed(0)} km</div></div>
        <div className="card"><div className="stat-label">Total fare collected</div><div className="stat-value">₹{Number(data.summary.total_fare_collected).toFixed(0)}</div></div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Monthly ride activity</h3>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={trend}>
            <CartesianGrid stroke="var(--mist)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="rides" stroke="#ff8a3d" strokeWidth={2} />
            <Line type="monotone" dataKey="km" stroke="#1f2a4a" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
