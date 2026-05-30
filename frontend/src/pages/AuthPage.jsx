import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client, { setAuthToken } from '../api/client';
import useAuthStore from '../store/authStore';
import useSettingsStore from '../store/settingsStore';

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

function Input({ label, id, type='text', value, onChange, placeholder, hint, error }) {
  const [show, setShow] = useState(false);
  const isPw = type === 'password';
  return (
    <div className="form-group">
      {label && <label className="form-label" htmlFor={id}>{label}</label>}
      <div style={{ position:'relative' }}>
        <input id={id} className="auth-input"
          type={isPw ? (show ? 'text' : 'password') : type}
          value={value} onChange={onChange} placeholder={placeholder} autoComplete="off"
          style={{ borderColor:error?'#ef4444':'', paddingRight:isPw?44:'' }} />
        {isPw && (
          <button type="button" onClick={() => setShow(s=>!s)}
            style={{ position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',
              background:'none',border:'none',cursor:'pointer',fontSize:17,color:'#64748b' }}>
            {show ? '🙈' : '👁'}
          </button>
        )}
      </div>
      {hint  && <div className="form-hint" style={{ color:hint.startsWith('⚠')?'#ef4444':'#94a3b8' }}>{hint}</div>}
      {error && <div className="form-error">{error}</div>}
    </div>
  );
}

// ── Background slideshow — 3 pharmacy images, slide left→right ──────────────
function AuthBackground() {
  return (
    <>
      <div className="auth-slideshow">
        <img className="auth-slide" src="/pic1.jpg"   alt="" />
        <img className="auth-slide" src="/pic2.jpg"   alt="" />
        <img className="auth-slide" src="/pic3.jpeg"  alt="" />
      </div>
      <div className="auth-overlay-bg" />
    </>
  );
}

function AuthHeader() {
  return (
    <div className="auth-header">
      <div className="auth-logo-wrap">
        <img src="/logo.jpeg" alt="PharmaCare Pro" />
      </div>
      <h1 className="auth-title-top">PharmaCare Pro</h1>
      <p className="auth-tagline">Retail &amp; Wholesale Management</p>
    </div>
  );
}

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

  const gstinHint = gstin
    ? (GSTIN_RE.test(gstin) ? '' : '⚠ Invalid format. Expected 15-char like 27ABCDE1234F1Z5')
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
    <>
      <AuthHeader />
      <div className="auth-panel">
        <div>
          <h2 className="auth-panel-title">Sign In</h2>
          <p className="auth-panel-sub">Choose how you want to sign in</p>
        </div>
        <div className="auth-mode-toggle">
          <button type="button" className={`auth-mode-btn${mode==='gstin'?' active':''}`} onClick={() => setMode('gstin')}>
            Sign in with GSTIN
          </button>
          <button type="button" className={`auth-mode-btn${mode==='drug'?' active':''}`} onClick={() => setMode('drug')}>
            Sign in with Drug License
          </button>
        </div>
        {mode === 'gstin' ? (
          <div className="form-group">
            <label className="form-label">GSTIN No. *</label>
            <input className="auth-input" type="text" value={gstin}
              onChange={e => setGstin(e.target.value.toUpperCase())}
              placeholder="E.G. 27ABCDE1234F1Z5" maxLength={15} />
            {gstinHint && <div className="form-hint" style={{ color:gstinHint.startsWith('⚠')?'#ef4444':'#94a3b8' }}>{gstinHint}</div>}
          </div>
        ) : (
          <Input label="Drug License No. *" id="login-drug" value={drug}
            onChange={e => setDrug(e.target.value)} placeholder="e.g. MH-MUM-123456" />
        )}
        <Input label="Password *" id="login-pw" type="password" value={password}
          onChange={e => setPassword(e.target.value)} placeholder="Your password" />
        {error && <div className="form-error" style={{ marginTop:-4 }}>{error}</div>}
        <button className="auth-submit-btn" onClick={handleLogin} disabled={loading}>
          {loading ? 'Signing in…' : 'Sign In →'}
        </button>
        <div className="auth-links">
          <button type="button" className="auth-link" onClick={() => onSwitch('forgot')}>
            Forgot Password?
          </button>
          <div className="auth-register-line">
            Don't have an account?{' '}
            <button type="button" onClick={() => onSwitch('register')}>Register here</button>
          </div>
        </div>
      </div>
    </>
  );
}

