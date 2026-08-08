import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { user } = await login(email, password);
      navigate(user.role === 'company_admin' ? '/admin' : '/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to continue your commute.">
      <form onSubmit={submit}>
        {error && <div className="form-error">{error}</div>}
        <div className="field">
          <label>Work email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button className="btn btn-primary btn-block" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
      <p style={{ marginTop: 18, fontSize: 13.5, color: 'var(--slate)', textAlign: 'center' }}>
        New to CarVista?{' '}
        <Link to="/register" style={{ color: 'var(--route-dark)', fontWeight: 600 }}>
          Register
        </Link>
      </p>
      <div className="divider" />
      <p style={{ fontSize: 12, color: 'var(--slate-light)', textAlign: 'center' }}>
        Demo: admin@acme.com / rohan@acme.com / ananya@acme.com — password <code>Password123!</code>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--sky)', padding: 20 }}>
      <div style={{ width: 420, maxWidth: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'center', marginBottom: 26 }}>
          <div className="brand-mark" style={{ background: 'var(--route)' }}>CV</div>
          <div className="brand-name" style={{ color: 'var(--ink)', fontSize: 20 }}>CarVista</div>
        </div>
        <div className="card" style={{ padding: 30 }}>
          <h2 style={{ fontSize: 22 }}>{title}</h2>
          <p style={{ color: 'var(--slate)', fontSize: 14, marginTop: 6, marginBottom: 22 }}>{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
