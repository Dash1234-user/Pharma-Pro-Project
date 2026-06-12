import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

const fetchProducts   = () => client.get('/products').then(r => r.data);
const fetchCategories = () => client.get('/categories').then(r => r.data);

function cur(n) { return '₹' + parseFloat(n||0).toFixed(2); }
function fmtMonth(val) {
  if (!val) return '—';
  const [y,m] = val.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1]+' '+y;
}
function daysLeft(expiry) {
  if (!expiry) return 9999;
  const exp = new Date(expiry+'-01'), now = new Date(); now.setDate(1);
  return Math.round((exp-now)/(864e5));
}
function expiryBadge(expiry) {
  if (!expiry) return {cls:'badge',style:{background:'#e2e8f0',color:'#475569'},label:'No Expiry'};
  const d = daysLeft(expiry);
  if (d<0)   return {cls:'badge badge-red',  style:{},label:fmtMonth(expiry)};
  if (d<=30) return {cls:'badge badge-red',  style:{},label:fmtMonth(expiry)};
  if (d<=90) return {cls:'badge badge-amber',style:{},label:fmtMonth(expiry)};
  return     {cls:'badge badge-green',       style:{},label:fmtMonth(expiry)};
}
function statusBadge(p) {
  const d = daysLeft(p.expiry);
  if (p.stock===0)               return {cls:'badge badge-red',  label:'Out of Stock'};
  if (d<0)                       return {cls:'badge badge-red',  label:'Expired'};
  if (p.stock<=p.minStock&&d<=30)return {cls:'badge badge-red',  label:'Critical'};
  if (p.stock<=p.minStock)       return {cls:'badge badge-amber',label:'Low Stock'};
  if (d<=30)                     return {cls:'badge badge-amber',label:'Expiring'};
  return                                {cls:'badge badge-green',label:'OK'};
}

/* ── Modal wrapper using existing .modal-bg / .modal-box CSS ── */
function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className={`modal-box${wide?' modal-bill':''}`} onClick={e=>e.stopPropagation()}
        style={{maxHeight:'92vh',overflowY:'auto'}}>
        <div className="modal-hd">
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div>{children}</div>
        {footer && <div style={{display:'flex',gap:10,justifyContent:'flex-end',marginTop:20,paddingTop:16,borderTop:'1px solid var(--border)'}}>{footer}</div>}
      </div>
    </div>
  );
}

