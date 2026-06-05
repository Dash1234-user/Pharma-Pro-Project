import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchDashboard = () => client.get('/dashboard').then(r => r.data);

function cur(n) { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function fmtMonth(val) {
  if (!val) return '—';
  const [y,m] = val.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]+' '+y;
}
function daysLeft(expiry) {
  if (!expiry) return 9999;
  const exp = new Date(expiry+'-01'), now = new Date(); now.setDate(1);
  return Math.round((exp-now)/864e5);
}
function expiryBadge(expiry) {
  const d = daysLeft(expiry);
  if (d<0)   return {cls:'badge badge-red',  label:'Expired'};
  if (d<=30) return {cls:'badge badge-red',  label:fmtMonth(expiry)};
  if (d<=90) return {cls:'badge badge-amber',label:fmtMonth(expiry)};
  return           {cls:'badge badge-green', label:fmtMonth(expiry)};
}

function StatCard({icon, value, label, trend, trendDown, color, color2}) {
  return (
    <div className="stat-card" style={{'--stat-color':color,'--stat-color2':color2}}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {trend && <div className={`stat-trend${trendDown?' down':''}`}>{trend}</div>}
    </div>
  );
}

const COLORS = ['#0ea5e9','#10b981','#f97316','#8b5cf6','#f59e0b','#ec4899','#14b8a6','#ef4444'];

