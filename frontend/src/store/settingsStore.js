import { create } from 'zustand';

const useSettingsStore = create((set) => ({
  // ── Defaults ─────────────────────────────────────────────────────────────
  storeName:          'My Pharmacy',
  storeType:          'Retail Pharmacy',
  address:            '',
  phone:              '',
  email:              '',
  license:            '',
  gstin:              '',
  defaultGst:         12,
  currency:           '₹',
  lowStockThreshold:  10,
  expiryAlertDays:    90,
  wholesaler:         '',
  ownerName:          '',
  wholesalerId:       '',
  shopName:           '',
  retailerOwner:      '',
  wholesaleUpiQr:     '',
  retailUpiQr:        '',
  pharmacyTypeLocked: '',
  nextBillNo:         1,

  // ── Actions ───────────────────────────────────────────────────────────────

  // Handles BOTH sources:
  //   /api/settings  → returns storeType directly
  //   /api/auth/login → returns pharmacyType (user object)
  // Both are normalized to storeType here
  setSettings: (data) =>
    set((prev) => ({
      ...prev,
      ...data,
      // Normalize: login sends pharmacyType, settings sends storeType
      storeType: data.storeType || data.pharmacyType || prev.storeType,
      // storeName: prefer storeName, fall back to wholesaler/shopName
      storeName: data.storeName
        || data.wholesaler
        || data.shopName
        || prev.storeName,
    })),

  updateSetting: (key, value) => set((prev) => ({ ...prev, [key]: value })),
}));

export default useSettingsStore;
