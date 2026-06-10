import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// ── Helpers ───────────────────────────────────────────────────────────────────
function cur(v, currency = '₹') { return currency + parseFloat(v || 0).toFixed(2); }
function today() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtMonth(v) {
  if (!v) return '—';
  const [y, m] = v.split('-');
  return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m,10)-1] + ' ' + y;
}
function daysLeft(expiry) {
  if (!expiry) return 9999;
  try {
    const exp = new Date(expiry + '-01'), now = new Date(); now.setDate(1);
    return Math.round((exp - now) / 864e5);
  } catch { return 9999; }
}
function getExpiryBadge(expiry) {
  const d = daysLeft(expiry);
  if (d < 0)   return { cls: 'badge badge-red',   label: 'Expired' };
  if (d <= 30) return { cls: 'badge badge-red',   label: fmtMonth(expiry) };
  if (d <= 90) return { cls: 'badge badge-amber', label: fmtMonth(expiry) };
  return             { cls: 'badge badge-green',  label: fmtMonth(expiry) };
}

// ── Calculation helpers (mirrors app.py _calc_item / _calc_totals) ────────────
function calcItem(unitPrice, qty, discount, gstRate) {
  const lineGross = qty * unitPrice;
  const discAmt   = lineGross * discount / 100;
  const taxable   = lineGross - discAmt;
  const gstAmt    = taxable * (gstRate / 100);
  return { gstAmt: +gstAmt.toFixed(2), lineTotal: +(taxable + gstAmt).toFixed(2) };
}

function calcTotals(items) {
  const subtotal      = items.reduce((s, it) => s + it.qty * it.unitPrice, 0);
  const totalDiscount = items.reduce((s, it) => s + it.qty * it.unitPrice * it.discount / 100, 0);
  const totalGst      = items.reduce((s, it) => s + it.gstAmt, 0);
  const raw           = subtotal - totalDiscount + totalGst;
  const grandTotal    = Math.round(raw);
  return {
    subtotal:      +subtotal.toFixed(2),
    totalDiscount: +totalDiscount.toFixed(2),
    totalGst:      +totalGst.toFixed(2),
    roundOff:      +(grandTotal - raw).toFixed(2),
    grandTotal,
  };
}

// ── makeItemFromInput — mirrors app.js makeItemFromInput exactly ──────────────
function makeItemFromInput(p, qty, unitPrice, disc, unitType = 'strip', isWholesale = false) {
  const pps = p.piecesPerStrip || 10;
  const spb = p.stripsPerBox   || 10;
  let qtyInPieces = qty;
  if (unitType === 'box')   qtyInPieces = qty * spb * pps;
  if (unitType === 'strip') qtyInPieces = qty * pps;

  let lineGross;
  if (isWholesale) {
    const sellPerBox = p.sellingPrice || p.sale || 0;
    if (unitType === 'box') {
      lineGross = sellPerBox * qty;
    } else {
      const fullBoxes   = Math.floor(qty / spb);
      const extraStrips = qty % spb;
      lineGross = fullBoxes * sellPerBox + (extraStrips / spb) * sellPerBox;
    }
  } else {
    lineGross = qty * unitPrice;
  }

  const discAmt   = lineGross * disc / 100;
  const taxable   = lineGross - discAmt;
  const gstAmt    = +(taxable * (p.gst / 100)).toFixed(2);
  const lineTotal = +(taxable + gstAmt).toFixed(2);
  const effectiveUnitPrice = qty > 0 ? lineGross / qty : unitPrice;

  return {
    id: Math.random().toString(36).slice(2),
    productId: p.id, name: p.name, category: p.category, unit: p.unit,
    qty,
    unitPrice: +effectiveUnitPrice.toFixed(4),
    discount: disc, gstRate: p.gst,
    gstAmt, lineTotal,
    amountBeforeTax: +lineGross.toFixed(2),
    mrpPerBox: p.sale || 0,
    sellingPricePerBox: p.sellingPrice || 0,
    stripsPerBox: spb, piecesPerStrip: pps,
    unitType, displayQty: qty, qtyInPieces,
  };
}

function recalcItem(item, isWholesale) {
  const spb = item.stripsPerBox || 10;
  let lineGross;
  if (isWholesale && item.sellingPricePerBox) {
    const sellPerBox = item.sellingPricePerBox;
    if (item.unitType === 'box') {
      lineGross = sellPerBox * item.qty;
    } else {
      const fullBoxes   = Math.floor(item.qty / spb);
      const extraStrips = item.qty % spb;
      lineGross = fullBoxes * sellPerBox + (extraStrips / spb) * sellPerBox;
    }
  } else {
    lineGross = item.qty * item.unitPrice;
  }
  item.amountBeforeTax = +lineGross.toFixed(2);
  const discAmt = lineGross * item.discount / 100;
  const taxable = lineGross - discAmt;
  item.gstAmt   = +(taxable * item.gstRate / 100).toFixed(2);
  item.lineTotal = +(taxable + item.gstAmt).toFixed(2);
  return { ...item };
}

