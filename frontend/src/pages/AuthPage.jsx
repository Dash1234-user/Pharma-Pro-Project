import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client, { setAuthToken } from '../api/client';
import useAuthStore from '../store/authStore';
import useSettingsStore from '../store/settingsStore';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function Field({ label, id, type = 'text', value, onChange, placeholder, hint, error }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';
  return (
    <div className="form-group">
      <label className="form-label" htmlFor={id}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className="form-input"
          type={isPassword ? (show ? 'text' : 'password') : type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete="off"
          style={{ borderColor: error ? '#ef4444' : '' }}
        />
        {isPassword && (
          <button type="button" onClick={() => setShow(s => !s)}
            style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {hint  && <div className="form-hint" style={{ color: hint.startsWith('⚠') ? '#ef4444' : '#94a3b8' }}>{hint}</div>}
      {error && <div style={{ color:'#ef4444', fontSize:12, marginTop:4 }}>{error}</div>}
    </div>
  );
}

// ── LOGIN PANEL ──────────────────────────────────────────────────────────────
function LoginPanel({ onSwitch }) {
  const [mode, setMode]         = useState('gstin');
  const [gstin, setGstin]       = useState('');
  const [drug, setDrug]         = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);
  const { login }               = useAuthStore();
  const { setSettings }         = useSettingsStore();
  const navigate                = useNavigate();

  const gstinHint = gstin && !GSTIN_RE.test(gstin)
    ? '⚠ Invalid format. Expected 15-char like 27ABCDE1234F1Z5'
    : 'Format: 15-character alphanumeric (e.g. 27ABCDE1234F1Z5)';

  async function handleLogin() {
    setError('');
    let identifier = '';
    if (mode === 'gstin') {
      identifier = gstin.trim().toUpperCase();
      if (!GSTIN_RE.test(identifier)) { setError('Invalid GSTIN format. Must be 15 characters like 27ABCDE1234F1Z5'); return; }
    } else {
      identifier = drug.trim();
      if (identifier.length < 5) { setError('Drug License No. must be at least 5 characters'); return; }
    }
    if (!password) { setError('Password is required'); return; }
    setLoading(true);
    try {
      const res = await client.post('/auth/login', { identifier, password, mode });
      setAuthToken(res.data.token);
      login(res.data.token, res.data.user);
      if (res.data.user) setSettings(res.data.user);
      navigate('/');
    } catch (e) {
      setError(e.response?.data?.error || 'Login failed. Check credentials.');
    } finally { setLoading(false); }
  }

  return (
    <div className="auth-panel">
      <div className="auth-logo">💊</div>
      <h2 className="auth-title">PharmaCare Pro</h2>
      <p className="auth-subtitle">Sign in to your pharmacy account</p>

      <div className="auth-mode-toggle">
        <button type="button" className={`auth-mode-btn${mode==='gstin'?' active':''}`} onClick={() => setMode('gstin')}>GSTIN</button>
        <button type="button" className={`auth-mode-btn${mode==='drug'?' active':''}`}  onClick={() => setMode('drug')}>Drug License</button>
      </div>

      {mode === 'gstin' ? (
        <div className="form-group">
          <label className="form-label">GSTIN</label>
          <input className="form-input" type="text" value={gstin}
            onChange={e => setGstin(e.target.value.toUpperCase())}
            placeholder="27ABCDE1234F1Z5" maxLength={15} />
          <div className="form-hint" style={{ color: gstin && !GSTIN_RE.test(gstin) ? '#ef4444':'#94a3b8' }}>{gstinHint}</div>
        </div>
      ) : (
        <Field label="Drug License No." id="login-drug" value={drug}
          onChange={e => setDrug(e.target.value)} placeholder="e.g. MH-MUM-123456" />
      )}

      <Field label="Password" id="login-pw" type="password" value={password}
        onChange={e => setPassword(e.target.value)} placeholder="Enter your password" />

      {error && <div style={{ color:'#ef4444', fontSize:13, marginBottom:8 }}>{error}</div>}

      <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleLogin} disabled={loading}>
        {loading ? 'Signing in…' : 'Sign In →'}
      </button>

      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => onSwitch('forgot')}>Forgot Password?</button>
        <button type="button" className="auth-link" onClick={() => onSwitch('register')}>New pharmacy? Register</button>
      </div>
    </div>
  );
}

