import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedLayout, AdminOnlyRoute, EmployeeOnlyRoute } from './components/ProtectedLayout';

import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

import Dashboard from './pages/Dashboard';
import FindRide from './pages/FindRide';
import OfferRide from './pages/OfferRide';
import MyTrips from './pages/MyTrips';
import TripDetail from './pages/TripDetail';
import Vehicles from './pages/Vehicles';
import Wallet from './pages/Wallet';
import RideHistory from './pages/RideHistory';
import Reports from './pages/Reports';
import Settings from './pages/Settings';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminEmployees from './pages/admin/AdminEmployees';
import AdminVehicles from './pages/admin/AdminVehicles';
import AdminSettings from './pages/admin/AdminSettings';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<ProtectedLayout />}>
        <Route element={<EmployeeOnlyRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/find-ride" element={<FindRide />} />
          <Route path="/offer-ride" element={<OfferRide />} />
          <Route path="/trips" element={<MyTrips />} />
          <Route path="/trips/:bookingId" element={<TripDetail />} />
          <Route path="/vehicles" element={<Vehicles />} />
          <Route path="/wallet" element={<Wallet />} />
          <Route path="/history" element={<RideHistory />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
        </Route>

        <Route element={<AdminOnlyRoute />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/employees" element={<AdminEmployees />} />
          <Route path="/admin/vehicles" element={<AdminVehicles />} />
          <Route path="/admin/settings" element={<AdminSettings />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
