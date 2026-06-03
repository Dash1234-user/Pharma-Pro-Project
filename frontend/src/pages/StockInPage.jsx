import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchProducts       = () => client.get('/products').then(r => r.data);
const fetchStockIns       = () => client.get('/stock-ins').then(r => r.data);
const fetchPurchaseRecords= () => client.get('/purchase-records').then(r => r.data);

function cur(n)  { return '₹' + parseFloat(n || 0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}
function fmtMonth(val) {
  if (!val) return '—';
  const [y, m] = val.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${y}`;
}
function expiryDaysLeft(expiry) {
  if (!expiry) return 9999;
  const exp = new Date(expiry + '-01');
  const now = new Date(); now.setDate(1);
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}

const STATUS_COLOR = { 'Pending':'#f59e0b', 'Delivered':'#10b981', 'Partial':'#0ea5e9' };
const STATUS_BG    = { 'Pending':'#fef3c7', 'Delivered':'#d1fae5', 'Partial':'#e0f2fe' };
const TYPE_CLS     = { 'Supplier':'badge-blue', 'Manufacturer':'badge-green', 'Distributor':'badge-amber' };

// ── Purchase Record Edit Modal (Wholesale) ────────────────────────────────────
function PurchaseEditModal({ record, onClose, onSaved }) {
  const [medName,  setMedName]  = useState(record.medicineName || '');
  const [qty,      setQty]      = useState(String(record.qty || ''));
  const [qtyUnit,  setQtyUnit]  = useState(record.qtyUnit || 'Box');
  const [amount,   setAmount]   = useState(String(record.amountPaid || ''));
  const [party,    setParty]    = useState(record.partyName || '');
  const [pType,    setPType]    = useState(record.partyType || 'Supplier');
  const [orderNo,  setOrderNo]  = useState(record.orderNo || '');
  const [expDel,   setExpDel]   = useState(record.expectedDelivery || '');
  const [status,   setStatus]   = useState(record.deliveryStatus || 'Pending');
  const [notes,    setNotes]    = useState(record.notes || '');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  async function handleSave() {
    setError('');
    if (!medName.trim())           { setError('Medicine name is required'); return; }
    if (!qty || parseFloat(qty)<=0){ setError('Enter valid quantity'); return; }
    if (!amount || parseFloat(amount)<0){ setError('Enter valid amount'); return; }
    if (!party.trim())             { setError('Supplier / party name is required'); return; }
    setSaving(true);
    try {
      await client.patch(`/purchase-records/${record.id}`, {
        deliveryStatus: status, notes, expectedDelivery: expDel, orderNo,
      });
      onSaved();
      onClose();
    } catch(e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally { setSaving(false); }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:520 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Edit Purchase Record</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13 }}>{error}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">MEDICINE NAME</label>
              <input className="form-input" value={medName} onChange={e=>setMedName(e.target.value)} disabled style={{ opacity:.7 }} />
              <div style={{ fontSize:11,color:'#94a3b8',marginTop:2 }}>Medicine name cannot be changed after saving</div>
            </div>
            <div className="form-group">
              <label className="form-label">ORDER / INVOICE NO.</label>
              <input className="form-input" value={orderNo} onChange={e=>setOrderNo(e.target.value)} placeholder="e.g. INV-2024-001" />
            </div>
            <div className="form-group">
              <label className="form-label">EXPECTED DELIVERY</label>
              <input className="form-input" type="date" value={expDel} onChange={e=>setExpDel(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">DELIVERY STATUS</label>
              <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
                <option value="Pending">⏳ Pending</option>
                <option value="Delivered">✅ Delivered</option>
                <option value="Partial">🔄 Partial</option>
              </select>
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">NOTES</label>
              <textarea className="form-input" style={{ minHeight:72, resize:'vertical' }}
                value={notes} onChange={e=>setNotes(e.target.value)}
                placeholder="e.g. 2nd payment instalment, partial delivery expected…" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : '✓ Update Record'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Retail Stock-In Edit Modal ────────────────────────────────────────────────
// (Retail stock-ins are immutable after creation — only delete is allowed per original app logic)

// ── Low Stock Table (shared) ──────────────────────────────────────────────────
function LowStockTable({ products }) {
  const lowProds = (products || [])
    .filter(p => p.stock <= p.minStock)
    .sort((a, b) => {
      if (a.stock === 0 && b.stock !== 0) return -1;
      if (b.stock === 0 && a.stock !== 0) return 1;
      return (a.stock / (a.minStock||1)) - (b.stock / (b.minStock||1));
    });

  const countColor = lowProds.length > 0 ? '#b45309' : '#15803d';
  const countBg    = lowProds.length > 0 ? '#fef3c7' : '#f0fdf4';
  const countBdr   = lowProds.length > 0 ? '#fde68a' : '#bbf7d0';

  return (
    <div className="card" style={{ overflow:'hidden', marginTop:24 }}>
      <div className="card-header">
        <h3 className="card-title">⚠ Low Stock Alert</h3>
        <span style={{ fontSize:12, fontWeight:700, padding:'4px 12px', borderRadius:99,
          background:countBg, color:countColor, border:`1px solid ${countBdr}` }}>
          {lowProds.length > 0 ? `${lowProds.length} medicine${lowProds.length!==1?'s':''} need restocking` : '✓ All stock levels OK'}
        </span>
      </div>
      <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width:36 }}>#</th>
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
            {lowProds.length === 0 ? (
              <tr className="empty-row">
                <td colSpan={9} style={{ textAlign:'center', padding:28, color:'#94a3b8', fontStyle:'italic' }}>
                  ✓ All medicines are adequately stocked
                </td>
              </tr>
            ) : lowProds.map((p, i) => {
              const shortage = p.minStock - p.stock;
              let statusBadge, rowBg;
              if (p.stock === 0) {
                statusBadge = <span className="badge badge-red">Out of Stock</span>;
                rowBg = '#fef2f2';
              } else if (p.stock <= Math.floor(p.minStock * 0.5)) {
                statusBadge = <span className="badge badge-red">Critical</span>;
                rowBg = '#fff7ed';
              } else {
                statusBadge = <span className="badge badge-amber">Low Stock</span>;
                rowBg = '#fffbeb';
              }
              return (
                <tr key={p.id} style={{ background:rowBg }}>
                  <td style={{ color:'#94a3b8', fontSize:12 }}>{i+1}</td>
                  <td>
                    <div style={{ fontWeight:600 }}>{p.name}</div>
                    {p.brand && <div style={{ fontSize:11, color:'#94a3b8' }}>{p.brand}</div>}
                  </td>
                  <td><span className="badge badge-blue">{p.categoryName || 'Uncategorized'}</span></td>
                  <td style={{ fontSize:12, color:'#64748b' }}>{p.unit}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{p.sku || '—'}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700,
                    color: p.stock===0 ? '#ef4444' : '#f59e0b' }}>{p.stock}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", color:'#64748b' }}>{p.minStock}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#ef4444' }}>
                    +{shortage} needed
                  </td>
                  <td>{statusBadge}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Wholesale View ────────────────────────────────────────────────────────────
function WholesaleStockIn({ products, toast }) {
  const qc = useQueryClient();
  const [medName,  setMedName]  = useState('');
  const [qty,      setQty]      = useState('');
  const [qtyUnit,  setQtyUnit]  = useState('Box');
  const [amount,   setAmount]   = useState('');
  const [party,    setParty]    = useState('');
  const [pType,    setPType]    = useState('Supplier');
  const [orderNo,  setOrderNo]  = useState('');
  const [expDel,   setExpDel]   = useState('');
  const [status,   setStatus]   = useState('Pending');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [editRec,  setEditRec]  = useState(null);

  const { data: records = [], isLoading } = useQuery({
    queryKey: ['purchase-records'],
    queryFn:  fetchPurchaseRecords,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload) => client.post('/purchase-records', payload),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['purchase-records'] });
      toast('✓ Record saved');
      setMedName(''); setQty(''); setAmount(''); setParty('');
      setOrderNo(''); setExpDel(''); setNotes('');
      setQtyUnit('Box'); setPType('Supplier'); setStatus('Pending');
      setError('');
    },
    onError: (e) => setError(e.response?.data?.error || 'Save failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/purchase-records/${id}`),
    onSuccess:  () => { qc.invalidateQueries({ queryKey:['purchase-records'] }); toast('Record deleted'); },
  });

  const patchMutation = useMutation({
    mutationFn: ({ id, payload }) => client.patch(`/purchase-records/${id}`, payload),
    onSuccess:  () => { qc.invalidateQueries({ queryKey:['purchase-records'] }); },
  });

  function handleSave() {
    setError('');
    if (!medName.trim())              { setError('Enter medicine name'); return; }
    if (!qty || parseFloat(qty) <= 0) { setError('Enter valid quantity'); return; }
    if (!amount || parseFloat(amount) < 0) { setError('Enter amount paid'); return; }
    if (!party.trim())                { setError('Enter supplier / manufacturer / distributor name'); return; }
    addMutation.mutate({
      medicineName: medName.trim(), qty: parseFloat(qty), qtyUnit,
      amountPaid: parseFloat(amount), partyName: party.trim(), partyType: pType,
      orderNo: orderNo.trim(), expectedDelivery: expDel, deliveryStatus: status, notes: notes.trim(),
    });
  }

  function handleDelete(r) {
    if (!window.confirm('Delete this purchase record?')) return;
    deleteMutation.mutate(r.id);
  }

  const pending = records.filter(r => r.deliveryStatus === 'Pending').length;

  return (
    <>
      {/* Info banner */}
      <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:12, padding:'14px 20px', marginBottom:20, display:'flex', gap:14, alignItems:'flex-start' }}>
        <span style={{ fontSize:20 }}>🗒️</span>
        <div>
          <div style={{ fontWeight:700, color:'#15803d', fontSize:14 }}>Purchase History for Wholesaler</div>
          <div style={{ fontSize:12, color:'#64748b', marginTop:2 }}>
            Record your payments to <strong>Suppliers, Manufacturers &amp; Distributors</strong>. This is a <em>personal ledger only</em> — medicines entered here are <strong>not added to Inventory</strong>. Use this to track bulk orders, track delivery status, and maintain payment history.
          </div>
        </div>
      </div>

      {/* Add form */}
      <div className="card" style={{ padding:'20px', marginBottom:20 }}>
        <h3 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 16px' }}>+ Add Purchase / Payment Entry</h3>
        {error && <div style={{ background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13 }}>{error}</div>}

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">MEDICINE NAME *</label>
          <input className="form-input" value={medName} onChange={e=>setMedName(e.target.value)}
            placeholder="e.g. Paracetamol 500mg, Azithromycin 250mg…" />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">QUANTITY *</label>
            <input className="form-input" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0" />
          </div>
          <div className="form-group" style={{ margin:0, alignSelf:'flex-end' }}>
            <select className="form-input" value={qtyUnit} onChange={e=>setQtyUnit(e.target.value)}>
              <option>Box</option><option>Strip</option><option>Piece</option><option>Kg</option><option>Litre</option>
            </select>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">AMOUNT PAID (₹) *</label>
            <input className="form-input" type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" />
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">SUPPLIER / MANUFACTURER / DISTRIBUTOR NAME *</label>
            <input className="form-input" value={party} onChange={e=>setParty(e.target.value)} placeholder="e.g. Sun Pharma, ABC Distributors…" />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">PARTY TYPE *</label>
            <select className="form-input" value={pType} onChange={e=>setPType(e.target.value)}>
              <option>Supplier</option><option>Manufacturer</option><option>Distributor</option>
            </select>
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">ORDER / INVOICE NO.</label>
            <input className="form-input" value={orderNo} onChange={e=>setOrderNo(e.target.value)} placeholder="e.g. INV-2024-001" />
          </div>
          <div className="form-group" style={{ margin:0 }}>
            <label className="form-label">EXPECTED DELIVERY DATE</label>
            <input className="form-input" type="date" value={expDel} onChange={e=>setExpDel(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom:12 }}>
          <label className="form-label">DELIVERY STATUS</label>
          <select className="form-input" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="Pending">⏳ Pending</option>
            <option value="Delivered">✅ Delivered</option>
            <option value="Partial">🔄 Partial</option>
          </select>
        </div>

        <div className="form-group" style={{ marginBottom:16 }}>
          <label className="form-label">NOTES</label>
          <textarea className="form-input" style={{ minHeight:80, resize:'vertical' }}
            value={notes} onChange={e=>setNotes(e.target.value)}
            placeholder="e.g. 2nd payment instalment, partial delivery expected…" />
        </div>

        <button className="btn-primary" style={{ width:'100%', justifyContent:'center', padding:'12px 0', fontSize:15 }}
          onClick={handleSave} disabled={addMutation.isPending}>
          {addMutation.isPending ? 'Saving…' : '✓ Save Purchase Record'}
        </button>
      </div>

      {/* Records table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div className="card-header">
          <h3 className="card-title">🗃 Recent Purchase Entries</h3>
          <span className="badge badge-blue">
            {records.length > 0 ? `${records.length} record${records.length!==1?'s':''} · ${pending} pending` : '0 records'}
          </span>
        </div>
        <div style={{ padding:'8px 20px', fontSize:12, color:'#94a3b8', borderBottom:'1px solid var(--border)' }}>
          Scroll to view all records. Click the status dropdown to update delivery status inline. Records here do <strong>not</strong> affect your inventory.
        </div>
        <div className="table-responsive">
          <table className="data-table" style={{ minWidth:860 }}>
            <thead>
              <tr>
                <th>DATE</th>
                <th>MEDICINE</th>
                <th>QTY</th>
                <th>AMOUNT PAID</th>
                <th>PARTY</th>
                <th>EXP. DELIVERY</th>
                <th>STATUS</th>
                <th>NOTES</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr className="empty-row"><td colSpan={9} style={{ textAlign:'center', padding:28 }}>Loading…</td></tr>
              ) : records.length === 0 ? (
                <tr className="empty-row">
                  <td colSpan={9} style={{ textAlign:'center', padding:28, color:'#94a3b8' }}>
                    No purchase records yet. Add your first entry above.
                  </td>
                </tr>
              ) : records.map(r => (
                <tr key={r.id}>
                  <td style={{ fontSize:12, color:'#64748b', whiteSpace:'nowrap' }}>{fmtDate(r.date)}</td>
                  <td>
                    <div style={{ fontWeight:700, color:'#1e293b' }}>{r.medicineName}</div>
                    {r.orderNo && <div style={{ fontSize:11, color:'#94a3b8', fontFamily:"'JetBrains Mono',monospace" }}>{r.orderNo}</div>}
                  </td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#0ea5e9', whiteSpace:'nowrap' }}>
                    {r.qty} <span style={{ fontSize:11, color:'#64748b' }}>{r.qtyUnit}</span>
                  </td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#10b981' }}>{cur(r.amountPaid)}</td>
                  <td>
                    <div style={{ fontWeight:600 }}>{r.partyName}</div>
                    <span className={`badge ${TYPE_CLS[r.partyType]||'badge-blue'}`} style={{ fontSize:10 }}>{r.partyType}</span>
                  </td>
                  <td style={{ fontSize:12, color:'#64748b' }}>{r.expectedDelivery ? fmtDate(r.expectedDelivery) : '—'}</td>
                  <td>
                    <select
                      onChange={e => patchMutation.mutate({ id:r.id, payload:{ deliveryStatus:e.target.value } })}
                      style={{ border:'none', fontSize:12, fontWeight:700, padding:'3px 8px', borderRadius:20,
                        cursor:'pointer', background: STATUS_BG[r.deliveryStatus]||'#f1f5f9',
                        color: STATUS_COLOR[r.deliveryStatus]||'#64748b', outline:'none' }}
                      defaultValue={r.deliveryStatus}>
                      <option value="Pending">⏳ Pending</option>
                      <option value="Delivered">✅ Delivered</option>
                      <option value="Partial">🔄 Partial</option>
                    </select>
                  </td>
                  <td style={{ fontSize:12, color:'#64748b', maxWidth:120, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}
                    title={r.notes||''}>{r.notes||'—'}</td>
                  <td style={{ whiteSpace:'nowrap' }}>
                    <button className="btn-icon" onClick={() => setEditRec(r)} title="Edit">✏️</button>
                    <button className="btn-icon" onClick={() => handleDelete(r)} title="Delete">🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editRec && (
        <PurchaseEditModal record={editRec} onClose={() => setEditRec(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey:['purchase-records'] }); setEditRec(null); toast('Record updated ✓'); }} />
      )}

      <LowStockTable products={products} />
    </>
  );
}

// ── Retail View ───────────────────────────────────────────────────────────────
function RetailStockIn({ products, toast }) {
  const qc = useQueryClient();
  const [prodSearch, setProdSearch] = useState('');
  const [selectedProd, setSelectedProd] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [qty,      setQty]      = useState('');
  const [price,    setPrice]    = useState('');
  const [batch,    setBatch]    = useState('');
  const [expiry,   setExpiry]   = useState('');
  const [supplier, setSupplier] = useState('');
  const [invoiceNo,setInvoiceNo]= useState('');
  const [notes,    setNotes]    = useState('');
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const searchRef = useRef(null);

  const { data: stockIns = [], isLoading } = useQuery({
    queryKey: ['stock-ins'],
    queryFn:  fetchStockIns,
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload) => client.post('/stock-ins', payload),
    onSuccess:  (res) => {
      qc.invalidateQueries({ queryKey:['stock-ins'] });
      qc.invalidateQueries({ queryKey:['products'] });
      toast(`✓ Stock entry added${res.data?.updatedProduct ? ` — new stock: ${res.data.updatedProduct.stock}` : ''}`);
      setProdSearch(''); setSelectedProd(null);
      setQty(''); setPrice(''); setBatch(''); setExpiry(''); setSupplier(''); setInvoiceNo(''); setNotes('');
      setError('');
    },
    onError: (e) => setError(e.response?.data?.error || 'Save failed'),
  });

  // No delete endpoint for stock-ins in original — showing info only
  // (stock-in entries adjust inventory and cannot be reversed via simple delete)

  const suggestions = prodSearch.length >= 1
    ? products.filter(p => p.name.toLowerCase().includes(prodSearch.toLowerCase())).slice(0, 8)
    : [];

  function selectProduct(p) {
    setSelectedProd(p);
    setProdSearch(p.name);
    setShowSuggestions(false);
  }

  function handleSave() {
    setError('');
    if (!selectedProd)             { setError('Select a medicine from the list'); return; }
    if (!qty || parseInt(qty) < 1) { setError('Enter valid quantity'); return; }
    if (!price || parseFloat(price) < 0) { setError('Enter purchase price'); return; }
    if (!batch.trim())             { setError('Batch number is required'); return; }
    if (!expiry)                   { setError('Expiry date is required'); return; }
    addMutation.mutate({
      productId: selectedProd.id, productName: selectedProd.name,
      qty: parseInt(qty), price: parseFloat(price),
      batch: batch.trim(), expiry, supplier: supplier.trim(),
      invoiceNo: invoiceNo.trim(), notes: notes.trim(),
    });
  }

  return (
    <>
      {/* Split layout: form + recent entries side by side */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 380px', gap:20, alignItems:'start', marginBottom:24 }}>

        {/* Add form */}
        <div className="card" style={{ padding:'20px' }}>
          <h3 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 16px' }}>Add Stock / Purchase Entry</h3>
          {error && <div style={{ background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13 }}>{error}</div>}

          {/* Medicine search with autocomplete */}
          <div className="form-group" style={{ marginBottom:12, position:'relative' }}>
            <label className="form-label">MEDICINE *</label>
            <input ref={searchRef} className="form-input"
              value={prodSearch}
              onChange={e => { setProdSearch(e.target.value); setSelectedProd(null); setShowSuggestions(true); }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              placeholder="Search medicine…" />
            {showSuggestions && suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, zIndex:100,
                background:'white', border:'1px solid var(--border)', borderRadius:8,
                boxShadow:'0 8px 32px rgba(0,0,0,.12)', maxHeight:240, overflowY:'auto' }}>
                {suggestions.map(p => (
                  <div key={p.id}
                    onMouseDown={() => selectProduct(p)}
                    style={{ padding:'10px 14px', cursor:'pointer', borderBottom:'1px solid var(--border)',
                      display:'flex', justifyContent:'space-between', alignItems:'center' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e=>e.currentTarget.style.background='white'}>
                    <div>
                      <div style={{ fontWeight:600, fontSize:13 }}>{p.name}</div>
                      {p.brand && <div style={{ fontSize:11, color:'#94a3b8' }}>{p.brand}</div>}
                    </div>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12,
                      color: p.stock===0?'#ef4444':p.stock<=p.minStock?'#f59e0b':'#10b981', fontWeight:700 }}>
                      {p.stock}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">QUANTITY *</label>
              <input className="form-input" type="number" min="1" value={qty} onChange={e=>setQty(e.target.value)} placeholder="0" />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">PURCHASE PRICE ₹ *</label>
              <input className="form-input" type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)} placeholder="0.00" />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">BATCH NO. *</label>
              <input className="form-input" value={batch} onChange={e=>setBatch(e.target.value)} placeholder="e.g. B240101" />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">EXPIRY DATE *</label>
              <input className="form-input" type="month" value={expiry} onChange={e=>setExpiry(e.target.value)} />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">SUPPLIER / DISTRIBUTOR</label>
              <input className="form-input" value={supplier} onChange={e=>setSupplier(e.target.value)} placeholder="Supplier name" />
            </div>
            <div className="form-group" style={{ margin:0 }}>
              <label className="form-label">INVOICE NO.</label>
              <input className="form-input" value={invoiceNo} onChange={e=>setInvoiceNo(e.target.value)} placeholder="INV-0001" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom:16 }}>
            <label className="form-label">NOTES</label>
            <textarea className="form-input" style={{ minHeight:72, resize:'vertical' }}
              value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes…" />
          </div>

          <button className="btn-primary" style={{ width:'100%', justifyContent:'center', padding:'11px 0', fontSize:14 }}
            onClick={handleSave} disabled={addMutation.isPending}>
            {addMutation.isPending ? 'Saving…' : '✓ Add Stock Entry'}
          </button>
        </div>

        {/* Recent entries sidebar */}
        <div className="card" style={{ overflow:'hidden' }}>
          <div className="card-header">
            <h3 className="card-title">Recent Purchase Entries</h3>
          </div>
          <div style={{ overflowY:'auto', maxHeight:480 }}>
            {isLoading ? (
              <div style={{ padding:20, textAlign:'center', color:'#94a3b8' }}>Loading…</div>
            ) : stockIns.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'#94a3b8', fontStyle:'italic' }}>No entries yet</div>
            ) : (
              <table className="data-table" style={{ fontSize:12 }}>
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
                  {stockIns.slice(0, 50).map(s => {
                    const days = expiryDaysLeft(s.expiry);
                    const expColor = days < 0 ? '#ef4444' : days <= 90 ? '#f59e0b' : '#64748b';
                    return (
                      <tr key={s.id}>
                        <td style={{ color:'#64748b' }}>{fmtDate(s.date)}</td>
                        <td>
                          <div style={{ fontWeight:600 }}>{s.productName}</div>
                          {s.invoiceNo && <div style={{ fontSize:10, color:'#94a3b8', fontFamily:"'JetBrains Mono',monospace" }}>{s.invoiceNo}</div>}
                        </td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#0ea5e9' }}>+{s.qty}</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{s.batch||'—'}</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:expColor }}>{fmtMonth(s.expiry)||'—'}</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(s.price)}</td>
                        <td style={{ fontSize:11, color:'#64748b' }}>{s.supplier||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <LowStockTable products={products} />

      {/* Responsive: stack on mobile */}
      <style>{`
        @media (max-width: 900px) {
          .stock-retail-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StockInPage() {
  const { storeType } = useSettingsStore();
  const isWS = (storeType || '').trim() === 'Wholesale Pharma';
  const [toastMsg, setToastMsg] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn:  fetchProducts,
    staleTime: 30_000,
  });

  function showToast(msg) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }

  return (
    <div style={{ padding:'20px 24px' }}>
      {toastMsg && (
        <div style={{ position:'fixed', top:20, right:24, zIndex:9999, background:'#1e293b', color:'white',
          padding:'10px 20px', borderRadius:10, fontWeight:600, fontSize:13, boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
          {toastMsg}
        </div>
      )}

      {isWS
        ? <WholesaleStockIn products={products} toast={showToast} />
        : <RetailStockIn    products={products} toast={showToast} />
      }
    </div>
  );
}
