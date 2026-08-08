import { useEffect, useState } from 'react';
import api from '../../api/client';

export default function AdminEmployees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', employeeCode: '', password: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/admin/employees');
    setEmployees(res.data.employees);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.post('/admin/employees', form);
      setForm({ fullName: '', email: '', phone: '', employeeCode: '', password: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Could not add employee.');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (id, isActive) => {
    await api.put(`/admin/employees/${id}/status`, { isActive: !isActive });
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="eyebrow">Company Administration</div>
          <h1 className="page-title">Employees</h1>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Cancel' : '+ Add employee'}</button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="card" style={{ maxWidth: 560, marginBottom: 20 }}>
          {error && <div className="form-error">{error}</div>}
          <div className="field-row">
            <div className="field"><label>Full name</label><input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
            <div className="field"><label>Employee code</label><input value={form.employeeCode} onChange={(e) => setForm({ ...form, employeeCode: e.target.value })} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="field"><label>Temporary password</label><input type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          <button className="btn btn-primary btn-block" disabled={saving}>{saving ? 'Adding…' : 'Add employee'}</button>
        </form>
      )}

      {loading ? <div className="spinner" /> : (
        <div className="card" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--slate)', fontSize: 12 }}>
                <th style={th}>Name</th><th style={th}>Email</th><th style={th}>Vehicles</th><th style={th}>Trips</th><th style={th}>Rating</th><th style={th}>Status</th><th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {employees.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--mist)' }}>
                  <td style={td}>{e.full_name}</td>
                  <td style={td}>{e.email}</td>
                  <td style={td}>{e.vehicle_count}</td>
                  <td style={td}>{e.trips_taken}</td>
                  <td style={td}>★ {Number(e.rating).toFixed(1)}</td>
                  <td style={td}><span className={`badge ${e.is_active ? 'badge-green' : 'badge-slate'}`}>{e.is_active ? 'Active' : 'Disabled'}</span></td>
                  <td style={td}><button className="btn btn-ghost btn-sm" onClick={() => toggleStatus(e.id, e.is_active)}>{e.is_active ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { padding: '10px 8px' };
const td = { padding: '10px 8px' };