/* ── Product Add/Edit Modal ── */
function ProductModal({isWS,categories,editProduct,defaultGst,lowStockThreshold,onClose,onSaved}) {
  const isEdit = !!editProduct;
  const [name,setName]         = useState('');
  const [cat,setCat]           = useState('');
  const [unit,setUnit]         = useState('Tablet');
  const [purchase,setPurchase] = useState('');
  const [sale,setSale]         = useState('');
  const [gst,setGst]           = useState(String(defaultGst??12));
  const [stock,setStock]       = useState('0');
  const [stockStrips,setStrips]= useState('0');
  const [minStock,setMin]      = useState(String(lowStockThreshold||10));
  const [sku,setSku]           = useState('');
  const [expiry,setExpiry]     = useState('');
  const [brand,setBrand]       = useState('');
  const [hsn,setHsn]           = useState('');
  const [desc,setDesc]         = useState('');
  const [pps,setPps]           = useState('10');
  const [spb,setSpb]           = useState('10');
  const [pu,setPu]             = useState(isWS?'box':'strip');
  const [sp,setSp]             = useState('');
  const [saving,setSaving]     = useState(false);
  const [error,setError]       = useState('');

  useEffect(()=>{
    if(!editProduct) return;
    setName(editProduct.name||''); setCat(editProduct.category||'');
    setUnit(editProduct.unit||'Tablet'); setPurchase(String(editProduct.purchase||''));
    setSale(String(editProduct.sale||'')); setGst(String(editProduct.gst??defaultGst??12));
    setMin(String(editProduct.minStock||10)); setSku(editProduct.sku||'');
    setExpiry(editProduct.expiry||''); setBrand(editProduct.brand||'');
    setHsn(editProduct.hsn||''); setDesc(editProduct.desc||'');
    setPps(String(editProduct.piecesPerStrip||10)); setSpb(String(editProduct.stripsPerBox||10));
    setPu(editProduct.purchaseUnit||(isWS?'box':'strip')); setSp(String(editProduct.sellingPrice||''));
    if(isWS){
      const ppsV=editProduct.piecesPerStrip||10, spbV=editProduct.stripsPerBox||10;
      const totStrips=Math.floor((editProduct.stock||0)/ppsV);
      setStrips(String(totStrips)); setStock(String(Math.floor(totStrips/spbV)));
    } else { setStock(String(editProduct.stock||0)); }
  },[editProduct]);

  const ppsN=parseInt(pps)||10, spbN=parseInt(spb)||10;
  const purV=parseFloat(purchase)||0, spV=parseFloat(sp)||0;
  let hint='';
  if(pu==='box'){ const cpp=purV>0?(purV/(spbN*ppsN)).toFixed(2):'—'; hint=`1 box = ${spbN} strips × ${ppsN} pcs = ${spbN*ppsN} pcs · ₹${cpp}/pc${isWS&&spV>0?' · Margin/box: ₹'+(spV-purV).toFixed(2):''}` }
  else if(pu==='strip'){ hint=`1 strip = ${ppsN} pcs · ₹${purV>0?(purV/ppsN).toFixed(2):'—'}/pc` }
  const stripsN=parseInt(stockStrips)||0;
  const wsHint=`Total: ${stripsN} strips = ${stripsN*ppsN} pcs (${Math.floor(stripsN/spbN)} full boxes + ${stripsN%spbN} extra strips)`;

  async function save(){
    setError('');
    if(!name.trim())  {setError('Medicine name is required');return;}
    if(!cat)          {setError('Category is required');return;}
    const pur=parseFloat(purchase),sal=parseFloat(sale);
    if(isNaN(pur)||isNaN(sal)){setError('Purchase and sale price required');return;}
    if(isWS&&!(parseFloat(sp)>0)){setError('Selling price required for Wholesale');return;}
    const stockPcs=isWS?(stripsN*ppsN):(parseInt(stock)||0);
    const payload={
      name:name.trim(),category:cat,unit,purchase:pur,sale:sal,
      gst:parseFloat(gst)>=0?parseFloat(gst):12,stock:stockPcs,
      minStock:parseInt(minStock)>0?parseInt(minStock):10,
      sku:sku.trim(),expiry,brand:brand.trim(),hsn:hsn.trim(),desc:desc.trim(),
      piecesPerStrip:ppsN,stripsPerBox:spbN,purchaseUnit:pu,
      sellingPrice:isWS?(parseFloat(sp)||0):0,
    };
    setSaving(true);
    try{
      isEdit ? await client.put(`/products/${editProduct.id}`,payload) : await client.post('/products',payload);
      onSaved(); onClose();
    }catch(e){setError(e.response?.data?.error||'Save failed');}
    finally{setSaving(false);}
  }

  const fg=(label,input)=>(
    <div className="form-group">
      <label className="form-label">{label}</label>
      {input}
    </div>
  );
  const inp=(val,set,opts={})=>(
    <input className="form-input" value={val} onChange={e=>set(e.target.value)} {...opts}/>
  );

  return (
    <Modal title={isEdit?'Edit Medicine':'Add New Medicine'} onClose={onClose}
      footer={<>
        <button className="btn-outline" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={save} disabled={saving}>{saving?'Saving…':isEdit?'✓ Update':'✓ Save Medicine'}</button>
      </>}>
      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',color:'#dc2626',borderRadius:8,padding:'8px 12px',marginBottom:12,fontSize:13}}>{error}</div>}
      <div className="rg-products-form">
        <div style={{gridColumn:'1/-1'}}>{fg('MEDICINE NAME *',inp(name,setName,{placeholder:'e.g. Paracetamol 500mg Tab'}))}</div>
        {fg('CATEGORY *',<select className="form-input" value={cat} onChange={e=>setCat(e.target.value)}><option value="">Select Category</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>)}
        {fg('FORM',<select className="form-input" value={unit} onChange={e=>setUnit(e.target.value)}>{['Tablet','Capsule','Syrup','Injection','Cream','Ointment','Drops','Inhaler','Powder','Bottle','Sachet','Strip','Gel','Spray','Suspension','Other'].map(u=><option key={u}>{u}</option>)}</select>)}
        {fg('PIECES PER STRIP',inp(pps,setPps,{type:'number',min:'1'}))}
        {fg('STRIPS PER BOX',inp(spb,setSpb,{type:'number',min:'1'}))}
        {fg('PURCHASE UNIT',<select className="form-input" value={pu} onChange={e=>setPu(e.target.value)}><option value="strip">Per Strip</option><option value="box">Per Box</option><option value="piece">Per Piece</option></select>)}
        {fg('PURCHASE PRICE ₹ *',inp(purchase,setPurchase,{type:'number',min:'0',step:'0.01',placeholder:'0.00'}))}
        {hint&&<div style={{gridColumn:'1/-1',fontSize:11,color:'#64748b',background:'#f8fafc',borderRadius:6,padding:'6px 10px',fontFamily:"'JetBrains Mono',monospace"}}>{hint}</div>}
        {fg('MRP ₹ *',inp(sale,setSale,{type:'number',min:'0',step:'0.01',placeholder:'0.00'}))}
        {isWS&&fg('SELLING PRICE / BOX ₹ *',inp(sp,setSp,{type:'number',min:'0',step:'0.01',placeholder:'0.00'}))}
        {fg('GST %',inp(gst,setGst,{type:'number',min:'0',step:'0.5'}))}
        {isWS?(
          <>
            {fg('OPENING STOCK (STRIPS)',inp(stockStrips,setStrips,{type:'number',min:'0'}))}
            <div style={{gridColumn:'1/-1',fontSize:11,color:'#64748b',background:'#f8fafc',borderRadius:6,padding:'6px 10px',fontFamily:"'JetBrains Mono',monospace"}}>{wsHint}</div>
          </>
        ):fg('OPENING STOCK',inp(stock,setStock,{type:'number',min:'0'}))}
        {fg('MIN. STOCK ALERT',inp(minStock,setMin,{type:'number',min:'0'}))}
        {fg('BATCH NO.',inp(sku,setSku,{placeholder:'e.g. AC23044'}))}
        {fg('EXPIRY DATE',inp(expiry,setExpiry,{type:'month'}))}
        {fg('MANUFACTURER / BRAND',inp(brand,setBrand,{placeholder:'e.g. Sun Pharma'}))}
        {fg('HSN CODE',inp(hsn,setHsn,{placeholder:'e.g. 30049099'}))}
        <div style={{gridColumn:'1/-1'}}>{fg('DESCRIPTION / COMPOSITION',inp(desc,setDesc,{placeholder:'e.g. Paracetamol 500mg'}))}</div>
      </div>
    </Modal>
  );
}

