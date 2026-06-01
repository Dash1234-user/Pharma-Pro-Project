import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import client from '../api/client';
import useAuthStore from '../store/authStore';
import useSettingsStore from '../store/settingsStore';

// ── API calls ─────────────────────────────────────────────────────────────────
const fetchSettings  = () => client.get('/settings').then(r => r.data);
const fetchDashboard = () => client.get('/dashboard').then(r => r.data);

// ── Locked field display ──────────────────────────────────────────────────────
function LockedField({ label, id, value }) {
  return (
    <div className="form-group">
      <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor={id}>
        {label}
        <span style={{ marginLeft:8, fontSize:10, color:'#d97706', fontWeight:700, background:'#fef3c7', padding:'2px 7px', borderRadius:4, border:'1px solid #fcd34d' }}>
          🔒 LOCKED
        </span>
      </label>
      <input id={id} className="form-input"
        value={value || ''} readOnly
        style={{ background:'#f8fafc', color:'#475569', cursor:'default' }} />
    </div>
  );
}

// ── Editable field ────────────────────────────────────────────────────────────
function Field({ label, id, type='text', value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <input id={id} className="form-input" type={type}
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} />
    </div>
  );
}

// ── Textarea field ────────────────────────────────────────────────────────────
function TextareaField({ label, id, value, onChange, placeholder }) {
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <textarea id={id} className="form-input"
        value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ minHeight:80, resize:'vertical', fontFamily:'inherit' }} />
    </div>
  );
}

// ── QR Upload ─────────────────────────────────────────────────────────────────
function QrUpload({ label, id, value, onChange }) {
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
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        {value ? (
          <img src={value} alt="QR" style={{ width:80, height:80, border:'1.5px solid var(--border)', borderRadius:8, objectFit:'contain' }} />
        ) : (
          <div style={{ color:'#94a3b8', fontSize:12 }}>No QR uploaded</div>
        )}
        <div style={{ display:'flex', gap:8 }}>
          <button type="button" className="btn-outline" style={{ fontSize:12, padding:'6px 14px' }}
            onClick={() => ref.current?.click()}>
            📷 Upload QR Image
          </button>
          {value && (
            <button type="button" className="btn-outline"
              style={{ fontSize:12, padding:'6px 14px', color:'#ef4444', borderColor:'#fca5a5' }}
              onClick={() => onChange('')}>
              Remove
            </button>
          )}
        </div>
      </div>
      <input ref={ref} type="file" accept="image/*" style={{ display:'none' }} onChange={handleFile} />
    </div>
  );
}

