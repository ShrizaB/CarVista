import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AuthShell } from './Login';

export default function Register() {
  const { registerEmployee, registerOrganization } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState('employee'); // employee | organization
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', password: '', organizationDomain: '',
    organizationName: '',
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'employee') {
        await registerEmployee({
          fullName: form.fullName, email: form.email, phone: form.phone,
          password: form.password, organizationDomain: form.organizationDomain,
        });
        navigate('/dashboard');
      } else {
        await registerOrganization({
          organizationName: form.organizationName, organizationDomain: form.organizationDomain,
          adminName: form.fullName, adminEmail: form.email, adminPhone: form.phone, adminPassword: form.password,
        });
        navigate('/admin');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Create your account" subtitle="Join your organization's carpool network.">
      <div style={{ display: 'flex', gap: 6, background: 'var(--sky)', padding: 4, borderRadius: 10, marginBottom: 20 }}>
        {[
          ['employee', 'I have a company code'],
          ['organization', 'Register my organization'],
        ].map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => setMode(v)}
            className="btn btn-sm"
            style={{
              flex: 1, background: mode === v ? '#fff' : 'transparent', color: mode === v ? 'var(--ink)' : 'var(--slate)',
              boxShadow: mode === v ? 'var(--shadow-sm)' : 'none', fontWeight: 600,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      <form onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}

        {mode === 'organization' && (
          <div className="field">
            <label>Organization name</label>
            <input required value={form.organizationName} onChange={set('organizationName')} placeholder="Acme Technologies" />
          </div>
        )}

        <div className="field-row">
          <div className="field">
            <label>{mode === 'employee' ? 'Full name' : 'Admin full name'}</label>
            <input required value={form.fullName} onChange={set('fullName')} placeholder="Jane Doe" />
          </div>
          <div className="field">
            <label>Phone</label>
            <input required value={form.phone} onChange={set('phone')} placeholder="98765 43210" />
          </div>
        </div>

        <div className="field">
          <label>{mode === 'employee' ? 'Work email' : 'Admin email'}</label>
          <input type="email" required value={form.email} onChange={set('email')} placeholder="you@company.com" />
        </div>

        <div className="field">
          <label>{mode === 'employee' ? 'Organization domain (given by your admin)' : 'Organization domain'}</label>
          <input required value={form.organizationDomain} onChange={set('organizationDomain')} placeholder="acme.com" />
          {mode === 'employee' && <div className="form-hint">Ask your Company Administrator for this if you don't have it.</div>}
        </div>

        <div className="field">
          <label>Password</label>
          <input type="password" required minLength={6} value={form.password} onChange={set('password')} placeholder="Minimum 6 characters" />
        </div>

        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Creating account…' : mode === 'employee' ? 'Create account' : 'Register organization'}
        </button>
      </form>

      <p style={{ marginTop: 18, fontSize: 13.5, color: 'var(--slate)', textAlign: 'center' }}>
        Already have an account?{' '}
        <Link to="/login" style={{ color: 'var(--route-dark)', fontWeight: 600 }}>Sign in</Link>
      </p>
    </AuthShell>
  );
}
