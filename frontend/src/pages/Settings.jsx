import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import AddressAutocomplete from '../components/AddressAutocomplete';

// PRD 5.10 — Settings is a quick-access hub to commonly used features.
const QUICK_ACCESS = [
  { to: '/trips', icon: '🗂', label: 'My Trips', desc: 'Upcoming & active rides' },
  { to: '/vehicles', icon: '🚗', label: 'My Vehicle', desc: 'Manage registered vehicles' },
  { to: '/wallet', icon: '💳', label: 'Payment Methods', desc: 'Wallet balance & recharge' },
  { to: '/history', icon: '📜', label: 'Ride History', desc: 'Completed & cancelled trips' },
  { to: '/trips', icon: '💬', label: 'Chat', desc: 'Message drivers/passengers from an active trip' },
];

export default function Settings() {
  const { user, refreshMe } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

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

      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, marginBottom: 14 }}>Quick access</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
          {QUICK_ACCESS.map((q) => (
            <Link
              key={q.label}
              to={q.to}
              style={{
                display: 'block', padding: '14px 12px', borderRadius: 12,
                border: '1px solid var(--mist)', textDecoration: 'none', color: 'inherit',
              }}
            >
              <div style={{ fontSize: 20, marginBottom: 6 }}>{q.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 13.5 }}>{q.label}</div>
              <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>{q.desc}</div>
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            style={{
              display: 'block', padding: '14px 12px', borderRadius: 12,
              border: '1px solid var(--mist)', textAlign: 'left', background: 'none', cursor: 'pointer', color: 'inherit',
            }}
          >
            <div style={{ fontSize: 20, marginBottom: 6 }}>🆘</div>
            <div style={{ fontWeight: 700, fontSize: 13.5 }}>Help & Support</div>
            <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>Contact your org admin or support</div>
          </button>
        </div>
      </div>

      {showHelp && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ fontSize: 15 }}>Help & Support</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(false)}>Close</button>
          </div>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.6 }}>
            For account, booking, or payment issues, contact your organization's Company Administrator,
            or reach CarVista support at <a href="mailto:support@carvista.app">support@carvista.app</a>.
            For anything about a specific active trip, use the in-trip Chat from <Link to="/trips">My Trips</Link>.
          </p>
        </div>
      )}

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