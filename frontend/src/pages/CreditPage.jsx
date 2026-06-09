import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// ── API ───────────────────────────────────────────────────────────────────────
const fetchCredits  = (f) => client.get(`/credits?filter=${f}`).then(r => r.data);
const fetchSummary  = ()  => client.get('/credits/summary').then(r => r.data);

function cur(n)  { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}
function todayStr() { return new Date().toISOString().slice(0,10); }
function uid()      { return Math.random().toString(36).slice(2,10); }

// ── Modal ─────────────────────────────────────────────────────────────────────
function Modal({title, onClose, children, footer, wide}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal-box${wide?' modal-bill':''}`}
        onClick={e=>e.stopPropagation()}
        style={{maxHeight:'92vh',overflowY:'auto'}}>
        <div className="modal-hd">
          <h2 style={{margin:0,fontSize:16}}>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{padding:'0 4px'}}>{children}</div>
        {footer && (
          <div style={{display:'flex',gap:10,justifyContent:'flex-end',
            marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Email popup ───────────────────────────────────────────────────────────────
function EmailPopup({creditId, onClose, onSaved}) {
  const [email,setSaving_] = useState('');
  const [saving,setSaving] = useState(false);
  const [err,setErr]       = useState('');
  const qc = useQueryClient();

  async function save() {
    if (!email.includes('@')) { setErr('Enter a valid email'); return; }
    setSaving(true);
    try {
      await client.patch(`/credits/${creditId}/email`, {email});
      qc.invalidateQueries({queryKey:['credits']});
      onSaved(email);
      onClose();
    } catch(e) { setErr(e.response?.data?.error||'Failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Add Email Address" onClose={onClose}
      footer={<>
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>
          {saving?'Saving…':'✓ Save Email'}
        </button>
      </>}>
      <div className="form-group" style={{marginTop:8}}>
        <label className="form-label">SHOPKEEPER / RETAILER EMAIL</label>
        <input className="form-input" type="email" autoFocus
          value={email} onChange={e=>setSaving_(e.target.value)}
          placeholder="e.g. shop@gmail.com"
          onKeyDown={e=>e.key==='Enter'&&save()}/>
        {err && <div style={{color:'#ef4444',fontSize:12,marginTop:4}}>{err}</div>}
      </div>
    </Modal>
  );
}

// ── Add Credit Form ───────────────────────────────────────────────────────────
// ── Top-level layout helpers — MUST be outside AddCreditForm to avoid remount ──
function Row({children, cols='1fr 1fr'}) {
  return <div style={{display:'grid',gridTemplateColumns:cols,gap:12,marginBottom:12}}>{children}</div>;
}
function FG({label, children}) {
  return (
    <div className="form-group" style={{margin:0}}>
      {label && <label className="form-label">{label}</label>}
      {children}
    </div>
  );
}

function AddCreditForm({onClose, onSaved}) {
  const [date,    setDate]    = useState(todayStr());
  const [shop,    setShop]    = useState('');
  const [keeper,  setKeeper]  = useState('');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [method,  setMethod]  = useState('UPI');
  const [status,  setStatus]  = useState('Pending');
  const [notes,   setNotes]   = useState('');
  const [useGst,  setUseGst]  = useState(false);
  const [gstVal,  setGstVal]  = useState('');
  const [gstMode, setGstMode] = useState('percent'); // 'percent' | 'amount'
  const [useDisc, setUseDisc] = useState(false);
  const [discVal, setDiscVal] = useState('');
  const [discMode,setDiscMode]= useState('percent');
  const [items,   setItems]   = useState([{id:uid(),name:'',itemType:'Box',amount:''}]);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState('');

  // Item helpers
  function addItem()     { setItems(p=>[...p,{id:uid(),name:'',itemType:'Box',amount:''}]); }
  function removeItem(id){ if(items.length===1) return; setItems(p=>p.filter(i=>i.id!==id)); }
  function setItem(id,k,v){ setItems(p=>p.map(i=>i.id===id?{...i,[k]:v}:i)); }

  const subtotal = items.reduce((s,i)=>s+(parseFloat(i.amount)||0),0);

  let gstAmt = 0;
  if (useGst && gstVal) {
    gstAmt = gstMode==='percent' ? subtotal*(parseFloat(gstVal)||0)/100 : parseFloat(gstVal)||0;
  }
  let discAmt = 0;
  if (useDisc && discVal) {
    discAmt = discMode==='percent' ? (subtotal+gstAmt)*(parseFloat(discVal)||0)/100 : parseFloat(discVal)||0;
  }
  const finalAmt = Math.max(0, subtotal + gstAmt - discAmt);

  async function handleSave() {
    setError('');
    if (!shop.trim())  { setError('Shop Name is required'); return; }
    if (!keeper.trim()){ setError('Shopkeeper Name is required'); return; }
    if (items.some(i=>!i.name.trim())) { setError('All item names are required'); return; }
    if (items.some(i=>!i.amount||parseFloat(i.amount)<=0)) { setError('All item amounts must be > 0'); return; }

    const payload = {
      date, shopName:shop.trim(), shopkeeperName:keeper.trim(),
      phone, email, method, status, notes,
      amount:   subtotal,
      gstAmount: gstAmt,
      discountAmount: discAmt,
      finalAmount: finalAmt,
      forItem: items.map(i=>i.name).join(', '),
      items: items.map(i=>({name:i.name,itemType:i.itemType,amount:parseFloat(i.amount)||0})),
    };
    setSaving(true);
    try {
      await client.post('/credits', payload);
      onSaved();
      onClose();
    } catch(e) { setError(e.response?.data?.error||'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="New Payment Receipt" onClose={onClose} wide
      footer={<>
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving?'Saving…':'✓ Add to Table'}
        </button>
      </>}>

      {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',
        borderRadius:8,padding:'8px 12px',marginBottom:14,fontSize:13}}>{error}</div>}

      {/* Basic info */}
      <Row><FG label="DATE *"><input className="form-input" type="date" value={date} onChange={e=>setDate(e.target.value)}/></FG>
           <FG label="PAYMENT METHOD"><select className="form-input" value={method} onChange={e=>setMethod(e.target.value)}>
             {['UPI','Cash','NEFT','Card','Cheque','Insurance','Other'].map(o=><option key={o}>{o}</option>)}
           </select></FG></Row>
      <Row><FG label="SHOP NAME *"><input className="form-input" value={shop} onChange={e=>setShop(e.target.value)} placeholder="Shop / Store name"/></FG>
           <FG label="SHOPKEEPER / RETAILER NAME *"><input className="form-input" value={keeper} onChange={e=>setKeeper(e.target.value)} placeholder="Full name"/></FG></Row>
      <Row><FG label="PHONE NO."><input className="form-input" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="10-digit mobile"/></FG>
           <FG label="SHOPKEEPER / RETAILER EMAIL"><input className="form-input" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="e.g. shop@gmail.com"/></FG></Row>

      {/* Items */}
      <div style={{marginBottom:12}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
          <label className="form-label" style={{margin:0}}>FOR ITEM(S) *</label>
          <button onClick={addItem}
            style={{display:'flex',alignItems:'center',gap:4,background:'#f0f9ff',color:'#0ea5e9',
              border:'1.5px solid #bae6fd',borderRadius:8,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
            + Add Item
          </button>
        </div>

        {/* Header row */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 110px 130px 28px',gap:8,marginBottom:4}}>
          <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em',paddingLeft:2}}>Item Name</div>
          <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>Type</div>
          <div style={{fontSize:10,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.06em'}}>Amount ₹</div>
          <div/>
        </div>

        {items.map((item,idx)=>(
          <div key={item.id} style={{display:'grid',gridTemplateColumns:'1fr 110px 130px 28px',gap:8,marginBottom:8,alignItems:'center'}}>
            <input className="form-input" style={{margin:0}} value={item.name}
              onChange={e=>setItem(item.id,'name',e.target.value)}
              placeholder={`Item ${idx+1} name…`}/>
            <select className="form-input" style={{margin:0}} value={item.itemType}
              onChange={e=>setItem(item.id,'itemType',e.target.value)}>
              <option>Box</option><option>Strip</option><option>Unit</option>
            </select>
            <input className="form-input" style={{margin:0}} type="number" min="0" step="0.01"
              value={item.amount} onChange={e=>setItem(item.id,'amount',e.target.value)}
              placeholder="0.00"/>
            <button onClick={()=>removeItem(item.id)}
              style={{background:'#fef2f2',color:'#ef4444',border:'1px solid #fecaca',borderRadius:6,
                width:28,height:36,cursor:'pointer',fontSize:14,display:'flex',alignItems:'center',justifyContent:'center'}}
              disabled={items.length===1}>✕</button>
          </div>
        ))}

        {/* Subtotal */}
        <div style={{display:'flex',justifyContent:'flex-end',fontSize:13,color:'#64748b',marginTop:4}}>
          Subtotal: <strong style={{marginLeft:8,fontFamily:"'JetBrains Mono',monospace",color:'#1e293b'}}>{cur(subtotal)}</strong>
        </div>
      </div>

      {/* GST toggle */}
      <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 16px',marginBottom:10,border:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:useGst?12:0}}>
          <span style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>Total GST</span>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <span style={{fontSize:12,color:'#64748b'}}>{useGst?'On':'Off'}</span>
            <div onClick={()=>setUseGst(p=>!p)} style={{width:40,height:22,borderRadius:99,
              background:useGst?'#0ea5e9':'#cbd5e1',cursor:'pointer',position:'relative',transition:'background .2s'}}>
              <div style={{position:'absolute',top:3,left:useGst?20:3,width:16,height:16,borderRadius:99,
                background:'white',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.2)'}}/>
            </div>
          </label>
        </div>
        {useGst && (
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:8,alignItems:'center'}}>
            <select className="form-input" style={{margin:0,width:110}} value={gstMode} onChange={e=>setGstMode(e.target.value)}>
              <option value="percent">% Rate</option>
              <option value="amount">₹ Amount</option>
            </select>
            <input className="form-input" style={{margin:0}} type="number" min="0" step="0.01"
              value={gstVal} onChange={e=>setGstVal(e.target.value)}
              placeholder={gstMode==='percent'?'e.g. 12 (%)':'e.g. 150.00 (₹)'}/>
          </div>
        )}
        {useGst && gstVal && <div style={{fontSize:12,color:'#0ea5e9',marginTop:6,textAlign:'right'}}>GST: +{cur(gstAmt)}</div>}
      </div>

      {/* Discount toggle */}
      <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 16px',marginBottom:14,border:'1px solid var(--border)'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:useDisc?12:0}}>
          <span style={{fontSize:13,fontWeight:700,color:'#1e293b'}}>Discount</span>
          <label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <span style={{fontSize:12,color:'#64748b'}}>{useDisc?'On':'Off'}</span>
            <div onClick={()=>setUseDisc(p=>!p)} style={{width:40,height:22,borderRadius:99,
              background:useDisc?'#10b981':'#cbd5e1',cursor:'pointer',position:'relative',transition:'background .2s'}}>
              <div style={{position:'absolute',top:3,left:useDisc?20:3,width:16,height:16,borderRadius:99,
                background:'white',transition:'left .2s',boxShadow:'0 1px 4px rgba(0,0,0,.2)'}}/>
            </div>
          </label>
        </div>
        {useDisc && (
          <div style={{display:'grid',gridTemplateColumns:'auto 1fr',gap:8,alignItems:'center'}}>
            <select className="form-input" style={{margin:0,width:110}} value={discMode} onChange={e=>setDiscMode(e.target.value)}>
              <option value="percent">% Rate</option>
              <option value="amount">₹ Amount</option>
            </select>
            <input className="form-input" style={{margin:0}} type="number" min="0" step="0.01"
              value={discVal} onChange={e=>setDiscVal(e.target.value)}
              placeholder={discMode==='percent'?'e.g. 5 (%)':'e.g. 50.00 (₹)'}/>
          </div>
        )}
        {useDisc && discVal && <div style={{fontSize:12,color:'#10b981',marginTop:6,textAlign:'right'}}>Discount: -{cur(discAmt)}</div>}
      </div>

      {/* Final amount display */}
      <div style={{background:'linear-gradient(135deg,#0f1f3d,#1e3a5f)',borderRadius:12,padding:'16px 20px',
        display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:'rgba(255,255,255,.6)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.08em'}}>Final Amount Due</div>
          <div style={{fontSize:28,fontWeight:800,color:'white',fontFamily:"'JetBrains Mono',monospace",lineHeight:1.2}}>
            {cur(finalAmt)}
          </div>
          <div style={{fontSize:11,color:'rgba(255,255,255,.5)',marginTop:2}}>
            {subtotal.toFixed(2)}{useGst&&gstVal?` + GST ₹${gstAmt.toFixed(2)}`:''}{useDisc&&discVal?` - disc ₹${discAmt.toFixed(2)}`:''}
          </div>
        </div>
        <div style={{fontSize:32,opacity:.3}}>₹</div>
      </div>

      <Row cols="1fr 1fr">
        <FG label="STATUS"><select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
          <option>Pending</option><option>Cleared</option>
        </select></FG>
        <div/>
      </Row>
      <FG label="NOTES">
        <textarea className="form-input" style={{minHeight:60,resize:'vertical'}} value={notes}
          onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…"/>
      </FG>
    </Modal>
  );
}

// ── Bill View Modal ───────────────────────────────────────────────────────────
// ── Isolated print window — never prints the whole React page ────────────────
function printBill(credit) {
  const items    = credit.items || [];
  const subtotal = items.reduce((s, i) => s + (i.amount || 0), 0) || credit.amount || 0;
  const gst      = credit.gstAmount      || 0;
  const disc     = credit.discountAmount || 0;
  const final_   = credit.finalAmount    || credit.amount || 0;
  const fmtD     = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';

  const itemRows = items.length > 0
    ? items.map(it =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-weight:600">${it.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#64748b">${it.itemType}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;text-align:right;font-family:monospace">
            \u20b9${parseFloat(it.amount||0).toFixed(2)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:8px 12px;color:#64748b">${credit.forItem || '\u2014'}</td></tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Credit Bill</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;background:white;color:#1e293b}
    .page{max-width:680px;margin:0 auto;padding:32px 28px}
    .hd{background:#0f1f3d;color:white;padding:20px 24px;border-radius:10px 10px 0 0}
    .hd h1{font-size:20px;font-weight:700}.hd p{font-size:12px;opacity:.7;margin-top:3px}
    .bd{border:1px solid #e2e8f0;border-top:none;border-radius:0 0 10px 10px;padding:24px}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;background:#f8fafc;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:13px}
    .lbl{color:#64748b}.val{font-weight:600;text-align:right}
    table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px}
    thead tr{background:#f8fafc}
    th{padding:9px 12px;text-align:left;border-bottom:2px solid #e2e8f0;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b}
    th:last-child{text-align:right}
    td{padding:8px 12px;border-bottom:1px solid #f1f5f9}
    .totals{display:flex;flex-direction:column;align-items:flex-end;gap:4px;font-size:13px;border-top:1px solid #e2e8f0;padding-top:12px}
    .tr{display:flex;justify-content:flex-end;gap:24px}
    .grand{font-size:20px;font-weight:800;color:#0ea5e9;font-family:monospace}
    .badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700}
    .pending{background:#fef2f2;color:#dc2626}.cleared{background:#f0fdf4;color:#16a34a}
    .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>
  <div class="page">
    <div class="hd"><h1>PharmaCare Pro</h1><p>Credit / Payment Due Bill</p></div>
    <div class="bd">
      <div class="meta">
        <span class="lbl">Shop Name</span>     <span class="val">${credit.shopName}</span>
        <span class="lbl">Shopkeeper</span>    <span class="val">${credit.shopkeeperName}</span>
        <span class="lbl">Date</span>          <span class="val">${fmtD(credit.date)}</span>
        <span class="lbl">Phone</span>         <span class="val">${credit.phone || '\u2014'}</span>
        <span class="lbl">Payment</span>       <span class="val">${credit.method}</span>
        <span class="lbl">Status</span>        <span class="val">
          <span class="badge ${credit.status==='Cleared'?'cleared':'pending'}">${credit.status}</span>
        </span>
        ${credit.email ? `<span class="lbl">Email</span><span class="val">${credit.email}</span>` : ''}
        ${credit.notes ? `<span class="lbl" style="grid-column:1/-1;color:#64748b">Notes: ${credit.notes}</span><span></span>` : ''}
      </div>
      <table>
        <thead><tr><th>Item</th><th>Type</th><th style="text-align:right">Amount</th></tr></thead>
        <tbody>${itemRows}</tbody>
      </table>
      <div class="totals">
        <div class="tr"><span style="color:#64748b">Subtotal</span><span style="font-family:monospace">\u20b9${subtotal.toFixed(2)}</span></div>
        ${gst>0?`<div class="tr"><span style="color:#64748b">GST</span><span style="color:#0ea5e9;font-family:monospace">+\u20b9${gst.toFixed(2)}</span></div>`:''}
        ${disc>0?`<div class="tr"><span style="color:#64748b">Discount</span><span style="color:#10b981;font-family:monospace">-\u20b9${disc.toFixed(2)}</span></div>`:''}
        <div class="tr" style="margin-top:8px;border-top:2px solid #e2e8f0;padding-top:8px">
          <span style="font-size:15px;font-weight:700">Total Due</span>
          <span class="grand">\u20b9${final_.toFixed(2)}</span>
        </div>
      </div>
      <div class="footer">PharmaCare Pro &middot; Generated ${new Date().toLocaleString('en-IN')}</div>
    </div>
  </div>
  </body></html>`;

  const win = window.open('', '_blank', 'width=750,height=900,scrollbars=yes');
  if (!win) { alert('Please allow popups for this site to print bills.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 700);
}

function BillViewModal({credit, onClose}) {
  if (!credit) return null;
  const items = credit.items||[];
  const subtotal = items.reduce((s,i)=>s+(i.amount||0),0) || credit.amount||0;

  return (
    <Modal title={`Credit Bill — ${credit.shopName}`} onClose={onClose} wide
      footer={<>
        <button className="btn-outline" onClick={()=>printBill(credit)}>🖨 Print / Save PDF</button>
        <button className="btn-primary"  onClick={onClose}>Close</button>
      </>}>
      <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:13,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><span style={{color:'#94a3b8'}}>Shop: </span><strong>{credit.shopName}</strong></div>
        <div><span style={{color:'#94a3b8'}}>Shopkeeper: </span><strong>{credit.shopkeeperName}</strong></div>
        <div><span style={{color:'#94a3b8'}}>Date: </span><strong>{fmtDate(credit.date)}</strong></div>
        <div><span style={{color:'#94a3b8'}}>Phone: </span><strong>{credit.phone||'—'}</strong></div>
        {credit.email&&<div style={{gridColumn:'1/-1'}}><span style={{color:'#94a3b8'}}>Email: </span><strong>{credit.email}</strong></div>}
        <div><span style={{color:'#94a3b8'}}>Payment: </span><span className="badge badge-blue">{credit.method}</span></div>
        <div><span style={{color:'#94a3b8'}}>Status: </span>
          <span className={`badge ${credit.status==='Cleared'?'badge-green':'badge-red'}`}>{credit.status}</span>
        </div>
        {credit.notes&&<div style={{gridColumn:'1/-1',color:'#64748b',fontSize:12}}>Notes: {credit.notes}</div>}
      </div>

      <div className="table-wrap" style={{marginBottom:14}}>
        <table className="tbl">
          <thead><tr><th>ITEM</th><th>TYPE</th><th style={{textAlign:'right'}}>AMOUNT</th></tr></thead>
          <tbody>
            {items.length>0
              ? items.map((it,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:600}}>{it.name}</td>
                    <td><span className="badge badge-blue">{it.itemType}</span></td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",textAlign:'right'}}>{cur(it.amount)}</td>
                  </tr>
                ))
              : <tr><td colSpan={3} style={{color:'#94a3b8',textAlign:'center'}}>{credit.forItem||'—'}</td></tr>
            }
          </tbody>
        </table>
      </div>

      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,fontSize:13,borderTop:'1px solid var(--border)',paddingTop:12}}>
        <div>Subtotal: <strong style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(subtotal)}</strong></div>
        {credit.gstAmount>0      && <div style={{color:'#0ea5e9'}}>GST: +{cur(credit.gstAmount)}</div>}
        {credit.discountAmount>0 && <div style={{color:'#10b981'}}>Discount: -{cur(credit.discountAmount)}</div>}
        <div style={{fontSize:18,fontWeight:800}}>
          Total Due: <span style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{cur(credit.finalAmount||credit.amount)}</span>
        </div>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// WHOLESALE CREDIT PAGE
