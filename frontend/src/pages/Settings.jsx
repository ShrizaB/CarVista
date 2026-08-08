import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AddressAutocomplete from '../components/AddressAutocomplete';

export default function Settings() {
  const { user, refreshMe } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [places, setPlaces] = useState([]);
  const [newPlace, setNewPlace] = useState(null);
  const [label, setLabel] = useState('Home');

  const loadPlaces = () => api.get('/users/me/saved-places').then((r) => setPlaces(r.data.places));
  useEffect(() => { loadPlaces(); }, []);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    await api.put('/users/me', { fullName, phone });
    await refreshMe();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addPlace = async () => {
    if (!newPlace) return;
    await api.post('/users/me/saved-places', { label, address: newPlace.displayName, latitude: newPlace.lat, longitude: newPlace.lng });
    setNewPlace(null);
    loadPlaces();
  };

  const removePlace = async (id) => {
    await api.delete(`/users/me/saved-places/${id}`);
    loadPlaces();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Settings</div>
          <h1 className="page-title">Profile & preferences</h1>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <form onSubmit={saveProfile} className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Profile</h3>
          <div className="field"><label>Full name</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="field"><label>Phone</label><input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="field"><label>Email (read-only)</label><input value={user?.email} disabled /></div>
          <button className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save changes'}</button>
        </form>

        <div className="card">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Saved places</h3>
          <div className="field-row">
            <div className="field">
              <label>Label</label>
              <select value={label} onChange={(e) => setLabel(e.target.value)}>
                <option>Home</option><option>Office</option><option>Other</option>
              </select>
            </div>
          </div>
          <AddressAutocomplete label="Address" onSelect={setNewPlace} />
          <button className="btn btn-secondary btn-block" onClick={addPlace} disabled={!newPlace}>Save place</button>

          <div className="divider" />
          {places.length === 0 && <div style={{ fontSize: 13, color: 'var(--slate-light)' }}>No saved places yet.</div>}
          {places.map((p) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13.5 }}>{p.label}</div>
                <div style={{ fontSize: 12, color: 'var(--slate)' }}>{p.address.split(',').slice(0, 2).join(', ')}</div>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => removePlace(p.id)}>Remove</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