/* ── Stock Adjust Modal ── */
function StockAdjModal({product,onClose,onSaved}) {
  const [mode,setMode]=useState('add');
  const [qty,setQty]=useState('');
  const [saving,setSaving]=useState(false);
  const qN=parseInt(qty)||0;
  const cur_stock=product?.stock||0;
  const preview=mode==='add'?cur_stock+qN:mode==='remove'?Math.max(0,cur_stock-qN):qN;

  async function apply(){
    if(!qty||qN<0) return;
    setSaving(true);
    try{ await client.patch(`/products/${product.id}/stock`,{mode,qty:qN}); onSaved(); onClose(); }
    catch(e){console.error(e);} finally{setSaving(false);}
  }

  const mBtn=(m,label,clr)=>(
    <button onClick={()=>setMode(m)} style={{flex:1,padding:'8px 0',border:`2px solid ${mode===m?clr:'#e2e8f0'}`,borderRadius:8,background:mode===m?clr:'white',color:mode===m?'white':'#64748b',fontWeight:700,cursor:'pointer',fontSize:13}}>
      {label}
    </button>
  );

  return (
    <Modal title="Adjust Stock" onClose={onClose}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={apply} disabled={saving||!qty}>{saving?'Saving…':'Apply'}</button></>}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{product?.name}</div>
      <div style={{fontSize:13,color:'#64748b',marginBottom:16}}>Current stock: <strong style={{fontFamily:"'JetBrains Mono',monospace",color:'#0ea5e9'}}>{cur_stock}</strong></div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {mBtn('add','+ Add','#10b981')}{mBtn('remove','− Remove','#f59e0b')}{mBtn('set','= Set','#6366f1')}
      </div>
      <div className="form-group">
        <label className="form-label">QUANTITY</label>
        <input className="form-input" type="number" min="0" value={qty} onChange={e=>setQty(e.target.value)} autoFocus placeholder="Enter quantity"/>
      </div>
      {qty&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'10px 14px',fontSize:13,marginTop:8}}>New stock: <strong style={{fontFamily:"'JetBrains Mono',monospace",color:'#15803d',fontSize:16}}>{preview}</strong></div>}
    </Modal>
  );
}