// ══════════════════════════════════════════════════════════════════════════════
function WholesaleCredit() {
  const qc = useQueryClient();
  const [filter,    setFilter]    = useState('all');
  const [showAdd,   setShowAdd]   = useState(false);
  const [showClear, setShowClear] = useState(false);
  const [viewCredit,setView]      = useState(null);
  const [emailPopup,setEmailPopup]= useState(null);   // credit id
  const [sending,   setSending]   = useState({});     // {id: true}
  const [toast,     setToast]     = useState('');

  const {data:credits=[], isLoading} = useQuery({
    queryKey: ['credits', filter],
    queryFn:  ()=>fetchCredits(filter),
    staleTime: 30_000,
  });
  const {data:summary={}} = useQuery({
    queryKey: ['credits-summary'],
    queryFn:  fetchSummary,
    staleTime: 30_000,
  });

  const patchMut = useMutation({
    mutationFn: ({id,payload})=>client.patch(`/credits/${id}`,payload),
    onSuccess:  ()=>{ qc.invalidateQueries({queryKey:['credits']}); qc.invalidateQueries({queryKey:['credits-summary']}); },
  });
  const delMut = useMutation({
    mutationFn: id=>client.delete(`/credits/${id}`),
    onSuccess:  ()=>{ qc.invalidateQueries({queryKey:['credits']}); qc.invalidateQueries({queryKey:['credits-summary']}); },
  });
  const bulkDelMut = useMutation({
    mutationFn: p=>client.delete(`/credits/bulk?period=${p}`),
    onSuccess:  ()=>{ qc.invalidateQueries({queryKey:['credits']}); qc.invalidateQueries({queryKey:['credits-summary']}); setShowClear(false); },
  });

  function showT(msg) { setToast(msg); setTimeout(()=>setToast(''),3000); }

  async function sendEmail(c) {
    setSending(p=>({...p,[c.id]:true}));
    try {
      await client.post(`/credits/${c.id}/send-email`);
      showT(`✓ Email sent to ${c.email}`);
    } catch(e) { showT(e.response?.data?.error||'Email failed'); }
    finally { setSending(p=>({...p,[c.id]:false})); }
  }

  const arr = Array.isArray(credits) ? credits : [];

  return (
    <div style={{padding:'20px 24px'}}>
      {/* Toast */}
      {toast && <div style={{position:'fixed',top:20,right:24,zIndex:9999,background:'#1e293b',color:'white',
        padding:'10px 20px',borderRadius:10,fontWeight:600,fontSize:13,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>{toast}</div>}

      {/* Modals */}
      {showAdd    && <AddCreditForm onClose={()=>setShowAdd(false)} onSaved={()=>{ qc.invalidateQueries({queryKey:['credits']}); qc.invalidateQueries({queryKey:['credits-summary']}); showT('✓ Record added'); }}/>}
      {viewCredit && <BillViewModal credit={viewCredit} onClose={()=>setView(null)}/>}
      {emailPopup && <EmailPopup creditId={emailPopup} onClose={()=>setEmailPopup(null)} onSaved={()=>{ qc.invalidateQueries({queryKey:['credits']}); showT('✓ Email saved'); }}/>}

      {/* Clear modal */}
      {showClear && (
        <Modal title="Clear Credit Records" onClose={()=>setShowClear(false)}
          footer={<button className="btn-outline" onClick={()=>setShowClear(false)}>Cancel</button>}>
          <div style={{fontSize:13,color:'#64748b',marginBottom:14}}>Permanently delete credit records. Cannot be undone.</div>
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {[{p:'7',l:'Last 7 Days'},{p:'30',l:'This Month'},{p:'90',l:'Last 90 Days'}].map(({p,l})=>(
              <button key={p} className="btn-outline"
                style={{justifyContent:'flex-start',color:'#ef4444',borderColor:'#fecaca',background:'#fef2f2'}}
                onClick={()=>{ if(window.confirm(`Delete all credit records from ${l}?`)) bulkDelMut.mutate(p); }}>
                🗑️ Clear {l}
              </button>
            ))}
          </div>
        </Modal>
      )}

      {/* Summary cards */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20}}>
        {[
          {label:'Total',   amt:summary.totalAmount||0,   bg:'#f0f9ff',border:'#bae6fd',color:'#0ea5e9'},
          {label:'Pending', amt:summary.pendingAmount||0, bg:'#fef2f2',border:'#fecaca',color:'#ef4444'},
          {label:'Cleared', amt:summary.clearedAmount||0, bg:'#f0fdf4',border:'#bbf7d0',color:'#10b981'},
        ].map(({label,amt,bg,border,color})=>(
          <div key={label} style={{background:bg,border:`1.5px solid ${border}`,borderRadius:12,
            padding:'12px 24px',textAlign:'center',minWidth:130}}>
            <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>{label}</div>
            <div style={{fontSize:18,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color}}>{cur(amt)}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        {/* Header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 20px',borderBottom:'1px solid var(--border)',flexWrap:'wrap',gap:10}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span className="card-title">Credit</span>
            <span style={{fontSize:12,color:'#64748b'}}>Amount Due / Pending Payments</span>
          </div>
          <div style={{display:'flex',gap:8}}>
            <button className="btn-primary" style={{fontSize:13,padding:'7px 14px'}} onClick={()=>setShowAdd(true)}>
              + Add a Payment Receipt
            </button>
            <button className="btn-outline" style={{fontSize:13,padding:'7px 14px',color:'#ef4444',borderColor:'#fecaca'}}
              onClick={()=>setShowClear(true)}>
              🗑 Clear Records
            </button>
          </div>
        </div>

        {/* Filter tabs */}
        <div style={{display:'flex',gap:6,padding:'10px 20px',borderBottom:'1px solid var(--border)'}}>
          {[{f:'all',l:'All'},{f:'7',l:'Last 7 Days'},{f:'30',l:'This Month'},{f:'90',l:'Last 90 Days'}].map(({f,l})=>(
            <button key={f} onClick={()=>setFilter(f)}
              style={{padding:'5px 14px',borderRadius:99,fontSize:13,cursor:'pointer',fontWeight:filter===f?700:400,
                border:`1.5px solid ${filter===f?'var(--accent)':'#e2e8f0'}`,
                background:filter===f?'#f0f9ff':'white',color:filter===f?'var(--accent)':'#64748b'}}>
              {l}
            </button>
          ))}
        </div>

        {/* Table */}
        {isLoading ? <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading…</div> : (
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:1000}}>
              <thead>
                <tr>
                  <th style={{width:40}}>SL.</th>
                  <th style={{minWidth:100}}>DATE</th>
                  <th style={{minWidth:140}}>SHOP NAME</th>
                  <th style={{minWidth:140}}>SHOPKEEPER NAME</th>
                  <th style={{minWidth:110}}>PHONE NO.</th>
                  <th style={{minWidth:160}}>FOR ITEM</th>
                  <th style={{minWidth:120}}>PAYMENT AMOUNT</th>
                  <th style={{minWidth:90}}>METHOD</th>
                  <th style={{minWidth:90}}>STATUS</th>
                  <th style={{minWidth:120}}>SEND</th>
                  <th style={{minWidth:110}}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {arr.length===0
                  ? <tr className="empty-row"><td colSpan={11}>No payment records yet. Click "+ Add a Payment Receipt" to begin.</td></tr>
                  : arr.map((c,i)=>{
                    const isPending = c.status==='Pending';
                    const hasEmail  = !!c.email;
                    const isSending = sending[c.id];
                    const itemsLabel = c.items?.length>0
                      ? c.items.map(it=>`${it.name} (${it.itemType})`).join(', ')
                      : (c.forItem||'—');

                    return (
                      <tr key={c.id} style={{background:isPending?'#fffbeb':''}}>
                        <td style={{color:'#94a3b8',fontSize:12,textAlign:'center'}}>{i+1}</td>
                        <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(c.date)}</td>
                        <td style={{fontWeight:600}}>{c.shopName}</td>
                        <td>{c.shopkeeperName}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12}}>{c.phone||'—'}</td>
                        <td style={{fontSize:12,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={itemsLabel}>
                          {itemsLabel}
                        </td>
                        <td>
                          <div style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap'}}>
                            {cur(c.finalAmount||c.amount)}
                          </div>
                          {(c.gstAmount>0||c.discountAmount>0) && (
                            <div style={{fontSize:10,color:'#94a3b8',whiteSpace:'nowrap'}}>
                              sub:{cur(c.amount)}{c.gstAmount>0?` +GST:${cur(c.gstAmount)}`:''}{c.discountAmount>0?` -disc:${cur(c.discountAmount)}`:''}
                            </div>
                          )}
                        </td>
                        <td><span className="badge badge-blue">{c.method}</span></td>
                        <td>
                          {isPending
                            ? <button onClick={()=>patchMut.mutate({id:c.id,payload:{status:'Cleared'}})}
                                style={{background:'#ecfdf5',color:'#059669',padding:'4px 10px',borderRadius:6,
                                  fontSize:11,fontWeight:700,border:'1px solid #a7f3d0',cursor:'pointer',whiteSpace:'nowrap'}}>
                                ✓ Received
                              </button>
                            : <span className="badge badge-green">Cleared</span>}
                        </td>
                        <td>
                          {hasEmail
                            ? <button onClick={()=>sendEmail(c)} disabled={isSending}
                                style={{background:'#f0f9ff',color:'#0ea5e9',padding:'4px 10px',borderRadius:6,
                                  fontSize:11,fontWeight:700,border:'1px solid #bae6fd',cursor:'pointer',
                                  opacity:isSending?.5:1,whiteSpace:'nowrap'}}>
                                {isSending?'Sending…':'📧 Send'}
                              </button>
                            : <button onClick={()=>setEmailPopup(c.id)}
                                title="Add email to enable sending"
                                style={{background:'#f8fafc',color:'#94a3b8',padding:'4px 10px',borderRadius:6,
                                  fontSize:11,border:'1px dashed #cbd5e1',cursor:'pointer',whiteSpace:'nowrap'}}>
                                ✉️ Add Email
                              </button>}
                        </td>
                        <td style={{whiteSpace:'nowrap'}}>
                          <button className="btn-icon" onClick={()=>setView(c)} title="View Bill">👁</button>
                          <button className="btn-icon"
                            onClick={()=>{ if(window.confirm('Delete this record?')) delMut.mutate(c.id); }}
                            title="Delete">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RETAIL CREDIT (shop-credits — unchanged from original)
// ══════════════════════════════════════════════════════════════════════════════
function RetailCredit() {
  const qc = useQueryClient();
  const [toast,      setToast]      = useState('');
  const [showPayNow, setShowPayNow] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected,   setSelected]   = useState([]);
  const [historyRec, setHistoryRec] = useState(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['shop-credits'],
    queryFn:  () => client.get('/shop-credits').then(r => r.data),
    staleTime: 30_000,
  });

  const delMut = useMutation({
    mutationFn: (id) => client.delete(`/shop-credits/${id}`),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['shop-credits'] });
      qc.invalidateQueries({ queryKey: ['shop-credits-summary'] });
    },
  });

  function showT(msg) { setToast(msg); setTimeout(() => setToast(''), 3500); }

  function toggleSelectMode() {
    setSelectMode(p => !p);
    setSelected([]);
  }

  function toggleSelect(id) {
    setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  }

  function selectAll(checked) {
    setSelected(checked ? records.map(r => r.id) : []);
  }

  async function deleteSelected() {
    if (!selected.length) { showT('No records selected'); return; }
    if (!window.confirm(`Delete ${selected.length} selected record${selected.length > 1 ? 's' : ''}? Cannot be undone.`)) return;
    await Promise.all(selected.map(id => delMut.mutateAsync(id)));
    setSelected([]);
    setSelectMode(false);
    qc.invalidateQueries({ queryKey: ['shop-credits'] });
    showT(`${selected.length} record${selected.length > 1 ? 's' : ''} deleted ✓`);
  }

  // Summary from API — latest-per-supplier dedup done server-side with ctid ordering
  const { data: shopSummary = {} } = useQuery({
    queryKey: ['shop-credits-summary'],
    queryFn:  () => client.get('/shop-credits/summary').then(r => r.data),
    staleTime: 10_000,
  });
  const totalPurchase = shopSummary.totalPurchase || 0;
  const totalPaid     = shopSummary.totalPaid     || 0;
  const totalPending  = shopSummary.totalPending  || 0;

  return (
    <div style={{ padding: '20px 24px' }}>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 24, zIndex: 9999, background: '#1e293b',
          color: 'white', padding: '10px 20px', borderRadius: 10, fontWeight: 600, fontSize: 13,
          boxShadow: '0 4px 20px rgba(0,0,0,.2)' }}>{toast}</div>
      )}

      {historyRec && (
        <SupplierHistoryModal supplierId={historyRec} records={records}
          onClose={() => setHistoryRec(null)} />
      )}
      {showPayNow && (
        <PayNowModal records={records} onClose={() => setShowPayNow(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['shop-credits'] });
            qc.invalidateQueries({ queryKey: ['shop-credits-summary'] });
            showT('Record saved ✓');
          }}
          showToast={showT} />
      )}

      {/* Summary bar */}
      <div id="retail-credit-summary-bar" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        {[
          { label: 'TOTAL PURCHASE', amt: totalPurchase, bg: '#f0f9ff', border: '#bae6fd', color: '#0ea5e9' },
          { label: 'TOTAL PAID',     amt: totalPaid,     bg: '#f0fdf4', border: '#bbf7d0', color: '#10b981' },
          { label: 'TOTAL PENDING',  amt: totalPending,  bg: '#fef2f2', border: '#fecaca', color: '#ef4444' },
        ].map(({ label, amt, bg, border, color }) => (
          <div key={label} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10,
            padding: '10px 16px', textAlign: 'center', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color }}>{cur(amt)}</div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <span className="card-title" style={{ marginRight: 6 }}>💳 Credit</span>
            <span style={{ fontSize: 12, color: '#64748b' }}>Supplier / Wholesaler Payments</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {selectMode && selected.length > 0 && (
              <button className="btn-primary"
                style={{ fontSize: 13, padding: '7px 14px', background: '#ef4444', borderColor: '#ef4444' }}
                onClick={deleteSelected}>
                🗑 Delete Selected
              </button>
            )}
            <button className="btn-outline"
              style={{ fontSize: 13, padding: '7px 14px',
                color: selectMode ? '#10b981' : '#0ea5e9',
                borderColor: selectMode ? '#10b981' : '#0ea5e9' }}
              onClick={toggleSelectMode}>
              {selectMode ? '✓ Done' : '☑ Select to Delete'}
            </button>
            <button className="btn-primary" style={{ fontSize: 13, padding: '7px 14px' }}
              onClick={() => setShowPayNow(true)}>
              💳 Pay Now
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
        ) : (
          <div className="table-wrap">
            <table className="tbl" style={{ minWidth: 960 }}>
              <thead>
                <tr>
                  {selectMode && (
                    <th style={{ width: 40 }}>
                      <input type="checkbox" style={{ cursor: 'pointer', width: 15, height: 15 }}
                        checked={selected.length === records.length && records.length > 0}
                        onChange={e => selectAll(e.target.checked)} />
                    </th>
                  )}
                  <th style={{ width: 40 }}>SL. NO.</th>
                  <th style={{ minWidth: 160 }}>SUPPLIER NAME</th>
                  <th style={{ minWidth: 110 }}>WHOLESALER ID</th>
                  <th style={{ minWidth: 160 }}>WHOLESALER (OWNER NAME)</th>
                  <th style={{ minWidth: 120 }}>TOTAL PURCHASE</th>
                  <th style={{ minWidth: 100 }}>PAID</th>
                  <th style={{ minWidth: 90 }}>PAYMENT MODE</th>
                  <th style={{ minWidth: 120 }}>PENDING (TO BE PAID)</th>
                  <th style={{ minWidth: 130 }}>LAST PURCHASE DATE</th>
                  <th style={{ minWidth: 100 }}>STATUS</th>
                  <th style={{ minWidth: 90 }}>ACTION</th>
                </tr>
              </thead>
              <tbody id="retail-credit-tbody">
                {records.length === 0 ? (
                  <tr className="empty-row">
                    <td colSpan={selectMode ? 11 : 10}>
                      No supplier records yet. Click "💳 Pay Now" to add.
                    </td>
                  </tr>
                ) : records.map((r, i) => {
                  const isPending = r.status === 'Pending';
                  return (
                    <tr key={r.id} style={{ background: isPending ? '#fffbeb' : '' }}>
                      {selectMode && (
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" style={{ cursor: 'pointer', width: 15, height: 15 }}
                            checked={selected.includes(r.id)}
                            onChange={() => toggleSelect(r.id)} />
                        </td>
                      )}
                      <td style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{i + 1}</td>
                      <td style={{ fontWeight: 600 }}>{r.supplierName}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: '#0ea5e9', fontWeight: 700 }}>{r.supplierId}</td>
                      <td>{r.ownerName}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700 }}>{cur(r.totalPurchase)}</td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", color: '#10b981', fontWeight: 700 }}>{cur(r.paid)}</td>
                      <td><span className="badge badge-blue">{r.paymentMode}</span></td>
                      <td style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700,
                        color: r.pending > 0 ? '#ef4444' : '#10b981' }}>{cur(r.pending)}</td>
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtDate(r.lastPurchaseDate)}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
                          fontWeight: 700, color: isPending ? '#ef4444' : '#10b981' }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%',
                            background: isPending ? '#ef4444' : '#10b981', display: 'inline-block' }} />
                          {r.status}
                        </span>
                      </td>
                      <td>
                        <button className="btn-icon" title="View payment history PDF"
                          onClick={() => setHistoryRec(r.supplierId)}
                          style={{ fontSize: 16 }}>📋</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Supplier History Modal ────────────────────────────────────────────────────
