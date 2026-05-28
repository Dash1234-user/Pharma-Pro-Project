import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import useSettingsStore from '../store/settingsStore';
import client from '../api/client';

// ── Page metadata — mirrors PAGE_META in app.js exactly ──────────────────────
const PAGE_META = {
  '/':           { title: 'Dashboard',      sub: 'Pharmacy overview at a glance',          action: '⟳ Reset Dashboard' },
  '/products':   { title: 'Inventory',       sub: 'Manage your medicine inventory',         action: '+ Add Medicine' },
  '/stock-in':   { title: 'Stock Details',   sub: 'Track stock entries & purchase records', action: '' },
  '/billing':    { title: 'Billing',         sub: 'Create a new prescription bill',         action: '🖨 Print Last' },
  '/history':    { title: 'Sales History',   sub: 'All past transactions',                  action: 'Export CSV' },
  '/credit':     { title: 'Credit',          sub: 'Amount Due / Pending Payments',          action: '+ Add Receipt' },
  '/analysis':   { title: 'Sales Analysis',  sub: 'Performance insights & trends',          action: 'Export CSV' },
  '/expiry':     { title: 'Expiry Tracker',  sub: 'Monitor expiring medicines',             action: '+ Add Medicine' },
  '/categories': { title: 'Categories',      sub: 'Manage medicine categories',             action: '+ Add Category' },
  '/purchases':  { title: 'Purchase Records',sub: 'Supplier orders & delivery tracking',    action: '+ Add Record' },
  '/settings':   { title: 'Settings',        sub: 'Pharmacy configuration',                 action: 'Save Settings' },
};

// ── SVG icons — extracted from index.html exactly ────────────────────────────
const icons = {
  dashboard: <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  products:  <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  stockin:   <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>,
  billing:   <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  history:   <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  credit:    <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  analysis:  <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  expiry:    <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
  categories:<svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>,
  purchases: <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>,
  settings:  <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/></svg>,
  close:     <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="18" height="18"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

export default function Layout({ children, onTopbarAction }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();
  const { logout } = useAuthStore();
  const { storeType, storeName, isWholesale } = useSettingsStore();

  const activePath = location.pathname;
  const meta = PAGE_META[activePath] || { title: activePath, sub: '', action: '' };

  // Credit nav visible for both Wholesale Pharma and Retail Pharmacy
  // Mirrors checkPharmacyTypeCredit() in app.js
  const showCredit = ['Wholesale Pharma','Retail Pharma','Retail Pharmacy',
    'Hospital Pharmacy','Medical Store','Ayurvedic Store'].includes((storeType||'').trim());

  // Footer date — mirrors footer-date in app.js
  const footerDate = new Date().toLocaleDateString('en-IN',
    { day: 'numeric', month: 'short', year: 'numeric' });

  // Close sidebar on route change (mobile)
  useEffect(() => { setSidebarOpen(false); }, [location]);

  function go(path) { navigate(path); }

  function handleLogout() {
    logout();
    navigate('/login');
  }

  // ── Sidebar nav links ────────────────────────────────────────────────────
  const navLinks = [
    { path: '/',           icon: icons.dashboard,  label: 'Dashboard'   },
    { path: '/products',   icon: icons.products,   label: 'Inventory'   },
    { path: '/stock-in',   icon: icons.stockin,    label: 'Stock Details'},
    { path: '/billing',    icon: icons.billing,    label: 'Billing'     },
    { path: '/history',    icon: icons.history,    label: 'Sales History'},
    showCredit
      ? { path: '/credit', icon: icons.credit,     label: 'Credit'      }
      : null,
    { path: '/analysis',   icon: icons.analysis,   label: 'Analysis'    },
    { path: '/expiry',     icon: icons.expiry,     label: 'Expiry Tracker'},
    { path: '/categories', icon: icons.categories, label: 'Categories'  },
    { path: '/purchases',  icon: icons.purchases,  label: 'Purchase Records'},
    { path: '/settings',   icon: icons.settings,   label: 'Settings'    },
  ].filter(Boolean);

  // ── Bottom nav — 5 items matching index.html exactly ─────────────────────
  const bottomNav = [
    { path: '/',         icon: icons.dashboard, label: 'Home'    },
    { path: '/products', icon: icons.products,  label: 'Inventory'},
    { path: '/billing',  icon: icons.billing,   label: 'Sale',   center: true },
    { path: '/expiry',   icon: icons.expiry,    label: 'Expiry'  },
    { path: '/analysis', icon: icons.analysis,  label: 'Analysis'},
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>

      {/* Sidebar overlay — mobile */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          style={{ display: 'block' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────────────── */}
      <aside id="sidebar" className={sidebarOpen ? 'open' : ''}>
        <div className="sidebar-brand">
          <div className="brand-icon" id="brand-icon"
            style={{ background:'transparent', boxShadow:'none', width:48, height:48, padding:0, overflow:'hidden' }}>
            <div style={{ width:'100%', height:'100%', borderRadius:10,
              background:'linear-gradient(135deg,#0ea5e9,#6366f1)',
              display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:22 }}>💊</div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="brand-name" id="brand-name">{storeName || 'PharmaCare'}</div>
            <div className="brand-type" id="brand-type">
              {storeType || 'Pro Edition'}
            </div>
          </div>
          <button className="sidebar-close-btn" onClick={() => setSidebarOpen(false)}>
            {icons.close}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navLinks.map(({ path, icon, label }) => (
            <a
              key={path}
              className={`nav-link${activePath === path ? ' active' : ''}`}
              onClick={e => { e.preventDefault(); go(path); }}
              href={path}
            >
              {icon}{label}
            </a>
          ))}
          {/* Logout */}
          <a className="nav-link" style={{ marginTop: 'auto', color:'#ef4444' }}
            onClick={handleLogout} href="#">
            <svg className="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </a>
        </nav>

        <div className="sidebar-footer">
          <div className="text-xs text-slate-500">PharmaCare Pro v2.0</div>
          <div className="text-xs font-semibold text-slate-600 mt-0.5" id="footer-date">
            {footerDate}
          </div>
        </div>
      </aside>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <main id="main-content" style={{ flex: 1, minWidth: 0 }}>

        {/* Topbar */}
        <header id="topbar">
          <div className="topbar-left">
            <button className="hamburger-btn" onClick={() => setSidebarOpen(true)}>
              <span/><span/><span/>
            </button>
            <div>
              <h1 id="page-heading" className="page-heading">{meta.title}</h1>
              <p id="page-sub" className="page-sub">{meta.sub}</p>
            </div>
          </div>
          {/* Action button — hidden on settings page, mirrors app.js */}
          {activePath !== '/settings' && meta.action && (
            <button
              id="topbar-action-btn"
              className="btn-primary"
              onClick={onTopbarAction}
            >
              {meta.action}
            </button>
          )}
        </header>

        {/* Page content */}
        <div style={{ padding: '0 0 80px 0' }}>
          {children}
        </div>
      </main>

      {/* ── Bottom nav (mobile) ─────────────────────────────────────────── */}
      <nav id="bottom-nav">
        {bottomNav.map(({ path, icon, label, center }) => (
          <button
            key={path}
            className={`bnav-btn${center ? ' bnav-center' : ''}${activePath === path ? ' active' : ''}`}
            onClick={() => go(path)}
          >
            {icon}<span>{label}</span>
          </button>
        ))}
      </nav>

    </div>
  );
}
