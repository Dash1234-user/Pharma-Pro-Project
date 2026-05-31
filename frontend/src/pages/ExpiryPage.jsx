import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';

// ── API ───────────────────────────────────────────────────────────────────────
// Backend already categorizes into expired/within30/within60/within90/safe
// Replaces: renderExpiryTracker() + expiryDaysLeft() + getExpiryBadge() in app.js
const fetchExpiry = () => client.get('/expiry').then(r => r.data);

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMonth(val) {
  if (!val) return '—';
  const [y, m] = val.split('-');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]} ${y}`;
}
function cur(n) { return '₹' + parseFloat(n || 0).toFixed(2); }

function ExpiryBadge({ daysLeft, expiry }) {
  if (!expiry)       return <span className="badge badge-gray">No Expiry</span>;
  if (daysLeft < 0)  return <span className="badge badge-red">Expired</span>;
  if (daysLeft <= 30) return <span className="badge badge-red">{daysLeft}d left</span>;
  if (daysLeft <= 90) return <span className="badge badge-amber">{daysLeft}d left</span>;
  return <span className="badge badge-green">{fmtMonth(expiry)}</span>;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon, value, label, color, color2 }) {
  return (
    <div className="stat-card" style={{ '--stat-color': color, '--stat-color2': color2 }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

// ── Filter buttons ────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'expired', label: 'Expired',       color: '#ef4444' },
  { key: '30',      label: 'Within 30 Days',color: '#f97316' },
  { key: '60',      label: 'Within 60 Days',color: '#f59e0b' },
  { key: '90',      label: 'Within 90 Days',color: '#10b981' },
  { key: 'all',     label: 'All by Expiry', color: '#6366f1' },
];

// ── Product table ─────────────────────────────────────────────────────────────
function ExpiryTable({ products }) {
  if (!products.length) return (
    <tr className="empty-row">
      <td colSpan="8" style={{ textAlign:'center', color:'#94a3b8', fontStyle:'italic', padding:24 }}>
        ✓ No medicines in this category
      </td>
    </tr>
  );
  return products.map((p, i) => (
    <tr key={p.id}>
      <td style={{ color:'#94a3b8' }}>{i + 1}</td>
      <td>
        <div style={{ fontWeight:600 }}>{p.name}</div>
        {p.brand && <div style={{ fontSize:11, color:'#94a3b8' }}>{p.brand}</div>}
      </td>
      <td><span className="badge badge-blue">{p.categoryName || 'Uncategorized'}</span></td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{p.sku || '—'}</td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{fmtMonth(p.expiry)}</td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color: p.stock===0?'#ef4444':'#64748b' }}>
        {p.stock}
      </td>
      <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(p.sale)}</td>
      <td><ExpiryBadge daysLeft={p.daysLeft} expiry={p.expiry} /></td>
    </tr>
  ));
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function ExpiryMobileCard({ p }) {
  return (
    <div className="m-card">
      <div className="m-card-hd">
        <div className="m-card-name">{p.name}</div>
        <ExpiryBadge daysLeft={p.daysLeft} expiry={p.expiry} />
      </div>
      <div className="m-card-row"><span>Category</span><strong>{p.categoryName || 'Uncategorized'}</strong></div>
      <div className="m-card-row"><span>Batch</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{p.sku || '—'}</strong></div>
      <div className="m-card-row"><span>Expiry</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{fmtMonth(p.expiry)}</strong></div>
      <div className="m-card-row">
        <span>Stock</span>
        <strong style={{ fontFamily:"'JetBrains Mono',monospace", color: p.stock===0?'#ef4444':'#64748b' }}>
          {p.stock} units
        </strong>
      </div>
      <div className="m-card-row"><span>MRP</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(p.sale)}</strong></div>
      {p.brand && <div className="m-card-row"><span>Manufacturer</span><strong>{p.brand}</strong></div>}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ExpiryPage() {
  const [filter, setFilter] = useState('expired');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expiry'],
    queryFn: fetchExpiry,
    staleTime: 60_000,   // 1 min — expiry data doesn't change frequently
  });

  const counts  = data?.counts  || {};
  const expired = data?.expired || [];
  const w30     = data?.within30 || [];
  const w60     = data?.within60 || [];
  const w90     = data?.within90 || [];
  const safe    = data?.safe    || [];

  // Build filtered list + title — mirrors renderExpiryTracker() in app.js
  let products, title;
  if (filter === 'expired') { products = expired; title = 'Expired Medicines'; }
  else if (filter === '30') { products = w30;     title = 'Expiring Within 30 Days'; }
  else if (filter === '60') { products = w60;     title = 'Expiring Within 60 Days'; }
  else if (filter === '90') { products = w90;     title = 'Expiring Within 90 Days'; }
  else {
    // All sorted by daysLeft — mirrors 'all' filter in app.js
    products = [...expired, ...w30, ...w60, ...w90, ...safe]
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    title = 'All Medicines by Expiry';
  }

  if (isLoading) return <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading expiry data…</div>;
  if (isError)   return <div style={{ padding:32, textAlign:'center', color:'#ef4444' }}>Failed to load expiry data.</div>;

  return (
    <div style={{ padding: '20px 24px' }}>

      {/* Stat cards — mirrors expiry-stats in app.js */}
      <div id="expiry-stats" className="stats-grid" style={{ marginBottom: 20 }}>
        <StatCard icon="⛔" value={counts.expired || 0}  label="Expired"        color="#ef4444" color2="#f87171" />
        <StatCard icon="🔴" value={counts.within30 || 0} label="Within 30 Days" color="#f97316" color2="#fb923c" />
        <StatCard icon="🟡" value={counts.within60 || 0} label="Within 60 Days" color="#f59e0b" color2="#fbbf24" />
        <StatCard icon="🟢" value={counts.within90 || 0} label="Within 90 Days" color="#10b981" color2="#34d399" />
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {FILTERS.map(f => (
          <button key={f.key}
            className={filter === f.key ? 'btn-primary' : 'btn-outline'}
            style={filter === f.key ? { background: f.color, borderColor: f.color } : { borderColor: f.color, color: f.color }}
            onClick={() => setFilter(f.key)}>
            {f.label}
            {f.key !== 'all' && (
              <span style={{
                marginLeft:6, background:'rgba(255,255,255,.25)',
                borderRadius:99, padding:'1px 6px', fontSize:11
              }}>
                {counts[f.key === '30' ? 'within30' : f.key === '60' ? 'within60' : f.key === '90' ? 'within90' : 'expired'] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table — desktop */}
      <div className="card table-card">
        <div className="card-header">
          <h3 id="expiry-table-title" className="card-title">{title}</h3>
          <span className="badge badge-blue">{products.length} items</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Medicine</th>
                <th>Category</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th>Stock</th>
                <th>MRP</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="expiry-tbody">
              <ExpiryTable products={products} />
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div id="expiry-mobile" className="mobile-cards" style={{ marginTop:12 }}>
        {products.length === 0 ? (
          <div style={{ textAlign:'center', padding:28, color:'#94a3b8', fontStyle:'italic' }}>
            ✓ No medicines in this category
          </div>
        ) : (
          products.map(p => <ExpiryMobileCard key={p.id} p={p} />)
        )}
      </div>
    </div>
  );
}
