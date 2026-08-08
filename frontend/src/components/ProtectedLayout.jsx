import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from './Sidebar';
import MobileTabBar from './MobileTabBar';

export function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}

export function AdminOnlyRoute() {
  const { user } = useAuth();
  if (user?.role !== 'company_admin') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export function EmployeeOnlyRoute() {
  const { user } = useAuth();
  if (user?.role === 'company_admin') return <Navigate to="/admin" replace />;
  return <Outlet />;
}
