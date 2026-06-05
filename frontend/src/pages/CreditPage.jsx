import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchCredits    = (filter) => client.get(`/credits?filter=${filter}`).then(r => r.data);

function cur(n)  { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function today() { return new Date().toISOString().slice(0,10); }

/* ── Modal wrapper using correct CSS ── */
function Modal({title, onClose, children, footer}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={e=>e.stopPropagation()} style={{maxHeight:'92vh',overflowY:'auto'}}>
        <div className="modal-hd">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
        {footer&&<div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>{footer}</div>}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   WHOLESALE CREDIT
══════════════════════════════════════════════════ */
function WholesaleCredit() {
  const qc = useQueryClient();
  const [filter,    setFilter]    = useState('all');
  const [showForm,  setShowForm]  = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [clearedId, setClearedId] = useState(null);  // for "Payment Received" popup
  const [form,      setForm]      = useState({date:today(),shopName:'',shopkeeperName:'',phone:'',forItem:'',amount:'',method:'UPI',status:'Pending'});
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  const {data:resp={}, isLoading} = useQuery({
    queryKey: ['credits', filter],
    queryFn:  ()=>fetchCredits(filter),
    staleTime: 30_000,
  });
  const credits = resp.credits || resp || [];

  const addMut = useMutation({
    mutationFn: p=>client.post('/credits',p),
    onSuccess:(res)=>{
      qc.invalidateQueries({queryKey:['credits']});
      setForm({date:today(),shopName:'',shopkeeperName:'',phone:'',forItem:'',amount:'',method:'UPI',status:'Pending'});
      setShowForm(false); setError('');
    },
    onError:e=>setError(e.response?.data?.error||'Add credit failed'),
  });

  const patchMut = useMutation({
    mutationFn:({id,payload})=>client.patch(`/credits/${id}`,payload),
    onSuccess:(res,vars)=>{
      qc.invalidateQueries({queryKey:['credits']});
      if(vars.payload.status==='Cleared') setClearedId(vars.id);
    },
  });

  const deleteBulkMut = useMutation({
    mutationFn:(period)=>client.delete(`/credits/bulk?period=${period}`),
    onSuccess:()=>{ qc.invalidateQueries({queryKey:['credits']}); setShowClear(false); },
  });

  function handleAdd() {
    setError('');
    if(!form.date||!form.shopName.trim()||!form.shopkeeperName.trim()||!form.amount||parseFloat(form.amount)<=0){
      setError('Date, Shop Name, Shopkeeper Name and Amount are required'); return;
    }
    addMut.mutate({...form,amount:parseFloat(form.amount)});
  }

  function markCleared(c) { patchMut.mutate({id:c.id,payload:{status:'Cleared'}}); }

  const f = v=>({...form,[v[0]]:v[1]});
  const inp = (k,opts={})=>(
    <input className="form-input" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})} {...opts}/>
  );
  const sel = (k,opts)=>(
    <select className="form-input" value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}>
      {opts.map(o=><option key={o}>{o}</option>)}
    </select>
  );

  const arr = Array.isArray(credits) ? credits : [];
  const totalAmt   = arr.reduce((s,c)=>s+c.amount,0);
  const pendingAmt = arr.filter(c=>c.status==='Pending').reduce((s,c)=>s+c.amount,0);
  const clearedAmt = arr.filter(c=>c.status==='Cleared').reduce((s,c)=>s+c.amount,0);
  const clearedEntry = arr.find(c=>c.id===clearedId);

  return (
    <>
      {/* Payment Received popup */}
      {clearedId && clearedEntry && (
        <Modal title="✅ Payment Received" onClose={()=>setClearedId(null)}
          footer={<button className="btn-primary" onClick={()=>setClearedId(null)}>Close</button>}>
          <div style={{textAlign:'center',padding:'8px 0'}}>
            <div style={{fontSize:32,marginBottom:12}}>🎉</div>
            <div style={{fontSize:15,fontWeight:600}}>Payment of <strong style={{color:'#10b981'}}>{cur(clearedEntry.amount)}</strong> from <strong>{clearedEntry.shopkeeperName}</strong></div>
            <div style={{fontSize:13,color:'#64748b',marginTop:4}}>{clearedEntry.shopName} · {clearedEntry.method}</div>
          </div>
        </Modal>
      )}

      {/* Clear records modal */}
      {showClear && (
        <Modal title="Clear Credit Records" onClose={()=>setShowClear(false)}
          footer={<button className="btn-outline" onClick={()=>setShowClear(false)}>Cancel</button>}>
          <div style={{fontSize:13,color:'#64748b',marginBottom:16}}>Permanently delete credit records from a period. This cannot be undone.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[{p:'7',l:'Last 7 Days'},{p:'30',l:'This Month'},{p:'90',l:'Last 90 Days'}].map(({p,l})=>(
              <button key={p} className="btn-outline"
                style={{justifyContent:'flex-start',color:'#ef4444',borderColor:'#fecaca',background:'#fef2f2'}}
                onClick={()=>{ if(window.confirm(`Delete all credit records from ${l}?`)) deleteBulkMut.mutate(p); }}>
                🗑️ Clear {l}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Summary bar */}
      <div id="credit-summary-bar" style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
        {[
          {label:'Total',   amt:totalAmt,   bg:'#f0f9ff',border:'#bae6fd',color:'#0ea5e9'},
          {label:'Pending', amt:pendingAmt, bg:'#fef2f2',border:'#fecaca',color:'#ef4444'},
          {label:'Cleared', amt:clearedAmt, bg:'#f0fdf4',border:'#bbf7d0',color:'#10b981'},
        ].map(({label,amt,bg,border,color})=>(
          <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:'10px 20px',textAlign:'center',minWidth:120}}>
            <div style={{fontSize:10,color:'#94a3b8',fontWeight:600,textTransform:'uppercase'}}>{label}</div>
            <div style={{fontSize:16,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color}}>{cur(amt)}</div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>New Payment Receipt</div>
          {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div className="form-group">
              <label className="form-label">DATE *</label>
              {inp('date',{type:'date'})}
            </div>
            <div className="form-group">
              <label className="form-label">SHOP NAME *</label>
              {inp('shopName',{placeholder:'Shop / Store name'})}
            </div>
            <div className="form-group">
              <label className="form-label">SHOPKEEPER NAME *</label>
              {inp('shopkeeperName',{placeholder:'Full name'})}
            </div>
            <div className="form-group">
              <label className="form-label">PHONE NO.</label>
              {inp('phone',{placeholder:'10-digit mobile'})}
            </div>
            <div className="form-group">
              <label className="form-label">FOR ITEM</label>
              {inp('forItem',{placeholder:'Medicine / Product name'})}
            </div>
            <div className="form-group">
              <label className="form-label">PAYMENT AMOUNT ₹ *</label>
              {inp('amount',{type:'number',min:'0',step:'0.01',placeholder:'0.00'})}
            </div>
            <div className="form-group">
              <label className="form-label">PAYMENT METHOD</label>
              {sel('method',['UPI','Cash','NEFT','Card','Cheque','Insurance','Other'])}
            </div>
            <div className="form-group">
              <label className="form-label">STATUS</label>
              {sel('status',['Pending','Cleared'])}
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button className="btn-primary" onClick={handleAdd} disabled={addMut.isPending}>
              {addMut.isPending?'Saving…':'✓ Add to Table'}
            </button>
            <button className="btn-outline" onClick={()=>{setShowForm(false);setError('');}}>Cancel</button>
          </div>
        </div>
      )}

      {/* Controls: add + filter + clear */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',gap:10}}>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
            <span className="card-title">Credit</span>
            <span style={{fontSize:12,color:'#64748b'}}>Amount Due / Pending Payments</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            {!showForm&&<button className="btn-primary" style={{fontSize:13,padding:'7px 14px'}} onClick={()=>setShowForm(true)}>+ Add a Payment Receipt</button>}
            <button className="btn-outline" style={{fontSize:13,padding:'7px 14px',color:'#ef4444',borderColor:'#fecaca'}} onClick={()=>setShowClear(true)}>🗑 Clear Records</button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{display:'flex',gap:6,padding:'10px 20px',borderBottom:'1px solid var(--border)'}}>
          {[{f:'all',l:'All'},{f:'7',l:'Last 7 Days'},{f:'30',l:'This Month'},{f:'90',l:'Last 90 Days'}].map(({f,l})=>(
            <button key={f} id={`cf-${f}`} onClick={()=>setFilter(f)}
              style={{padding:'5px 14px',borderRadius:99,border:`1.5px solid ${filter===f?'var(--accent)':'#e2e8f0'}`,
                background:filter===f?'#f0f9ff':'white',color:filter===f?'var(--accent)':'#64748b',
                fontWeight:filter===f?700:400,fontSize:13,cursor:'pointer'}}>
              {l}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? (
          <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:860}}>
              <thead>
                <tr>
                  <th style={{width:40}}>SL. NO.</th>
                  <th style={{minWidth:100}}>DATE</th>
                  <th style={{minWidth:130}}>SHOP NAME</th>
                  <th style={{minWidth:140}}>SHOPKEEPER NAME</th>
                  <th style={{minWidth:110}}>PHONE NO.</th>
                  <th style={{minWidth:130}}>FOR ITEM</th>
                  <th style={{minWidth:110}}>PAYMENT AMOUNT</th>
                  <th style={{minWidth:90}}>PAYMENT METHOD</th>
                  <th style={{minWidth:90}}>STATUS</th>
                  <th style={{minWidth:100}}>ACTION</th>
                </tr>
              </thead>
              <tbody id="credit-tbody">
                {arr.length===0 ? (
                  <tr className="empty-row"><td colSpan={10}>No payment records yet. Click "+ Add a Payment Receipt" to begin.</td></tr>
                ) : arr.map((c,i)=>{
                  const isPending = c.status==='Pending';
                  return(
                    <tr key={c.id} style={{background:isPending?'#fffbeb':''}}>
                      <td style={{color:'#94a3b8',fontSize:12,textAlign:'center'}}>{i+1}</td>
                      <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(c.date)}</td>
                      <td style={{fontWeight:600}}>{c.shopName}</td>
                      <td>{c.shopkeeperName}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{c.phone||'—'}</td>
                      <td style={{fontSize:12}}>{c.forItem||'—'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap'}}>{cur(c.amount)}</td>
                      <td><span className="badge badge-blue">{c.method}</span></td>
                      <td>
                        {isPending
                          ? <span className="badge badge-red" style={{fontWeight:700}}>Pending</span>
                          : <span className="badge badge-green" style={{fontWeight:700}}>Cleared</span>}
                      </td>
                      <td>
                        {isPending
                          ? <button onClick={()=>markCleared(c)}
                              style={{background:'#ecfdf5',color:'#059669',padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:700,border:'1px solid #a7f3d0',cursor:'pointer',whiteSpace:'nowrap'}}>
                              ✓ Received
                            </button>
                          : <span style={{color:'#94a3b8',fontSize:11,fontStyle:'italic'}}>Done</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ══════════════════════════════════════════════════
   RETAIL CREDIT (shop-credits)
══════════════════════════════════════════════════ */
function RetailCredit() {
  // Retail uses /api/shop-credits endpoint — same UI pattern as wholesale
  // but columns are simpler (no shopkeeper vs shop distinction for retail)
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({date:today(),shopName:'',shopkeeperName:'',phone:'',forItem:'',amount:'',method:'UPI',status:'Pending'});
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState('');

  const {data:resp={}, isLoading} = useQuery({
    queryKey: ['shop-credits'],
    queryFn:  ()=>client.get('/shop-credits').then(r=>r.data),
    staleTime: 30_000,
  });
  const records = Array.isArray(resp) ? resp : (resp.records || []);

  const addMut = useMutation({
    mutationFn: p=>client.post('/shop-credits',p),
    onSuccess:  ()=>{ qc.invalidateQueries({queryKey:['shop-credits']}); setShowForm(false); setForm({date:today(),shopName:'',shopkeeperName:'',phone:'',forItem:'',amount:'',method:'UPI',status:'Pending'}); setError(''); },
    onError:    e=>setError(e.response?.data?.error||'Save failed'),
  });

  const delMut = useMutation({
    mutationFn: id=>client.delete(`/shop-credits/${id}`),
    onSuccess:  ()=>qc.invalidateQueries({queryKey:['shop-credits']}),
  });

  function handleAdd() {
    setError('');
    if(!form.date||!form.shopName.trim()||!form.amount||parseFloat(form.amount)<=0){
      setError('Date, Name and Amount are required'); return;
    }
    addMut.mutate({...form,amount:parseFloat(form.amount)});
  }

  const totalAmt   = records.reduce((s,r)=>s+(r.amount||r.paymentAmount||0),0);
  const pendingAmt = records.filter(r=>r.status==='Pending').reduce((s,r)=>s+(r.amount||r.paymentAmount||0),0);
  const clearedAmt = records.filter(r=>r.status==='Cleared').reduce((s,r)=>s+(r.amount||r.paymentAmount||0),0);

  return (
    <>
      {/* Summary */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:16}}>
        {[{label:'Total',amt:totalAmt,bg:'#f0f9ff',border:'#bae6fd',color:'#0ea5e9'},{label:'Pending',amt:pendingAmt,bg:'#fef2f2',border:'#fecaca',color:'#ef4444'},{label:'Cleared',amt:clearedAmt,bg:'#f0fdf4',border:'#bbf7d0',color:'#10b981'}]
          .map(({label,amt,bg,border,color})=>(
            <div key={label} style={{background:bg,border:`1px solid ${border}`,borderRadius:10,padding:'10px 20px',textAlign:'center',minWidth:120}}>
              <div style={{fontSize:10,color:'#94a3b8',fontWeight:600,textTransform:'uppercase'}}>{label}</div>
              <div style={{fontSize:16,fontWeight:700,fontFamily:"'JetBrains Mono',monospace",color}}>{cur(amt)}</div>
            </div>
          ))}
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card" style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,marginBottom:14}}>New Payment Receipt</div>
          {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            {[
              {k:'date',l:'DATE *',t:'date'},
              {k:'shopName',l:'SHOP NAME *',ph:'Shop / Store name'},
              {k:'shopkeeperName',l:'CUSTOMER NAME',ph:'Full name'},
              {k:'phone',l:'PHONE NO.',ph:'10-digit mobile'},
              {k:'forItem',l:'FOR ITEM',ph:'Medicine / Product name'},
              {k:'amount',l:'AMOUNT ₹ *',t:'number',ph:'0.00'},
            ].map(({k,l,t,ph})=>(
              <div key={k} className="form-group">
                <label className="form-label">{l}</label>
                <input className="form-input" type={t||'text'} placeholder={ph} value={form[k]} onChange={e=>setForm({...form,[k]:e.target.value})}/>
              </div>
            ))}
            <div className="form-group">
              <label className="form-label">PAYMENT METHOD</label>
              <select className="form-input" value={form.method} onChange={e=>setForm({...form,method:e.target.value})}>
                {['UPI','Cash','NEFT','Card','Cheque','Insurance','Other'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">STATUS</label>
              <select className="form-input" value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>
                {['Pending','Cleared'].map(o=><option key={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex',gap:10,marginTop:4}}>
            <button className="btn-primary" onClick={handleAdd} disabled={addMut.isPending}>{addMut.isPending?'Saving…':'✓ Add to Table'}</button>
            <button className="btn-outline" onClick={()=>{setShowForm(false);setError('');}}>Cancel</button>
          </div>
        </div>
      )}

      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',gap:10}}>
          <span className="card-title">Credit — Amount Due / Pending Payments</span>
          {!showForm&&<button className="btn-primary" style={{fontSize:13,padding:'7px 14px'}} onClick={()=>setShowForm(true)}>+ Add a Payment Receipt</button>}
        </div>
        {isLoading ? (
          <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:760}}>
              <thead>
                <tr>
                  <th style={{width:40}}>SL. NO.</th>
                  <th>DATE</th>
                  <th>SHOP NAME</th>
                  <th>SHOPKEEPER NAME</th>
                  <th>PHONE NO.</th>
                  <th>FOR ITEM</th>
                  <th>PAYMENT AMOUNT</th>
                  <th>PAYMENT METHOD</th>
                  <th>STATUS</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {records.length===0 ? (
                  <tr className="empty-row"><td colSpan={10}>No payment records yet. Click "+ Add a Payment Receipt" to begin.</td></tr>
                ) : records.map((r,i)=>{
                  const isPending=r.status==='Pending';
                  const amt=r.amount||r.paymentAmount||0;
                  return(
                    <tr key={r.id||i} style={{background:isPending?'#fffbeb':''}}>
                      <td style={{color:'#94a3b8',fontSize:12,textAlign:'center'}}>{i+1}</td>
                      <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(r.date)}</td>
                      <td style={{fontWeight:600}}>{r.shopName||r.supplierName||'—'}</td>
                      <td>{r.shopkeeperName||r.ownerName||'—'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{r.phone||'—'}</td>
                      <td style={{fontSize:12}}>{r.forItem||r.item||'—'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap'}}>{cur(amt)}</td>
                      <td><span className="badge badge-blue">{r.method||r.paymentMethod||'UPI'}</span></td>
                      <td>{isPending?<span className="badge badge-red" style={{fontWeight:700}}>Pending</span>:<span className="badge badge-green" style={{fontWeight:700}}>Cleared</span>}</td>
                      <td style={{whiteSpace:'nowrap'}}>
                        {isPending&&<button style={{background:'#ecfdf5',color:'#059669',padding:'4px 10px',borderRadius:6,fontSize:11,fontWeight:700,border:'1px solid #a7f3d0',cursor:'pointer'}}
                          onClick={()=>delMut.mutate(r.id)}>✓ Done</button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Main Page ── */
export default function CreditPage() {
  const {storeType} = useSettingsStore();
  const isWS = (storeType||'').trim() === 'Wholesale Pharma';

  return (
    <div style={{padding:'20px 24px'}}>
      {isWS ? <WholesaleCredit/> : <RetailCredit/>}
    </div>
  );
}
