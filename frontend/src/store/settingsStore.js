import { create } from 'zustand';

// Replaces STATE.settings from app.js
// Mirrors the exact same fields so nothing in the UI logic changes
const useSettingsStore = create((set) => ({
  // ── Default values match STATE.settings defaults in app.js ───
  storeName:          'My Pharmacy',
  storeType:          'Retail Pharmacy',   // 'Retail Pharmacy' | 'Wholesale Pharma'
  address:            '',
  phone:              '',
  email:              '',
  license:            '',
  gstin:              '',
  defaultGst:         12,
  currency:           '₹',
  lowStockThreshold:  10,
  expiryAlertDays:    90,

  // Wholesale-specific
  wholesaler:         '',
  ownerName:          '',
  wholesalerId:       '',

  // Retail-specific
  shopName:           '',
  retailerOwner:      '',

  // QR codes (base64)
  wholesaleUpiQr:     '',
  retailUpiQr:        '',

  // ── Derived helpers ──────────────────────────────────────────
  // Replaces: (STATE.settings.storeType || '').trim() === 'Wholesale Pharma'
  isWholesale: () => {
    const state = useSettingsStore.getState();
    return (state.storeType || '').trim() === 'Wholesale Pharma';
  },

  // ── Actions ─────────────────────────────────────────────────

  // Bulk-load settings from /api/settings response
  // Mirrors: STATE.settings = { ...STATE.settings, ...serverSettings }
  setSettings: (serverSettings) =>
    set((prev) => ({ ...prev, ...serverSettings })),

  // Update a single field (used in settings form)
  updateSetting: (key, value) =>
    set((prev) => ({ ...prev, [key]: value })),
}));

export default useSettingsStore;