// ── REGISTER PANEL ───────────────────────────────────────────────────────────
// Handles both Wholesale Pharma and Retail Pharmacy — mirrors setRegType()+doRegister()
function RegisterPanel({ onSwitch }) {
  const [type, setType]             = useState('Retail Pharmacy');
  const isWS                        = type === 'Wholesale Pharma';
  const [email, setEmail]           = useState('');
  const [phone, setPhone]           = useState('');
  const [gstin, setGstin]           = useState('');
  const [license, setLicense]       = useState('');
  const [password, setPassword]     = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [address, setAddress]       = useState('');
  const [defaultGst, setDefaultGst] = useState('12');
  const [lowStock, setLowStock]     = useState('10');
  const [expiryDays, setExpiryDays] = useState('90');
  // Wholesale only
  const [ownerName, setOwnerName]       = useState('');
  const [wholesaler, setWholesaler]     = useState('');
  const [wholesalerId, setWholesalerId] = useState('');
  // Retail only
  const [shopName, setShopName]           = useState('');
  const [retailerOwner, setRetailerOwner] = useState('');

  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const { login }             = useAuthStore();
  const { setSettings }       = useSettingsStore();
  const navigate              = useNavigate();

  async function handleRegister() {
    setError('');
    if (isWS  && !ownerName)     { setError('Wholesaler Owner Name is required'); return; }
    if (isWS  && !wholesaler)    { setError('Wholesaler Business Name is required'); return; }
    if (!isWS && !shopName)      { setError('Retail / Shop Name is required'); return; }
    if (!isWS && !retailerOwner) { setError('Retailer / Owner Name is required'); return; }
    if (!email || !email.includes('@')) { setError('Valid email is required'); return; }
    if (!phone || phone.replace(/\D/g,'').length < 10) { setError('Enter a valid 10-digit phone number'); return; }
    if (!license || license.length < 5) { setError('Drug License No. must be at least 5 characters'); return; }
    if (!GSTIN_RE.test(gstin.trim().toUpperCase())) { setError('Invalid GSTIN format. Expected: 27ABCDE1234F1Z5'); return; }
    if (password.length < 8)          { setError('Password must be at least 8 characters'); return; }
    if (!/[A-Za-z]/.test(password))   { setError('Password must contain letters'); return; }
    if (!/[0-9]/.test(password))      { setError('Password must contain at least one number'); return; }
    if (password !== confirmPw)       { setError('Passwords do not match'); return; }

    const payload = {
      email, phone,
      pharmacyType:      type,
      drugLicense:       license,
      gstin:             gstin.trim().toUpperCase(),
      password,          confirmPassword: confirmPw,
      ownerName:         isWS ? ownerName      : '',
      wholesaler:        isWS ? wholesaler     : '',
      wholesalerId:      isWS ? wholesalerId   : '',
      shopName:          isWS ? ''             : shopName,
      retailerOwner:     isWS ? ''             : retailerOwner,
      address,
      defaultGst:        parseFloat(defaultGst) || 12,
      lowStockThreshold: parseInt(lowStock)      || 10,
      expiryAlertDays:   parseInt(expiryDays)    || 90,
    };

    setLoading(true);
    try {
      const res = await client.post('/auth/register', payload);
      setAuthToken(res.data.token);
      login(res.data.token, res.data.user);
      if (res.data.user) setSettings(res.data.user);
      setSuccess(`Welcome to PharmaCare Pro! Your ${res.data.user.pharmacyType} account is ready.`);
    } catch (e) {
      setError(e.response?.data?.error || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  if (success) {
    return (
      <div className="auth-panel" style={{ textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🎉</div>
        <h2 className="auth-title">Account Created!</h2>
        <p style={{ color:'#64748b', margin:'12px 0 24px' }}>{success}</p>
        <button className="btn btn-primary" style={{ width:'100%' }} onClick={() => navigate('/')}>
          Go to Dashboard →
        </button>
      </div>
    );
  }

  return (
    <div className="auth-panel">
      <h2 className="auth-title">Create Account</h2>
      <p className="auth-subtitle">Register your pharmacy</p>

      {/* Pharmacy type toggle — Wholesale Pharma | Retail Pharmacy */}
      <div className="auth-mode-toggle" style={{ marginBottom:16 }}>
        <button type="button"
          className={`auth-mode-btn${!isWS?' active':''}`}
          style={!isWS?{borderColor:'#10b981',background:'#f0fdf4',color:'#166534'}:{}}
          onClick={() => setType('Retail Pharmacy')}>
          Retail Pharmacy
        </button>
        <button type="button"
          className={`auth-mode-btn${isWS?' active':''}`}
          style={isWS?{borderColor:'#1e40af',background:'#eff6ff',color:'#1e40af'}:{}}
          onClick={() => setType('Wholesale Pharma')}>
          Wholesale Pharma
        </button>
      </div>

      {/* Wholesale-specific */}
      {isWS && <>
        <Field label="Owner Name *"             id="reg-owner"  value={ownerName}    onChange={e=>setOwnerName(e.target.value)}    placeholder="Wholesaler owner full name" />
        <Field label="Business Name *"          id="reg-biz"    value={wholesaler}   onChange={e=>setWholesaler(e.target.value)}   placeholder="Wholesale business name" />
        <Field label="Wholesaler ID (optional)" id="reg-wsid"   value={wholesalerId} onChange={e=>setWholesalerId(e.target.value)} placeholder="e.g. WS-2024-001" />
      </>}

      {/* Retail-specific */}
      {!isWS && <>
        <Field label="Shop / Store Name *"  id="reg-shop"   value={shopName}      onChange={e=>setShopName(e.target.value)}      placeholder="Your pharmacy name" />
        <Field label="Owner / Proprietor *" id="reg-owner2" value={retailerOwner} onChange={e=>setRetailerOwner(e.target.value)} placeholder="Owner full name" />
      </>}

      {/* Common fields */}
      <Field label="Email *"           id="reg-email" type="email" value={email}   onChange={e=>setEmail(e.target.value)}   placeholder="pharmacy@email.com" />
      <Field label="Phone *"           id="reg-phone" type="tel"   value={phone}   onChange={e=>setPhone(e.target.value)}   placeholder="10-digit mobile number" />
      <Field label="Drug License No. *"id="reg-lic"               value={license}  onChange={e=>setLicense(e.target.value)} placeholder="e.g. MH-MUM-123456" />

      <div className="form-group">
        <label className="form-label">GSTIN *</label>
        <input className="form-input" type="text" value={gstin}
          onChange={e=>setGstin(e.target.value.toUpperCase())}
          placeholder="27ABCDE1234F1Z5" maxLength={15} />
        <div className="form-hint" style={{ color: gstin && !GSTIN_RE.test(gstin)?'#ef4444':'#94a3b8' }}>
          {gstin && !GSTIN_RE.test(gstin) ? '⚠ Invalid GSTIN format' : 'Format: 15-character alphanumeric'}
        </div>
      </div>

      <Field label="Address" id="reg-addr" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Store address" />
      <Field label="Password *"        id="reg-pw"  type="password" value={password}  onChange={e=>setPassword(e.target.value)}  placeholder="Min 8 chars, letters + numbers" />
      <Field label="Confirm Password *"id="reg-cpw" type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter password" />

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:4 }}>
        <div className="form-group">
          <label className="form-label">Default GST %</label>
          <input className="form-input" type="number" value={defaultGst} onChange={e=>setDefaultGst(e.target.value)} min="0" max="28" />
        </div>
        <div className="form-group">
          <label className="form-label">Low Stock Qty</label>
          <input className="form-input" type="number" value={lowStock}   onChange={e=>setLowStock(e.target.value)}   min="1" />
        </div>
        <div className="form-group">
          <label className="form-label">Expiry Alert Days</label>
          <input className="form-input" type="number" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)} min="1" />
        </div>
      </div>

      {error && <div style={{ color:'#ef4444', fontSize:13, marginBottom:8 }}>{error}</div>}

      <button className="btn btn-primary" style={{ width:'100%' }} onClick={handleRegister} disabled={loading}>
        {loading ? 'Creating account…' : 'Create Account ✓'}
      </button>
      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => onSwitch('login')}>Already registered? Sign In</button>
      </div>
    </div>
  );
}

