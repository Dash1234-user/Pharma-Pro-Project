import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// ── API helpers ───────────────────────────────────────────────────────────────
const fetchBills = (params) => {
  const qs = new URLSearchParams();
  if (params.q)       qs.set('q',       params.q);
  if (params.from)    qs.set('from',    params.from);
  if (params.to)      qs.set('to',      params.to);
  if (params.payment) qs.set('payment', params.payment);
  return client.get(`/bills?${qs.toString()}`).then(r => r.data);
};

function cur(n)  { return '₹' + parseFloat(n || 0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

// ── Bill View Modal ───────────────────────────────────────────────────────────
function BillViewModal({ bill, isWS, onClose }) {
  if (!bill) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth:680, maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">Bill #{bill.billNo}</h3>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-outline" style={{ padding:'6px 14px', fontSize:12 }}
              onClick={() => window.print()}>🖨 Print</button>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="modal-body">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16, fontSize:13 }}>
            <div><span style={{ color:'#94a3b8' }}>Bill No:</span> <strong style={{ fontFamily:"'JetBrains Mono',monospace", color:'#0ea5e9' }}>{bill.billNo}</strong></div>
            <div><span style={{ color:'#94a3b8' }}>Date:</span> <strong>{fmtDate(bill.date)}</strong></div>
            {isWS ? (
              <>
                <div><span style={{ color:'#94a3b8' }}>Shop Name:</span> <strong>{bill.shopName || '—'}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>Shopkeeper:</span> <strong>{bill.customer || '—'}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>GSTIN (WS):</span> <strong style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{bill.wsGstin || '—'}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>GSTIN (Shop):</span> <strong style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{bill.shopkeeperGstin || '—'}</strong></div>
              </>
            ) : (
              <>
                <div><span style={{ color:'#94a3b8' }}>Customer:</span> <strong>{bill.customer || 'Walk-in'}</strong></div>
                <div><span style={{ color:'#94a3b8' }}>Doctor:</span> <strong>{bill.doctor || '—'}</strong></div>
                {bill.rtShop   && <div><span style={{ color:'#94a3b8' }}>Shop:</span> <strong>{bill.rtShop}</strong></div>}
                {bill.rtGstin  && <div><span style={{ color:'#94a3b8' }}>GSTIN:</span> <strong style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11 }}>{bill.rtGstin}</strong></div>}
              </>
            )}
            <div><span style={{ color:'#94a3b8' }}>Payment:</span> <span className="badge badge-green">{bill.paymentMode}</span></div>
            <div><span style={{ color:'#94a3b8' }}>Phone:</span> <strong>{bill.phone || '—'}</strong></div>
          </div>

          <table className="data-table" style={{ marginBottom:12 }}>
            <thead>
              <tr>
                <th>MEDICINE</th>
                <th>QTY</th>
                <th>UNIT PRICE</th>
                <th>GST</th>
                <th>DISCOUNT</th>
                <th>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {(bill.items || []).map(item => (
                <tr key={item.id}>
                  <td><div style={{ fontWeight:600 }}>{item.name}</div></td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{item.displayQty || item.qty} {item.unitType}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(item.unitPrice)}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", color:'#64748b', fontSize:12 }}>{cur(item.gstAmt)}</td>
                  <td style={{ color:'#10b981', fontSize:12 }}>-{cur(item.discount)}</td>
                  <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{cur(item.lineTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4, fontSize:13 }}>
            <div>Subtotal: <strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(bill.subtotal)}</strong></div>
            <div>GST: <strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(bill.totalGst)}</strong></div>
            {bill.totalDiscount > 0 && <div style={{ color:'#10b981' }}>Discount: <strong>-{cur(bill.totalDiscount)}</strong></div>}
            {bill.roundOff !== 0 && <div style={{ color:'#94a3b8' }}>Round off: <strong>{cur(bill.roundOff)}</strong></div>}
            <div style={{ borderTop:'2px solid var(--border)', paddingTop:6, fontSize:16, fontWeight:800 }}>
              Grand Total: <span style={{ color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{cur(bill.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function HistoryPage() {
  const { storeType } = useSettingsStore();
  const isWS = (storeType || '').trim() === 'Wholesale Pharma';
  const qc   = useQueryClient();

  const [search,  setSearch]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [payment, setPayment] = useState('');
  const [viewBill,setViewBill]= useState(null);
  const [toastMsg,setToastMsg]= useState('');

  // Build query params
  const queryParams = { q: search, from, to, payment };

  const { data: allBills = [], isLoading } = useQuery({
    queryKey: ['bills', queryParams],
    queryFn:  () => fetchBills(queryParams),
    staleTime: 30_000,
  });

  // Filter by store type client-side (same logic as original renderHistory)
  const bills = allBills.filter(b => {
    const bType = b.billStoreType || 'retail';
    return isWS ? bType === 'wholesale' : bType !== 'wholesale';
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => client.delete(`/bills/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bills'] });
      showToast('Bill deleted');
    },
    onError: (e) => showToast(e.response?.data?.error || 'Delete failed'),
  });

  function showToast(msg) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 3000); }

  function handleDelete(b) {
    if (!window.confirm('Delete this bill? Stock will NOT be restored.')) return;
    deleteMutation.mutate(b.id);
  }

  function clearFilters() { setSearch(''); setFrom(''); setTo(''); setPayment(''); }

  // Summary stats
  const totalRev  = bills.reduce((s, b) => s + b.grandTotal,    0);
  const totalGst  = bills.reduce((s, b) => s + b.totalGst,      0);
  const totalDisc = bills.reduce((s, b) => s + b.totalDiscount, 0);
  const hasSummary = bills.length > 0;

  // CSV Export — mirrors exportCSV() in app.js exactly
  function exportCSV() {
    let rows;
    if (isWS) {
      rows = [['Bill No','GSTIN (Wholesaler)','GSTIN (Shopkeeper)','Date','Shop Name','Shopkeeper','Phone','Items','Subtotal','GST','Discount','Total','Payment']];
      bills.forEach(b => rows.push([b.billNo, b.wsGstin||'', b.shopkeeperGstin||'', b.date, b.shopName||'', b.customer, b.phone||'', b.items.length, b.subtotal, b.totalGst, b.totalDiscount, b.grandTotal, b.paymentMode]));
    } else {
      rows = [['Bill No','Date','Shop Name','Owner','GSTIN','DL No','Customer','Doctor','Items','Subtotal','GST','Discount','Total','Payment']];
      bills.forEach(b => rows.push([b.billNo, b.date, b.rtShop||'', b.rtOwner||'', b.rtGstin||'', b.rtLicense||'', b.customer, b.doctor||'', b.items.length, b.subtotal, b.totalGst, b.totalDiscount, b.grandTotal, b.paymentMode]));
    }
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv,' + encodeURIComponent(csv);
    a.download = `sales_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('CSV exported ✓');
  }

  return (
    <div style={{ padding:'20px 24px' }}>
      {/* Toast */}
      {toastMsg && (
        <div style={{ position:'fixed', top:20, right:24, zIndex:9999, background:'#1e293b', color:'white',
          padding:'10px 20px', borderRadius:10, fontWeight:600, fontSize:13, boxShadow:'0 4px 20px rgba(0,0,0,.2)' }}>
          {toastMsg}
        </div>
      )}

      {/* Bill View Modal */}
      {viewBill && <BillViewModal bill={viewBill} isWS={isWS} onClose={() => setViewBill(null)} />}

      {/* Main Card */}
      <div className="card" style={{ overflow:'hidden' }}>
        <div className="card-header" style={{ padding:'14px 20px', flexWrap:'wrap', gap:10 }}>
          <h3 className="card-title">Sales History</h3>
          <button className="btn-primary" style={{ padding:'7px 16px', fontSize:13 }} onClick={exportCSV}>
            ⬇ CSV
          </button>
        </div>

        {/* Filters */}
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
          <input className="form-input" style={{ maxWidth:220, margin:0 }}
            placeholder="Bill / patient…" value={search} onChange={e=>setSearch(e.target.value)} />
          <input className="form-input" type="date" style={{ maxWidth:160, margin:0 }} value={from} onChange={e=>setFrom(e.target.value)} />
          <input className="form-input" type="date" style={{ maxWidth:160, margin:0 }} value={to}   onChange={e=>setTo(e.target.value)} />
          <select className="form-input" style={{ maxWidth:160, margin:0 }} value={payment} onChange={e=>setPayment(e.target.value)}>
            <option value="">All Payments</option>
            <option>Cash</option>
            <option>UPI</option>
            <option>Card</option>
            <option>NEFT</option>
            <option>Credit</option>
            <option>Insurance</option>
          </select>
          <button className="btn-outline" style={{ padding:'7px 14px', fontSize:13 }} onClick={clearFilters}>Clear</button>
        </div>

        {/* Summary bar */}
        {hasSummary && (
          <div style={{ padding:'8px 20px', background:'#f8fafc', borderBottom:'1px solid var(--border)',
            display:'flex', gap:20, flexWrap:'wrap', fontSize:13 }}>
            <span>Bills: <strong>{bills.length}</strong></span>
            <span>Revenue: <strong style={{ color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{cur(totalRev)}</strong></span>
            <span>GST: <strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(totalGst)}</strong></span>
            <span>Discount: <strong style={{ color:'#10b981', fontFamily:"'JetBrains Mono',monospace" }}>-{cur(totalDisc)}</strong></span>
          </div>
        )}

        {/* Table */}
        {isLoading ? (
          <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading…</div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="table-responsive">
              {isWS ? (
                /* ── Wholesale table ── */
                <table className="data-table" style={{ minWidth:1100 }}>
                  <thead>
                    <tr>
                      <th>BILL NO</th>
                      <th>GSTIN (WHOLESALER)</th>
                      <th>GSTIN (SHOPKEEPER)</th>
                      <th>DATE</th>
                      <th>SHOP / RETAILER</th>
                      <th>SHOPKEEPER NAME</th>
                      <th>CONTACT</th>
                      <th>STOCK NAME</th>
                      <th>NO. OF ITEMS</th>
                      <th>SUBTOTAL</th>
                      <th>GST</th>
                      <th>DISCOUNT</th>
                      <th>TOTAL</th>
                      <th>PAYMENT MODE</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length === 0 ? (
                      <tr className="empty-row"><td colSpan={15}>No bills match the filter</td></tr>
                    ) : bills.map(b => {
                      const stockNames = (b.items || []).map(it => it.name).join(', ');
                      const wsGstin = b.wsGstin || '—';
                      const skGstin = b.shopkeeperGstin || '—';
                      const pmCls = b.paymentMode === 'Cash' ? 'badge-green' : b.paymentMode === 'NEFT' ? 'badge-blue' : 'badge-blue';
                      return (
                        <tr key={b.id}>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#0ea5e9', whiteSpace:'nowrap' }}>{b.billNo}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#64748b' }}>{wsGstin}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, color:'#7c3aed' }}>{skGstin}</td>
                          <td style={{ fontSize:12, whiteSpace:'nowrap' }}>{fmtDate(b.date)}</td>
                          <td>
                            <div style={{ fontWeight:600 }}>{b.shopName || b.customer}</div>
                            <div style={{ fontSize:11, color:'#94a3b8' }}>{b.phone||''}</div>
                          </td>
                          <td style={{ fontSize:12 }}>{b.customer || '—'}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12 }}>{b.phone || '—'}</td>
                          <td style={{ fontSize:12, maxWidth:160, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }} title={stockNames}>{stockNames}</td>
                          <td style={{ textAlign:'center' }}>{b.items.length} item{b.items.length!==1?'s':''}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(b.subtotal)}</td>
                          <td style={{ fontSize:12, color:'#64748b' }}>{cur(b.totalGst)}</td>
                          <td style={{ color:'#10b981', fontSize:12 }}>-{cur(b.totalDiscount)}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'var(--accent)' }}>{cur(b.grandTotal)}</td>
                          <td><span className={`badge ${pmCls}`}>{b.paymentMode}</span></td>
                          <td style={{ whiteSpace:'nowrap' }}>
                            <button className="btn-icon" onClick={() => setViewBill(b)} title="View">👁</button>
                            <button className="btn-icon" onClick={() => { setViewBill(b); setTimeout(() => window.print(), 400); }} title="Print">🖨</button>
                            <button className="btn-icon" onClick={() => handleDelete(b)} title="Delete">🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                /* ── Retail table ── */
                <table className="data-table" style={{ minWidth:900 }}>
                  <thead>
                    <tr>
                      <th>BILL NO</th>
                      <th>DATE</th>
                      <th>CUSTOMER / SHOP</th>
                      <th>DOCTOR</th>
                      <th>ITEMS</th>
                      <th>SUBTOTAL</th>
                      <th>GST</th>
                      <th>DISCOUNT</th>
                      <th>TOTAL</th>
                      <th>PAYMENT</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.length === 0 ? (
                      <tr className="empty-row"><td colSpan={11}>No bills match the filter</td></tr>
                    ) : bills.map(b => {
                      const pmCls = b.paymentMode==='Cash' ? 'badge-green'
                        : b.paymentMode==='Insurance' ? 'badge-purple'
                        : b.paymentMode==='Credit' ? 'badge-red' : 'badge-blue';
                      return (
                        <tr key={b.id}>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'#0ea5e9' }}>#{b.billNo}</td>
                          <td style={{ fontSize:12 }}>{fmtDate(b.date)}</td>
                          <td>
                            <div style={{ fontWeight:600 }}>{b.customer || 'Walk-in'}</div>
                            <div style={{ fontSize:11, color:'#94a3b8' }}>{b.phone||''}</div>
                            {b.rtShop  && <div style={{ fontSize:10, color:'#10b981', fontWeight:600 }}>🏪 {b.rtShop}</div>}
                            {b.rtGstin && <div style={{ fontSize:10, color:'#6366f1' }}>GSTIN: {b.rtGstin}</div>}
                          </td>
                          <td style={{ fontSize:12 }}>{b.doctor || '—'}</td>
                          <td>{b.items.length} item{b.items.length!==1?'s':''}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(b.subtotal)}</td>
                          <td style={{ fontSize:12, color:'#64748b' }}>{cur(b.totalGst)}</td>
                          <td style={{ color:'#10b981', fontSize:12 }}>-{cur(b.totalDiscount)}</td>
                          <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'var(--accent)' }}>{cur(b.grandTotal)}</td>
                          <td><span className={`badge ${pmCls}`}>{b.paymentMode}</span></td>
                          <td style={{ whiteSpace:'nowrap' }}>
                            <button className="btn-icon" onClick={() => setViewBill(b)} title="View">👁</button>
                            <button className="btn-icon" onClick={() => { setViewBill(b); setTimeout(() => window.print(), 400); }} title="Print">🖨</button>
                            <button className="btn-icon" onClick={() => handleDelete(b)} title="Delete">🗑️</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Mobile cards */}
            <div id="history-mobile" style={{ display:'none' }}>
              {bills.map(b => {
                const pmCls = b.paymentMode==='Cash' ? 'badge-green' : b.paymentMode==='Credit' ? 'badge-red' : 'badge-blue';
                return (
                  <div key={b.id} className="m-card">
                    <div className="m-card-hd">
                      <div>
                        <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:700, background:'#f0f9ff', color:'#0369a1', padding:'2px 8px', borderRadius:20 }}>
                          {isWS ? b.billNo : `#${b.billNo}`}
                        </span>
                        <div className="m-card-name" style={{ marginTop:4 }}>{b.customer || 'Walk-in'}</div>
                        {b.rtShop && !isWS && <div style={{ fontSize:11, color:'#10b981', fontWeight:600 }}>🏪 {b.rtShop}</div>}
                      </div>
                      <div style={{ textAlign:'right' }}>
                        <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, color:'var(--accent)', fontSize:16 }}>{cur(b.grandTotal)}</div>
                        <span className={`badge ${pmCls}`} style={{ marginTop:4 }}>{b.paymentMode}</span>
                      </div>
                    </div>
                    <div className="m-card-row"><span>Date</span><strong>{fmtDate(b.date)}</strong></div>
                    <div className="m-card-row"><span>{isWS ? 'Owner Name' : 'Doctor'}</span><strong>{b.doctor || '—'}</strong></div>
                    {isWS && <div className="m-card-row"><span>Stock</span><strong style={{ fontSize:11 }}>{(b.items||[]).map(it=>it.name).join(', ')}</strong></div>}
                    {!isWS && b.rtGstin && <div className="m-card-row"><span>GSTIN</span><strong style={{ fontSize:11, color:'#6366f1' }}>{b.rtGstin}</strong></div>}
                    <div className="m-card-row"><span>Items</span><strong>{b.items.length}</strong></div>
                    <div className="m-card-row"><span>GST</span><strong style={{ fontFamily:"'JetBrains Mono',monospace" }}>{cur(b.totalGst)}</strong></div>
                    {b.totalDiscount > 0 && <div className="m-card-row"><span>Discount</span><strong style={{ color:'#10b981' }}>-{cur(b.totalDiscount)}</strong></div>}
                    <div className="m-card-actions">
                      <button className="act-edit"  onClick={() => setViewBill(b)}>👁 View</button>
                      <button className="act-stock" onClick={() => { setViewBill(b); setTimeout(() => window.print(), 400); }}>🖨 Print</button>
                      <button className="act-del"   onClick={() => handleDelete(b)}>🗑️ Delete</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Responsive */}
      <style>{`
        @media (max-width: 768px) {
          .table-responsive { display: none !important; }
          #history-mobile   { display: block !important; }
        }
      `}</style>
    </div>
  );
}
