import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Vehicles() {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ model: '', registrationNumber: '', color: '', seatingCapacity: 4, vehicleType: 'car' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/vehicles');
    setVehicles(res.data.vehicles);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/vehicles', form);
      setForm({ model: '', registrationNumber: '', color: '', seatingCapacity: 4, vehicleType: 'car' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not register vehicle.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm('Remove this vehicle?')) return;
    await api.delete(`/vehicles/${id}`);
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Vehicle Management</div>
          <h1 className="page-title">My Vehicles</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>
          {showForm ? 'Cancel' : '+ Register vehicle'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
          {error && <div className="form-error">{error}</div>}
          <div className="field-row">
            <div className="field">
              <label>Vehicle model</label>
              <input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} placeholder="Hyundai Creta" />
            </div>
            <div className="field">
              <label>Registration number</label>
              <input required value={form.registrationNumber} onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })} placeholder="WB-06-AB-1234" />
            </div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Color</label>
              <input value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="White" />
            </div>
            <div className="field">
              <label>Seating capacity</label>
              <input type="number" min={1} max={8} required value={form.seatingCapacity} onChange={(e) => setForm({ ...form, seatingCapacity: Number(e.target.value) })} />
            </div>
          </div>
          <div className="field">
            <label>Vehicle type</label>
            <select value={form.vehicleType} onChange={(e) => setForm({ ...form, vehicleType: e.target.value })}>
              <option value="car">Car</option>
              <option value="suv">SUV</option>
              <option value="van">Van</option>
              <option value="bike">Bike</option>
            </select>
          </div>
          <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Saving…' : 'Register vehicle'}</button>
        </form>
      )}

      {loading ? <div className="spinner" /> : vehicles.length === 0 ? (
        <div className="card empty-state">No vehicles registered yet.</div>
      ) : (
        <div className="grid-2">
          {vehicles.map((v) => (
            <div key={v.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{v.model}</div>
                  <div style={{ fontSize: 13, color: 'var(--slate)', marginTop: 3 }}>{v.registration_number}</div>
                </div>
                <span className={`badge ${v.is_active ? 'badge-green' : 'badge-slate'}`}>{v.is_active ? 'Active' : 'Inactive'}</span>
              </div>
              <div className="divider" />
              <div style={{ display: 'flex', gap: 18, fontSize: 13, color: 'var(--slate)' }}>
                <div>🎨 {v.color || '—'}</div>
                <div>💺 {v.seating_capacity} seats</div>
                <div>🚙 {v.vehicle_type}</div>
              </div>
              <button className="btn btn-danger btn-sm" style={{ marginTop: 14 }} onClick={() => remove(v.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
