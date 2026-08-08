import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminSettings() {
  const [org, setOrg] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get('/admin/organization').then((res) => setOrg(res.data.organization));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    const res = await api.put('/admin/organization', {
      name: org.name,
      fuelCostPerLitre: org.fuel_cost_per_litre,
      avgFuelEfficiency: org.avg_fuel_efficiency,
      defaultFarePerKm: org.default_fare_per_km,
    });
    setOrg(res.data.organization);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (!org) return <div className="spinner" />;

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Company Administration</div>
          <h1 className="page-title">Organization settings</h1>
        </div>
      </div>

      <form onSubmit={save} className="card" style={{ maxWidth: 520 }}>
        <div className="field"><label>Organization name</label><input value={org.name} onChange={(e) => setOrg({ ...org, name: e.target.value })} /></div>
        <div className="field"><label>Domain (read-only)</label><input value={org.domain} disabled /></div>
        <div className="field-row">
          <div className="field"><label>Fuel cost per litre (₹)</label><input type="number" step="0.01" value={org.fuel_cost_per_litre} onChange={(e) => setOrg({ ...org, fuel_cost_per_litre: e.target.value })} /></div>
          <div className="field"><label>Avg fuel efficiency (km/l)</label><input type="number" step="0.1" value={org.avg_fuel_efficiency} onChange={(e) => setOrg({ ...org, avg_fuel_efficiency: e.target.value })} /></div>
        </div>
        <div className="field"><label>Default fare per km (₹)</label><input type="number" step="0.5" value={org.default_fare_per_km} onChange={(e) => setOrg({ ...org, default_fare_per_km: e.target.value })} /></div>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save settings'}</button>
      </form>
    </div>
  );
}
