import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, Doughnut,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchAnalysis = (days) => client.get(`/analysis?days=${days}`).then(r => r.data);

function cur(n)  { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtD(d) { return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short'}); }

const COLORS = ['#0ea5e9','#10b981','#f97316','#8b5cf6','#f59e0b','#ec4899','#14b8a6','#ef4444','#6366f1'];

function ChartCard({title, subtitle, children, height=320}) {
  return (
    <div className="card" style={{padding:'20px'}}>
      <div style={{fontWeight:700,fontSize:14,marginBottom:subtitle?4:14}}>{title}</div>
      {subtitle&&<div style={{fontSize:12,color:'#94a3b8',marginBottom:14}}>{subtitle}</div>}
      <div style={{height}}>{children}</div>
    </div>
  );
}

function StatCard({icon, value, label, color, color2}) {
  return (
    <div className="stat-card" style={{'--stat-color':color,'--stat-color2':color2}}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value" style={{fontSize:value&&String(value).length>8?16:undefined}}>{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function EmptyChart({msg='No data in this period'}) {
  return <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',color:'#94a3b8',fontStyle:'italic',fontSize:13}}>{msg}</div>;
}

export default function AnalysisPage() {
  const {storeType, currency} = useSettingsStore();
  const isWS = (storeType||'').trim() === 'Wholesale Pharma';
  const [period, setPeriod] = useState(7);

  const {data:an={}, isLoading} = useQuery({
    queryKey: ['analysis', period],
    queryFn:  ()=>fetchAnalysis(period),
    staleTime: 60_000,
  });

  const cur$ = currency||'₹';

  /* ── Derived data ── */
  const dashMeta = isWS
    ? {icon:'🏢',label:'Wholesale',color:'#0ea5e9'}
    : {icon:'🏥',label:'Retail',   color:'#10b981'};

  const revData  = (an.revenueByDay||[]).map(r=>({name:fmtD(r.date),revenue:r.revenue}));
  const prodRows = an.productSales || [];
  const catData  = (an.categorySales||[]).map((c,i)=>({name:c.name,value:c.revenue,fill:COLORS[i%COLORS.length]}));
  const payData  = (an.paymentBreakdown||[]).map((p,i)=>({name:`${p.mode} (${cur(p.total)})`,value:p.total,fill:COLORS[i%COLORS.length]}));
  const topBar   = prodRows.slice(0,8).map((p,i)=>({name:p.name.length>22?p.name.slice(0,22)+'…':p.name,units:p.units,fill:COLORS[i%COLORS.length]}));
  const totalRev = an.totalRevenue||0;

  /* Wholesale extras */
  const custData  = (an.topCustomers||[]).slice(0,8).map((c,i)=>({name:c.customer.length>22?c.customer.slice(0,22)+'…':c.customer,revenue:c.revenue,fill:COLORS[i%COLORS.length]}));
  const stripData = (an.stripSales||[]).slice(0,8).map((s,i)=>({name:s.name.length>22?s.name.slice(0,22)+'…':s.name,strips:s.strips,fill:COLORS[i%COLORS.length]}));

  /* Retail profit chart */
  const weekP    = an.weekProfit||[0,0,0,0];
  const weekData = weekP.map((v,i)=>({name:`Week ${i+1}`,profit:v}));

  return (
    <div style={{padding:'20px 24px'}}>

      {/* Period tabs */}
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {[{d:7,l:'7 Days'},{d:30,l:'30 Days'},{d:90,l:'90 Days'},{d:365,l:'1 Year'}].map(({d,l})=>(
          <button key={d} onClick={()=>setPeriod(d)}
            style={{padding:'6px 18px',borderRadius:99,border:`1.5px solid ${period===d?'var(--accent)':'#e2e8f0'}`,
              background:period===d?'var(--accent)':'white',color:period===d?'white':'#64748b',
              fontWeight:700,fontSize:13,cursor:'pointer',transition:'all .15s'}}>
            {l}
          </button>
        ))}
      </div>

      {/* Type banner */}
      <div style={{marginBottom:16}}>
        <span style={{display:'inline-flex',alignItems:'center',gap:6,background:`${dashMeta.color}18`,border:`1.5px solid ${dashMeta.color}40`,color:dashMeta.color,borderRadius:30,padding:'4px 14px',fontSize:12,fontWeight:700}}>
          {dashMeta.icon} {dashMeta.label} Analysis
        </span>
      </div>

      {/* Stat cards */}
      <div id="analysis-stats" className="stats-grid" style={{marginBottom:20}}>
        {isWS ? <>
          <StatCard icon="🧾" value={an.totalBills||0}             label="Total Invoices"      color="#0ea5e9" color2="#38bdf8"/>
          <StatCard icon="₹"  value={cur(an.totalRevenue)}          label="Wholesale Revenue"   color="#10b981" color2="#34d399"/>
          <StatCard icon="📦" value={cur(an.avgBillValue)}          label="Avg Invoice Value"   color="#f97316" color2="#fb923c"/>
          <StatCard icon="🏪" value={an.uniqueRetailers||0}         label="Active Retailers"    color="#8b5cf6" color2="#a78bfa"/>
        </> : <>
          <StatCard icon="🧾" value={an.totalBills||0}              label="Total Bills"         color="#0ea5e9" color2="#38bdf8"/>
          <StatCard icon="₹"  value={cur(an.totalRevenue)}          label="Total Revenue"       color="#10b981" color2="#34d399"/>
          <StatCard icon="📈" value={cur(an.avgBillValue)}          label="Avg Bill Value"      color="#f97316" color2="#fb923c"/>
          <StatCard icon="🏆" value={(an.topProduct||'—').split(' ').slice(0,2).join(' ')} label="Top Medicine" color="#8b5cf6" color2="#a78bfa"/>
        </>}
      </div>

      {isLoading && <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading analysis…</div>}

      {/* Row 1: Daily Revenue line + Category doughnut */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
        <ChartCard title={isWS?'Daily Wholesale Revenue':'Daily Revenue'} height={260}>
          {revData.length===0 ? <EmptyChart/>
          : <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revData} margin={{top:4,right:8,left:0,bottom:0}}>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>cur$+v} tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <Tooltip formatter={v=>[cur$+parseFloat(v).toFixed(2),'Revenue']}/>
                <Line type="monotone" dataKey="revenue" stroke={dashMeta.color} strokeWidth={2.5}
                  dot={{fill:dashMeta.color,r:4}} fill={dashMeta.color+'1a'}/>
              </LineChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="Category Breakdown" height={260}>
          {catData.length===0 ? <EmptyChart/>
          : <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" cx="50%" cy="45%"
                  innerRadius="52%" outerRadius="78%" paddingAngle={2}>
                  {catData.map((c,i)=><Cell key={i} fill={c.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>[cur(v),'Revenue']}/>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{fontSize:11,paddingTop:8}}/>
              </PieChart>
            </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Row 2: Top Products bar + Payment Mode pie */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
        <ChartCard title={isWS?'Top Products by Volume':'Top Medicines'} height={Math.max(260,topBar.length*44)}>
          {topBar.length===0 ? <EmptyChart/>
          : <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBar} layout="vertical" margin={{top:0,right:8,left:0,bottom:0}}>
                <XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis type="category" dataKey="name" width={160} tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false}/>
                <Tooltip formatter={v=>[v,'Units']}/>
                <Bar dataKey="units" radius={[0,6,6,0]}>
                  {topBar.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>}
        </ChartCard>

        <ChartCard title="Payment Mode Split" height={260}>
          {payData.length===0 ? <EmptyChart/>
          : <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={payData} dataKey="value" nameKey="name" cx="50%" cy="45%"
                  outerRadius="72%" paddingAngle={2}>
                  {payData.map((p,i)=><Cell key={i} fill={p.fill}/>)}
                </Pie>
                <Tooltip formatter={v=>[cur(v),'Revenue']}/>
                <Legend iconType="circle" iconSize={10} wrapperStyle={{fontSize:11,paddingTop:8}}/>
              </PieChart>
            </ResponsiveContainer>}
        </ChartCard>
      </div>

      {/* Wholesale-only: Top Customers + Strip Sales */}
      {isWS && (
        <div id="analysis-wholesale-extra" style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
          <ChartCard title="🏪 Top Customers / Retailers" subtitle="Revenue contribution by retailer in the selected period"
            height={Math.max(260,custData.length*44)}>
            {custData.length===0 ? <EmptyChart/>
            : <ResponsiveContainer width="100%" height="100%">
                <BarChart data={custData} layout="vertical" margin={{top:0,right:8,left:0,bottom:0}}>
                  <XAxis type="number" tickFormatter={v=>cur$+v} tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                  <YAxis type="category" dataKey="name" width={160} tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false}/>
                  <Tooltip formatter={v=>[cur(v),'Revenue']}/>
                  <Bar dataKey="revenue" radius={[0,6,6,0]}>
                    {custData.map((e,i)=><Cell key={i} fill={e.fill}/>)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>}
          </ChartCard>

          <ChartCard title="🍫 Top Products by Strip Sales" subtitle="Medicines sold in strip format from billing — top 8 by strip count"
            height={Math.max(260,stripData.length*44)}>
            {stripData.length===0
              ? <div style={{height:'100%',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',color:'#94a3b8',fontSize:13,textAlign:'center'}}>
                  <div style={{fontSize:18,marginBottom:8}}>📦</div>
                  <div style={{fontStyle:'italic'}}>No strip-wise sales in this period.</div>
                  <div style={{fontSize:11,marginTop:4}}>Strip sales from the Billing section will appear here.</div>
                </div>
              : <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stripData} layout="vertical" margin={{top:0,right:8,left:0,bottom:0}}>
                    <XAxis type="number" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                    <YAxis type="category" dataKey="name" width={160} tick={{fontSize:11,fill:'#475569'}} axisLine={false} tickLine={false}/>
                    <Tooltip formatter={v=>[v,'Strips']}/>
                    <Bar dataKey="strips" radius={[0,6,6,0]}>
                      {stripData.map((e,i)=><Cell key={i} fill={['#8b5cf6','#6366f1','#0ea5e9','#10b981','#f97316','#f59e0b','#ec4899','#14b8a6'][i%8]}/>)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>}
          </ChartCard>
        </div>
      )}

      {/* Retail-only: Weekly Profit */}
      {!isWS && (
        <div id="analysis-retail-extra" style={{marginBottom:20}}>
          <div className="card" style={{padding:'20px'}}>
            <div style={{fontWeight:700,fontSize:14,marginBottom:4}}>📈 Profit Analysis — Weekly (This Month)</div>
            <div style={{fontSize:12,color:'#94a3b8',marginBottom:16}}>Profit = MRP (Selling Price) – Purchase Price | Grouped by week of current month</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weekData} margin={{top:4,right:8,left:0,bottom:8}}>
                <XAxis dataKey="name" tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <YAxis tickFormatter={v=>cur$+v} tick={{fontSize:11,fill:'#94a3b8'}} axisLine={false} tickLine={false}/>
                <Tooltip formatter={v=>[cur$+parseFloat(v).toFixed(2),'Profit']}/>
                <Bar dataKey="profit" radius={[8,8,0,0]}>
                  {weekData.map((e,i)=><Cell key={i} fill={e.profit>=0?'rgba(16,185,129,0.85)':'rgba(239,68,68,0.85)'}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:14}}>
              {weekData.map((w,i)=>{
                const pos=w.profit>=0;
                return(
                  <div key={i} style={{flex:1,minWidth:120,background:pos?'#f0fdf4':'#fef2f2',borderRadius:10,padding:'10px 14px',border:`1px solid ${pos?'#bbf7d0':'#fecaca'}`}}>
                    <div style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>Week {i+1}</div>
                    <div style={{fontSize:16,fontWeight:700,color:pos?'#10b981':'#ef4444',fontFamily:"'JetBrains Mono',monospace"}}>
                      {cur$}{w.profit.toFixed(2)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Product Sales Performance table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13}}>
          {isWS?'Product Sales Performance':'Sales Performance'}
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>MEDICINE</th>
                <th>CATEGORY</th>
                <th>UNITS SOLD</th>
                <th>REVENUE</th>
                <th>AVG PRICE</th>
                <th>SHARE %</th>
              </tr>
            </thead>
            <tbody id="analysis-prod-tbody">
              {prodRows.length===0
                ? <tr className="empty-row"><td colSpan={6}>No sales in this period</td></tr>
                : prodRows.map((p,i)=>{
                    const contrib = totalRev>0?((p.revenue/totalRev)*100).toFixed(1):'0';
                    return(
                      <tr key={i}>
                        <td style={{fontWeight:600}}>{p.name}</td>
                        <td><span className="badge badge-blue">{p.category||'Uncategorized'}</span></td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{Math.round(p.units)}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",color:'var(--accent)',fontWeight:700}}>{cur(p.revenue)}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace"}}>{p.units>0?cur(p.revenue/p.units):'—'}</td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                            <div style={{flex:1,background:'#f1f5f9',borderRadius:99,height:6}}>
                              <div style={{width:`${contrib}%`,background:'linear-gradient(90deg,#0ea5e9,#38bdf8)',height:6,borderRadius:99}}/>
                            </div>
                            <span style={{fontSize:12,fontWeight:700,color:'#0ea5e9',minWidth:38}}>{contrib}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
