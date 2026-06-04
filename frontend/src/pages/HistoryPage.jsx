import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchBills = (params) => {
  const qs = new URLSearchParams();
  if (params.q)       qs.set('q',       params.q);
  if (params.from)    qs.set('from',    params.from);
  if (params.to)      qs.set('to',      params.to);
  if (params.payment) qs.set('payment', params.payment);
  return client.get(`/bills?${qs.toString()}`).then(r => r.data);
};

function cur(n)  { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
}

/* ── Modal wrapper using correct CSS classes ── */
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

/* ── Bill View Modal ── */
function BillViewModal({bill, isWS, onClose}) {
  if (!bill) return null;
  return (
    <Modal title={`Bill ${isWS ? bill.billNo : '#'+bill.billNo}`} onClose={onClose} wide
      footer={<><button className="btn-outline" onClick={()=>window.print()}>🖨 Print</button><button className="btn-primary" onClick={onClose}>Close</button></>}>

      {/* Bill meta */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16,fontSize:13,background:'#f8fafc',borderRadius:10,padding:'12px 16px'}}>
        <div><span style={{color:'#94a3b8'}}>Bill No: </span><strong style={{fontFamily:"'JetBrains Mono',monospace",color:'#0ea5e9'}}>{bill.billNo}</strong></div>
        <div><span style={{color:'#94a3b8'}}>Date: </span><strong>{fmtDate(bill.date)}</strong></div>
        {isWS ? <>
          <div><span style={{color:'#94a3b8'}}>Shop Name: </span><strong>{bill.shopName||'—'}</strong></div>
          <div><span style={{color:'#94a3b8'}}>Shopkeeper: </span><strong>{bill.customer||'—'}</strong></div>
          <div><span style={{color:'#94a3b8'}}>GSTIN (WS): </span><strong style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{bill.wsGstin||'—'}</strong></div>
          <div><span style={{color:'#94a3b8'}}>GSTIN (Shop): </span><strong style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{bill.shopkeeperGstin||'—'}</strong></div>
        </> : <>
          <div><span style={{color:'#94a3b8'}}>Customer: </span><strong>{bill.customer||'Walk-in'}</strong></div>
          <div><span style={{color:'#94a3b8'}}>Doctor: </span><strong>{bill.doctor||'—'}</strong></div>
          {bill.rtShop  && <div><span style={{color:'#94a3b8'}}>Shop: </span><strong>{bill.rtShop}</strong></div>}
          {bill.rtGstin && <div><span style={{color:'#94a3b8'}}>GSTIN: </span><strong style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11}}>{bill.rtGstin}</strong></div>}
        </>}
        <div><span style={{color:'#94a3b8'}}>Payment: </span><span className="badge badge-green">{bill.paymentMode}</span></div>
        {bill.phone && <div><span style={{color:'#94a3b8'}}>Phone: </span><strong>{bill.phone}</strong></div>}
      </div>

      {/* Items table */}
      <div className="table-wrap" style={{marginBottom:14}}>
        <table className="tbl">
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
            {(bill.items||[]).map((item,i)=>(
              <tr key={i}>
                <td style={{fontWeight:600}}>{item.name}</td>
                <td style={{fontFamily:"'JetBrains Mono',monospace"}}>{item.displayQty||item.qty} {item.unitType}</td>
                <td style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(item.unitPrice)}</td>
                <td style={{fontFamily:"'JetBrains Mono',monospace",color:'#64748b',fontSize:12}}>{cur(item.gstAmt)}</td>
                <td style={{color:'#10b981',fontSize:12}}>-{cur(item.discount)}</td>
                <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{cur(item.lineTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:4,fontSize:13,borderTop:'1px solid var(--border)',paddingTop:12}}>
        <div>Subtotal: <strong style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(bill.subtotal)}</strong></div>
        <div>GST: <strong style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(bill.totalGst)}</strong></div>
        {bill.totalDiscount>0 && <div style={{color:'#10b981'}}>Discount: <strong>-{cur(bill.totalDiscount)}</strong></div>}
        {bill.roundOff!==0    && <div style={{color:'#94a3b8'}}>Round off: <strong>{cur(bill.roundOff)}</strong></div>}
        <div style={{fontSize:17,fontWeight:800,marginTop:4}}>
          Grand Total: <span style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{cur(bill.grandTotal)}</span>
        </div>
      </div>
    </Modal>
  );
}

