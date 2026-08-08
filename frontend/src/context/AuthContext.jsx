import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import api from '../api/client';
import { connectSocket, disconnectSocket } from '../api/socket';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('carvista_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [organization, setOrganization] = useState(() => {
    const raw = localStorage.getItem('carvista_org');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  const persist = (token, user, organization) => {
    localStorage.setItem('carvista_token', token);
    localStorage.setItem('carvista_user', JSON.stringify(user));
    localStorage.setItem('carvista_org', JSON.stringify(organization));
    setUser(user);
    setOrganization(organization);
    connectSocket();
  };

  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    persist(res.data.token, res.data.user, res.data.organization);
    return res.data;
  };

  const registerEmployee = async (payload) => {
    const res = await api.post('/auth/register', payload);
    persist(res.data.token, res.data.user, res.data.organization);
    return res.data;
  };

  const registerOrganization = async (payload) => {
    const res = await api.post('/auth/register-organization', payload);
    persist(res.data.token, res.data.user, res.data.organization);
    return res.data;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('carvista_token');
    localStorage.removeItem('carvista_user');
    localStorage.removeItem('carvista_org');
    setUser(null);
    setOrganization(null);
    disconnectSocket();
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data.user);
      setOrganization(res.data.organization);
      localStorage.setItem('carvista_user', JSON.stringify(res.data.user));
      localStorage.setItem('carvista_org', JSON.stringify(res.data.organization));
    } catch {
      logout();
    }
  }, [logout]);

  useEffect(() => {
    const token = localStorage.getItem('carvista_token');
    if (token) {
      connectSocket();
      refreshMe().finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, organization, loading, login, registerEmployee, registerOrganization, logout, refreshMe }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