// ── Bill print HTML builders (mirrors showBillView in app.js exactly) ─────────
function buildWholesaleHTML(bill, settings) {
  const c = v => (settings.currency || '₹') + parseFloat(v || 0).toFixed(2);
  const sup = bill.wsSupplier || settings.supplierName || settings.storeName || '';
  const own = bill.wsOwner    || settings.ownerName    || '';
  const gst = bill.wsGstin   || settings.gstin         || '';
  const wsParts = [];
  if (sup) wsParts.push(`Supplier: ${sup}`);
  if (own) wsParts.push(`Owner: ${own}`);
  if (gst) wsParts.push(`GSTIN (Wholesaler): ${gst}`);
  const extraHeaderLines = wsParts.length
    ? `<div class="print-store-info" style="color:#0ea5e9;font-weight:600">${wsParts.join(' &nbsp;|&nbsp; ')}</div>`
    : '';
  const wsQr = settings.wholesaleUpiQr || '';
  const qrBlock = wsQr
    ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;margin-left:16px">
         <img src="${wsQr}" style="width:90px;height:90px;object-fit:contain;border:1.5px solid #bae6fd;border-radius:8px;background:#f8fafc"/>
         <div style="font-size:9px;color:#64748b;font-weight:600;letter-spacing:0.5px">SCAN TO PAY</div>
       </div>`
    : '';

  const wsRows = bill.items.map((it, i) => {
    const _spb   = it.stripsPerBox || 10;
    const _isBx  = it.unitType === 'box';
    const qtyLabel = _isBx ? `${it.qty} Box` : `${it.qty} Strip`;
    const mrpUnit  = _isBx ? (it.mrpPerBox || 0) : (it.mrpPerBox || 0) / _spb;
    const spUnit   = _isBx ? (it.sellingPricePerBox || 0) : (it.sellingPricePerBox || 0) / _spb;
    const amtBT    = c(it.amountBeforeTax || (it.qty * (it.unitPrice || 0)));
    return `<tr>
      <td>${i+1}</td><td>${it.name}</td><td>${it.unit}</td>
      <td>${qtyLabel}</td><td>${c(mrpUnit)}</td><td>${c(spUnit)}</td>
      <td>${it.discount}%</td><td>${it.gstRate}% (${c(it.gstAmt)})</td>
      <td>${amtBT}</td><td style="font-weight:700">${c(it.lineTotal)}</td>
    </tr>`;
  }).join('');

  return `<div class="print-doc">
    <div class="print-header" style="display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1;min-width:0;text-align:center">
        <div class="print-store-name">${settings.storeName || 'My Pharmacy'}</div>
        <div class="print-store-info">Wholesale Pharma${settings.address ? ' | ' + settings.address : ''}</div>
        ${extraHeaderLines}
        <div class="print-store-info">${settings.phone ? '📞 ' + settings.phone : ''} ${settings.email ? '| ✉ ' + settings.email : ''}</div>
        <div class="print-store-info">${settings.gstin ? 'GSTIN: ' + settings.gstin : ''} ${settings.license ? '| DL No: ' + settings.license : ''}</div>
      </div>
      ${qrBlock}
    </div>
    <div class="print-meta">
      <div><strong>Bill No:</strong> ${bill.billNo}</div>
      <div><strong>Date:</strong> ${fmtDate(bill.date)}</div>
      <div><strong>Shop / Retail Name:</strong> ${bill.shopName || '—'}</div>
      <div><strong>Shopkeeper Name:</strong> ${bill.customer || '—'}</div>
      <div><strong>Phone (Shopkeeper):</strong> ${bill.phone || '—'}</div>
      <div><strong>GSTIN (Shopkeeper):</strong> ${bill.shopkeeperGstin || '—'}</div>
      <div><strong>Payment:</strong> ${bill.paymentMode}</div>
      ${bill.notes ? `<div><strong>Notes:</strong> ${bill.notes}</div>` : ''}
    </div>
    <table class="print-items-table">
      <thead><tr><th>#</th><th>Medicine</th><th>Form</th><th>Qty</th><th>MRP</th><th>Selling Price</th><th>Disc</th><th>GST</th><th>Amt (Before Tax)</th><th>Amount</th></tr></thead>
      <tbody>${wsRows}</tbody>
    </table>
    <div class="print-totals">
      <div>Subtotal: ${c(bill.subtotal)}</div>
      <div>Discount: -${c(bill.totalDiscount)}</div>
      <div>GST: ${c(bill.totalGst)}</div>
      ${bill.roundOff ? `<div>Round Off: ${c(bill.roundOff)}</div>` : ''}
      <div class="print-grand-total">GRAND TOTAL: ${c(bill.grandTotal)}</div>
    </div>
    <div class="print-footer">
      Thank you for choosing ${settings.storeName || 'our pharmacy'} · Get well soon! 💊<br/>
      Computer generated bill — no signature required · Licensed Pharmacy
    </div>
  </div>`;
}

function buildRetailHTML(bill, settings) {
  const c = v => (settings.currency || '₹') + parseFloat(v || 0).toFixed(2);
  const type = (settings.storeType || 'Retail Pharmacy').trim();
  const rtShop    = bill.rtShop    || settings.shopName      || settings.storeName || '';
  const rtOwner   = bill.rtOwner   || settings.retailerOwner || '';
  const rtGstin   = bill.rtGstin   || settings.gstin         || '';
  const rtLicense = bill.rtLicense || settings.license       || '';
  const rtEmail   = bill.rtEmail   || settings.email         || '';
  const rtPhone   = bill.rtPhone   || settings.phone         || '';
  const rtAddress = settings.address || '';
  const rtQr = settings.retailUpiQr || '';
  const qrBlock = rtQr
    ? `<div style="flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:4px;margin-left:16px">
         <img src="${rtQr}" style="width:90px;height:90px;object-fit:contain;border:1.5px solid #bbf7d0;border-radius:8px;background:#f8fafc"/>
         <div style="font-size:9px;color:#64748b;font-weight:600;letter-spacing:0.5px">SCAN TO PAY</div>
       </div>`
    : '';

  const rtRows = bill.items.map((it, i) =>
    `<tr>
      <td>${i+1}</td><td>${it.name}</td><td>${it.unit}</td>
      <td>${it.qty}</td><td>${c(it.unitPrice)}</td>
      <td>${it.discount}%</td><td>${it.gstRate}% (${c(it.gstAmt)})</td>
      <td style="font-weight:700">${c(it.lineTotal)}</td>
    </tr>`
  ).join('');

  return `<div class="print-doc">
    <div class="print-header" style="padding-bottom:14px;border-bottom:2px solid #10b981;margin-bottom:0;display:flex;justify-content:space-between;align-items:flex-start">
      <div style="flex:1;min-width:0;text-align:center">
        <div class="print-store-name" style="font-size:22px;letter-spacing:-0.3px">${settings.storeName || 'My Pharmacy'}</div>
        <div class="print-store-info" style="color:#10b981;font-weight:700;font-size:13px;margin:3px 0">${type}</div>
        ${rtShop ? `<div class="print-store-info"><strong>Shop:</strong> ${rtShop}${rtOwner ? ' &nbsp;|&nbsp; <strong>Owner:</strong> ' + rtOwner : ''}</div>` : ''}
        ${rtAddress ? `<div class="print-store-info">📍 ${rtAddress}</div>` : ''}
        <div class="print-store-info">${rtPhone ? '📞 ' + rtPhone : ''}${rtEmail ? (rtPhone ? ' &nbsp;|&nbsp; ' : '') + '✉ ' + rtEmail : ''}</div>
        <div class="print-store-info">${rtGstin ? 'GSTIN: <strong>' + rtGstin + '</strong>' : ''}${rtLicense ? (rtGstin ? ' &nbsp;|&nbsp; ' : '') + 'DL No: <strong>' + rtLicense + '</strong>' : ''}</div>
      </div>
      ${qrBlock}
    </div>
    <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:0 0 8px 8px;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:6px">
      <div style="font-size:15px;font-weight:800;color:#166534;letter-spacing:0.5px">TAX INVOICE / BILL</div>
      <div style="font-size:13px;font-weight:700;color:#374151">Bill No: <span style="color:#10b981;font-family:'JetBrains Mono',monospace">#${bill.billNo}</span> &nbsp;|&nbsp; Date: ${fmtDate(bill.date)}</div>
    </div>
    <div class="print-meta" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;margin-bottom:16px;display:grid;grid-template-columns:1fr 1fr;gap:6px 20px">
      <div><strong>Customer:</strong> ${bill.customer || 'Walk-in'}</div>
      <div><strong>Phone:</strong> ${bill.phone || '—'}</div>
      <div><strong>Doctor:</strong> ${bill.doctor || '—'}</div>
      <div><strong>Payment Mode:</strong> <span style="color:#10b981;font-weight:700">${bill.paymentMode}</span></div>
      ${bill.notes ? `<div style="grid-column:1/-1"><strong>Notes:</strong> ${bill.notes}</div>` : ''}
    </div>
    <table class="print-items-table" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <thead style="background:#f0fdf4">
        <tr>
          <th style="color:#166534">#</th><th style="color:#166534">Medicine</th>
          <th style="color:#166534">Form</th><th style="color:#166534">Qty</th>
          <th style="color:#166534">MRP</th><th style="color:#166534">Disc%</th>
          <th style="color:#166534">GST</th><th style="color:#166534">Amount</th>
        </tr>
      </thead>
      <tbody>${rtRows}</tbody>
    </table>
    <div class="print-totals" style="margin-top:0;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 8px 8px;padding:12px 16px;background:#fafafa">
      <div style="color:#64748b">Subtotal: ${c(bill.subtotal)}</div>
      <div style="color:#ef4444">Discount: -${c(bill.totalDiscount)}</div>
      <div style="color:#6366f1">GST: ${c(bill.totalGst)}</div>
      ${bill.roundOff ? `<div style="color:#94a3b8">Round Off: ${c(bill.roundOff)}</div>` : ''}
      <div class="print-grand-total" style="color:#10b981;border-top:2px solid #10b981;margin-top:8px;padding-top:8px">GRAND TOTAL: ${c(bill.grandTotal)}</div>
    </div>
    <div class="print-footer" style="margin-top:18px;border-top:1px dashed #bbf7d0;padding-top:12px;color:#64748b">
      Thank you for choosing <strong>${settings.storeName || 'our pharmacy'}</strong> · Get well soon! 💊<br/>
      Computer generated bill — no signature required · Licensed Pharmacy
      ${rtGstin ? `<br/>GSTIN: ${rtGstin}` : ''}${rtLicense ? ` | DL No: ${rtLicense}` : ''}
    </div>
  </div>`;
}

// ── BillPreviewModal ───────────────────────────────────────────────────────────
function BillPreviewModal({ bill, settings, onClose }) {
  const isWholesale = (settings.storeType || '').trim() === 'Wholesale Pharma';
  const html = isWholesale
    ? buildWholesaleHTML(bill, settings)
    : buildRetailHTML(bill, settings);

  function handlePrint() {
    const w = window.open('', '_blank', 'width=800,height=700');
    w.document.write(`
      <!DOCTYPE html><html><head><title>Bill #${bill.billNo}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 24px; }
        .print-doc { max-width: 780px; margin: 0 auto; }
        .print-store-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
        .print-store-info { font-size: 12px; color: #475569; margin: 2px 0; }
        .print-header { padding-bottom: 14px; border-bottom: 2px solid #1e293b; margin-bottom: 12px; }
        .print-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 12px; margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; }
        .print-items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 12px; }
        .print-items-table th { background: #1e293b; color: #fff; padding: 7px 9px; font-weight: 600; text-align: left; font-size: 11px; }
        .print-items-table td { padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
        .print-items-table tr:last-child td { border-bottom: none; }
        .print-totals { text-align: right; padding: 10px 14px; font-size: 13px; line-height: 1.8; }
        .print-grand-total { font-size: 16px; font-weight: 800; margin-top: 6px; padding-top: 6px; border-top: 2px solid #1e293b; }
        .print-footer { margin-top: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
        @media print { body { padding: 8px; } }
      </style>
      </head><body>${html}</body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 350);
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:780, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px', borderBottom:'1px solid #e2e8f0', flexShrink:0 }}>
          <span style={{ fontWeight:700, fontSize:15 }}>Bill Preview</span>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-primary" style={{ gap:6 }} onClick={handlePrint}>
              🖨 Print
            </button>
            <button className="btn-icon" onClick={onClose} style={{ fontSize:18, lineHeight:1 }}>×</button>
          </div>
        </div>
        {/* Content */}
        <div style={{ overflowY:'auto', padding:20, flex:1 }}
          dangerouslySetInnerHTML={{ __html: html }} />
      </div>

      {/* Print-specific inline styles injected into main document */}
      <style>{`
        .print-doc { font-family: 'Segoe UI', Arial, sans-serif; font-size: 13px; color: #1e293b; }
        .print-store-name { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
        .print-store-info { font-size: 12px; color: #475569; margin: 2px 0; }
        .print-header { padding-bottom: 14px; border-bottom: 2px solid #1e293b; margin-bottom: 12px; }
        .print-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 20px; font-size: 12px; margin-bottom: 14px; padding: 10px 14px; background: #f8fafc; border-radius: 6px; }
        .print-items-table { width: 100%; border-collapse: collapse; margin-bottom: 0; font-size: 12px; }
        .print-items-table th { background: #1e293b; color: #fff; padding: 7px 9px; font-weight: 600; text-align: left; font-size: 11px; }
        .print-items-table td { padding: 7px 9px; border-bottom: 1px solid #e2e8f0; }
        .print-items-table tr:last-child td { border-bottom: none; }
        .print-totals { text-align: right; padding: 10px 14px; font-size: 13px; line-height: 1.8; }
        .print-grand-total { font-size: 16px; font-weight: 800; margin-top: 6px; padding-top: 6px; border-top: 2px solid #1e293b; }
        .print-footer { margin-top: 16px; text-align: center; font-size: 11px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 10px; }
      `}</style>
    </div>
  );
}

// ── Low Stock Alert Toast ─────────────────────────────────────────────────────
function LowStockToast({ alerts, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 7000); return () => clearTimeout(t); }, []);
  return (
    <div style={{ position:'fixed', bottom:90, right:20, zIndex:9998, background:'#fffbeb', border:'1.5px solid #f59e0b', borderRadius:10, padding:'12px 16px', maxWidth:300, boxShadow:'0 4px 16px rgba(0,0,0,0.12)' }}>
      <div style={{ fontWeight:700, fontSize:13, color:'#92400e', marginBottom:6 }}>⚠ Low Stock Alert</div>
      {alerts.map((a, i) => (
        <div key={i} style={{ fontSize:12, color:'#78350f' }}>{a.name} — {a.stock} pcs left</div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN BillingPage
// ══════════════════════════════════════════════════════════════════════════════
export default function BillingPage() {
  // Use flat store keys (mirrors DashboardPage / AnalysisPage pattern)
  const {
    storeType: rawStoreType = '',
    storeName = 'My Pharmacy',
    currency  = '₹',
    gstin: settingsGstin = '',
    phone: settingsPhone = '',
    email: settingsEmail = '',
    address = '',
    license = '',
    supplierName = '',
    ownerName = '',
    shopName = '',
    retailerOwner = '',
    wholesaleUpiQr = '',
    retailUpiQr = '',
  } = useSettingsStore();

  const storeType   = (rawStoreType || '').trim();
  const isWholesale = storeType === 'Wholesale Pharma';

  // Build a settings object so PDF builders and existing code keep working unchanged
  const settings = {
    storeType, storeName, currency, gstin: settingsGstin,
    phone: settingsPhone, email: settingsEmail, address, license,
    supplierName, ownerName, shopName, retailerOwner,
    wholesaleUpiQr, retailUpiQr,
  };
  const c = v => currency + parseFloat(v || 0).toFixed(2);

  const qc = useQueryClient();

  // ── Products query ─────────────────────────────────────────────────────────
  const { data: products = [] } = useQuery({
    queryKey: ['products'],
    queryFn:  () => client.get('/products').then(r => r.data),
    staleTime: 60_000,
  });

  // ── Next bill number ───────────────────────────────────────────────────────
  const { data: billNoData } = useQuery({
    queryKey: ['nextBillNo'],
    queryFn:  () => client.get('/bills/next-number').then(r => r.data),
    staleTime: 0,
  });
  const formattedBillNo = billNoData?.formatted || '0001';
  const gstin = billNoData?.gstin || settings.gstin || '';
  const displayBillNo = isWholesale && gstin
    ? `${gstin}-${formattedBillNo}`
    : `#${formattedBillNo}`;

  // ── Bill items state ───────────────────────────────────────────────────────
  const [billItems, setBillItems] = useState([]);

  // ── Search / product selection ─────────────────────────────────────────────
  const [searchVal,   setSearchVal]   = useState('');
  const [dropdown,    setDropdown]    = useState([]);
  const [selProduct,  setSelProduct]  = useState(null);
  const [qty,         setQty]         = useState(1);
  const [unitPrice,   setUnitPrice]   = useState(0);
  const [disc,        setDisc]        = useState(0);
  const [unitType,    setUnitType]    = useState(isWholesale ? 'box' : 'strip');
  const searchRef = useRef(null);

  // ── Wholesale bill header fields ───────────────────────────────────────────
  const [wsShopName,       setWsShopName]       = useState('');
  const [wsCustName,       setWsCustName]       = useState('');
  const [wsCustPhone,      setWsCustPhone]      = useState('');
  const [wsShopkeeperGstin,setWsShopkeeperGstin]= useState('');
  const [wsDate,           setWsDate]           = useState(today());
  const [wsPayment,        setWsPayment]        = useState('Cash');
  const [wsNotes,          setWsNotes]          = useState('');

  // ── Retail bill header fields ──────────────────────────────────────────────
  const [rtCustName,  setRtCustName]  = useState('');
  const [rtCustPhone, setRtCustPhone] = useState('');
  const [rtDoctor,    setRtDoctor]    = useState('');
  const [rtDate,      setRtDate]      = useState(today());
  const [rtPayment,   setRtPayment]   = useState('Cash');
  const [rtNotes,     setRtNotes]     = useState('');

  // ── UI state ───────────────────────────────────────────────────────────────
  const [previewBill,  setPreviewBill]  = useState(null);
  const [error,        setError]        = useState('');
  const [lowStockAlerts, setLowStockAlerts] = useState([]);

  // ── Reset unit type when pharmacy type changes ─────────────────────────────
  useEffect(() => {
    setUnitType(isWholesale ? 'box' : 'strip');
    setSelProduct(null);
    setSearchVal('');
    setDropdown([]);
  }, [isWholesale]);

  // ── Amount calc for wholesale panel ───────────────────────────────────────
  const amtBeforeTax = useCallback(() => {
    if (!selProduct || !isWholesale) return 0;
    const spb = selProduct.stripsPerBox || 10;
    const sellPerBox = selProduct.sellingPrice || selProduct.sale || 0;
    if (unitType === 'box') return sellPerBox * (qty || 0);
    const totalStrips = qty || 0;
    const fullBoxes   = Math.floor(totalStrips / spb);
    const extraStrips = totalStrips % spb;
    return fullBoxes * sellPerBox + (extraStrips / spb) * sellPerBox;
  }, [selProduct, qty, unitType, isWholesale]);

  const amtAfterTax = useCallback(() => {
    const amt  = amtBeforeTax();
    const discA = amt * (disc || 0) / 100;
    const tax   = (amt - discA) * (selProduct?.gst || 0) / 100;
    return amt - discA + tax;
  }, [amtBeforeTax, disc, selProduct]);

  // ── Update unit price when product / unitType changes ─────────────────────
  const updateUnitPrice = useCallback((p, ut) => {
    if (!p) return;
    const pps = p.piecesPerStrip || 10;
    const spb = p.stripsPerBox   || 10;
    if (isWholesale) {
      const sellPerBox = p.sellingPrice || p.sale || 0;
      setUnitPrice(ut === 'box' ? +sellPerBox.toFixed(2) : +(sellPerBox / spb).toFixed(4));
    } else {
      let price = p.sale;
      if (ut === 'piece') price = +(p.sale / pps).toFixed(4);
      if (ut === 'box')   price = +(p.sale * spb).toFixed(2);
      setUnitPrice(price);
    }
  }, [isWholesale]);

  // ── Search handler ─────────────────────────────────────────────────────────
  function handleSearch(val) {
    setSearchVal(val);
    if (!val.trim()) { setDropdown([]); return; }
    const q = val.toLowerCase();
    const matches = products.filter(p =>
      p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q)
    ).slice(0, 8);
    setDropdown(matches);
  }

  function selectProduct(p) {
    if (daysLeft(p.expiry) < 0) {
      if (!window.confirm(`⚠️ "${p.name}" is EXPIRED (${fmtMonth(p.expiry)}). Add anyway?`)) return;
    }
    const defaultUnit = isWholesale ? 'box' : 'strip';
    setSelProduct(p);
    setSearchVal(p.name);
    setDropdown([]);
    setQty(1);
    setDisc(0);
    setUnitType(defaultUnit);
    updateUnitPrice(p, defaultUnit);
  }

  function handleUnitTypeChange(ut) {
    setUnitType(ut);
    if (selProduct) updateUnitPrice(selProduct, ut);
  }

  // ── Add item to bill ───────────────────────────────────────────────────────
  function addItem() {
    if (!selProduct) { setError('Select a medicine first'); return; }
    const q = parseFloat(qty) || 1;
    const d = parseFloat(disc) || 0;
    if (q <= 0) { setError('Quantity must be positive'); return; }

    // Stock check
    const pps = selProduct.piecesPerStrip || 10;
    const spb = selProduct.stripsPerBox   || 10;
    let qtyInPieces = q;
    if (unitType === 'box')   qtyInPieces = q * spb * pps;
    if (unitType === 'strip') qtyInPieces = q * pps;
    if (qtyInPieces > selProduct.stock) {
      setError(`⚠ Only ${selProduct.stock} pieces in stock (you need ${qtyInPieces})`);
      return;
    }

    const item = makeItemFromInput(selProduct, q, parseFloat(unitPrice) || selProduct.sale, d, unitType, isWholesale);
    setBillItems(prev => {
      const existing = prev.findIndex(it => it.productId === selProduct.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          qty:         updated[existing].qty + q,
          displayQty:  updated[existing].displayQty + q,
          qtyInPieces: updated[existing].qtyInPieces + qtyInPieces,
        };
        updated[existing] = recalcItem(updated[existing], isWholesale);
        return updated;
      }
      return [...prev, item];
    });

    setSelProduct(null);
    setSearchVal('');
    setDropdown([]);
    setQty(1);
    setDisc(0);
    setError('');
  }

  function changeItemQty(idx, delta) {
    setBillItems(prev => {
      const updated = [...prev];
      updated[idx] = recalcItem({ ...updated[idx], qty: Math.max(1, updated[idx].qty + delta) }, isWholesale);
      return updated;
    });
  }

  function removeItem(idx) {
    setBillItems(prev => prev.filter((_, i) => i !== idx));
  }

  function clearItems() {
    if (!billItems.length || !window.confirm('Clear all bill items?')) return;
    setBillItems([]);
  }

  // ── Totals ─────────────────────────────────────────────────────────────────
  const totals = calcTotals(billItems);

  // ── Create bill mutation ───────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (payload) => client.post('/bills', payload).then(r => r.data),
    onSuccess: (result) => {
      // Refresh products (stock changed) and bill history
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
      qc.invalidateQueries({ queryKey: ['nextBillNo'] });
      // Reset form
      setBillItems([]);
      if (isWholesale) {
        setWsShopName(''); setWsCustName(''); setWsCustPhone('');
        setWsShopkeeperGstin(''); setWsDate(today()); setWsPayment('Cash'); setWsNotes('');
      } else {
        setRtCustName(''); setRtCustPhone(''); setRtDoctor('');
        setRtDate(today()); setRtPayment('Cash'); setRtNotes('');
      }
      setError('');
      // Show preview
      setPreviewBill(result.bill);
      // Low stock alerts
      if (result.lowStockAlerts?.length) {
        setLowStockAlerts(result.lowStockAlerts);
      }
    },
    onError: (e) => setError(e.response?.data?.error || 'Bill generation failed'),
  });

  function finalizeBill() {
    if (!billItems.length) { setError('Add at least one medicine to the bill'); return; }
    setError('');

    const payload = {
      items: JSON.parse(JSON.stringify(billItems)),
      billStoreType: isWholesale ? 'wholesale' : 'retail',
    };

    if (isWholesale) {
      if (!wsShopName.trim())  { setError('Shop / Retail Name is required'); return; }
      if (!wsCustName.trim())  { setError('Shopkeeper / Retailer Name is required'); return; }
      Object.assign(payload, {
        date: wsDate, customer: wsCustName, phone: wsCustPhone,
        doctor: wsCustName, paymentMode: wsPayment, notes: wsNotes,
        shopName: wsShopName, shopkeeperGstin: wsShopkeeperGstin,
        wsSupplier: settings.supplierName || settings.storeName || '',
        wsOwner:    settings.ownerName    || '',
        wsGstin:    settings.gstin        || '',
      });
    } else {
      Object.assign(payload, {
        date: rtDate,
        customer: rtCustName.trim() || 'Walk-in',
        phone: rtCustPhone, doctor: rtDoctor, paymentMode: rtPayment, notes: rtNotes,
        rtShop:    settings.shopName      || settings.storeName || '',
        rtOwner:   settings.retailerOwner || '',
        rtGstin:   settings.gstin         || '',
        rtLicense: settings.license       || '',
        rtEmail:   settings.email         || '',
        rtPhone:   settings.phone         || '',
      });
    }
    createMut.mutate(payload);
  }

  // ── Print last bill ────────────────────────────────────────────────────────
  // Exposed to Layout via window for topbar "🖨 Print Last" button
  useEffect(() => {
    window.__pharmacare_printLastBill = async () => {
      try {
        const res = await client.get('/bills', { params: { limit: 1 } });
        const bills = res.data;
        const typeFilter = isWholesale ? 'wholesale' : 'retail';
        const last = bills.find(b => (b.billStoreType || 'retail') === typeFilter);
        if (last) setPreviewBill(last);
        else alert('No bills yet for this pharmacy type');
      } catch { alert('Could not fetch last bill'); }
    };
    return () => { delete window.__pharmacare_printLastBill; };
  }, [isWholesale]);

  // ── QR panel ──────────────────────────────────────────────────────────────
  const qrSrc = isWholesale ? (settings.wholesaleUpiQr || '') : (settings.retailUpiQr || '');

  // ── Auto-filled settings banner ────────────────────────────────────────────
  const SettingsBanner = () => isWholesale ? (
    <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'8px 14px', fontSize:12, marginBottom:14, color:'#0369a1' }}>
      <span style={{ marginRight:8 }}>📋</span>
      <strong>FROM SETTINGS (AUTO-FILLED)</strong>
      {settings.supplierName && <span style={{ marginLeft:10 }}>Supplier: <strong>{settings.supplierName}</strong></span>}
      {settings.ownerName    && <span style={{ marginLeft:10 }}>Owner: <strong>{settings.ownerName}</strong></span>}
      {settings.gstin        && <span style={{ marginLeft:10 }}>GSTIN: <strong>{settings.gstin}</strong></span>}
    </div>
  ) : (
    <div style={{ background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8, padding:'8px 14px', fontSize:12, marginBottom:14, color:'#166534' }}>
      <span style={{ marginRight:8 }}>🏪</span>
      <strong>FROM SETTINGS (AUTO-FILLED)</strong>
      {(settings.shopName || settings.storeName) && <span style={{ marginLeft:10 }}>Shop: <strong>{settings.shopName || settings.storeName}</strong></span>}
      {settings.retailerOwner && <span style={{ marginLeft:10 }}>Owner: <strong>{settings.retailerOwner}</strong></span>}
      {settings.phone         && <span style={{ marginLeft:10 }}>Phone: <strong>{settings.phone}</strong></span>}
      {settings.gstin         && <span style={{ marginLeft:10 }}>GSTIN: <strong>{settings.gstin}</strong></span>}
      {settings.license       && <span style={{ marginLeft:10 }}>DL No: <strong>{settings.license}</strong></span>}
    </div>
  );

  // ── Bill items table ───────────────────────────────────────────────────────
  function renderBillTable() {
    if (billItems.length === 0) {
      return (
        <tr className="empty-row">
          <td colSpan={isWholesale ? 11 : 8}>No items added yet</td>
        </tr>
      );
    }
    return billItems.map((it, i) => {
      if (isWholesale) {
        const _spb  = it.stripsPerBox || 10;
        const _isBx = it.unitType === 'box';
        const mrpUnit = _isBx ? (it.mrpPerBox || 0) : (it.mrpPerBox || 0) / _spb;
        const spUnit  = _isBx ? (it.sellingPricePerBox || 0) : (it.sellingPricePerBox || 0) / _spb;
        return (
          <tr key={it.id}>
            <td style={{ color:'#94a3b8' }}>{i+1}</td>
            <td>
              <div style={{ fontWeight:600 }}>{it.name}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{it.qtyInPieces || it.qty} pcs</div>
            </td>
            <td><span style={{ fontSize:11, background:'#f0f9ff', color:'#0369a1', padding:'2px 6px', borderRadius:6 }}>{it.unitType || 'strip'}</span></td>
            <td>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <button className="btn-icon" style={{ color:'#ef4444', fontWeight:'bold', fontSize:16 }} onClick={() => changeItemQty(i, -1)}>−</button>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600, minWidth:28, textAlign:'center' }}>{it.qty}</span>
                <button className="btn-icon" style={{ color:'#10b981', fontWeight:'bold', fontSize:16 }} onClick={() => changeItemQty(i, 1)}>+</button>
              </div>
            </td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{c(mrpUnit)}</td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace", color:'#10b981', fontWeight:600 }}>{c(spUnit)}</td>
            <td>{it.discount}%</td>
            <td style={{ fontSize:12, color:'#64748b' }}>{c(it.gstAmt)}</td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace", color:'#0ea5e9' }}>{c(it.amountBeforeTax || 0)}</td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'var(--accent)' }}>{c(it.lineTotal)}</td>
            <td><button className="btn-icon" onClick={() => removeItem(i)}>🗑</button></td>
          </tr>
        );
      } else {
        return (
          <tr key={it.id}>
            <td style={{ color:'#94a3b8' }}>{i+1}</td>
            <td>
              <div style={{ fontWeight:600 }}>{it.name}</div>
              <div style={{ fontSize:11, color:'#94a3b8' }}>{it.unitType || 'strip'} · {it.qtyInPieces || it.qty} pcs</div>
            </td>
            <td>
              <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                <button className="btn-icon" style={{ color:'#ef4444', fontWeight:'bold', fontSize:16 }} onClick={() => changeItemQty(i, -1)}>−</button>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600, minWidth:28, textAlign:'center' }}>{it.qty}</span>
                <button className="btn-icon" style={{ color:'#10b981', fontWeight:'bold', fontSize:16 }} onClick={() => changeItemQty(i, 1)}>+</button>
              </div>
            </td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace" }}>{c(it.unitPrice)}</td>
            <td>{it.discount}%</td>
            <td style={{ fontSize:12, color:'#64748b' }}>{c(it.gstAmt)}</td>
            <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700, color:'var(--accent)' }}>{c(it.lineTotal)}</td>
            <td><button className="btn-icon" onClick={() => removeItem(i)}>🗑</button></td>
          </tr>
        );
      }
    });
  }

  // ── Dropdown item hint ─────────────────────────────────────────────────────
  function DropdownItem({ p }) {
    const eb = getExpiryBadge(p.expiry);
    return (
      <div className="dd-item" onClick={() => selectProduct(p)}>
        <div className="dd-name">
          {p.name}
          {p.stock <= 0
            ? <span style={{ color:'#ef4444', fontSize:11, marginLeft:6 }}>[Out of Stock]</span>
            : daysLeft(p.expiry) < 0
              ? <span style={{ color:'#ef4444', fontSize:11, marginLeft:6 }}>[Expired]</span>
              : null}
        </div>
        <div className="dd-meta">
          {isWholesale
            ? `MRP/Box: ${c(p.sale)} · Selling: ${c(p.sellingPrice || 0)}`
            : `MRP: ${c(p.sale)}`} · Stock: {p.stock} · Batch: {p.sku || '—'} · Exp: {fmtMonth(p.expiry) || '—'}
        </div>
      </div>
    );
  }

  // ── Selected product info banner ───────────────────────────────────────────
  function SelectedProductInfo() {
    if (!selProduct) return null;
    const eb  = getExpiryBadge(selProduct.expiry);
    const pps = selProduct.piecesPerStrip || 10;
    const spb = selProduct.stripsPerBox   || 10;
    return (
      <div style={{ background:'#f0f9ff', border:'1px solid #bae6fd', borderRadius:8, padding:'8px 12px', fontSize:12, marginBottom:10 }}>
        {isWholesale ? (
          <>
            <strong>{selProduct.name}</strong> · MRP/box: <strong>{c(selProduct.sale)}</strong>
            {' '}· Selling Price/box: <strong style={{ color:'#10b981' }}>{c(selProduct.sellingPrice || 0)}</strong>
            {' '}· GST: <strong>{selProduct.gst}%</strong>
            {' '}· Batch: {selProduct.sku || '—'}
            {' '}· Exp: <span className={eb.cls} style={{ fontSize:10 }}>{eb.label}</span>
            {' '}· Stock: <strong style={{ color: selProduct.stock > 0 ? '#10b981' : '#ef4444' }}>{selProduct.stock} pcs</strong>
            {' '}· Pack: {pps} pcs/strip, {spb} strips/box
          </>
        ) : (
          <>
            <strong>{selProduct.name}</strong> · MRP/strip: <strong>{c(selProduct.sale)}</strong>
            {' '}· GST: <strong>{selProduct.gst}%</strong>
            {' '}· Batch: {selProduct.sku || '—'}
            {' '}· Exp: <span className={eb.cls} style={{ fontSize:10 }}>{eb.label}</span>
            {' '}· Stock: <strong style={{ color: selProduct.stock > 0 ? '#10b981' : '#ef4444' }}>{selProduct.stock} pcs</strong>
            {' '}· Pack: {pps} pcs/strip, {spb} strips/box
          </>
        )}
      </div>
    );
  }

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding:'20px 24px', display:'grid', gridTemplateColumns:'1fr 300px', gap:20, alignItems:'start' }}>

      {/* ── LEFT: Bill Form ──────────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

        {/* Bill Details card */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:0 }}>Bill Details</h3>
            <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:'#ef4444' }}>
              Bill #{displayBillNo}
            </span>
          </div>

          <SettingsBanner />

          {isWholesale ? (
            // ── Wholesale Fields ───────────────────────────────────────────
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group">
                <label className="form-label">SHOP / RETAIL NAME *</label>
                <input className="form-input" placeholder="Retailer's shop name"
                  value={wsShopName} onChange={e => setWsShopName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">SHOPKEEPER / RETAILER NAME *</label>
                <input className="form-input" placeholder="Shopkeeper name"
                  value={wsCustName} onChange={e => setWsCustName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">PHONE NO. (SHOPKEEPER/RETAILER)</label>
                <input className="form-input" placeholder="Mobile"
                  value={wsCustPhone} onChange={e => setWsCustPhone(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">GSTIN (SHOPKEEPER/RETAILER)</label>
                <input className="form-input" placeholder="e.g. 22AAAAA0000A1Z5"
                  value={wsShopkeeperGstin} onChange={e => setWsShopkeeperGstin(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">BILL DATE</label>
                <input className="form-input" type="date"
                  value={wsDate} onChange={e => setWsDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">PAYMENT MODE</label>
                <select className="form-input" value={wsPayment} onChange={e => setWsPayment(e.target.value)}>
                  <option>Cash</option><option>UPI</option><option>NEFT</option>
                  <option>RTGS</option><option>Cheque</option><option>Credit</option>
                </select>
              </div>
              <div className="form-group" style={{ gridColumn:'1/-1' }}>
                <label className="form-label">BILL NO.</label>
                <input className="form-input" readOnly value={displayBillNo}
                  style={{ background:'#f8fafc', color:'#64748b', cursor:'not-allowed' }} />
              </div>
            </div>
          ) : (
            // ── Retail Fields ──────────────────────────────────────────────
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div className="form-group">
                <label className="form-label">CUSTOMER NAME</label>
                <input className="form-input" placeholder="Customer / Walk-in"
                  value={rtCustName} onChange={e => setRtCustName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">PHONE (CUSTOMER)</label>
                <input className="form-input" placeholder="Mobile"
                  value={rtCustPhone} onChange={e => setRtCustPhone(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">DOCTOR NAME</label>
                <input className="form-input" placeholder="Prescribing doctor"
                  value={rtDoctor} onChange={e => setRtDoctor(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">BILL DATE</label>
                <input className="form-input" type="date"
                  value={rtDate} onChange={e => setRtDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">PAYMENT MODE</label>
                <select className="form-input" value={rtPayment} onChange={e => setRtPayment(e.target.value)}>
                  <option>Cash</option><option>UPI</option><option>Card</option>
                  <option>Insurance</option><option>Credit</option><option>Cheque</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">BILL NO.</label>
                <input className="form-input" readOnly value={displayBillNo}
                  style={{ background:'#f8fafc', color:'#64748b', cursor:'not-allowed' }} />
              </div>
            </div>
          )}
        </div>

        {/* Add Medicines card */}
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 14px' }}>Add Medicines</h3>

          {/* Search row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr auto auto', gap:10, marginBottom:10 }}>
            <div style={{ position:'relative' }}>
              <label className="form-label">SEARCH MEDICINE</label>
              <input ref={searchRef} className="form-input" placeholder="Type to search…"
                value={searchVal}
                onChange={e => handleSearch(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addItem()}
                autoComplete="off"
              />
              {dropdown.length > 0 && (
                <div id="bill-dropdown" className="dropdown-list" style={{ display:'block' }}>
                  {dropdown.map(p => <DropdownItem key={p.id} p={p} />)}
                </div>
              )}
            </div>
            <div>
              <label className="form-label">QUANTITY TYPE</label>
              <select className="form-input" value={unitType} onChange={e => handleUnitTypeChange(e.target.value)}
                style={{ minWidth:130 }}>
                {isWholesale
                  ? <>
                      <option value="box">Box</option>
                      <option value="strip">Strip</option>
                    </>
                  : <>
                      <option value="strip">Strip</option>
                      <option value="piece">Piece</option>
                    </>
                }
              </select>
            </div>
            <div>
              <label className="form-label">QTY</label>
              <input className="form-input" type="number" min="1" style={{ width:80 }}
                value={qty}
                onChange={e => setQty(parseFloat(e.target.value) || 1)}
                onKeyDown={e => e.key === 'Enter' && addItem()} />
            </div>
          </div>

          {/* Price & Discount row */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
            <div>
              <label className="form-label">PRICE ₹</label>
              <input className="form-input" type="number" min="0" step="0.01"
                value={unitPrice}
                onChange={e => setUnitPrice(parseFloat(e.target.value) || 0)}
                onKeyDown={e => e.key === 'Enter' && addItem()} />
            </div>
            <div>
              <label className="form-label">DISCOUNT %</label>
              <input className="form-input" type="number" min="0" max="100"
                value={disc}
                onChange={e => setDisc(parseFloat(e.target.value) || 0)}
                onKeyDown={e => e.key === 'Enter' && addItem()} />
            </div>
          </div>

          <SelectedProductInfo />

          {/* Amount calc panel (wholesale only) */}
          {isWholesale && selProduct && (
            <div style={{ background:'#f8fafc', border:'1px solid #e2e8f0', borderRadius:8, padding:'10px 14px', marginBottom:10, display:'flex', justifyContent:'space-between', fontSize:13 }}>
              <div style={{ color:'#64748b' }}>
                Amount Calculated (Before GST & Discount)
                <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'#0ea5e9', fontWeight:700, marginLeft:10 }}>
                  {c(amtBeforeTax())}
                </span>
              </div>
              <div style={{ color:'#64748b' }}>
                Amount After GST & Discount
                <span style={{ fontFamily:"'JetBrains Mono',monospace", color:'#10b981', fontWeight:700, marginLeft:10 }}>
                  {c(amtAfterTax())}
                </span>
              </div>
            </div>
          )}

          {error && (
            <div style={{ color:'#ef4444', fontSize:13, fontWeight:600, marginBottom:8 }}>{error}</div>
          )}

          <button className="btn-primary" style={{ width:'100%', justifyContent:'center', fontSize:14 }}
            onClick={addItem}>
            + Add to Bill
          </button>
        </div>

        {/* Bill Items card */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
            <h3 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:0 }}>Bill Items</h3>
            {billItems.length > 0 && (
              <button className="btn-outline" style={{ fontSize:12, color:'#ef4444', borderColor:'#fecaca' }}
                onClick={clearItems}>Clear All</button>
            )}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#f8fafc' }}>
                  {isWholesale ? (
                    <>
                      <th style={th}>#</th><th style={th}>Medicine</th><th style={th}>Qty Type</th>
                      <th style={th}>Qty</th><th style={th}>MRP</th><th style={th}>Selling Price</th>
                      <th style={th}>Disc%</th><th style={th}>GST</th><th style={th}>Amt (Before Tax)</th>
                      <th style={th}>Total</th><th style={th}></th>
                    </>
                  ) : (
                    <>
                      <th style={th}>#</th><th style={th}>Medicine</th><th style={th}>Qty</th>
                      <th style={th}>MRP</th><th style={th}>Disc%</th><th style={th}>GST</th>
                      <th style={th}>Total</th><th style={th}></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody id="bill-items-tbody">
                {renderBillTable()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── RIGHT: Summary + QR ──────────────────────────────────────────── */}
      <div style={{ display:'flex', flexDirection:'column', gap:16, position:'sticky', top:80 }}>

        {/* Bill Summary */}
        <div className="card" style={{ padding:20 }}>
          <h3 style={{ fontSize:14, fontWeight:800, color:'var(--text)', margin:'0 0 14px' }}>Bill Summary</h3>
          <div style={{ display:'flex', flexDirection:'column', gap:8, fontSize:13 }}>
            <SumRow label="Subtotal"  id="sum-sub"   value={c(totals.subtotal)} />
            <SumRow label="Discount"  id="sum-disc"  value={`-${c(totals.totalDiscount)}`} valueColor="#10b981" />
            <SumRow label="GST"       id="sum-gst"   value={c(totals.totalGst)} />
            <SumRow label="Round Off" id="sum-round" value={c(totals.roundOff)} />
            <div style={{ borderTop:'2px solid var(--border)', marginTop:4, paddingTop:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:800, fontSize:15 }}>TOTAL</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:800, fontSize:18, color:'var(--accent)' }} id="sum-total">
                {c(totals.grandTotal)}
              </span>
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginTop:14 }}>
            <label className="form-label">NOTES / REMARKS</label>
            <textarea className="form-input" rows={3} placeholder="Any instructions…"
              style={{ resize:'vertical', minHeight:64 }}
              value={isWholesale ? wsNotes : rtNotes}
              onChange={e => isWholesale ? setWsNotes(e.target.value) : setRtNotes(e.target.value)} />
          </div>
        </div>

        {/* QR Code panel */}
        <div className="card" style={{ padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:10, letterSpacing:0.5 }}>
            📱 SCAN HERE (QR CODE)
          </div>
          {qrSrc ? (
            <div style={{ textAlign:'center' }}>
              <img src={qrSrc} alt="UPI QR"
                style={{ width:120, height:120, objectFit:'contain', border:'2px solid #bae6fd', borderRadius:10, background:'#f8fafc', display:'block', margin:'0 auto' }} />
              <div style={{ fontSize:11, color:'#94a3b8', marginTop:6, fontWeight:600 }}>Scan to pay via UPI</div>
            </div>
          ) : (
            <div style={{ textAlign:'center', color:'#94a3b8', fontSize:12, fontStyle:'italic', padding:'16px 0' }}>
              Upload UPI QR in Settings
            </div>
          )}
        </div>

        {/* Generate Bill button */}
        <button className="btn-primary"
          style={{ width:'100%', justifyContent:'center', fontSize:15, padding:'14px 0', borderRadius:10 }}
          onClick={finalizeBill}
          disabled={createMut.isPending}>
          {createMut.isPending ? 'Saving…' : '✓ Generate Bill'}
        </button>

        {/* Print last bill (icon button) */}
        <button className="btn-outline"
          style={{ width:'100%', justifyContent:'center', fontSize:13 }}
          onClick={() => window.__pharmacare_printLastBill?.()}>
          🖨 Print Last Bill
        </button>
      </div>

      {/* ── Bill Preview Modal ──────────────────────────────────────────── */}
      {previewBill && (
        <BillPreviewModal
          bill={previewBill}
          settings={settings}
          onClose={() => setPreviewBill(null)}
        />
      )}

      {/* ── Low Stock Toast ─────────────────────────────────────────────── */}
      {lowStockAlerts.length > 0 && (
        <LowStockToast alerts={lowStockAlerts} onClose={() => setLowStockAlerts([])} />
      )}
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
const th = {
  padding: '9px 10px',
  textAlign: 'left',
  fontSize: 11,
  fontWeight: 700,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
};

function SumRow({ label, value, valueColor }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <span style={{ color:'#64748b', fontSize:13 }}>{label}</span>
      <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, color: valueColor || 'var(--text)', fontWeight:600 }}>{value}</span>
    </div>
  );
}
