import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import client from '../api/client';
import useSettingsStore from '../store/settingsStore';

// Replaces: loadSettingsForm() + _fillSettingsForm() + saveSettings() in app.js
// Locked fields (storeType, drugLicense, gstin) come from JWT — never editable
// Backend enforces this: PUT /api/settings always uses JWT values for locked fields

const fetchSettings = () => client.get('/settings').then(r => r.data);

function Section({ title, children }) {
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h3 className="card-title">{title}</h3>
      </div>
      <div style={{ padding: '16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, id, type='text', value, onChange, placeholder, locked, hint }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>
        {label}{locked && <span style={{ marginLeft:6, fontSize:10, color:'#6366f1', fontWeight:700, background:'#eef2ff', padding:'1px 6px', borderRadius:4 }}>LOCKED</span>}
      </label>
      {locked ? (
        <div className="form-input" style={{ background:'#f8fafc', color:'#475569', cursor:'not-allowed', userSelect:'all' }}>
          {value || '—'}
        </div>
      ) : (
        <input id={id} className="form-input" type={type}
          value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder} />
      )}
      {hint && <div style={{ fontSize:11.5, color:'#94a3b8', marginTop:2 }}>{hint}</div>}
    </div>
  );
}

// QR upload — mirrors handleQrUpload() in app.js
function QrUpload({ label, value, onChange }) {
  const ref = useRef();
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = ev => onChange(ev.target.result);
    reader.readAsDataURL(file);
  }
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        {value ? (
          <img src={value} alt="QR Code" style={{ width:80, height:80, border:'1.5px solid var(--border)', borderRadius:8, objectFit:'contain' }} />
        ) : (
          <div style={{ width:80, height:80, border:'2px dashed #cbd5e1', borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8', fontSize:11 }}>
            No QR
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          <button className="btn-outline" style={{ fontSize:12, padding:'6px 12px' }}
            onClick={() => ref.current?.click()}>
            📷 Upload QR
          </button>
          {value && (
            <button className="btn-outline" style={{ fontSize:12, padding:'6px 12px', color:'#ef4444', borderColor:'#ef4444' }}
              onClick={() => onChange('')}>
              🗑️ Remove
            </button>
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
    </div>
  );
}

export default function SettingsPage() {
  const { setSettings: setStoreSettings } = useSettingsStore();

  // ── Local form state ──────────────────────────────────────────────────────
  const [storeName,         setStoreName]         = useState('');
  const [address,           setAddress]           = useState('');
  const [phone,             setPhone]             = useState('');
  const [email,             setEmail]             = useState('');
  const [defaultGst,        setDefaultGst]        = useState('12');
  const [currency,          setCurrency]          = useState('₹');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [expiryAlertDays,   setExpiryAlertDays]   = useState('90');
  // Wholesale fields
  const [wholesaler,    setWholesaler]    = useState('');
  const [ownerName,     setOwnerName]     = useState('');
  const [wholesalerId,  setWholesalerId]  = useState('');
  // Retail fields
  const [shopName,      setShopName]      = useState('');
  const [retailerOwner, setRetailerOwner] = useState('');
  // QR codes
  const [wholesaleUpiQr, setWholesaleUpiQr] = useState('');
  const [retailUpiQr,    setRetailUpiQr]    = useState('');
  // Locked fields — read only, from JWT
  const [lockedType,    setLockedType]    = useState('');
  const [lockedLicense, setLockedLicense] = useState('');
  const [lockedGstin,   setLockedGstin]   = useState('');

  const [toast, setToast] = useState('');
  const isWS = (lockedType || '').trim() === 'Wholesale Pharma';

  // ── Load settings ─────────────────────────────────────────────────────────
  const { isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
    onSuccess: (s) => {
      setStoreName(s.storeName || '');
      setAddress(s.address || '');
      setPhone(s.userPhone || s.phone || '');
      setEmail(s.userEmail || s.email || '');
      setDefaultGst(String(s.defaultGst ?? 12));
      setCurrency(s.currency || '₹');
      setLowStockThreshold(String(s.lowStockThreshold ?? 10));
      setExpiryAlertDays(String(s.expiryAlertDays ?? 90));
      setWholesaler(s.wholesaler || '');
      setOwnerName(s.ownerName || '');
      setWholesalerId(s.wholesalerId || '');
      setShopName(s.shopName || '');
      setRetailerOwner(s.retailerOwner || '');
      setWholesaleUpiQr(s.wholesaleUpiQr || '');
      setRetailUpiQr(s.retailUpiQr || '');
      setLockedType(s.pharmacyTypeLocked || s.storeType || '');
      setLockedLicense(s.drugLicenseLocked || s.license || '');
      setLockedGstin(s.gstinLocked || s.gstin || '');
    },
  });

  // ── Save settings ─────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload) => client.put('/settings', payload),
    onSuccess: (_, payload) => {
      // Update Zustand store so sidebar name updates immediately
      setStoreSettings({ storeName: payload.storeName });
      showToast('Settings saved ✓');
    },
    onError: () => showToast('Save failed — try again', 'err'),
  });

  function showToast(msg, type = 'ok') {
    setToast({ msg, type });
    setTimeout(() => setToast(''), 3200);
  }

  function handleSave() {
    saveMutation.mutate({
      storeName:          storeName.trim()             || 'My Pharmacy',
      address,            phone,                email,
      defaultGst:         parseFloat(defaultGst)       || 12,
      currency:           currency                     || '₹',
      lowStockThreshold:  parseInt(lowStockThreshold)  || 10,
      expiryAlertDays:    parseInt(expiryAlertDays)    || 90,
      wholesaler,         ownerName,         wholesalerId,
      shopName,           retailerOwner,
      wholesaleUpiQr,     retailUpiQr,
    });
  }

  if (isLoading) return <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading settings…</div>;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 720, margin: '0 auto' }}>

      {/* ── Pharmacy Identity (locked) ─────────────────────────────────── */}
      <Section title="🔒 Pharmacy Identity">
        <div style={{ background:'#f0f9ff', border:'1.5px solid #bae6fd', borderRadius:10, padding:'10px 14px', fontSize:13, color:'#0369a1' }}>
          These fields are set during registration and cannot be changed here.
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <Field label="Pharmacy Type"   value={lockedType}    locked />
          <Field label="Drug License No." value={lockedLicense} locked />
          <Field label="GSTIN"           value={lockedGstin}   locked />
        </div>
      </Section>

      {/* ── General Settings ───────────────────────────────────────────── */}
      <Section title="🏥 General">
        <Field label="Store / Business Name" id="set-name"
          value={storeName} onChange={setStoreName} placeholder="Your pharmacy name" />
        <Field label="Address" id="set-address"
          value={address} onChange={setAddress} placeholder="Full address" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
          <Field label="Phone" id="set-phone" type="tel"
            value={phone} onChange={setPhone} placeholder="10-digit mobile" />
          <Field label="Email" id="set-email" type="email"
            value={email} onChange={setEmail} placeholder="pharmacy@email.com" />
        </div>
      </Section>

      {/* ── Preferences ────────────────────────────────────────────────── */}
      <Section title="⚙️ Preferences">
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
          <Field label="Default GST %" id="set-gst" type="number"
            value={defaultGst} onChange={setDefaultGst}
            hint="Applied to new bills" />
          <Field label="Currency Symbol" id="set-currency"
            value={currency} onChange={setCurrency} placeholder="₹" />
          <Field label="Low Stock Qty" id="set-low-stock" type="number"
            value={lowStockThreshold} onChange={setLowStockThreshold}
            hint="Alert threshold" />
        </div>
        <Field label="Expiry Alert Days" id="set-expiry-days" type="number"
          value={expiryAlertDays} onChange={setExpiryAlertDays}
          hint="Days before expiry to show alerts" />
      </Section>

      {/* ── Wholesale fields ────────────────────────────────────────────── */}
      {isWS && (
        <Section title="🏭 Wholesale Details">
          <Field label="Business / Wholesaler Name" id="set-wholesaler"
            value={wholesaler} onChange={setWholesaler} placeholder="Wholesale business name" />
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Owner Name" id="set-owner-name"
              value={ownerName} onChange={setOwnerName} placeholder="Owner full name" />
            <Field label="Wholesaler ID" id="set-wholesaler-id"
              value={wholesalerId} onChange={setWholesalerId} placeholder="e.g. WS-2024-001" />
          </div>
          <QrUpload label="UPI QR Code (Wholesale)"
            value={wholesaleUpiQr} onChange={setWholesaleUpiQr} />
        </Section>
      )}

      {/* ── Retail fields ───────────────────────────────────────────────── */}
      {!isWS && (
        <Section title="🏪 Retail Details">
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            <Field label="Shop / Store Name" id="set-shop-name"
              value={shopName} onChange={setShopName} placeholder="Retail shop name" />
            <Field label="Owner / Proprietor" id="set-retailer-owner"
              value={retailerOwner} onChange={setRetailerOwner} placeholder="Owner full name" />
          </div>
          <QrUpload label="UPI QR Code (Retail)"
            value={retailUpiQr} onChange={setRetailUpiQr} />
        </Section>
      )}

      {/* ── Save button ─────────────────────────────────────────────────── */}
      <button className="btn-primary"
        style={{ width:'100%', padding:'13px', fontSize:15, fontWeight:700 }}
        onClick={handleSave} disabled={saveMutation.isPending}>
        {saveMutation.isPending ? 'Saving…' : '💾 Save Settings'}
      </button>

      {/* Toast */}
      {toast && (
        <div className={`toast ${toast.type || 'ok'}`} style={{ display:'block', position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)' }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
