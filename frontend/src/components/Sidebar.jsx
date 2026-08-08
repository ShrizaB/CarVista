import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const employeeLinks = [
  { to: '/dashboard', label: 'Dashboard', icon: '⌂' },
  { to: '/find-ride', label: 'Find a Ride', icon: '🔍' },
  { to: '/offer-ride', label: 'Offer a Ride', icon: '🧭' },
  { to: '/trips', label: 'My Trips', icon: '🗂' },
  { to: '/vehicles', label: 'My Vehicles', icon: '🚗' },
  { to: '/wallet', label: 'Wallet & Payments', icon: '💳' },
  { to: '/history', label: 'Ride History', icon: '📜' },
  { to: '/reports', label: 'Reports & Analytics', icon: '📊' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

const adminLinks = [
  { to: '/admin', label: 'Admin Dashboard', icon: '⌂' },
  { to: '/admin/employees', label: 'Employees', icon: '👥' },
  { to: '/admin/vehicles', label: 'Vehicles', icon: '🚗' },
  { to: '/admin/settings', label: 'Org Settings', icon: '⚙' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'company_admin';
  const links = isAdmin ? adminLinks : employeeLinks;

  return (
    <nav className="sidebar">
      <div className="brand">
        <div className="brand-mark">CV</div>
        <div className="brand-name">CarVista</div>
      </div>

      <div className="nav-section-label">{isAdmin ? 'Administration' : 'Commute'}</div>
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} end={l.to.endsWith('admin')}>
          <span>{l.icon}</span>
          <span>{l.label}</span>
        </NavLink>
      ))}

      <div style={{ marginTop: 'auto', paddingTop: 16 }}>
        <div className="route-line" style={{ marginBottom: 14 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 10px 12px' }}>
          <div className="avatar" style={{ width: 34, height: 34, fontSize: 13 }}>
            {(user?.full_name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('')}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {user?.full_name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11.5 }}>{isAdmin ? 'Company Admin' : 'Employee'}</div>
          </div>
        </div>
        <button className="btn btn-outline btn-block btn-sm" style={{ borderColor: 'rgba(255,255,255,0.2)', color: '#fff' }} onClick={logout}>
          Log out
        </button>
      </div>
    </nav>
  );
}