export default function DashboardPage() {
  const {storeType, currency} = useSettingsStore();
  const isWS = (storeType||'').trim() === 'Wholesale Pharma';
  const navigate = useNavigate();
  const qc = useQueryClient();

  const {data:dash={}, isLoading} = useQuery({
    queryKey: ['dashboard'],
    queryFn:  fetchDashboard,
    staleTime: 30_000,
  });

  const resetMut = useMutation({
    mutationFn: (payload) => client.post('/dashboard/reset', payload),
    onSuccess:  () => qc.invalidateQueries({queryKey:['dashboard']}),
  });

  function handleReset() {
    const typeKey = isWS ? 'wholesale' : 'retail';
    const label   = isWS ? 'Wholesale' : 'Retail / Hospital / Medical / Ayurvedic';
    if (!window.confirm(
      `Reset the ${label} Dashboard?\n\n` +
      `• Stats, charts, and recent bills will only show data from today onwards.\n` +
      `• Old bills are NOT deleted — only hidden from this dashboard view.\n\nProceed?`
    )) return;
    const today = new Date().toISOString().slice(0,10);
    resetMut.mutate({storeTypeKey: typeKey, resetDate: today});
  }

  // Expose reset to topbar "⟳ Reset Dashboard" button
  if (typeof window !== 'undefined') window.__pharmacare_resetDashboard = handleReset;

  const dashMeta = isWS
    ? {icon:'🏢', label:'Wholesale', color:'#0ea5e9'}
    : {icon:'🏥', label:'Retail',    color:'#10b981'};

  const rev7   = dash.revenue7Days  || [];
  const topP   = dash.topProducts   || [];
  const weekP  = dash.weekProfit    || [0,0,0,0];
  const lowS   = dash.lowStockItems || [];
  const expiry = dash.expiryAlerts  || [];
  const recent = dash.recentBills   || [];

  const weekLabels = ['Week 1\n(Days 1–7)','Week 2\n(Days 8–14)','Week 3\n(Days 15–21)','Week 4\n(Days 22–end)'];
  const weekData   = weekP.map((v,i) => ({name:weekLabels[i], profit:v}));
  const revData    = rev7.map(r => ({
    name: new Date(r.date).toLocaleDateString('en-IN',{weekday:'short',day:'numeric'}),
    revenue: r.revenue,
  }));
  const topData = topP.map((p,i) => ({name: p.name.length>20?p.name.slice(0,20)+'…':p.name, units:p.units, fill:COLORS[i%COLORS.length]}));

  if (isLoading) return <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading dashboard…</div>;

  return (
    <div style={{padding:'20px 24px'}}>

      {/* Type banner + reset note */}
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16,flexWrap:'wrap'}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,background:`${dashMeta.color}18`,border:`1.5px solid ${dashMeta.color}40`,color:dashMeta.color,borderRadius:30,padding:'4px 14px',fontSize:12,fontWeight:700}}>
          {dashMeta.icon} {dashMeta.label} Dashboard
          {dash.resetDate && <span style={{fontWeight:400,opacity:.75,marginLeft:4}}>· since {fmtDate(dash.resetDate)}</span>}
        </span>
      </div>

      {/* Stat cards */}
      <div id="dash-stats" className="stats-grid" style={{marginBottom:20}}>
        <StatCard icon="💊" value={dash.totalProducts||0}  label="Total Medicines"  color="#0ea5e9" color2="#38bdf8"/>
        <StatCard icon="₹"  value={cur(dash.todayRevenue)} label="Today's Revenue"  color="#10b981" color2="#34d399" trend={`${dash.todayBillCount||0} bills today`}/>
        <StatCard icon="⚠️" value={dash.lowStockCount||0}  label="Low Stock Items"  color="#f59e0b" color2="#fbbf24"/>
        <StatCard icon="📅" value={(dash.expiredCount||0)+(dash.expiryAlerts||[]).filter(p=>p.daysLeft>=0).length}
          label="Expiry Alerts" color="#ef4444" color2="#f87171"
          trend={`${dash.expiredCount||0} expired`} trendDown/>
      </div>

      {/* Revenue chart + Low Stock side by side */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20,marginBottom:20,alignItems:'start'}}>
        {/* Revenue last 7 days */}
        <div className="card" style={{padding:'20px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Revenue — Last 7 Days</div>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={revData} margin={{top:4,right:8,left:0,bottom:0}}>
              <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <YAxis tickFormatter={v=>(currency||'₹')+v} tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
              <Tooltip formatter={v=>[(currency||'₹')+parseFloat(v).toFixed(2),'Revenue']}/>
              <Bar dataKey="revenue" fill="rgba(14,165,233,0.85)" radius={[7,7,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Low stock sidebar */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13}}>⚠ Low Stock</div>
          <div id="dash-low-stock" style={{maxHeight:280,overflowY:'auto'}}>
            {lowS.length===0
              ? <div style={{padding:24,textAlign:'center',color:'#94a3b8',fontStyle:'italic',fontSize:13}}>✓ All medicines adequately stocked</div>
              : lowS.map(p=>(
                <div key={p.id} className="low-stock-item">
                  <div><div className="ls-name">{p.name}</div><div style={{fontSize:11,color:'#94a3b8'}}>{p.categoryName||''} · {p.unit}</div></div>
                  <div style={{textAlign:'right'}}><div className="ls-stock">{p.stock}</div><div style={{fontSize:10,color:'#94a3b8'}}>min:{p.minStock}</div></div>
                </div>
              ))
            }
          </div>
        </div>
      </div>

      {/* Top Products chart + Expiring Soon side by side */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 300px',gap:20,marginBottom:20,alignItems:'start'}}>
        <div className="card" style={{padding:'20px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:16}}>Top Selling Medicines</div>
          {topData.length===0
            ? <div style={{padding:40,textAlign:'center',color:'#94a3b8',fontStyle:'italic'}}>No sales data yet</div>
            : <ResponsiveContainer width="100%" height={Math.max(200,topData.length*44)}>
                <BarChart data={topData} layout="vertical" margin={{top:0,right:8,left:0,bottom:0}}>
                  <XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" width={160} tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={v=>[v,'Units Sold']}/>
                  <Bar dataKey="units" radius={[0,6,6,0]}>
                    {topData.map((entry,i)=><Cell key={i} fill={entry.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
          }
        </div>

        {/* Expiring soon */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontWeight:700,fontSize:13}}>🗓 Expiring Soon</span>
            <button onClick={()=>navigate('/expiry')} style={{fontSize:12,color:'#0ea5e9',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>View all →</button>
          </div>
          <div id="dash-expiry-list" style={{maxHeight:310,overflowY:'auto'}}>
            {expiry.length===0
              ? <div style={{padding:20,textAlign:'center',color:'#94a3b8',fontStyle:'italic',fontSize:13}}>✓ No expiry alerts</div>
              : expiry.map(p=>{
                  const eb=expiryBadge(p.expiry);
                  return(
                    <div key={p.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 16px',borderBottom:'1px solid #f1f5f9'}}>
                      <div>
                        <div style={{fontSize:13,fontWeight:600}}>{p.name}</div>
                        <div style={{fontSize:11,color:'#94a3b8'}}>{p.sku||''} · {p.stock} units</div>
                      </div>
                      <span className={eb.cls}>{eb.label}</span>
                    </div>
                  );
                })
            }
          </div>
        </div>
      </div>

      {/* Profit Analysis — Weekly */}
      <div className="card" style={{padding:'20px',marginBottom:20}}>
        <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📈 Profit Analysis — Weekly (This Month)</div>
        <div style={{fontSize:12,color:'#94a3b8',marginBottom:16}}>
          Profit = MRP (Selling Price) – Purchase Price | Grouped by week of current month
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={weekData} margin={{top:4,right:8,left:0,bottom:8}}>
            <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
            <YAxis tickFormatter={v=>(currency||'₹')+v} tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
            <Tooltip formatter={v=>[(currency||'₹')+parseFloat(v).toFixed(2),'Profit']}/>
            <Bar dataKey="profit" radius={[8,8,0,0]}>
              {weekData.map((entry,i)=><Cell key={i} fill={entry.profit>=0?'rgba(16,185,129,0.85)':'rgba(239,68,68,0.85)'}/>)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {/* Week summary badges */}
        <div id="profit-week-summary" style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
          {weekData.map((w,i)=>{
            const pos=w.profit>=0;
            return(
              <div key={i} style={{flex:1,minWidth:120,background:pos?'#f0fdf4':'#fef2f2',borderRadius:10,padding:'10px 14px',border:`1px solid ${pos?'#bbf7d0':'#fecaca'}`}}>
                <div style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>Week {i+1}</div>
                <div style={{fontSize:16,fontWeight:700,color:pos?'#10b981':'#ef4444',fontFamily:"'JetBrains Mono',monospace"}}>
                  {(currency||'₹')}{w.profit.toFixed(2)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Bills */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
          <span style={{fontWeight:700,fontSize:13}}>Recent Bills</span>
          <button onClick={()=>navigate('/history')} style={{fontSize:12,color:'#0ea5e9',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>View all →</button>
        </div>
        <div id="dash-recent-bills">
          {recent.length===0
            ? <div style={{padding:24,textAlign:'center',color:'#94a3b8',fontStyle:'italic'}}>No bills yet for this pharmacy type</div>
            : recent.map(b=>(
              <div key={b.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'9px 20px',borderBottom:'1px solid #f1f5f9'}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,fontWeight:700,background:'#f0f9ff',color:'#0369a1',padding:'2px 8px',borderRadius:20,whiteSpace:'nowrap'}}>
                    #{b.billNo}
                  </span>
                  <div>
                    <div style={{fontSize:13,fontWeight:600}}>{b.customer}</div>
                    <div style={{fontSize:11,color:'#94a3b8'}}>{fmtDate(b.date)} · {b.doctor||''}{b.doctor?' · ':''}{b.paymentMode}</div>
                  </div>
                </div>
                <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#10b981',whiteSpace:'nowrap'}}>{cur(b.grandTotal)}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}
