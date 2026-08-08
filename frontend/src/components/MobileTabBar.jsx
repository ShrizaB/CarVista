import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function MobileTabBar() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'company_admin';

  const links = isAdmin
    ? [
        { to: '/admin', label: 'Home', icon: '⌂' },
        { to: '/admin/employees', label: 'Team', icon: '👥' },
        { to: '/admin/vehicles', label: 'Vehicles', icon: '🚗' },
        { to: '/admin/settings', label: 'Settings', icon: '⚙' },
      ]
    : [
        { to: '/dashboard', label: 'Home', icon: '⌂' },
        { to: '/find-ride', label: 'Find', icon: '🔍' },
        { to: '/offer-ride', label: 'Offer', icon: '🧭' },
        { to: '/trips', label: 'Trips', icon: '🗂' },
        { to: '/settings', label: 'More', icon: '⚙' },
      ];

  return (
    <div className="mobile-tabbar">
      {links.map((l) => (
        <NavLink key={l.to} to={l.to} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span style={{ fontSize: 18 }}>{l.icon}</span>
          <span>{l.label}</span>
        </NavLink>
      ))}
    </div>
  );
}