function RegisterPanel({ onSwitch }) {
  const [type, setType]               = useState('Retail Pharmacy');
  const isWS                          = type === 'Wholesale Pharma';
  const [email, setEmail]             = useState('');
  const [phone, setPhone]             = useState('');
  const [gstin, setGstin]             = useState('');
  const [license, setLicense]         = useState('');
  const [password, setPassword]       = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [address, setAddress]         = useState('');
  const [defaultGst, setDefaultGst]   = useState('12');
  const [lowStock, setLowStock]       = useState('10');
  const [expiryDays, setExpiryDays]   = useState('90');
  const [ownerName, setOwnerName]     = useState('');
  const [wholesaler, setWholesaler]   = useState('');
  const [wholesalerId, setWholesalerId] = useState('');
  const [shopName, setShopName]         = useState('');
  const [retailerOwner, setRetailerOwner] = useState('');
  const [error, setError]   = useState('');
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
    setLoading(true);
    try {
      const res = await client.post('/auth/register', {
        email, phone, pharmacyType: type, drugLicense: license,
        gstin: gstin.trim().toUpperCase(), password, confirmPassword: confirmPw,
        ownerName: isWS?ownerName:'', wholesaler: isWS?wholesaler:'',
        wholesalerId: isWS?wholesalerId:'', shopName: isWS?'':shopName,
        retailerOwner: isWS?'':retailerOwner, address,
        defaultGst: parseFloat(defaultGst)||12,
        lowStockThreshold: parseInt(lowStock)||10,
        expiryAlertDays: parseInt(expiryDays)||90,
      });
      setAuthToken(res.data.token);
      login(res.data.token, res.data.user);
      if (res.data.user) setSettings(res.data.user);
      setSuccess(`Welcome! Your ${res.data.user.pharmacyType} account is ready.`);
    } catch (e) {
      setError(e.response?.data?.error || 'Registration failed. Please try again.');
    } finally { setLoading(false); }
  }

  if (success) return (
    <>
      <AuthHeader />
      <div className="auth-panel" style={{ textAlign:'center', gap:20 }}>
        <div style={{ fontSize:52 }}>🎉</div>
        <h2 className="auth-panel-title">Account Created!</h2>
        <p style={{ color:'#64748b' }}>{success}</p>
        <button className="auth-submit-btn" onClick={() => navigate('/')}>Go to Dashboard →</button>
      </div>
    </>
  );

  return (
    <>
      <AuthHeader />
      <div className="auth-panel">
        <div>
          <h2 className="auth-panel-title">Create Account</h2>
          <p className="auth-panel-sub">Register your pharmacy</p>
        </div>
        <div className="auth-mode-toggle">
          <button type="button" className={`auth-mode-btn${!isWS?' active':''}`} onClick={() => setType('Retail Pharmacy')}>Retail Pharmacy</button>
          <button type="button" className={`auth-mode-btn${isWS?' active':''}`}  onClick={() => setType('Wholesale Pharma')}>Wholesale Pharma</button>
        </div>
        {isWS && <>
          <Input label="Owner Name *"             id="r1" value={ownerName}    onChange={e=>setOwnerName(e.target.value)}    placeholder="Wholesaler owner full name" />
          <Input label="Business Name *"          id="r2" value={wholesaler}   onChange={e=>setWholesaler(e.target.value)}   placeholder="Wholesale business name" />
          <Input label="Wholesaler ID (optional)" id="r3" value={wholesalerId} onChange={e=>setWholesalerId(e.target.value)} placeholder="e.g. WS-2024-001" />
        </>}
        {!isWS && <>
          <Input label="Shop / Store Name *"  id="r4" value={shopName}      onChange={e=>setShopName(e.target.value)}      placeholder="Your pharmacy name" />
          <Input label="Owner / Proprietor *" id="r5" value={retailerOwner} onChange={e=>setRetailerOwner(e.target.value)} placeholder="Owner full name" />
        </>}
        <Input label="Email *"            id="r6" type="email" value={email}   onChange={e=>setEmail(e.target.value)}   placeholder="pharmacy@email.com" />
        <Input label="Phone *"            id="r7" type="tel"   value={phone}   onChange={e=>setPhone(e.target.value)}   placeholder="10-digit mobile number" />
        <Input label="Drug License No. *" id="r8"              value={license}  onChange={e=>setLicense(e.target.value)} placeholder="e.g. MH-MUM-123456" />
        <div className="form-group">
          <label className="form-label">GSTIN *</label>
          <input className="auth-input" type="text" value={gstin}
            onChange={e=>setGstin(e.target.value.toUpperCase())} placeholder="27ABCDE1234F1Z5" maxLength={15} />
          <div className="form-hint" style={{ color:gstin&&!GSTIN_RE.test(gstin)?'#ef4444':'#94a3b8' }}>
            {gstin&&!GSTIN_RE.test(gstin)?'⚠ Invalid GSTIN format':'Format: 15-character alphanumeric'}
          </div>
        </div>
        <Input label="Address" id="r9" value={address} onChange={e=>setAddress(e.target.value)} placeholder="Store address" />
        <Input label="Password *"         id="r10" type="password" value={password}  onChange={e=>setPassword(e.target.value)}  placeholder="Min 8 chars, letters + numbers" />
        <Input label="Confirm Password *" id="r11" type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter password" />
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
          <div className="form-group">
            <label className="form-label">GST %</label>
            <input className="auth-input" type="number" value={defaultGst} onChange={e=>setDefaultGst(e.target.value)} min="0" max="28" />
          </div>
          <div className="form-group">
            <label className="form-label">Low Stock</label>
            <input className="auth-input" type="number" value={lowStock}   onChange={e=>setLowStock(e.target.value)}   min="1" />
          </div>
          <div className="form-group">
            <label className="form-label">Expiry Days</label>
            <input className="auth-input" type="number" value={expiryDays} onChange={e=>setExpiryDays(e.target.value)} min="1" />
          </div>
        </div>
        {error && <div className="form-error">{error}</div>}
        <button className="auth-submit-btn" onClick={handleRegister} disabled={loading}>
          {loading ? 'Creating account…' : 'Create Account ✓'}
        </button>
        <div className="auth-links">
          <button type="button" className="auth-link" onClick={() => onSwitch('login')}>Already registered? Sign In</button>
        </div>
      </div>
    </>
  );
}

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
    <>
      <AuthHeader />
      <div className="auth-panel">
        <div>
          <h2 className="auth-panel-title">Reset Password</h2>
          <p className="auth-panel-sub">Enter your GSTIN or Drug License to receive an OTP</p>
        </div>
        <Input label="GSTIN or Drug License No." id="fp-id"
          value={identifier} onChange={e=>setIdentifier(e.target.value)}
          placeholder="Your registered identifier" />
        <Input label="New Password"     id="fp-pw"  type="password" value={newPw}    onChange={e=>setNewPw(e.target.value)}    placeholder="Min 8 chars, letters + numbers" />
        <Input label="Confirm Password" id="fp-cpw" type="password" value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} placeholder="Re-enter new password" />
        {error && <div className="form-error">{error}</div>}
        <button className="auth-submit-btn" onClick={handleSendOtp} disabled={loading}>
          {loading ? 'Sending OTP…' : otpSent ? 'Resend OTP' : 'Send OTP to Registered Email'}
        </button>
        {otpSent && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {devOtp && <div className="form-hint" style={{ color:'#f59e0b' }}>Dev mode: OTP is {devOtp} (auto-filled)</div>}
            <Input label="Enter OTP (6 digits)" id="fp-otp"
              value={otp} onChange={e=>setOtp(e.target.value)}
              placeholder="6-digit OTP from email" error={otpError} />
            <button className="auth-submit-btn" style={{ opacity:otp.length!==6?0.55:1 }}
              onClick={handleConfirm} disabled={confirming||otp.length!==6}>
              {confirming ? 'Confirming…' : 'Confirm Reset'}
            </button>
          </div>
        )}
        <div className="auth-links">
          <button type="button" className="auth-link" onClick={() => onSwitch('login')}>← Back to Sign In</button>
        </div>
      </div>
    </>
  );
}

export default function AuthPage({ mode = 'login' }) {
  const [panel, setPanel] = useState(mode);
  return (
    <div className="auth-overlay">
      <AuthBackground />
      <div className="auth-container">
        {panel === 'login'    && <LoginPanel    onSwitch={setPanel} />}
        {panel === 'register' && <RegisterPanel onSwitch={setPanel} />}
        {panel === 'forgot'   && <ForgotPanel   onSwitch={setPanel} />}
      </div>
    </div>
  );
}