/* ── Payment badge class ── */
function pmBadge(mode) {
  if (mode==='Cash')      return 'badge-green';
  if (mode==='Credit')    return 'badge-red';
  if (mode==='Insurance') return 'badge-purple';
  return 'badge-blue';
}

/* ── Main Page ── */
export default function HistoryPage() {
  const {storeType} = useSettingsStore();
  const isWS = (storeType||'').trim()==='Wholesale Pharma';
  const qc   = useQueryClient();

  const [search,  setSearch]  = useState('');
  const [from,    setFrom]    = useState('');
  const [to,      setTo]      = useState('');
  const [payment, setPayment] = useState('');
  const [viewBill,setViewBill]= useState(null);
  const [toastMsg,setToastMsg]= useState('');

  const queryParams = {q:search, from, to, payment};

  const {data:allBills=[],isLoading} = useQuery({
    queryKey: ['bills', queryParams],
    queryFn:  ()=>fetchBills(queryParams),
    staleTime: 30_000,
  });

  /* filter by store type client-side — mirrors original renderHistory() logic */
  const bills = allBills.filter(b=>{
    const t = b.billStoreType||'retail';
    return isWS ? t==='wholesale' : t!=='wholesale';
  });

  const delMut = useMutation({
    mutationFn: id=>client.delete(`/bills/${id}`),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['bills']});showT('Bill deleted');},
    onError:e=>showT(e.response?.data?.error||'Delete failed'),
  });

  function showT(msg){setToastMsg(msg);setTimeout(()=>setToastMsg(''),3000);}
  function handleDel(b){
    if(!window.confirm('Delete this bill? Stock will NOT be restored.')) return;
    delMut.mutate(b.id);
  }
  function clearFilters(){setSearch('');setFrom('');setTo('');setPayment('');}

  /* Summary */
  const totalRev  = bills.reduce((s,b)=>s+b.grandTotal,   0);
  const totalGst  = bills.reduce((s,b)=>s+b.totalGst,     0);
  const totalDisc = bills.reduce((s,b)=>s+b.totalDiscount,0);

  /* CSV export — mirrors exportCSV() in app.js exactly */
  function exportCSV(){
    let rows;
    if(isWS){
      rows=[['Bill No','GSTIN (Wholesaler)','GSTIN (Shopkeeper)','Date','Shop / Retailer','Shopkeeper Name','Contact','Stock Name','No. of Items','Subtotal','GST','Discount','Total','Payment Mode']];
      bills.forEach(b=>rows.push([b.billNo,b.wsGstin||'',b.shopkeeperGstin||'',b.date,b.shopName||'',b.customer,b.phone||'',(b.items||[]).map(it=>it.name).join('; '),b.items.length,b.subtotal,b.totalGst,b.totalDiscount,b.grandTotal,b.paymentMode]));
    }else{
      rows=[['Bill No','Date','Customer','Shop Name','GSTIN','Doctor','Items','Subtotal','GST','Discount','Total','Payment']];
      bills.forEach(b=>rows.push([b.billNo,b.date,b.customer,b.rtShop||'',b.rtGstin||'',b.doctor||'',b.items.length,b.subtotal,b.totalGst,b.totalDiscount,b.grandTotal,b.paymentMode]));
    }
    const csv=rows.map(r=>r.map(v=>`"${v}"`).join(',')).join('\n');
    const a=document.createElement('a');
    a.href='data:text/csv,'+encodeURIComponent(csv);
    a.download=`sales_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showT('CSV exported ✓');
  }

  return (
    <div style={{padding:'20px 24px'}}>
      {/* Toast */}
      {toastMsg&&(
        <div style={{position:'fixed',top:20,right:24,zIndex:9999,background:'#1e293b',color:'white',padding:'10px 20px',borderRadius:10,fontWeight:600,fontSize:13,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>
          {toastMsg}
        </div>
      )}

      {/* Bill view modal */}
      {viewBill&&<BillViewModal bill={viewBill} isWS={isWS} onClose={()=>setViewBill(null)}/>}

      <div className="card" style={{padding:0,overflow:'hidden'}}>

        {/* Card header */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
          <span className="card-title">Sales History</span>
          <button className="btn-primary" style={{padding:'7px 16px',fontSize:13}} onClick={exportCSV}>⬇ CSV</button>
        </div>

        {/* Filters row */}
        <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end'}}>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.05em'}}>Search</label>
            <input className="form-input" style={{minWidth:200,margin:0}}
              placeholder="Bill / patient…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.05em'}}>From:</label>
            <input className="form-input" type="date" style={{margin:0,width:160}} value={from} onChange={e=>setFrom(e.target.value)}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.05em'}}>To:</label>
            <input className="form-input" type="date" style={{margin:0,width:160}} value={to} onChange={e=>setTo(e.target.value)}/>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4}}>
            <label style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.05em'}}>Payment</label>
            <select className="form-input" style={{margin:0,width:150}} value={payment} onChange={e=>setPayment(e.target.value)}>
              <option value="">All Payments</option>
              <option>Cash</option><option>UPI</option><option>Card</option>
              <option>NEFT</option><option>Credit</option><option>Insurance</option>
            </select>
          </div>
          <button className="btn-outline" style={{padding:'9px 16px',fontSize:13,alignSelf:'flex-end'}} onClick={clearFilters}>Clear</button>
        </div>

        {/* Summary bar */}
        {bills.length>0&&(
          <div style={{padding:'8px 20px',background:'#f8fafc',borderBottom:'1px solid var(--border)',display:'flex',gap:20,flexWrap:'wrap',fontSize:13}}>
            <span>Bills: <strong>{bills.length}</strong></span>
            <span>Revenue: <strong style={{color:'var(--accent)',fontFamily:"'JetBrains Mono',monospace"}}>{cur(totalRev)}</strong></span>
            <span>GST: <strong style={{fontFamily:"'JetBrains Mono',monospace"}}>{cur(totalGst)}</strong></span>
            <span>Discount: <strong style={{color:'#10b981',fontFamily:"'JetBrains Mono',monospace"}}>-{cur(totalDisc)}</strong></span>
          </div>
        )}

        {/* Table — horizontally scrollable */}
        {isLoading ? (
          <div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading…</div>
        ) : bills.length===0 ? (
          <div style={{padding:32,textAlign:'center',color:'#94a3b8',fontStyle:'italic'}}>No bills match the filter</div>
        ) : isWS ? (

          /* ══ WHOLESALE TABLE ══ */
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:1180}}>
              <thead>
                <tr>
                  <th style={{minWidth:170}}>BILL NO</th>
                  <th style={{minWidth:150}}>GSTIN (WHOLESALER)</th>
                  <th style={{minWidth:150}}>GSTIN (SHOPKEEPER)</th>
                  <th style={{minWidth:110}}>DATE</th>
                  <th style={{minWidth:150}}>SHOP / RETAILER</th>
                  <th style={{minWidth:140}}>SHOPKEEPER NAME</th>
                  <th style={{minWidth:130}}>CONTACT</th>
                  <th style={{minWidth:160}}>STOCK NAME</th>
                  <th style={{minWidth:80}}>NO. OF ITEMS</th>
                  <th style={{minWidth:90}}>SUBTOTAL</th>
                  <th style={{minWidth:80}}>GST</th>
                  <th style={{minWidth:90}}>DISCOUNT</th>
                  <th style={{minWidth:90}}>TOTAL</th>
                  <th style={{minWidth:110}}>PAYMENT MODE</th>
                  <th style={{minWidth:100}}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(b=>{
                  const stockNames=(b.items||[]).map(it=>it.name).join(', ');
                  return(
                    <tr key={b.id}>
                      <td>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#0ea5e9',cursor:'pointer',fontSize:12}}
                          onClick={()=>setViewBill(b)}>{b.billNo}</span>
                      </td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#64748b'}}>{b.wsGstin||'—'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:'#7c3aed'}}>{b.shopkeeperGstin||'—'}</td>
                      <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(b.date)}</td>
                      <td>
                        <div style={{fontWeight:600,fontSize:13}}>{b.shopName||b.customer}</div>
                        {b.phone&&<div style={{fontSize:11,color:'#94a3b8'}}>{b.phone}</div>}
                      </td>
                      <td style={{fontSize:12}}>{b.customer||'—'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,whiteSpace:'nowrap'}}>{b.phone||'—'}</td>
                      <td style={{fontSize:12,maxWidth:160,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}} title={stockNames}>{stockNames||'—'}</td>
                      <td style={{textAlign:'center',fontSize:12}}>{b.items.length} item{b.items.length!==1?'s':''}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,whiteSpace:'nowrap'}}>{cur(b.subtotal)}</td>
                      <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{cur(b.totalGst)}</td>
                      <td style={{color:'#10b981',fontSize:12,whiteSpace:'nowrap'}}>{b.totalDiscount>0?'-'+cur(b.totalDiscount):'₹0.00'}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap'}}>{cur(b.grandTotal)}</td>
                      <td><span className={`badge ${pmBadge(b.paymentMode)}`}>{b.paymentMode}</span></td>
                      <td style={{whiteSpace:'nowrap'}}>
                        <button className="btn-icon" onClick={()=>setViewBill(b)} title="View">👁</button>
                        <button className="btn-icon" onClick={()=>{setViewBill(b);setTimeout(()=>window.print(),400);}} title="Print">🖨</button>
                        <button className="btn-icon" onClick={()=>handleDel(b)} title="Delete">🗑️</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

        ) : (

          /* ══ RETAIL TABLE ══ */
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:900}}>
              <thead>
                <tr>
                  <th style={{minWidth:90}}>BILL NO</th>
                  <th style={{minWidth:110}}>DATE</th>
                  <th style={{minWidth:200}}>CUSTOMER / SHOP</th>
                  <th style={{minWidth:120}}>DOCTOR</th>
                  <th style={{minWidth:80}}>ITEMS</th>
                  <th style={{minWidth:90}}>SUBTOTAL</th>
                  <th style={{minWidth:80}}>GST</th>
                  <th style={{minWidth:90}}>DISCOUNT</th>
                  <th style={{minWidth:90}}>TOTAL</th>
                  <th style={{minWidth:90}}>PAYMENT</th>
                  <th style={{minWidth:100}}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(b=>(
                  <tr key={b.id}>
                    <td>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'#0ea5e9',cursor:'pointer'}}
                        onClick={()=>setViewBill(b)}>#{b.billNo}</span>
                    </td>
                    <td style={{fontSize:12,whiteSpace:'nowrap'}}>{fmtDate(b.date)}</td>
                    <td>
                      <div style={{fontWeight:600,fontSize:13}}>{b.customer||'Walk-in'}</div>
                      {b.phone   &&<div style={{fontSize:11,color:'#94a3b8'}}>{b.phone}</div>}
                      {b.rtShop  &&<div style={{fontSize:11,color:'#10b981',fontWeight:600}}>🏪 {b.rtShop}</div>}
                      {b.rtGstin &&<div style={{fontSize:10,color:'#6366f1',fontFamily:"'JetBrains Mono',monospace"}}>GSTIN: {b.rtGstin}</div>}
                    </td>
                    <td style={{fontSize:12}}>{b.doctor||'—'}</td>
                    <td style={{fontSize:12,textAlign:'center'}}>{b.items.length} item{b.items.length!==1?'s':''}</td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:12,whiteSpace:'nowrap'}}>{cur(b.subtotal)}</td>
                    <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{cur(b.totalGst)}</td>
                    <td style={{fontSize:12,whiteSpace:'nowrap',color:b.totalDiscount>0?'#10b981':'#94a3b8'}}>
                      {b.totalDiscount>0?'-'+cur(b.totalDiscount):'₹0.00'}
                    </td>
                    <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:'var(--accent)',whiteSpace:'nowrap'}}>{cur(b.grandTotal)}</td>
                    <td><span className={`badge ${pmBadge(b.paymentMode)}`}>{b.paymentMode}</span></td>
                    <td style={{whiteSpace:'nowrap'}}>
                      <button className="btn-icon" onClick={()=>setViewBill(b)} title="View">👁</button>
                      <button className="btn-icon" onClick={()=>{setViewBill(b);setTimeout(()=>window.print(),400);}} title="Print">🖨</button>
                      <button className="btn-icon" onClick={()=>handleDel(b)} title="Delete">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
