import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchProducts        = () => client.get('/products').then(r => r.data);
const fetchStockIns        = () => client.get('/stock-ins').then(r => r.data);
const fetchPurchaseRecords = () => client.get('/purchase-records').then(r => r.data);

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

const STATUS_BG    = {Pending:'#fef3c7',Delivered:'#d1fae5',Partial:'#e0f2fe'};
const STATUS_COLOR = {Pending:'#92400e',Delivered:'#065f46',Partial:'#0369a1'};
const TYPE_CLS     = {Supplier:'badge-blue',Manufacturer:'badge-green',Distributor:'badge-amber'};

/* ── Shared Modal wrapper using correct CSS ── */
function Modal({title, onClose, children, footer, wide}) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal-box${wide?' modal-bill':''}`} onClick={e=>e.stopPropagation()}
        style={{maxHeight:'92vh',overflowY:'auto'}}>
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

/* ── Wholesale: Edit purchase record modal ── */
function PurchaseEditModal({record, onClose, onSaved}) {
  const [orderNo,  setOrderNo]  = useState(record.orderNo||'');
  const [expDel,   setExpDel]   = useState(record.expectedDelivery||'');
  const [status,   setStatus]   = useState(record.deliveryStatus||'Pending');
  const [notes,    setNotes]    = useState(record.notes||'');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function save() {
    setSaving(true);
    try {
      await client.patch(`/purchase-records/${record.id}`,{deliveryStatus:status,notes,expectedDelivery:expDel,orderNo});
      onSaved(); onClose();
    } catch(e) { setError(e.response?.data?.error||'Save failed'); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="Edit Purchase Record" onClose={onClose}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':'✓ Update Record'}</button></>}>
      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}

      {/* Read-only summary */}
      <div style={{background:'#f8fafc',borderRadius:10,padding:'10px 14px',marginBottom:14,fontSize:13}}>
        <div style={{fontWeight:700,color:'#1e293b',marginBottom:4}}>{record.medicineName}</div>
        <div style={{display:'flex',gap:16,color:'#64748b'}}>
          <span>Qty: <strong>{record.qty} {record.qtyUnit}</strong></span>
          <span>Paid: <strong style={{color:'#10b981'}}>{cur(record.amountPaid)}</strong></span>
          <span>Party: <strong>{record.partyName}</strong></span>
        </div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        <div className="form-group">
          <label className="form-label">ORDER / INVOICE NO.</label>
          <input className="form-input" value={orderNo} onChange={e=>setOrderNo(e.target.value)} placeholder="e.g. INV-2024-001"/>
        </div>
        <div className="form-group">
          <label className="form-label">EXPECTED DELIVERY</label>
          <input className="form-input" type="date" value={expDel} onChange={e=>setExpDel(e.target.value)}/>
        </div>
        <div className="form-group">
          <label className="form-label">DELIVERY STATUS</label>
          <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="Pending">⏳ Pending</option>
            <option value="Delivered">✅ Delivered</option>
            <option value="Partial">🔄 Partial</option>
          </select>
        </div>
        <div className="form-group" style={{gridColumn:'1/-1'}}>
          <label className="form-label">NOTES</label>
          <textarea className="form-input" style={{minHeight:72,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. 2nd payment instalment…"/>
        </div>
      </div>
    </Modal>
  );
}

/* ── Shared Low Stock Table ── */
function LowStockTable({products}) {
  const low = (products||[])
    .filter(p=>p.stock<=p.minStock)
    .sort((a,b)=>{
      if(a.stock===0&&b.stock!==0) return -1;
      if(b.stock===0&&a.stock!==0) return 1;
      return (a.stock/(a.minStock||1))-(b.stock/(b.minStock||1));
    });

  return (
    <div className="card" style={{padding:0,overflow:'hidden',marginTop:24}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
        <span className="card-title">⚠ Low Stock Alert</span>
        <span style={{fontSize:12,fontWeight:700,padding:'4px 12px',borderRadius:99,
          background:low.length>0?'#fef3c7':'#f0fdf4',
          color:low.length>0?'#92400e':'#15803d',
          border:`1px solid ${low.length>0?'#fde68a':'#bbf7d0'}`}}>
          {low.length>0?`${low.length} medicine${low.length!==1?'s':''} need restocking`:'✓ All stock levels OK'}
        </span>
      </div>
      <div style={{fontSize:12,color:'#94a3b8',padding:'8px 20px',borderBottom:'1px solid var(--border)'}}>
        Medicines where current stock has reached or fallen below the Min. Stock Alert set during medicine creation.
      </div>
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{width:36}}>#</th>
              <th>MEDICINE</th>
              <th>CATEGORY</th>
              <th>FORM</th>
              <th>BATCH</th>
              <th>CURRENT STOCK</th>
              <th>MIN. ALERT</th>
              <th>SHORTAGE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {low.length===0?(
              <tr className="empty-row"><td colSpan={9}>✓ All medicines are adequately stocked</td></tr>
            ):low.map((p,i)=>{
              const shortage=p.minStock-p.stock;
              let badge,rowBg;
              if(p.stock===0)                          {badge=<span className="badge badge-red">Out of Stock</span>;rowBg='#fef2f2';}
              else if(p.stock<=Math.floor(p.minStock*.5)){badge=<span className="badge badge-red">Critical</span>;    rowBg='#fff7ed';}
              else                                     {badge=<span className="badge badge-amber">Low Stock</span>;  rowBg='#fffbeb';}
              return(
                <tr key={p.id} style={{background:rowBg}}>
                  <td style={{color:'#94a3b8',fontSize:12}}>{i+1}</td>
                  <td><div style={{fontWeight:600}}>{p.name}</div>{p.brand&&<div style={{fontSize:11,color:'#94a3b8'}}>{p.brand}</div>}</td>
                  <td><span className="badge badge-blue">{p.categoryName||'Uncategorized'}</span></td>
                  <td style={{fontSize:12,color:'#64748b'}}>{p.unit}</td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{p.sku||'—'}</td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:p.stock===0?'#ef4444':'#f59e0b'}}>{p.stock}</td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",color:'#64748b'}}>{p.minStock}</td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#ef4444'}}>+{shortage} needed</td>
                  <td>{badge}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   WHOLESALE VIEW
══════════════════════════════════════════════════════ */
function WholesaleStockIn({products, toast}) {
  const qc = useQueryClient();
  const [medName, setMedName]  = useState('');
  const [qty,     setQty]      = useState('');
  const [qtyUnit, setQtyUnit]  = useState('Box');
  const [amount,  setAmount]   = useState('');
  const [party,   setParty]    = useState('');
  const [pType,   setPType]    = useState('Supplier');
  const [orderNo, setOrderNo]  = useState('');
  const [expDel,  setExpDel]   = useState('');
  const [status,  setStatus]   = useState('Pending');
  const [notes,   setNotes]    = useState('');
  const [saving,  setSaving]   = useState(false);
  const [error,   setError]    = useState('');
  const [editRec, setEditRec]  = useState(null);

  const {data:records=[],isLoading} = useQuery({queryKey:['purchase-records'],queryFn:fetchPurchaseRecords,staleTime:30_000});

  const addMut = useMutation({
    mutationFn: p=>client.post('/purchase-records',p),
    onSuccess:()=>{
      qc.invalidateQueries({queryKey:['purchase-records']});
      toast('✓ Record saved');
      setMedName('');setQty('');setAmount('');setParty('');setOrderNo('');setExpDel('');setNotes('');
      setQtyUnit('Box');setPType('Supplier');setStatus('Pending');setError('');
    },
    onError:e=>setError(e.response?.data?.error||'Save failed'),
  });

  const delMut = useMutation({
    mutationFn: id=>client.delete(`/purchase-records/${id}`),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['purchase-records']});toast('Record deleted');},
  });

  const patchMut = useMutation({
    mutationFn:({id,payload})=>client.patch(`/purchase-records/${id}`,payload),
    onSuccess:()=>qc.invalidateQueries({queryKey:['purchase-records']}),
  });

  function handleSave(){
    setError('');
    if(!medName.trim())              {setError('Enter medicine name');return;}
    if(!qty||parseFloat(qty)<=0)     {setError('Enter valid quantity');return;}
    if(!amount||parseFloat(amount)<0){setError('Enter amount paid');return;}
    if(!party.trim())                {setError('Enter supplier / party name');return;}
    addMut.mutate({medicineName:medName.trim(),qty:parseFloat(qty),qtyUnit,amountPaid:parseFloat(amount),
      partyName:party.trim(),partyType:pType,orderNo:orderNo.trim(),expectedDelivery:expDel,deliveryStatus:status,notes:notes.trim()});
  }

  const pending = records.filter(r=>r.deliveryStatus==='Pending').length;

  return (
    <>
      {/* Info banner */}
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'14px 20px',marginBottom:20,display:'flex',gap:14,alignItems:'flex-start'}}>
        <span style={{fontSize:20}}>🗒️</span>
        <div>
          <div style={{fontWeight:700,color:'#15803d',fontSize:14}}>Purchase History for Wholesaler</div>
          <div style={{fontSize:12,color:'#64748b',marginTop:2}}>
            Record your payments to <strong>Suppliers, Manufacturers &amp; Distributors</strong>. This is a <em>personal ledger only</em> — medicines here are <strong>not added to Inventory</strong>.
          </div>
        </div>
      </div>

      {/* Add form card */}
      <div className="card" style={{marginBottom:20}}>
        <div style={{fontWeight:800,fontSize:15,color:'var(--text)',marginBottom:16}}>+ Add Purchase / Payment Entry</div>
        {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}

        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">MEDICINE NAME *</label>
          <input className="form-input" value={medName} onChange={e=>setMedName(e.target.value)} placeholder="e.g. Paracetamol 500mg, Azithromycin 250mg…"/>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 120px 1fr',gap:12,marginBottom:12}}>
          <div className="form-group">
            <label className="form-label">QUANTITY *</label>
            <input className="form-input" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/>
          </div>
          <div className="form-group" style={{alignSelf:'flex-end'}}>
            <select className="form-input" value={qtyUnit} onChange={e=>setQtyUnit(e.target.value)}>
              <option>Box</option><option>Strip</option><option>Piece</option><option>Kg</option><option>Litre</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">AMOUNT PAID (₹) *</label>
            <input className="form-input" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00"/>
          </div>
        </div>

        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
          <div className="form-group">
            <label className="form-label">SUPPLIER / MANUFACTURER / DISTRIBUTOR NAME *</label>
            <input className="form-input" value={party} onChange={e=>setParty(e.target.value)} placeholder="e.g. Sun Pharma, ABC Distributors…"/>
          </div>
          <div className="form-group">
            <label className="form-label">PARTY TYPE *</label>
            <select className="form-input" value={pType} onChange={e=>setPType(e.target.value)}>
              <option>Supplier</option><option>Manufacturer</option><option>Distributor</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">ORDER / INVOICE NO.</label>
            <input className="form-input" value={orderNo} onChange={e=>setOrderNo(e.target.value)} placeholder="e.g. INV-2024-001"/>
          </div>
          <div className="form-group">
            <label className="form-label">EXPECTED DELIVERY DATE</label>
            <input className="form-input" type="date" value={expDel} onChange={e=>setExpDel(e.target.value)}/>
          </div>
        </div>

        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">DELIVERY STATUS</label>
          <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="Pending">⏳ Pending</option>
            <option value="Delivered">✅ Delivered</option>
            <option value="Partial">🔄 Partial</option>
          </select>
        </div>

        <div className="form-group" style={{marginBottom:16}}>
          <label className="form-label">NOTES</label>
          <textarea className="form-input" style={{minHeight:80,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. 2nd payment instalment, partial delivery expected…"/>
        </div>

        <button className="btn-primary" style={{width:'100%',justifyContent:'center',padding:'12px 0',fontSize:15}} onClick={handleSave} disabled={addMut.isPending}>
          {addMut.isPending?'Saving…':'✓ Save Purchase Record'}
        </button>
      </div>

      {/* Records table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
          <span className="card-title">🗃 Recent Purchase Entries</span>
          <span className="badge badge-blue">{records.length} record{records.length!==1?'s':''} · {pending} pending</span>
        </div>
        <div style={{fontSize:12,color:'#94a3b8',padding:'8px 20px',borderBottom:'1px solid var(--border)'}}>
          Scroll to view all records. Click the status dropdown to update delivery status inline. Records here do <strong>not</strong> affect your inventory.
        </div>
        <div className="table-wrap">
          <table className="tbl" style={{minWidth:900}}>
            <thead>
              <tr>
                <th style={{minWidth:100}}>DATE</th>
                <th style={{minWidth:160}}>MEDICINE</th>
                <th style={{minWidth:100}}>QTY</th>
                <th style={{minWidth:120}}>AMOUNT PAID</th>
                <th style={{minWidth:180}}>PARTY</th>
                <th style={{minWidth:120}}>EXP. DELIVERY</th>
                <th style={{minWidth:140}}>STATUS</th>
                <th style={{minWidth:140}}>NOTES</th>
                <th style={{minWidth:80}}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading?(
                <tr className="empty-row"><td colSpan={9}>Loading…</td></tr>
              ):records.length===0?(
                <tr className="empty-row"><td colSpan={9}>No purchase records yet. Add your first entry above.</td></tr>
              ):records.map(r=>(
                <tr key={r.id}>
                  <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{fmtDate(r.date)}</td>
                  <td>
                    <div style={{fontWeight:700}}>{r.medicineName}</div>
                    {r.orderNo&&<div style={{fontSize:11,color:'#94a3b8',fontFamily:"'JetBrains Mono',monospace"}}>{r.orderNo}</div>}
                  </td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#0ea5e9',whiteSpace:'nowrap'}}>
                    {r.qty} <span style={{fontSize:11,color:'#64748b'}}>{r.qtyUnit}</span>
                  </td>
                  <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#10b981',whiteSpace:'nowrap'}}>{cur(r.amountPaid)}</td>
                  <td>
                    <div style={{fontWeight:600}}>{r.partyName}</div>
                    <span className={`badge ${TYPE_CLS[r.partyType]||'badge-blue'}`} style={{fontSize:10}}>{r.partyType}</span>
                  </td>
                  <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{r.expectedDelivery?fmtDate(r.expectedDelivery):'—'}</td>
                  <td>
                    <select
                      defaultValue={r.deliveryStatus}
                      onChange={e=>patchMut.mutate({id:r.id,payload:{deliveryStatus:e.target.value}})}
                      style={{border:'none',fontSize:12,fontWeight:700,padding:'3px 8px',borderRadius:20,cursor:'pointer',
                        background:STATUS_BG[r.deliveryStatus]||'#f1f5f9',
                        color:STATUS_COLOR[r.deliveryStatus]||'#64748b',outline:'none',minWidth:110}}>
                      <option value="Pending">⏳ Pending</option>
                      <option value="Delivered">✅ Delivered</option>
                      <option value="Partial">🔄 Partial</option>
                    </select>
                  </td>
                  <td style={{fontSize:12,color:'#64748b',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={r.notes||''}>{r.notes||'—'}</td>
                  <td style={{whiteSpace:'nowrap'}}>
                    <button className="btn-icon" onClick={()=>setEditRec(r)} title="Edit">✏️</button>
                    <button className="btn-icon" onClick={()=>{if(window.confirm('Delete this record?'))delMut.mutate(r.id);}} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editRec&&(
        <PurchaseEditModal record={editRec} onClose={()=>setEditRec(null)}
          onSaved={()=>{qc.invalidateQueries({queryKey:['purchase-records']});setEditRec(null);toast('Updated ✓');}}/>
      )}

      <LowStockTable products={products}/>
    </>
  );
}

/* ══════════════════════════════════════════════════════
   RETAIL VIEW
══════════════════════════════════════════════════════ */
function RetailStockIn({products, toast}) {
  const qc = useQueryClient();
  const [prodSearch, setProdSearch]   = useState('');
  const [selectedProd, setSelected]   = useState(null);
  const [showSug, setShowSug]         = useState(false);
  const [qty,     setQty]             = useState('');
  const [price,   setPrice]           = useState('');
  const [batch,   setBatch]           = useState('');
  const [expiry,  setExpiry]          = useState('');
  const [supplier,setSupplier]        = useState('');
  const [invoiceNo,setInvoice]        = useState('');
  const [notes,   setNotes]           = useState('');
  const [saving,  setSaving]          = useState(false);
  const [error,   setError]           = useState('');

  const {data:stockIns=[],isLoading} = useQuery({queryKey:['stock-ins'],queryFn:fetchStockIns,staleTime:30_000});

  const addMut = useMutation({
    mutationFn: p=>client.post('/stock-ins',p),
    onSuccess:(res)=>{
      qc.invalidateQueries({queryKey:['stock-ins']});
      qc.invalidateQueries({queryKey:['products']});
      toast(`✓ Stock added${res.data?.updatedProduct?` — new stock: ${res.data.updatedProduct.stock}`:''}`);
      setProdSearch('');setSelected(null);setQty('');setPrice('');
      setBatch('');setExpiry('');setSupplier('');setInvoice('');setNotes('');setError('');
    },
    onError:e=>setError(e.response?.data?.error||'Save failed'),
  });

  const suggestions = prodSearch.length>=1
    ? products.filter(p=>p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0,8)
    : [];

  function selectProd(p) { setSelected(p); setProdSearch(p.name); setShowSug(false); }

  function handleSave() {
    setError('');
    if(!selectedProd)           {setError('Select a medicine from the list');return;}
    if(!qty||parseInt(qty)<1)   {setError('Enter valid quantity');return;}
    if(!price||parseFloat(price)<0){setError('Enter purchase price');return;}
    if(!batch.trim())           {setError('Batch number is required');return;}
    if(!expiry)                 {setError('Expiry date is required');return;}
    addMut.mutate({productId:selectedProd.id,productName:selectedProd.name,
      qty:parseInt(qty),price:parseFloat(price),batch:batch.trim(),expiry,
      supplier:supplier.trim(),invoiceNo:invoiceNo.trim(),notes:notes.trim()});
  }

  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 400px',gap:20,alignItems:'start',marginBottom:24}}>

        {/* Add form */}
        <div className="card">
          <div style={{fontWeight:800,fontSize:15,marginBottom:16}}>Add Stock / Purchase Entry</div>
          {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}

          {/* Medicine autocomplete */}
          <div className="form-group" style={{marginBottom:12,position:'relative'}}>
            <label className="form-label">MEDICINE *</label>
            <input className="form-input" value={prodSearch}
              onChange={e=>{setProdSearch(e.target.value);setSelected(null);setShowSug(true);}}
              onFocus={()=>setShowSug(true)}
              onBlur={()=>setTimeout(()=>setShowSug(false),180)}
              placeholder="Search medicine…"/>
            {showSug&&suggestions.length>0&&(
              <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'white',border:'1px solid var(--border)',borderRadius:10,boxShadow:'0 8px 32px rgba(0,0,0,.12)',maxHeight:220,overflowY:'auto'}}>
                {suggestions.map(p=>(
                  <div key={p.id} onMouseDown={()=>selectProd(p)}
                    style={{padding:'10px 14px',cursor:'pointer',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background='white'}>
                    <div>
                      <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                      {p.brand&&<div style={{fontSize:11,color:'#94a3b8'}}>{p.brand}</div>}
                    </div>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,color:p.stock===0?'#ef4444':p.stock<=p.minStock?'#f59e0b':'#10b981',fontWeight:700}}>{p.stock}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:12}}>
            <div className="form-group">
              <label className="form-label">QUANTITY *</label>
              <input className="form-input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0"/>
            </div>
            <div className="form-group">
              <label className="form-label">PURCHASE PRICE ₹ *</label>
              <input className="form-input" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00"/>
            </div>
            <div className="form-group">
              <label className="form-label">BATCH NO. *</label>
              <input className="form-input" value={batch} onChange={e=>setBatch(e.target.value)} placeholder="e.g. B240101"/>
            </div>
            <div className="form-group">
              <label className="form-label">EXPIRY DATE *</label>
              <input className="form-input" type="month" value={expiry} onChange={e=>setExpiry(e.target.value)}/>
            </div>
            <div className="form-group">
              <label className="form-label">SUPPLIER / DISTRIBUTOR</label>
              <input className="form-input" value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Supplier name"/>
            </div>
            <div className="form-group">
              <label className="form-label">INVOICE NO.</label>
              <input className="form-input" value={invoiceNo} onChange={e=>setInvoice(e.target.value)} placeholder="INV-0001"/>
            </div>
          </div>

          <div className="form-group" style={{marginBottom:16}}>
            <label className="form-label">NOTES</label>
            <textarea className="form-input" style={{minHeight:68,resize:'vertical'}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…"/>
          </div>

          <button className="btn-primary" style={{width:'100%',justifyContent:'center',padding:'11px 0'}} onClick={handleSave} disabled={addMut.isPending}>
            {addMut.isPending?'Saving…':'✓ Add Stock Entry'}
          </button>
        </div>

        {/* Recent entries panel */}
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13}}>Recent Purchase Entries</div>
          <div style={{overflowY:'auto',maxHeight:500}}>
            {isLoading?(
              <div style={{padding:20,textAlign:'center',color:'#94a3b8'}}>Loading…</div>
            ):stockIns.length===0?(
              <div style={{padding:24,textAlign:'center',color:'#94a3b8',fontStyle:'italic'}}>No entries yet</div>
            ):(
              <table className="tbl" style={{fontSize:12}}>
                <thead>
                  <tr>
                    <th>DATE</th>
                    <th>MEDICINE</th>
                    <th>QTY</th>
                    <th>BATCH</th>
                    <th>EXPIRY</th>
                    <th>PRICE</th>
                    <th>SUPPLIER</th>
                  </tr>
                </thead>
                <tbody>
                  {stockIns.slice(0,50).map(s=>{
                    const d=daysLeft(s.expiry);
                    const ec=d<0?'#ef4444':d<=90?'#f59e0b':'#64748b';
                    return(
                      <tr key={s.id}>
                        <td style={{color:'#64748b',whiteSpace:'nowrap'}}>{fmtDate(s.date)}</td>
                        <td>
                          <div style={{fontWeight:600}}>{s.productName}</div>
                          {s.invoiceNo&&<div style={{fontSize:10,color:'#94a3b8',fontFamily:"'JetBrains Mono',monospace"}}>{s.invoiceNo}</div>}
                        </td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#0ea5e9'}}>+{s.qty}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{s.batch||'—'}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:ec}}>{fmtMonth(s.expiry)||'—'}</td>
                        <td style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(s.price)}</td>
                        <td style={{fontSize:11,color:'#64748b'}}>{s.supplier||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <LowStockTable products={products}/>

      <style>{`@media(max-width:900px){.retail-grid{grid-template-columns:1fr!important;}}`}</style>
    </>
  );
}

/* ── Main Page ── */
export default function StockInPage() {
  const {storeType} = useSettingsStore();
  const isWS = (storeType||'').trim()==='Wholesale Pharma';
  const [toastMsg,setToastMsg] = useState('');

  const {data:products=[]} = useQuery({queryKey:['products'],queryFn:fetchProducts,staleTime:30_000});

  function showToast(msg){setToastMsg(msg);setTimeout(()=>setToastMsg(''),3000);}

  return (
    <div style={{padding:'20px 24px'}}>
      {toastMsg&&(
        <div style={{position:'fixed',top:20,right:24,zIndex:9999,background:'#1e293b',color:'white',padding:'10px 20px',borderRadius:10,fontWeight:600,fontSize:13,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toastMsg}
        </div>
      )}
      {isWS
        ? <WholesaleStockIn products={products} toast={showToast}/>
        : <RetailStockIn    products={products} toast={showToast}/>
      }
    </div>
  );
}