/* ── Main Page ── */
export default function ProductsPage() {
  const {storeType,defaultGst,lowStockThreshold}=useSettingsStore();
  const isWS=(storeType||'').trim()==='Wholesale Pharma';
  const qc=useQueryClient();
  const [search,setSearch]     =useState('');
  const [catF,setCatF]         =useState('');
  const [statF,setStatF]       =useState('');
  const [showModal,setShowModal]=useState(false);
  const [editProd,setEditProd] =useState(null);
  const [adjProd,setAdjProd]  =useState(null);
  const [toast,setToast]       =useState('');

  const {data:products=[],isLoading}=useQuery({queryKey:['products'],queryFn:fetchProducts,staleTime:30_000});
  const {data:categories=[]}       =useQuery({queryKey:['categories'],queryFn:fetchCategories,staleTime:120_000});

  const delMut=useMutation({
    mutationFn:id=>client.delete(`/products/${id}`),
    onSuccess:()=>{qc.invalidateQueries({queryKey:['products']});showT('Deleted ✓');},
    onError:e=>showT(e.response?.data?.error||'Delete failed'),
  });

  function showT(msg){setToast(msg);setTimeout(()=>setToast(''),3000);}
  function openAdd(){setEditProd(null);setShowModal(true);}
  function openEdit(p){setEditProd(p);setShowModal(true);}
  function onSaved(){qc.invalidateQueries({queryKey:['products']});showT(editProd?'Updated ✓':'Added ✓');}
  function handleDel(p){
    if(!window.confirm(`Delete "${p.name}"?`)) return;
    delMut.mutate(p.id);
  }

  useEffect(()=>{
    window.__pharmacare_openAddProduct=openAdd;
    return()=>{delete window.__pharmacare_openAddProduct;};
  },[]);

  const catMap={};
  categories.forEach(c=>{catMap[c.id]=c.name;});

  const filtered=products.filter(p=>{
    const q=search.toLowerCase();
    const mq=!q||p.name.toLowerCase().includes(q)||(p.sku||'').toLowerCase().includes(q)||(p.brand||'').toLowerCase().includes(q);
    const mc=!catF||p.category===catF;
    const d=daysLeft(p.expiry);
    const ms=!statF
      ||(statF==='low'&&p.stock<=p.minStock&&p.stock>0)
      ||(statF==='out'&&p.stock===0)
      ||(statF==='expiring'&&d>=0&&d<=90)
      ||(statF==='expired'&&d<0)
      ||(statF==='ok'&&p.stock>p.minStock&&d>90);
    return mq&&mc&&ms;
  });

  return (
    <div className="page-pad">
      {toast&&<div style={{position:'fixed',top:20,right:24,zIndex:9999,background:'#1e293b',color:'white',padding:'10px 20px',borderRadius:10,fontWeight:600,fontSize:13,boxShadow:'0 4px 20px rgba(0,0,0,.2)'}}>{toast}</div>}
      {showModal&&<ProductModal isWS={isWS} categories={categories} editProduct={editProd} defaultGst={defaultGst} lowStockThreshold={lowStockThreshold} onClose={()=>setShowModal(false)} onSaved={onSaved}/>}
      {adjProd&&<StockAdjModal product={adjProd} onClose={()=>setAdjProd(null)} onSaved={()=>{qc.invalidateQueries({queryKey:['products']});showT('Stock updated ✓');}}/>}

      {/* Filter bar */}
      <div className="card" style={{padding:'14px 18px',marginBottom:16}}>
        <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',justifyContent:'space-between'}}>
          <div style={{display:'flex',gap:10,flexWrap:'wrap',flex:1}}>
            <input className="form-input" style={{maxWidth:260,margin:0}} placeholder="Search medicines…" value={search} onChange={e=>setSearch(e.target.value)}/>
            <select className="form-input" style={{maxWidth:180,margin:0}} value={catF} onChange={e=>setCatF(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select className="form-input" style={{maxWidth:140,margin:0}} value={statF} onChange={e=>setStatF(e.target.value)}>
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

      {/* Table */}
      <div className="card" style={{padding:0,overflow:'hidden'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
          <span className="card-title">Medicine Inventory</span>
          <span className="badge badge-blue">{filtered.length} items</span>
        </div>
        {isLoading?<div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>Loading…</div>:(
          <div className="table-wrap">
            <table className="tbl" style={{minWidth:isWS?1060:900}}>
              <thead>
                <tr>
                  <th style={{width:36}}>#</th>
                  <th>MEDICINE NAME</th>
                  <th>CATEGORY</th>
                  <th>FORM</th>
                  <th>BATCH</th>
                  <th>EXPIRY</th>
                  <th>MRP ₹</th>
                  <th>PURCHASE ₹</th>
                  {isWS&&<th>SELL/BOX ₹</th>}
                  <th>GST%</th>
                  <th>STOCK</th>
                  <th>STATUS</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length===0?(
                  <tr className="empty-row"><td colSpan={isWS?13:12}>No medicines found</td></tr>
                ):filtered.map((p,i)=>{
                  const eb=expiryBadge(p.expiry), sb=statusBadge(p);
                  const stkClr=p.stock===0?'#ef4444':p.stock<=p.minStock?'#f59e0b':'#10b981';
                  const margin=p.purchase>0?(((p.sale-p.purchase)/p.purchase)*100).toFixed(1):'0';
                  return(
                    <tr key={p.id}>
                      <td style={{color:'#94a3b8',fontSize:12}}>{i+1}</td>
                      <td style={{minWidth:160}}>
                        <div style={{fontWeight:600,fontSize:13}}>{p.name}</div>
                        {(p.brand||p.desc)&&<div style={{fontSize:11,color:'#94a3b8'}}>{p.brand}{p.brand&&p.desc?' · ':''}{p.desc}</div>}
                      </td>
                      <td><span className="badge badge-blue">{catMap[p.category]||'Uncategorized'}</span></td>
                      <td style={{fontSize:12,color:'#64748b',whiteSpace:'nowrap'}}>{p.unit}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,whiteSpace:'nowrap'}}>{p.sku||'—'}</td>
                      <td><span className={eb.cls} style={{fontFamily:"'JetBrains Mono',monospace",fontSize:10,...eb.style}}>{eb.label}</span></td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:600,whiteSpace:'nowrap'}}>{cur(p.sale)}</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",whiteSpace:'nowrap'}}>
                        {cur(p.purchase)}<br/><span style={{fontSize:10,color:'#10b981'}}>+{margin}%</span>
                      </td>
                      {isWS&&<td style={{fontFamily:"'JetBrains Mono',monospace",color:'#6366f1',whiteSpace:'nowrap'}}>{cur(p.sellingPrice)}</td>}
                      <td style={{whiteSpace:'nowrap'}}>{p.gst}%</td>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700,color:stkClr}}>{p.stock}</td>
                      <td><span className={sb.cls}>{sb.label}</span></td>
                      <td style={{whiteSpace:'nowrap'}}>
                        <button className="btn-icon" onClick={()=>openEdit(p)} title="Edit">✏️</button>
                        <button className="btn-icon" onClick={()=>setAdjProd(p)} title="Stock">📦</button>
                        <button className="btn-icon" onClick={()=>handleDel(p)} title="Delete">🗑️</button>
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