function SupplierHistoryModal({ supplierId, records, onClose }) {
  const history = records
    .filter(r => (r.supplierId || '').toLowerCase() === supplierId.toLowerCase())
    .sort((a, b) => {
      const da = new Date(b.billDate || b.lastPurchaseDate);
      const db = new Date(a.billDate || a.lastPurchaseDate);
      return da - db;
    });

  const supplier   = history[0] || {};
  const totalPaid  = history.reduce((s, r) => s + (r.paid || 0), 0);
  const latestPend = history[0]?.pending || 0;

  function printHistory() {
    const rows = history.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#f8fafc' : 'white'}">
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${fmtDate(r.billDate || r.lastPurchaseDate)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace">₹${parseFloat(r.totalPurchase||0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:#10b981;font-weight:700">₹${parseFloat(r.paid||0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:${r.pending>0?'#ef4444':'#10b981'};font-weight:700">₹${parseFloat(r.pending||0).toFixed(2)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">${r.paymentMode}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e2e8f0">
          <span style="background:${r.status==='Cleared'?'#f0fdf4':'#fef2f2'};color:${r.status==='Cleared'?'#10b981':'#ef4444'};padding:2px 10px;border-radius:99px;font-size:11px;font-weight:700">${r.status}</span>
        </td>
      </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment History</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:28px;color:#1e293b}
      .hd{background:#0f1f3d;color:white;padding:18px 24px;border-radius:10px 10px 0 0}
      .hd h1{font-size:18px}.hd p{font-size:11px;opacity:.7;margin-top:3px}
      .meta{background:#f8fafc;padding:14px 18px;border:1px solid #e2e8f0;border-top:none;
        display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;font-size:13px;margin-bottom:18px}
      .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;margin-bottom:2px}
      .val{font-weight:700}
      table{width:100%;border-collapse:collapse;font-size:13px}
      thead tr{background:#0ea5e9}
      th{padding:9px 12px;text-align:left;color:white;font-size:10px;text-transform:uppercase;letter-spacing:.05em}
      .footer{text-align:center;font-size:11px;color:#94a3b8;margin-top:20px;padding-top:14px;border-top:1px solid #e2e8f0}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="hd"><h1>PharmaCare Pro — Supplier Payment History</h1>
      <p>Generated ${new Date().toLocaleString('en-IN')}</p></div>
    <div class="meta">
      <div><div class="lbl">Supplier Name</div><div class="val">${supplier.supplierName||''}</div></div>
      <div><div class="lbl">Wholesaler ID</div><div class="val" style="color:#0ea5e9">${supplierId}</div></div>
      <div><div class="lbl">Owner Name</div><div class="val">${supplier.ownerName||''}</div></div>
      <div><div class="lbl">Total Paid (All Time)</div><div class="val" style="color:#10b981">₹${totalPaid.toFixed(2)}</div></div>
      <div><div class="lbl">Current Pending</div><div class="val" style="color:${latestPend>0?'#ef4444':'#10b981'}">₹${latestPend.toFixed(2)}</div></div>
      <div><div class="lbl">Total Records</div><div class="val">${history.length}</div></div>
    </div>
    <table>
      <thead><tr><th>Date</th><th>Total Purchase</th><th>Paid</th><th>Pending</th><th>Mode</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">PharmaCare Pro · Supplier / Wholesaler Payment Statement</div>
    </body></html>`;
    const win = window.open('','_blank','width=860,height=700,scrollbars=yes');
    if (!win){alert('Allow popups to print.');return;}
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(()=>win.print(),700);
  }

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box modal-bill" onClick={e=>e.stopPropagation()}
        style={{maxHeight:'90vh',overflowY:'auto'}}>
        <div className="modal-hd">
          <h2 style={{margin:0,fontSize:16}}>📋 Payment History — {supplierId}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        {/* Meta */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10,
          background:'#f8fafc',borderRadius:8,padding:'12px 16px',marginBottom:16,fontSize:13}}>
          {[
            {l:'Supplier Name',   v:supplier.supplierName||'',    c:undefined},
            {l:'Wholesaler ID',   v:supplierId,                    c:'#0ea5e9'},
            {l:'Owner Name',      v:supplier.ownerName||'',        c:undefined},
            {l:'Total Paid',      v:cur(totalPaid),                c:'#10b981'},
            {l:'Current Pending', v:cur(latestPend),               c:latestPend>0?'#ef4444':'#10b981'},
            {l:'Records',         v:String(history.length),        c:undefined},
          ].map(({l,v,c})=>(
            <div key={l}>
              <div style={{fontSize:10,color:'#94a3b8',textTransform:'uppercase',marginBottom:2}}>{l}</div>
              <div style={{fontWeight:700,color:c||'#1e293b',fontFamily:c?"'JetBrains Mono',monospace":undefined}}>{v}</div>
            </div>
          ))}
        </div>
        {/* Table */}
        <div className="table-wrap" style={{marginBottom:16}}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:36}}>#</th>
                <th style={{minWidth:110}}>DATE</th>
                <th style={{minWidth:120}}>TOTAL PURCHASE</th>
                <th style={{minWidth:100}}>PAID</th>
                <th style={{minWidth:110}}>PENDING</th>
                <th style={{minWidth:80}}>MODE</th>
                <th style={{minWidth:90}}>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {history.length===0
                ? <tr className="empty-row"><td colSpan={7}>No records found.</td></tr>
                : history.map((r,i)=>(
                  <tr key={r.id} style={{background:i===0?'#f0fdf4':''}}>
                    <td style={{color:'#94a3b8',fontSize:12}}>{history.length-i}</td>
                    <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(r.billDate||r.lastPurchaseDate)}</td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{cur(r.totalPurchase)}</td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",color:'#10b981',fontWeight:700}}>{cur(r.paid)}</td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,
                      color:r.pending>0?'#ef4444':'#10b981'}}>{cur(r.pending)}</td>
                    <td><span className="badge badge-blue">{r.paymentMode}</span></td>
                    <td>
                      <span style={{display:'inline-flex',alignItems:'center',gap:4,fontWeight:700,fontSize:12,
                        color:r.status==='Cleared'?'#10b981':'#ef4444'}}>
                        <span style={{width:8,height:8,borderRadius:'50%',display:'inline-block',
                          background:r.status==='Cleared'?'#10b981':'#ef4444'}}/>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <div style={{display:'flex',gap:10,justifyContent:'flex-end',
          paddingTop:16,borderTop:'1px solid var(--border)'}}>
          <button className="btn-outline" onClick={onClose}>Close</button>
          <button className="btn-primary" onClick={printHistory}>🖨 Print / Save PDF</button>
        </div>
      </div>
    </div>
  );
}

// ── Pay Now Modal ─────────────────────────────────────────────────────────────
function PayNowModal({ records, onClose, onSaved, showToast }) {
  const qc = useQueryClient();
  const [supplierId,   setSupplierId]   = useState('');
  const [ownerName,    setOwnerName]    = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [totalPurch,   setTotalPurch]   = useState('');
  const [nowPaying,    setNowPaying]    = useState('');
  const [pending,      setPending]      = useState('');
  const [payMode,      setPayMode]      = useState('UPI');
  const [lastDate,     setLastDate]     = useState('');
  const [billDate,     setBillDate]     = useState(todayStr());
  const [status,       setStatus]       = useState('Pending');
  const [locked,       setLocked]       = useState(false);
  const [fetchedRec,   setFetchedRec]   = useState(null);
  const [oldPending,   setOldPending]   = useState(0);
  const [editMode,     setEditMode]     = useState(false);
  const [infoBar,      setInfoBar]      = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  // Auto-calc pending whenever nowPaying or totalPurch changes
  const nowPay  = parseFloat(nowPaying)  || 0;
  const totPur  = parseFloat(totalPurch) || 0;
  const base    = fetchedRec ? oldPending : totPur;
  const calcPending = Math.max(0, base - nowPay);
  const calcStatus  = calcPending <= 0 ? 'Cleared' : 'Pending';

  function clearForm() {
    setSupplierId(''); setOwnerName(''); setSupplierName('');
    setTotalPurch(''); setNowPaying(''); setPending('');
    setPayMode('UPI'); setLastDate(''); setBillDate(todayStr());
    setStatus('Pending'); setLocked(false); setFetchedRec(null);
    setOldPending(0); setEditMode(false); setInfoBar(null); setError('');
  }

  async function handleFetch() {
    setError('');
    if (!supplierId.trim() || !ownerName.trim()) {
      setError('Enter Wholesaler ID and Owner Name first'); return;
    }
    // Find in local records first
    const match = records.find(r =>
      r.supplierId.toLowerCase() === supplierId.toLowerCase() &&
      r.ownerName.toLowerCase()  === ownerName.toLowerCase()
    );
    if (!match) {
      // Try server
      try {
        const res = await client.get(`/shop-credits/fetch/${encodeURIComponent(supplierId)}`);
        const m = res.data;
        applyFetch(m);
      } catch {
        setError('No existing record found for this Wholesaler ID & Owner Name');
      }
      return;
    }
    applyFetch(match);
  }

  function applyFetch(match) {
    setInfoBar({
      totalPurchase: match.totalPurchase,
      paid:          match.paid,
      pending:       match.pending,
      status:        match.status,
    });
    setSupplierName(match.supplierName || '');
    setTotalPurch(String(match.totalPurchase || ''));
    setNowPaying(String(match.paid || ''));
    setPending(String(match.pending || ''));
    setLastDate(match.lastPurchaseDate || '');
    setPayMode(match.paymentMode || 'UPI');
    setStatus(match.status || 'Pending');
    setFetchedRec(match);
    setOldPending(match.pending || 0);
    setLocked(true);
    setEditMode(false);
    showToast(`Fetched! Old Pending: ₹${parseFloat(match.pending||0).toFixed(2)}. Click ✏️ EDIT FETCHED → enter amount paying now → Pending auto-updates`);
  }

  function handleEditFetched() {
    setTotalPurch(String(fetchedRec.totalPurchase || ''));
    setNowPaying('');
    setPending(String(oldPending));
    setPayMode(fetchedRec.paymentMode || 'UPI');
    setStatus('Pending');
    setLocked(false);
    setEditMode(true);
  }

  async function handleSave() {
    setError('');
    if (!supplierId.trim() || !supplierName.trim() || !ownerName.trim()) {
      setError('Supplier Name, Wholesaler ID and Owner Name are required'); return;
    }
    const np  = parseFloat(nowPaying) || 0;
    const tp  = parseFloat(totalPurch) || 0;
    let newPending, cumulativePaid;
    if (fetchedRec) {
      const op = fetchedRec.pending;
      const op_paid = fetchedRec.paid;
      newPending     = +Math.max(0, op - np).toFixed(2);
      cumulativePaid = +(op_paid + np).toFixed(2);
    } else {
      newPending     = +Math.max(0, tp - np).toFixed(2);
      cumulativePaid = +np.toFixed(2);
    }
    const finalStatus = newPending <= 0 ? 'Cleared' : 'Pending';

    const payload = {
      supplierId: supplierId.trim(),
      supplierName: supplierName.trim(),
      ownerName: ownerName.trim(),
      totalPurchase: tp,
      paid: cumulativePaid,
      paymentMode: payMode,
      pending: newPending,
      lastPurchaseDate: lastDate || todayStr(),
      billDate, status: finalStatus,
    };

    setSaving(true);
    try {
      await client.post('/shop-credits', payload);
      onSaved();
      onClose();
      // Print prompt
      if (window.confirm('Record saved ✓\n\nDo you want to print the supplier statement?')) {
        printSupplierStatement(supplierId, payload, records);
      }
    } catch(e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  const inputStyle = (locked && !editMode)
    ? { margin: 0, background: '#f1f5f9', cursor: 'not-allowed' }
    : { margin: 0 };

  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()} style={{ maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>
        <div className="modal-hd">
          <h2 style={{ margin: 0, fontSize: 16 }}>💳 Pay Now — New Record</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: '4px 0' }}>
          {/* Instruction */}
          <div style={{ fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 1.6 }}>
            Enter <strong>Total Purchase</strong> (full amount bought) + <strong>Now Paying</strong> (amount paying this time) → Pending &amp; Status auto-fill.
            For existing supplier: enter ID &amp; Owner Name → click <strong>🔍 FETCH DETAILS</strong> → click <strong>✏️ EDIT FETCHED</strong> → update fields → <strong>ADD RECORD</strong>.
          </div>

          {/* Info bar after fetch */}
          {infoBar && (
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 14px',
              marginBottom: 12, fontSize: 13, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#15803d' }}>📋 Previous Record:</span>
              <span>Total Purchase: <strong>{cur(infoBar.totalPurchase)}</strong></span>
              <span>Paid: <strong>{cur(infoBar.paid)}</strong></span>
              <span>Pending: <strong>{cur(infoBar.pending)}</strong></span>
              <span>Status: <strong style={{ color: infoBar.status === 'Cleared' ? '#10b981' : '#ef4444' }}>{infoBar.status}</strong></span>
            </div>
          )}

          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626',
            borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 13 }}>{error}</div>}

          {/* Form grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">WHOLESALER ID *</label>
              <input className="form-input" style={{ margin: 0 }} value={supplierId}
                onChange={e => setSupplierId(e.target.value)} placeholder="e.g. WHL-001" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">WHOLESALER (OWNER NAME) *</label>
              <input className="form-input" style={{ margin: 0 }} value={ownerName}
                onChange={e => setOwnerName(e.target.value)} placeholder="Owner full name" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">SUPPLIER NAME *</label>
              <input className="form-input" style={inputStyle} value={supplierName}
                readOnly={locked && !editMode}
                onChange={e => setSupplierName(e.target.value)} placeholder="Company / Distributor name" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">TOTAL PURCHASE ₹</label>
              <input className="form-input" type="number" min="0" step="0.01"
                style={inputStyle} value={totalPurch}
                readOnly={locked && !editMode}
                onChange={e => setTotalPurch(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ color: '#10b981' }}>NOW PAYING ₹ (AMOUNT PAYING THIS TIME)</label>
              <input className="form-input" type="number" min="0" step="0.01"
                style={editMode ? { margin: 0, background: '#fffbeb', border: '2px solid #10b981' } : inputStyle}
                value={nowPaying}
                readOnly={locked && !editMode}
                onChange={e => setNowPaying(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">PAYMENT MODE</label>
              <select className="form-input" style={{ margin: 0 }} value={payMode}
                disabled={locked && !editMode}
                onChange={e => setPayMode(e.target.value)}>
                {['UPI','Cash','NEFT','Card','Cheque','Other'].map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">PENDING (TO BE PAID) ₹ (AUTO-CALCULATED)</label>
              <input className="form-input" style={{ margin: 0, background: '#f1f5f9', cursor: 'not-allowed' }}
                readOnly value={nowPaying ? calcPending.toFixed(2) : (pending || '')}
                placeholder="Auto-calculated" />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">LAST PURCHASE DATE</label>
              <input className="form-input" type="date"
                style={inputStyle} value={lastDate}
                readOnly={locked && !editMode}
                onChange={e => setLastDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">BILL DATE</label>
              <input className="form-input" type="date" style={{ margin: 0 }} value={billDate}
                onChange={e => setBillDate(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">STATUS (AUTO-SET)</label>
              <select className="form-input" style={{ margin: 0, background: '#f1f5f9', cursor: 'not-allowed' }}
                disabled value={nowPaying ? calcStatus : status}>
                <option value="Pending">Pending</option>
                <option value="Cleared">Cleared</option>
              </select>
            </div>
          </div>

          {/* Edit fetched button */}
          {locked && !editMode && (
            <button type="button" onClick={handleEditFetched}
              style={{ marginTop: 12, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a',
                borderRadius: 8, padding: '7px 16px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ✏️ EDIT FETCHED
            </button>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
            <button type="button" className="btn-outline" onClick={clearForm}>🗑 CLEAR</button>
            <button type="button" className="btn-outline" style={{ color: '#0ea5e9', borderColor: '#0ea5e9' }}
              onClick={handleFetch}>
              🔍 FETCH DETAILS
            </button>
            <button type="button" className="btn-primary" style={{ flex: 1, justifyContent: 'center' }}
              onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : '✓ ADD RECORD'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function printSupplierStatement(supplierId, lastRecord, allRecords) {
  const records = allRecords.filter(r => r.supplierId.toLowerCase() === supplierId.toLowerCase());
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  const rows = records.map((r, i) => `
    <tr style="background:${i%2===0?'#f8fafc':'white'}">
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${fmtDate(r.billDate||r.lastPurchaseDate)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace">₹${parseFloat(r.totalPurchase||0).toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:#10b981">₹${parseFloat(r.paid||0).toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;font-family:monospace;color:${r.pending>0?'#ef4444':'#10b981'}">₹${parseFloat(r.pending||0).toFixed(2)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${r.paymentMode}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">
        <span style="background:${r.status==='Cleared'?'#f0fdf4':'#fef2f2'};color:${r.status==='Cleared'?'#10b981':'#ef4444'};padding:2px 8px;border-radius:20px;font-weight:700;font-size:11px">${r.status}</span>
      </td>
    </tr>`).join('');

  win.document.write(`<!DOCTYPE html><html><head><title>Supplier Statement — ${supplierId}</title>
  <style>body{font-family:Arial,sans-serif;padding:28px}h2{margin:0;color:#0f172a}.sub{color:#64748b;font-size:13px;margin-bottom:20px}
  table{width:100%;border-collapse:collapse}th{background:#0ea5e9;color:#fff;padding:8px 10px;text-align:left;font-size:11px;text-transform:uppercase}
  @media print{body{padding:16px}}</style></head><body>
  <h2>Supplier Statement</h2>
  <div class="sub">Wholesaler ID: <strong>${supplierId}</strong> · ${records[0]?.supplierName||''} · Owner: ${records[0]?.ownerName||''}</div>
  <table>
    <thead><tr><th>Date</th><th>Total Purchase</th><th>Paid</th><th>Pending</th><th>Mode</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── Main export ───────────────────────────────────────────────────────────────
export default function CreditPage() {
  const { storeType } = useSettingsStore();
  const isWS = (storeType || '').trim() === 'Wholesale Pharma';
  return isWS ? <WholesaleCredit /> : <RetailCredit />;
}
