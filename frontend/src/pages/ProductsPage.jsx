import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchProducts   = () => client.get('/products').then(r => r.data);
const fetchCategories = () => client.get('/categories').then(r => r.data);

function cur(n) { return '₹' + parseFloat(n || 0).toFixed(2); }
function fmtMonth(val) {
  if (!val) return '—';
  const [y, m] = val.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m,10)-1]} ${y}`;
}
function expiryDaysLeft(expiry) {
  if (!expiry) return 9999;
  const exp = new Date(expiry + '-01');
  const now = new Date();
  now.setDate(1);
  return Math.round((exp - now) / (1000 * 60 * 60 * 24));
}
function getExpiryBadge(expiry) {
  if (!expiry) return { cls: 'badge-gray', label: 'No Expiry' };
  const days = expiryDaysLeft(expiry);
  if (days < 0)   return { cls: 'badge-red',   label: fmtMonth(expiry) };
  if (days <= 30) return { cls: 'badge-red',   label: fmtMonth(expiry) };
  if (days <= 90) return { cls: 'badge-amber', label: fmtMonth(expiry) };
  return { cls: 'badge-green', label: fmtMonth(expiry) };
}
function getStatusBadge(p) {
  const days = expiryDaysLeft(p.expiry);
  if (p.stock === 0)                            return { cls: 'badge-red',   label: 'Out of Stock' };
  if (days < 0)                                 return { cls: 'badge-red',   label: 'Expired' };
  if (p.stock <= p.minStock && days <= 30)      return { cls: 'badge-red',   label: 'Critical' };
  if (p.stock <= p.minStock)                    return { cls: 'badge-amber', label: 'Low Stock' };
  if (days <= 30)                               return { cls: 'badge-amber', label: 'Expiring' };
  return { cls: 'badge-green', label: 'OK' };
}

// ── Product Modal ─────────────────────────────────────────────────────────────
function ProductModal({ isWS, categories, editProduct, defaultGst, lowStockThreshold, onClose, onSaved }) {
  const isEdit = !!editProduct;
  const [name, setName]             = useState('');
  const [cat, setCat]               = useState('');
  const [unit, setUnit]             = useState('Tablet');
  const [purchase, setPurchase]     = useState('');
  const [sale, setSale]             = useState('');
  const [gst, setGst]               = useState(String(defaultGst ?? 12));
  const [stock, setStock]           = useState('0');
  const [stockBoxes, setStockBoxes] = useState('0');
  const [stockStrips, setStockStrips] = useState('0');
  const [minStock, setMinStock]     = useState(String(lowStockThreshold || 10));
  const [sku, setSku]               = useState('');
  const [expiry, setExpiry]         = useState('');
  const [brand, setBrand]           = useState('');
  const [hsn, setHsn]               = useState('');
  const [desc, setDesc]             = useState('');
  const [piecesPerStrip, setPPS]    = useState('10');
  const [stripsPerBox, setSPB]      = useState('10');
  const [purchaseUnit, setPU]       = useState(isWS ? 'box' : 'strip');
  const [sellingPrice, setSP]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (editProduct) {
      setName(editProduct.name || '');
      setCat(editProduct.category || '');
      setUnit(editProduct.unit || 'Tablet');
      setPurchase(String(editProduct.purchase || ''));
      setSale(String(editProduct.sale || ''));
      setGst(String(editProduct.gst ?? defaultGst ?? 12));
      setMinStock(String(editProduct.minStock || 10));
      setSku(editProduct.sku || '');
      setExpiry(editProduct.expiry || '');
      setBrand(editProduct.brand || '');
      setHsn(editProduct.hsn || '');
      setDesc(editProduct.desc || '');
      setPPS(String(editProduct.piecesPerStrip || 10));
      setSPB(String(editProduct.stripsPerBox || 10));
      setPU(editProduct.purchaseUnit || (isWS ? 'box' : 'strip'));
      setSP(String(editProduct.sellingPrice || ''));
      if (isWS) {
        const spbVal = editProduct.stripsPerBox || 10;
        const ppsVal = editProduct.piecesPerStrip || 10;
        const totalStrips = Math.floor((editProduct.stock || 0) / ppsVal);
        const boxes = Math.floor(totalStrips / spbVal);
        setStockBoxes(String(boxes));
        setStockStrips(String(totalStrips));
      } else {
        setStock(String(editProduct.stock || 0));
      }
    }
  }, [editProduct]);

  const pps = parseInt(piecesPerStrip) || 10;
  const spb = parseInt(stripsPerBox) || 10;
  const purVal = parseFloat(purchase) || 0;
  const spVal  = parseFloat(sellingPrice) || 0;
  let purchaseHint = '';
  if (purchaseUnit === 'box') {
    const cpp = purVal > 0 ? (purVal / (spb * pps)).toFixed(2) : '—';
    const margin = (purVal > 0 && spVal > 0 && isWS) ? ` · Margin/box: ₹${(spVal - purVal).toFixed(2)}` : '';
    purchaseHint = `1 box = ${spb} strips × ${pps} pieces = ${spb*pps} pieces · cost/piece = ₹${cpp}${margin}`;
  } else {
    const cpp = purVal > 0 ? (purVal / pps).toFixed(2) : '—';
    purchaseHint = `1 strip = ${pps} pieces · cost/piece = ₹${cpp}`;
  }
  const strips = parseInt(stockStrips) || 0;
  const boxes  = parseInt(stockBoxes) || 0;
  const totalPcs = strips * pps;
  const wsStockHint = `Total: ${strips} strips = ${totalPcs} pieces  (${boxes} full boxes + ${strips % spb} extra strips)`;

  function handleBoxChange(v) {
    setStockBoxes(v);
    const b = parseInt(v) || 0;
    setStockStrips(String(b * spb));
  }

  async function handleSave() {
    setError('');
    if (!name.trim())       { setError('Medicine name is required'); return; }
    if (!cat)               { setError('Category is required'); return; }
    const pur = parseFloat(purchase);
    const sal = parseFloat(sale);
    if (isNaN(pur) || isNaN(sal)) { setError('Purchase and sale price are required'); return; }
    const sp = isWS ? (parseFloat(sellingPrice) || 0) : 0;
    if (isWS && !sp)        { setError('Selling Price is required for Wholesale'); return; }

    let stockPcs;
    if (isWS) {
      stockPcs = (parseInt(stockStrips) || 0) * (parseInt(piecesPerStrip) || 10);
    } else {
      stockPcs = parseInt(stock) || 0;
    }

    const payload = {
      name: name.trim(), category: cat, unit,
      purchase: pur, sale: sal,
      gst: parseFloat(gst) >= 0 ? parseFloat(gst) : 12,
      stock: stockPcs,
      minStock: parseInt(minStock) > 0 ? parseInt(minStock) : 10,
      sku: sku.trim(), expiry, brand: brand.trim(), hsn: hsn.trim(), desc: desc.trim(),
      piecesPerStrip: parseInt(piecesPerStrip) || 10,
      stripsPerBox:   parseInt(stripsPerBox) || 10,
      purchaseUnit, sellingPrice: sp,
    };

    setSaving(true);
    try {
      if (isEdit) {
        await client.put(`/products/${editProduct.id}`, payload);
      } else {
        await client.post('/products', payload);
      }
      onSaved();
      onClose();
    } catch(e) {
      setError(e.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{isEdit ? 'Edit Medicine' : 'Add New Medicine'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#dc2626', borderRadius:8, padding:'8px 12px', marginBottom:12, fontSize:13 }}>{error}</div>}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">MEDICINE NAME *</label>
              <input className="form-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Paracetamol 500mg Tab" />
            </div>
            <div className="form-group">
              <label className="form-label">CATEGORY *</label>
              <select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}>
                <option value="">Select Category</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">FORM</label>
              <select className="form-input" value={unit} onChange={e=>setUnit(e.target.value)}>
                {['Tablet','Capsule','Syrup','Injection','Cream','Ointment','Drops','Inhaler','Powder','Bottle','Sachet','Strip','Gel','Spray','Patch','Suppository','Lotion','Suspension','Other'].map(u => <option key={u}>{u}</option>)}
              </select>
            </div>

            {/* Pack-size fields */}
            <div className="form-group">
              <label className="form-label">PIECES PER STRIP</label>
              <input className="form-input" type="number" min="1" value={piecesPerStrip} onChange={e=>setPPS(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">STRIPS PER BOX</label>
              <input className="form-input" type="number" min="1" value={stripsPerBox} onChange={e=>setSPB(e.target.value)} />
            </div>

            <div className="form-group">
              <label className="form-label">PURCHASE UNIT</label>
              <select className="form-input" value={purchaseUnit} onChange={e=>setPU(e.target.value)}>
                <option value="strip">Per Strip</option>
                <option value="box">Per Box</option>
                <option value="piece">Per Piece</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">PURCHASE PRICE ₹ *</label>
              <input className="form-input" type="number" min="0" step="0.01" value={purchase} onChange={e=>setPurchase(e.target.value)} placeholder="0.00" />
            </div>

            {purchaseHint && (
              <div style={{ gridColumn:'1/-1', fontSize:11, color:'#64748b', background:'#f8fafc', borderRadius:6, padding:'6px 10px', fontFamily:"'JetBrains Mono',monospace" }}>
                {purchaseHint}
              </div>
            )}

            <div className="form-group">
              <label className="form-label">MRP ₹ *</label>
              <input className="form-input" type="number" min="0" step="0.01" value={sale} onChange={e=>setSale(e.target.value)} placeholder="0.00" />
            </div>

            {isWS && (
              <div className="form-group">
                <label className="form-label">SELLING PRICE / BOX ₹ *</label>
                <input className="form-input" type="number" min="0" step="0.01" value={sellingPrice} onChange={e=>setSP(e.target.value)} placeholder="0.00" />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">GST %</label>
              <input className="form-input" type="number" min="0" step="0.5" value={gst} onChange={e=>setGst(e.target.value)} />
            </div>

            {/* Stock fields */}
            {isWS ? (
              <>
                <div className="form-group">
                  <label className="form-label">OPENING STOCK (BOXES)</label>
                  <input className="form-input" type="number" min="0" value={stockBoxes} onChange={e=>handleBoxChange(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">OPENING STOCK (STRIPS)</label>
                  <input className="form-input" type="number" min="0" value={stockStrips} onChange={e=>setStockStrips(e.target.value)} />
                </div>
                <div style={{ gridColumn:'1/-1', fontSize:11, color:'#64748b', background:'#f8fafc', borderRadius:6, padding:'6px 10px', fontFamily:"'JetBrains Mono',monospace" }}>
                  {wsStockHint}
                </div>
              </>
            ) : (
              <div className="form-group">
                <label className="form-label">OPENING STOCK</label>
                <input className="form-input" type="number" min="0" value={stock} onChange={e=>setStock(e.target.value)} />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">MIN. STOCK ALERT</label>
              <input className="form-input" type="number" min="0" value={minStock} onChange={e=>setMinStock(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">BATCH NO.</label>
              <input className="form-input" value={sku} onChange={e=>setSku(e.target.value)} placeholder="e.g. AC23044" />
            </div>
            <div className="form-group">
              <label className="form-label">EXPIRY DATE</label>
              <input className="form-input" type="month" value={expiry} onChange={e=>setExpiry(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">MANUFACTURER / BRAND</label>
              <input className="form-input" value={brand} onChange={e=>setBrand(e.target.value)} placeholder="e.g. Sun Pharma" />
            </div>
            <div className="form-group">
              <label className="form-label">HSN CODE</label>
              <input className="form-input" value={hsn} onChange={e=>setHsn(e.target.value)} placeholder="e.g. 30049099" />
            </div>
            <div className="form-group" style={{ gridColumn:'1/-1' }}>
              <label className="form-label">DESCRIPTION / COMPOSITION</label>
              <input className="form-input" value={desc} onChange={e=>setDesc(e.target.value)} placeholder="e.g. Paracetamol 500mg" />
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : isEdit ? '✓ Update Medicine' : '✓ Save Medicine'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Stock Adjust Modal ────────────────────────────────────────────────────────
function StockAdjModal({ product, onClose, onSaved }) {
  const [mode, setMode] = useState('add');
  const [qty, setQty]   = useState('');
  const [saving, setSaving] = useState(false);

  const cur_stock = product?.stock || 0;
  const qtyNum = parseInt(qty) || 0;
  let preview = cur_stock;
  if (mode === 'add')    preview = cur_stock + qtyNum;
  if (mode === 'remove') preview = Math.max(0, cur_stock - qtyNum);
  if (mode === 'set')    preview = qtyNum;

  async function handleApply() {
    if (!qty || qtyNum < 0) return;
    setSaving(true);
    try {
      await client.patch(`/products/${product.id}/stock`, { mode, qty: qtyNum });
      onSaved();
      onClose();
    } catch(e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const modeBtn = (m, label, color) => (
    <button onClick={() => setMode(m)}
      style={{ flex:1, padding:'8px 0', border:`2px solid ${mode===m?color:'#e2e8f0'}`,
        borderRadius:8, background: mode===m ? color : 'white',
        color: mode===m ? 'white' : '#64748b', fontWeight:700, cursor:'pointer', fontSize:13 }}>
      {label}
    </button>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:400 }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Adjust Stock</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontWeight:700, fontSize:15, marginBottom:4 }}>{product?.name}</div>
          <div style={{ fontSize:13, color:'#64748b', marginBottom:16 }}>
            Current stock: <strong style={{ fontFamily:"'JetBrains Mono',monospace", color:'#0ea5e9' }}>{cur_stock}</strong> {product?.unit}s
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            {modeBtn('add','+ Add','#10b981')}
            {modeBtn('remove','− Remove','#f59e0b')}
            {modeBtn('set','= Set','#6366f1')}
          </div>
          <div className="form-group">
            <label className="form-label">QUANTITY</label>
            <input className="form-input" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} autoFocus placeholder="Enter quantity" />
          </div>
          {qty && (
            <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'10px 14px', fontSize:13, marginTop:8 }}>
              New stock will be: <strong style={{ fontFamily:"'JetBrains Mono',monospace", color:'#15803d', fontSize:16 }}>{preview}</strong> {product?.unit}s
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleApply} disabled={saving || !qty}>
            {saving ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function ProductsPage() {
  const { storeType, defaultGst, lowStockThreshold } = useSettingsStore();
  const isWS = (storeType || '').trim() === 'Wholesale Pharma';
  const qc   = useQueryClient();

  const [search, setSearch]       = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [statusFilter, setStatus] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editProd, setEditProd]   = useState(null);
  const [adjProd, setAdjProd]     = useState(null);
  const [toast, setToast]         = useState('');

  const { data: products = [], isLoading }  = useQuery({ queryKey:['products'],   queryFn: fetchProducts,   staleTime: 30_000 });
  const { data: categories = [] }           = useQuery({ queryKey:['categories'], queryFn: fetchCategories, staleTime: 120_000 });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/products/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey:['products'] }); showToast('Medicine deleted'); },
    onError:   (e) => showToast(e.response?.data?.error || 'Delete failed'),
  });

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  function handleDelete(p) {
    if (!window.confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
    deleteMutation.mutate(p.id);
  }

  function openAdd() { setEditProd(null); setShowModal(true); }
  function openEdit(p) { setEditProd(p); setShowModal(true); }
  function onSaved() {
    qc.invalidateQueries({ queryKey:['products'] });
    qc.invalidateQueries({ queryKey:['categories'] });
    showToast(editProd ? 'Medicine updated ✓' : 'Medicine added ✓');
  }

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });

  // Filter
  const filtered = products.filter(p => {
    const q = search.toLowerCase();
    const mq = !q || p.name.toLowerCase().includes(q) || (p.sku||'').toLowerCase().includes(q) || (p.brand||'').toLowerCase().includes(q) || (p.desc||'').toLowerCase().includes(q);
    const mc = !catFilter || p.category === catFilter;
    const days = expiryDaysLeft(p.expiry);
    const ms = !statusFilter
      || (statusFilter === 'low'      && p.stock <= p.minStock && p.stock > 0)
      || (statusFilter === 'out'      && p.stock === 0)
      || (statusFilter === 'expiring' && days >= 0 && days <= 90)
      || (statusFilter === 'expired'  && days < 0)
      || (statusFilter === 'ok'       && p.stock > p.minStock && days > 90);
    return mq && mc && ms;
  });

  const margin = p => p.purchase > 0 ? (((p.sale - p.purchase) / p.purchase) * 100).toFixed(1) : '0';

  // Expose openAdd to topbar via global
  useEffect(() => {
    window.__pharmacare_openAddProduct = openAdd;
    return () => { delete window.__pharmacare_openAddProduct; };
  }, []);

  return (
    <div style={{ padding:'20px 24px' }}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', top:20, right:24, zIndex:9999, background:'#1e293b', color:'white', padding:'10px 20px', borderRadius:10, fontWeight:600, fontSize:13, boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
          {toast}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ProductModal
          isWS={isWS} categories={categories} editProduct={editProd}
          defaultGst={defaultGst} lowStockThreshold={lowStockThreshold}
          onClose={() => setShowModal(false)} onSaved={onSaved}
        />
      )}
      {adjProd && (
        <StockAdjModal product={adjProd} onClose={() => setAdjProd(null)}
          onSaved={() => { qc.invalidateQueries({ queryKey:['products'] }); showToast('Stock updated ✓'); }} />
      )}

      {/* Search + Filter Bar */}
      <div className="card" style={{ padding:'16px 20px', marginBottom:16 }}>
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap', flex:1 }}>
            <input className="form-input" style={{ maxWidth:280, margin:0 }}
              placeholder="Search medicines…" value={search} onChange={e=>setSearch(e.target.value)} />
            <select className="form-input" style={{ maxWidth:180, margin:0 }}
              value={catFilter} onChange={e=>setCatFilter(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="form-input" style={{ maxWidth:140, margin:0 }}
              value={statusFilter} onChange={e=>setStatus(e.target.value)}>
              <option value="">All Status</option>
              <option value="ok">OK</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
              <option value="expiring">Expiring</option>
              <option value="expired">Expired</option>
            </select>
          </div>
          <button className="btn-primary" onClick={openAdd}>+ Add</button>
        </div>
      </div>

      {/* Desktop Table */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div className="card-header" style={{ padding:'14px 20px' }}>
          <h3 className="card-title">Medicine Inventory</h3>
          <span className="badge badge-blue">{filtered.length} items</span>
        </div>

        {isLoading ? (
          <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading…</div>
        ) : (
          <>
            {/* Desktop */}
            <div className="table-responsive" style={{ display:'block' }}>
              <table className="data-table" style={{ minWidth: isWS ? 1000 : 900 }}>
                <thead>
                  <tr>
                    <th style={{ width:36 }}>#</th>
                    <th>MEDICINE NAME</th>
                    <th>CATEGORY</th>
                    <th>FORM</th>
                    <th>BATCH</th>
                    <th>EXPIRY</th>
                    <th>MRP ₹</th>
                    <th>PURCHASE ₹</th>
                    {isWS && <th>SELL/BOX ₹</th>}
                    <th>GST%</th>
                    <th>STOCK</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 ? (
                    <tr className="empty-row"><td colSpan={isWS ? 13 : 12}>No medicines found</td></tr>
                  ) : filtered.map((p, i) => {
                    const eb = getExpiryBadge(p.expiry);
                    const sb = getStatusBadge(p);
                    const stockColor = p.stock === 0 ? '#ef4444' : p.stock <= p.minStock ? '#f59e0b' : '#10b981';
                    return (
                      <tr key={p.id}>
                        <td style={{ color:'#94a3b8', fontSize:12 }}>{i+1}</td>
                        <td>
                          <div style={{ fontWeight:600 }}>{p.name}</div>
                          <div style={{ fontSize:11, color:'#94a3b8' }}>{p.brand}{p.brand && p.desc ? ' · ' : ''}{p.desc}</div>
                        </td>
                        <td><span className="badge badge-blue">{catMap[p.category] || 'Uncategorized'}</span></td>
                        <td style={{ fontSize:12, color:'#64748b' }}>{p.unit}</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{p.sku || '—'}</td>
                        <td><span className={`badge ${eb.cls}`} style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:10 }}>{eb.label}</span></td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{cur(p.sale)}</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>
                          {cur(p.purchase)}
                          <br/><span style={{ fontSize:10, color:'#10b981' }}>+{margin(p)}%</span>
                        </td>
                        {isWS && <td style={{ fontFamily:"'JetBrains Mono',monospace", color:'#6366f1' }}>{cur(p.sellingPrice)}</td>}
                        <td>{p.gst}%</td>
                        <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:stockColor }}>{p.stock}</td>
                        <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                        <td style={{ whiteSpace:'nowrap' }}>
                          <button className="btn-icon" onClick={() => openEdit(p)} title="Edit">✏️</button>
                          <button className="btn-icon" onClick={() => setAdjProd(p)} title="Adjust Stock">📦</button>
                          <button className="btn-icon" onClick={() => handleDelete(p)} title="Delete">🗑️</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div id="products-mobile" style={{ display:'none' }}>
              {filtered.map(p => {
                const eb = getExpiryBadge(p.expiry);
                const sb = getStatusBadge(p);
                const stockColor = p.stock === 0 ? '#ef4444' : p.stock <= p.minStock ? '#f59e0b' : '#10b981';
                return (
                  <div key={p.id} className="m-card">
                    <div className="m-card-hd">
                      <div className="m-card-name">{p.name}</div>
                      <span className={`badge ${sb.cls}`}>{sb.label}</span>
                    </div>
                    <div className="m-card-row"><span>Category</span><strong>{catMap[p.category] || 'Uncategorized'}</strong></div>
                    <div className="m-card-row"><span>Form</span><strong>{p.unit}</strong></div>
                    <div className="m-card-row"><span>MRP</span><strong style={{ color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{cur(p.sale)}</strong></div>
                    {isWS && <div className="m-card-row"><span>Sell/Box</span><strong style={{ color:'#6366f1', fontFamily:"'JetBrains Mono',monospace" }}>{cur(p.sellingPrice)}</strong></div>}
                    <div className="m-card-row"><span>Purchase</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(p.purchase)}</strong></div>
                    <div className="m-card-row"><span>Stock</span><strong style={{ fontFamily:"'JetBrains Mono',monospace", color:stockColor }}>{p.stock} {p.unit}s</strong></div>
                    <div className="m-card-row"><span>Expiry</span><span className={`badge ${eb.cls}`}>{eb.label}</span></div>
                    {p.brand && <div className="m-card-row"><span>Manufacturer</span><strong>{p.brand}</strong></div>}
                    {p.sku   && <div className="m-card-row"><span>Batch</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{p.sku}</strong></div>}
                    <div className="m-card-actions">
                      <button className="act-edit"  onClick={() => openEdit(p)}>✏️ Edit</button>
                      <button className="act-stock" onClick={() => setAdjProd(p)}>📦 Stock</button>
                      <button className="act-del"   onClick={() => handleDelete(p)}>🗑 Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Responsive: show cards on mobile, table on desktop */}
      <style>{`
        @media (max-width: 768px) {
          .table-responsive { display: none !important; }
          #products-mobile  { display: block !important; }
        }
      `}</style>
    </div>
  );
}
