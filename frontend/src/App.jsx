import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import useAuthStore    from './store/authStore';
import useSettingsStore from './store/settingsStore';
import client          from './api/client';

// Pages — imported as we build them phase by phase
// For now all point to placeholder components
import AuthPage        from './pages/AuthPage';
import DashboardPage   from './pages/DashboardPage';
import ProductsPage    from './pages/ProductsPage';
import CategoriesPage  from './pages/CategoriesPage';
import BillingPage     from './pages/BillingPage';
import HistoryPage     from './pages/HistoryPage';
import StockInPage     from './pages/StockInPage';
import ExpiryPage      from './pages/ExpiryPage';
import AnalysisPage    from './pages/AnalysisPage';
import CreditPage      from './pages/CreditPage';
import PurchasePage    from './pages/PurchasePage';
import SettingsPage    from './pages/SettingsPage';

// ── Protected Route wrapper ──────────────────────────────────────────
// Replaces the manual token check in initApp() in app.js
function ProtectedRoute({ children }) {
  const token     = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);

  if (isLoading) {
    // Brief loading state while /api/auth/me is in-flight
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loader"></div>
      </div>
    );
  }

  return token ? children : <Navigate to="/login" replace />;
}

// ── App root ─────────────────────────────────────────────────────────
export default function App() {
  const { token, setUser, clearUser } = useAuthStore();
  const { setSettings }               = useSettingsStore();

  // On boot: verify JWT is still valid by calling /api/auth/me
  // Replaces: initApp() → authFetch('/api/auth/me') check in app.js
  useEffect(() => {
    if (!token) {
      clearUser();
      return;
    }
    client.get('/auth/me')
      .then((res) => {
        setUser(res.data);
        // Also hydrate settings store from /api/settings
        return client.get('/settings');
      })
      .then((res) => setSettings(res.data))
      .catch(() => clearUser());
  }, []);   // runs once on app mount

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login"    element={<AuthPage mode="login"    />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      {/* Protected routes — all require valid JWT */}
      <Route path="/"           element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/products"   element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
      <Route path="/categories" element={<ProtectedRoute><CategoriesPage /></ProtectedRoute>} />
      <Route path="/billing"    element={<ProtectedRoute><BillingPage /></ProtectedRoute>} />
      <Route path="/history"    element={<ProtectedRoute><HistoryPage /></ProtectedRoute>} />
      <Route path="/stock-in"   element={<ProtectedRoute><StockInPage /></ProtectedRoute>} />
      <Route path="/expiry"     element={<ProtectedRoute><ExpiryPage /></ProtectedRoute>} />
      <Route path="/analysis"   element={<ProtectedRoute><AnalysisPage /></ProtectedRoute>} />
      <Route path="/credit"     element={<ProtectedRoute><CreditPage /></ProtectedRoute>} />
      <Route path="/purchases"  element={<ProtectedRoute><PurchasePage /></ProtectedRoute>} />
      <Route path="/settings"   element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

      {/* Fallback — unknown routes go to dashboard */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
