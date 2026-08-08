import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from 'recharts';
import api from '../api/client';

export default function Reports() {
  const [data, setData] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [reportsRes, vehiclesRes] = await Promise.all([api.get('/reports/me'), api.get('/reports/me/vehicles')]);
      setData(reportsRes.data);
      setVehicles(vehiclesRes.data.vehicles);
      setLoading(false);
    })();
  }, []);

  if (loading || !data) return <div className="spinner" />;

  const trend = [...data.monthlyTrend].reverse().map((m) => ({ month: m.month, trips: Number(m.trips), km: Number(m.distance_km) }));

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Reports & Analytics</div>
          <h1 className="page-title">Your travel insights</h1>
        </div>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        <div className="card"><div className="stat-label">Total trips</div><div className="stat-value">{data.totals.total_trips}</div></div>
        <div className="card"><div className="stat-label">Total distance</div><div className="stat-value">{Number(data.totals.total_distance_km).toFixed(0)} km</div></div>
        <div className="card"><div className="stat-label">Total spent</div><div className="stat-value">₹{Number(data.totals.total_spent).toFixed(0)}</div></div>
      </div>

      <div className="grid-2" style={{ marginBottom: 20 }}>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 4 }}>Fuel consumption (as driver)</h3>
          <p className="form-hint" style={{ marginBottom: 14 }}>Based on org average efficiency of {data.fuel.avgFuelEfficiencyKmpl} km/l</p>
          <div className="grid-2">
            <MiniStat label="Distance driven" value={`${data.fuel.distanceAsDriverKm} km`} />
            <MiniStat label="Litres consumed" value={`${data.fuel.litresConsumed} L`} />
          </div>
          <MiniStat label="Estimated fuel cost" value={`₹${data.fuel.estimatedFuelCost}`} full />
        </div>
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Monthly trips & distance</h3>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={trend}>
              <CartesianGrid stroke="var(--mist)" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="trips" stroke="#ff8a3d" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="km" stroke="#1f2a4a" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {vehicles.length > 0 && (
        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Vehicle-wise cost analysis</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={vehicles.map((v) => ({ name: v.model, trips: Number(v.trips), km: Number(v.distance_km) }))}>
              <CartesianGrid stroke="var(--mist)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="km" fill="#ff8a3d" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value, full }) {
  return (
    <div style={{ background: 'var(--sky)', borderRadius: 10, padding: '10px 14px', marginTop: full ? 12 : 0 }}>
      <div style={{ fontSize: 11.5, color: 'var(--slate)' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 18 }}>{value}</div>
    </div>
  );
}