// ── Section header (matches old UI) ──────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize:15, fontWeight:800, color:'#0ea5e9', textTransform:'uppercase',
      letterSpacing:'.06em', marginTop:24, marginBottom:16,
      paddingBottom:8, borderBottom:'2px solid #e0f2fe' }}>
      {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN SETTINGS PAGE
// ═══════════════════════════════════════════════════════════════════════════════
export default function SettingsPage() {
  const qc                              = useQueryClient();
  const { logout }                      = useAuthStore();
  const { setSettings: setStoreSettings } = useSettingsStore();

  // ── Form state ─────────────────────────────────────────────────────────────
  const [storeName,         setStoreName]         = useState('');
  const [address,           setAddress]           = useState('');
  const [phone,             setPhone]             = useState('');
  const [email,             setEmail]             = useState('');
  const [defaultGst,        setDefaultGst]        = useState('12');
  const [currency,          setCurrency]          = useState('₹');
  const [lowStockThreshold, setLowStockThreshold] = useState('10');
  const [expiryAlertDays,   setExpiryAlertDays]   = useState('90');
  const [wholesaler,        setWholesaler]        = useState('');
  const [ownerName,         setOwnerName]         = useState('');
  const [wholesalerId,      setWholesalerId]      = useState('');
  const [shopName,          setShopName]          = useState('');
  const [retailerOwner,     setRetailerOwner]     = useState('');
  const [wholesaleUpiQr,    setWholesaleUpiQr]    = useState('');
  const [retailUpiQr,       setRetailUpiQr]       = useState('');
  // Locked (from JWT — never editable)
  const [lockedType,        setLockedType]        = useState('');
  const [lockedLicense,     setLockedLicense]     = useState('');
  const [lockedGstin,       setLockedGstin]       = useState('');
  const [lockedName,        setLockedName]        = useState('');

  const [toastMsg,  setToastMsg]  = useState('');
  const [toastType, setToastType] = useState('ok');
  const isWS = (lockedType || '').trim() === 'Wholesale Pharma';

  // ── Fetch settings — useEffect to populate (RQ v5 removed onSuccess) ───────
  const { data: settingsData, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn:  fetchSettings,
  });

  useEffect(() => {
    if (!settingsData) return;
    const s = settingsData;
    setStoreName(s.storeName         || '');
    setAddress(s.address             || '');
    setPhone(s.userPhone || s.phone  || '');
    setEmail(s.userEmail || s.email  || '');
    setDefaultGst(String(s.defaultGst     ?? 12));
    setCurrency(s.currency           || '₹');
    setLowStockThreshold(String(s.lowStockThreshold ?? 10));
    setExpiryAlertDays(String(s.expiryAlertDays     ?? 90));
    setWholesaler(s.wholesaler       || '');
    setOwnerName(s.ownerName         || '');
    setWholesalerId(s.wholesalerId   || '');
    setShopName(s.shopName           || '');
    setRetailerOwner(s.retailerOwner || '');
    setWholesaleUpiQr(s.wholesaleUpiQr || '');
    setRetailUpiQr(s.retailUpiQr     || '');
    setLockedType(s.pharmacyTypeLocked || s.storeType || '');
    setLockedLicense(s.drugLicenseLocked || s.license || '');
    setLockedGstin(s.gstinLocked    || s.gstin    || '');
    setLockedName(s.userName         || '');
  }, [settingsData]);

  // ── Dashboard stats for App Info panel ────────────────────────────────────
  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  fetchDashboard,
    staleTime: 60_000,
  });

  // ── Save settings ──────────────────────────────────────────────────────────
  const saveMutation = useMutation({
    mutationFn: (payload) => client.put('/settings', payload),
    onSuccess: (_, payload) => {
      setStoreSettings({ storeName: payload.storeName });
      qc.invalidateQueries({ queryKey: ['settings'] });
      showToast('Settings saved ✓');
    },
    onError: () => showToast('Save failed — please try again', 'err'),
  });

  function handleSave() {
    saveMutation.mutate({
      storeName:         storeName.trim() || 'My Pharmacy',
      address,           phone,           email,
      defaultGst:        parseFloat(defaultGst)      || 12,
      currency:          currency                    || '₹',
      lowStockThreshold: parseInt(lowStockThreshold) || 10,
      expiryAlertDays:   parseInt(expiryAlertDays)   || 90,
      wholesaler,        ownerName,       wholesalerId,
      shopName,          retailerOwner,
      wholesaleUpiQr,    retailUpiQr,
    });
  }

  // ── Export backup ──────────────────────────────────────────────────────────
  async function handleExport() {
    try {
      const res  = await client.get('/export/backup', { responseType:'blob' });
      const url  = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)]));
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `pharmacare-backup-${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Backup exported ✓');
    } catch { showToast('Export failed', 'err'); }
  }

  // ── Reset all data ─────────────────────────────────────────────────────────
  // Mirrors resetAllData() in app.js — double confirm, then POST to /api/state
  async function handleReset() {
    if (!window.confirm('⚠️ RESET ALL DATA?\nThis will permanently delete all medicines, bills, credits and settings for your account.')) return;
    if (!window.confirm('Are you absolutely sure? This CANNOT be undone!')) return;
    try {
      await client.post('/state', {
        products:[], bills:[], stockIns:[], credits:[],
        shopCredits:[], categories:[], nextBillNo:1
      });
      showToast('All data reset ✓');
      qc.invalidateQueries();          // refresh all queries
    } catch { showToast('Reset failed', 'err'); }
  }

  function showToast(msg, type = 'ok') {
    setToastMsg(msg); setToastType(type);
    setTimeout(() => setToastMsg(''), 3200);
  }

  if (isLoading) return (
    <div style={{ padding:32, textAlign:'center', color:'#94a3b8' }}>Loading settings…</div>
  );

  return (
    <div style={{ padding:'20px 24px' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24, alignItems:'start' }}>

        {/* ── LEFT: Pharmacy Identity ────────────────────────────── */}
        <div className="card settings-left-card" style={{ padding:'24px' }}>
          <style dangerouslySetInnerHTML={{ __html:`
            .settings-left-card .form-input { font-size:15px; padding:12px 14px; }
            .settings-left-card .form-group { margin-bottom:16px; }
          `}} />
          <h3 style={{ fontSize:18, fontWeight:800, color:'var(--text)', margin:'0 0 20px' }}>
            Pharmacy Identity
          </h3>

          {/* Pharmacy Name */}
          <div className="form-group" style={{ marginBottom:14 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-name">PHARMACY NAME *</label>
            <input id="set-name" className="form-input" type="text"
              value={storeName} onChange={e => setStoreName(e.target.value)}
              placeholder="Your pharmacy name" />
          </div>

          {/* Pharmacy Type — LOCKED */}
          <LockedField label="PHARMACY TYPE" id="set-type" value={lockedType} />

          {/* Address */}
          <div className="form-group" style={{ marginBottom:14, marginTop:14 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-address">ADDRESS</label>
            <textarea id="set-address" className="form-input"
              value={address} onChange={e => setAddress(e.target.value)}
              placeholder="Pharmacy address"
              style={{ minHeight:72, resize:'vertical', fontFamily:'inherit' }} />
          </div>

          {/* Phone */}
          <div className="form-group" style={{ marginBottom:14 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-phone">PHONE</label>
            <input id="set-phone" className="form-input" type="tel"
              value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="+91XXXXXXXXXX" />
          </div>

          {/* Email */}
          <div className="form-group" style={{ marginBottom:14 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-email">EMAIL</label>
            <input id="set-email" className="form-input" type="email"
              value={email} onChange={e => setEmail(e.target.value)}
              placeholder="pharmacy@email.com" />
          </div>

          {/* Drug License — LOCKED */}
          <div style={{ marginBottom:14 }}>
            <LockedField label="DRUG LICENSE NO." id="set-license" value={lockedLicense} />
          </div>

          {/* GSTIN — LOCKED */}
          <div style={{ marginBottom:14 }}>
            <LockedField label="GSTIN" id="set-gstin" value={lockedGstin} />
          </div>

          {/* ── Wholesale-specific fields ──────────────────────────────── */}
          {isWS && <>
            <SectionLabel>WHOLESALE DETAILS</SectionLabel>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-wholesaler">WHOLESALER (BUSINESS NAME)</label>
              <input id="set-wholesaler" className="form-input"
                value={wholesaler} onChange={e => setWholesaler(e.target.value)}
                placeholder="Wholesale business name" />
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-owner-name">OWNER NAME</label>
              <input id="set-owner-name" className="form-input"
                value={ownerName} onChange={e => setOwnerName(e.target.value)}
                placeholder="Owner full name" />
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-wholesaler-id">WHOLESALER ID</label>
              <input id="set-wholesaler-id" className="form-input"
                value={wholesalerId} onChange={e => setWholesalerId(e.target.value)}
                placeholder="e.g. WHL-001" />
            </div>
          </>}

          {/* ── Retail-specific fields ─────────────────────────────────── */}
          {!isWS && <>
            <SectionLabel>RETAIL DETAILS</SectionLabel>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-shop-name">SHOP / STORE NAME</label>
              <input id="set-shop-name" className="form-input"
                value={shopName} onChange={e => setShopName(e.target.value)}
                placeholder="Your shop name" />
            </div>
            <div className="form-group" style={{ marginBottom:14 }}>
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-retailer-owner">RETAILER / OWNER NAME</label>
              <input id="set-retailer-owner" className="form-input"
                value={retailerOwner} onChange={e => setRetailerOwner(e.target.value)}
                placeholder="Owner full name" />
            </div>
          </>}

          {/* ── Preferences ────────────────────────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
            <div className="form-group">
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-gst">DEFAULT GST %</label>
              <input id="set-gst" className="form-input" type="number"
                value={defaultGst} onChange={e => setDefaultGst(e.target.value)} min="0" max="28" />
            </div>
            <div className="form-group">
              <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-currency">CURRENCY SYMBOL</label>
              <input id="set-currency" className="form-input"
                value={currency} onChange={e => setCurrency(e.target.value)} placeholder="₹" />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom:14 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-low-stock">LOW STOCK THRESHOLD</label>
            <input id="set-low-stock" className="form-input" type="number"
              value={lowStockThreshold} onChange={e => setLowStockThreshold(e.target.value)} min="1" />
          </div>

          <div className="form-group" style={{ marginBottom:20 }}>
            <label style={{ fontSize:14, fontWeight:800, color:'#1e293b', textTransform:'uppercase', letterSpacing:'.06em', display:'block', marginBottom:6 }} htmlFor="set-expiry-days">EXPIRY ALERT (DAYS BEFORE)</label>
            <input id="set-expiry-days" className="form-input" type="number"
              value={expiryAlertDays} onChange={e => setExpiryAlertDays(e.target.value)} min="1" />
          </div>

          {/* Save button */}
          <button className="btn-primary"
            style={{ width:'100%', padding:'13px', fontSize:15, fontWeight:700, marginBottom:10 }}
            onClick={handleSave} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
          </button>

          {/* Logout button */}
          <button
            style={{ width:'100%', padding:'12px', fontSize:14, fontWeight:600,
              background:'white', color:'#ef4444', border:'1.5px solid #fca5a5',
              borderRadius:10, cursor:'pointer' }}
            onClick={() => { logout(); window.location.href = '/login'; }}>
            ⚙ Logout / Switch Account
          </button>
        </div>

        {/* ── RIGHT: Data Management + App Info + QR ───────────────────── */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

          {/* Data Management */}
          <div className="card" style={{ padding:'20px' }}>
            <h4 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 14px' }}>
              Data Management
            </h4>

            {/* Export */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Export Data</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
                Download your pharmacy data as a backup or spreadsheet.
              </div>
              <button className="btn-outline" style={{ width:'100%', justifyContent:'center', fontSize:13 }}
                onClick={handleExport}>
                ↓ Export Data
              </button>
            </div>

            {/* Import */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:4 }}>Import Data</div>
              <div style={{ fontSize:12, color:'#64748b', marginBottom:8 }}>
                Upload medicines, sales history, credits, or restore from a backup.
              </div>
              <button className="btn-outline" style={{ width:'100%', justifyContent:'center', fontSize:13 }}
                onClick={() => showToast('Import: use the old app for now — coming in Phase 4', 'ok')}>
                ↑ Import Data
              </button>
            </div>

            {/* Reset */}
            <div style={{ background:'#fff5f5', border:'1.5px solid #fecaca', borderRadius:10, padding:'12px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, fontWeight:700, fontSize:13, color:'#ef4444', marginBottom:4 }}>
                ⚠ Reset All Data
              </div>
              <div style={{ fontSize:12, color:'#dc2626', marginBottom:10 }}>
                This will permanently delete all data.
              </div>
              <button
                style={{ width:'100%', padding:'10px', background:'#ef4444', color:'white',
                  border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer' }}
                onClick={handleReset}>
                Reset Everything
              </button>
            </div>
          </div>

          {/* App Info */}
          <div className="card" style={{ padding:'20px' }}>
            <h4 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 14px' }}>
              App Info
            </h4>
            {[
              { label:'Account',           value: lockedName || lockedGstin,              color:'#0ea5e9'   },
              { label:'Total Medicines',   value: dash?.totalProducts  ?? '—',            color:null        },
              { label:'Categories',        value: dash ? '—' : '—',                       color:null        },
              { label:'Total Bills',       value: dash?.totalBills     ?? '—',            color:null        },
              { label:'Expired Medicines', value: dash?.expiredCount   ?? '—',            color:'#ef4444'   },
              { label:'Total Revenue',     value: dash ? `₹${parseFloat(dash.totalRevenue ?? 0).toFixed(2)}` : '—', color:'#10b981' },
            ].map(row => (
              <div key={row.label} style={{ display:'flex', justifyContent:'space-between',
                alignItems:'center', padding:'6px 0',
                borderBottom:'1px solid var(--border)', fontSize:13 }}>
                <span style={{ color:'#64748b' }}>{row.label}</span>
                <span style={{ fontWeight:700, color: row.color || 'var(--text)' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* UPI QR Code */}
          <div className="card" style={{ padding:'20px' }}>
            <h4 style={{ fontSize:15, fontWeight:800, color:'var(--text)', margin:'0 0 4px' }}>
              🔳 UPI QR Code
            </h4>
            <div style={{ fontSize:12, color:'#64748b', marginBottom:14 }}>
              Upload your UPI payment QR code. It will appear on bills and in the billing panel.
            </div>
            {isWS ? (
              <>
                <SectionLabel>WHOLESALE PHARMA QR</SectionLabel>
                <QrUpload label="" id="ws-qr" value={wholesaleUpiQr} onChange={setWholesaleUpiQr} />
              </>
            ) : (
              <>
                <SectionLabel>RETAIL PHARMACY QR</SectionLabel>
                <QrUpload label="" id="rt-qr" value={retailUpiQr} onChange={setRetailUpiQr} />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className={`toast ${toastType}`} style={{ display:'block' }}>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
