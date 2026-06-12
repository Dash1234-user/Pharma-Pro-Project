import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import client from '../api/client';

// Backend categorizes into expired/within30/within60/within90/safe
// Replaces renderExpiryTracker() in app.js — NO TABLE, card list only
const fetchExpiry = () => client.get('/expiry').then(r => r.data);

function fmtMonth(val) {
  if (!val) return '—';
  const [y, m] = val.split('-');
  return `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]} ${y}`;
}
function cur(n) { return '₹' + parseFloat(n || 0).toFixed(2); }

function ExpiryBadge({ daysLeft, expiry }) {
  if (!expiry)        return <span className="badge badge-gray">No Expiry</span>;
  if (daysLeft < 0)   return <span className="badge badge-red">Expired</span>;
  if (daysLeft <= 30) return <span className="badge badge-red">{daysLeft}d left</span>;
  if (daysLeft <= 90) return <span className="badge badge-amber">{daysLeft}d left</span>;
  return <span className="badge badge-green">{fmtMonth(expiry)}</span>;
}

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card" style={{ '--stat-color': color, '--stat-color2': color }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

const FILTERS = [
  { key: 'expired', label: 'Expired',        color: '#ef4444', countKey: 'expired'  },
  { key: '30',      label: 'Within 30 Days', color: '#f97316', countKey: 'within30' },
  { key: '60',      label: 'Within 60 Days', color: '#f59e0b', countKey: 'within60' },
  { key: '90',      label: 'Within 90 Days', color: '#10b981', countKey: 'within90' },
  { key: 'all',     label: 'All by Expiry',  color: '#6366f1', countKey: null       },
];

// ── Card for each medicine — replaces table rows ──────────────────────────────
function ExpiryCard({ p }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding:'12px 16px', background:'white',
      borderBottom:'1px solid var(--border)',
    }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, fontSize:14, color:'var(--text)' }}>{p.name}</div>
        {p.brand && <div style={{ fontSize:12, color:'#94a3b8' }}>{p.brand}</div>}
        <div style={{ display:'flex', gap:8, marginTop:4, flexWrap:'wrap', alignItems:'center' }}>
          <span className="badge badge-blue">{p.categoryName || 'Uncategorized'}</span>
          {p.sku && <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#94a3b8' }}>{p.sku}</span>}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, flexShrink:0, marginLeft:12 }}>
        <ExpiryBadge daysLeft={p.daysLeft} expiry={p.expiry} />
        <div style={{ fontSize:12, color:'#64748b' }}>Exp: {fmtMonth(p.expiry)}</div>
        <div style={{ display:'flex', gap:12, fontSize:12 }}>
          <span style={{ color: p.stock===0?'#ef4444':'#64748b', fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>
            Qty: {p.stock}
          </span>
          <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'#475569' }}>{cur(p.sale)}</span>
        </div>
      </div>
    </div>
  );
}

export default function ExpiryPage() {
  const [filter, setFilter] = useState('expired');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['expiry'],
    queryFn: fetchExpiry,
    staleTime: 60_000,
  });

  const counts  = data?.counts   || {};
  const expired = data?.expired  || [];
  const w30     = data?.within30 || [];
  const w60     = data?.within60 || [];
  const w90     = data?.within90 || [];
  const safe    = data?.safe     || [];

  let products, title;
  if      (filter === 'expired') { products = expired; title = 'Expired Medicines'; }
  else if (filter === '30')      { products = w30;     title = 'Expiring Within 30 Days'; }
  else if (filter === '60')      { products = w60;     title = 'Expiring Within 60 Days'; }
  else if (filter === '90')      { products = w90;     title = 'Expiring Within 90 Days'; }
  else {
    products = [...expired, ...w30, ...w60, ...w90, ...safe]
      .sort((a, b) => (a.daysLeft ?? 9999) - (b.daysLeft ?? 9999));
    title = 'All Medicines by Expiry';
  }

  if (isLoading) return <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading expiry data…</div>;
  if (isError)   return <div style={{ padding:32, textAlign:'center', color:'#ef4444' }}>Failed to load expiry data.</div>;

  return (
    <div className="page-pad">

      {/* Stat cards */}
      <div id="expiry-stats" className="stats-grid" style={{ marginBottom:20 }}>
        <StatCard icon="⛔" value={counts.expired  || 0} label="Expired"        color="#ef4444" />
        <StatCard icon="🔴" value={counts.within30 || 0} label="Within 30 Days" color="#f97316" />
        <StatCard icon="🟡" value={counts.within60 || 0} label="Within 60 Days" color="#f59e0b" />
        <StatCard icon="🟢" value={counts.within90 || 0} label="Within 90 Days" color="#10b981" />
      </div>

      {/* Filter buttons */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {FILTERS.map(f => (
          <button key={f.key}
            className={filter === f.key ? 'btn-primary' : 'btn-outline'}
            style={filter === f.key
              ? { background:f.color, borderColor:f.color }
              : { borderColor:f.color, color:f.color }}
            onClick={() => setFilter(f.key)}>
            {f.label}
            {f.countKey && (
              <span style={{ marginLeft:6, background:'rgba(255,255,255,.25)', borderRadius:99, padding:'1px 6px', fontSize:11 }}>
                {counts[f.countKey] || 0}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Card list — NO TABLE */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div className="card-header">
          <h3 id="expiry-table-title" className="card-title">{title}</h3>
          <span className="badge badge-blue">{products.length} items</span>
        </div>

        {products.length === 0 ? (
          <div style={{ padding:28, textAlign:'center', color:'#94a3b8', fontStyle:'italic' }}>
            ✓ No medicines in this category
          </div>
        ) : (
          <div id="expiry-tbody">
            {products.map(p => <ExpiryCard key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