// ── FORGOT PASSWORD PANEL ────────────────────────────────────────────────────
// mirrors fpSendOtp() + fpConfirm() in app.js
function ForgotPanel({ onSwitch }) {
  const [identifier, setIdentifier] = useState('');
  const [newPw, setNewPw]           = useState('');
  const [confirmPw, setConfirmPw]   = useState('');
  const [otp, setOtp]               = useState('');
  const [otpSent, setOtpSent]       = useState(false);
  const [devOtp, setDevOtp]         = useState('');
  const [error, setError]           = useState('');
  const [otpError, setOtpError]     = useState('');
  const [loading, setLoading]       = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleSendOtp() {
    setError('');
    if (!identifier)             { setError('Please enter your GSTIN or Drug License No.'); return; }
    if (!newPw)                  { setError('Please enter a new password.'); return; }
    if (newPw.length < 8)       { setError('Password must be at least 8 characters.'); return; }
    if (!/[A-Za-z]/.test(newPw)){ setError('Password must contain at least one letter.'); return; }
    if (!/[0-9]/.test(newPw))   { setError('Password must contain at least one number.'); return; }
    if (newPw !== confirmPw)     { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const res = await client.post('/auth/forgot-password/send-otp', { identifier, newPassword: newPw });
      setOtpSent(true);
      if (res.data.devOtp) { setDevOtp(res.data.devOtp); setOtp(res.data.devOtp); }
    } catch (e) {
      setError(e.response?.data?.error || 'Server error — please try again.');
    } finally { setLoading(false); }
  }

  async function handleConfirm() {
    setOtpError('');
    if (otp.length !== 6) { setOtpError('Enter the 6-digit OTP.'); return; }
    setConfirming(true);
    try {
      await client.post('/auth/forgot-password/reset', { identifier, otp, newPassword: newPw });
      alert('Password reset successfully! Please sign in with your new password.');
      onSwitch('login');
    } catch (e) {
      setOtpError(e.response?.data?.error || 'Invalid OTP. Please try again.');
    } finally { setConfirming(false); }
  }

  return (
    <div className="auth-panel">
      <h2 className="auth-title">Reset Password</h2>
      <p className="auth-subtitle">Enter your GSTIN or Drug License to receive an OTP</p>

      <Field label="GSTIN or Drug License No." id="fp-id"
        value={identifier} onChange={e=>setIdentifier(e.target.value)}
        placeholder="Your registered identifier" />
      <Field label="New Password"     id="fp-pw"  type="password" value={newPw}    onChange={e=>setNewPw(e.target.value)}    placeholder="Min 8 chars, letters + numbers" />
      <Field label="Confirm Password" id="fp-cpw" type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter new password" />

      {error && <div style={{ color:'#ef4444', fontSize:13, marginBottom:8 }}>{error}</div>}

      <button className="btn btn-primary" style={{ width:'100%', marginBottom:12 }}
        onClick={handleSendOtp} disabled={loading}>
        {loading ? 'Sending OTP…' : otpSent ? 'Resend OTP' : 'Send OTP to Registered Email'}
      </button>

      {otpSent && <>
        {devOtp && (
          <div className="form-hint" style={{ color:'#f59e0b', marginBottom:8 }}>
            Dev mode: OTP is {devOtp} (email not configured — auto-filled)
          </div>
        )}
        <Field label="Enter OTP (6 digits)" id="fp-otp"
          value={otp} onChange={e=>setOtp(e.target.value)}
          placeholder="6-digit OTP from email" error={otpError} />
        <button className="btn btn-primary" style={{ width:'100%', opacity: otp.length!==6?0.5:1 }}
          onClick={handleConfirm} disabled={confirming || otp.length!==6}>
          {confirming ? 'Confirming…' : 'Confirm Reset'}
        </button>
      </>}

      <div className="auth-links">
        <button type="button" className="auth-link" onClick={() => onSwitch('login')}>← Back to Sign In</button>
      </div>
    </div>
  );
}

// ── ROOT AuthPage ─────────────────────────────────────────────────────────────
export default function AuthPage({ mode = 'login' }) {
  const [panel, setPanel] = useState(mode);
  return (
    <div className="auth-overlay" style={{ display:'flex' }}>
      <div className="auth-container">
        {panel === 'login'    && <LoginPanel    onSwitch={setPanel} />}
        {panel === 'register' && <RegisterPanel onSwitch={setPanel} />}
        {panel === 'forgot'   && <ForgotPanel   onSwitch={setPanel} />}
      </div>
    </div>
  );
}
