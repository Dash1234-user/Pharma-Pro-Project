import React, { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import useAuthStore     from './store/authStore';
import useSettingsStore from './store/settingsStore';
import client           from './api/client';
import Layout           from './components/Layout';

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

// ── Protected route wrapper ───────────────────────────────────────────────────
function ProtectedRoute({ children }) {
  const token     = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);
  if (isLoading) return <div className="loader-screen"><div className="loader"/></div>;
  return token ? children : <Navigate to="/login" replace />;
}

// ── Pages wrapped in Layout ───────────────────────────────────────────────────
function PageWrapper({ children, onTopbarAction }) {
  return (
    <ProtectedRoute>
      <Layout onTopbarAction={onTopbarAction}>
        {children}
      </Layout>
    </ProtectedRoute>
  );
}

// ── App root ─────────────────────────────────────────────────────────────────
export default function App() {
  const { token, setUser, clearUser } = useAuthStore();
  const { setSettings }               = useSettingsStore();

  useEffect(() => {
    if (!token) { clearUser(); return; }
    client.get('/auth/me')
      .then(res => { setUser(res.data); return client.get('/settings'); })
      .then(res => setSettings(res.data))
      .catch(() => clearUser());
  }, []);

  return (
    <Routes>
      {/* Public */}
      <Route path="/login"    element={<AuthPage mode="login"    />} />
      <Route path="/register" element={<AuthPage mode="register" />} />

      {/* Protected — all wrapped in Layout */}
      <Route path="/"           element={<PageWrapper><DashboardPage /></PageWrapper>} />
      <Route path="/products"   element={<PageWrapper><ProductsPage /></PageWrapper>} />
      <Route path="/categories" element={<PageWrapper><CategoriesPage /></PageWrapper>} />
      <Route path="/billing"    element={<PageWrapper><BillingPage /></PageWrapper>} />
      <Route path="/history"    element={<PageWrapper><HistoryPage /></PageWrapper>} />
      <Route path="/stock-in"   element={<PageWrapper><StockInPage /></PageWrapper>} />
      <Route path="/expiry"     element={<PageWrapper><ExpiryPage /></PageWrapper>} />
      <Route path="/analysis"   element={<PageWrapper><AnalysisPage /></PageWrapper>} />
      <Route path="/credit"     element={<PageWrapper><CreditPage /></PageWrapper>} />
      <Route path="/purchases"  element={<PageWrapper><PurchasePage /></PageWrapper>} />
      <Route path="/settings"   element={<PageWrapper><SettingsPage /></PageWrapper>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
