import { create } from 'zustand';
import { getAuthToken, setAuthToken, clearAuthToken } from '../api/client';

// Replaces the auth-related parts of global STATE in app.js:
//   STATE.settings.storeType, STATE.settings.storeName, etc.
// and the token management: getAuthToken/setAuthToken/clearAuthToken

const useAuthStore = create((set) => ({
  // ── State ─────────────────────────────────────────────────
  token:     getAuthToken(),   // hydrate from localStorage on boot
  user:      null,             // populated after /api/auth/me
  isLoading: true,             // true until /api/auth/me resolves

  // ── Actions ───────────────────────────────────────────────

  // Called after successful login — stores token and user info
  // Mirrors: setAuthToken(t) + STATE.settings = { ...data.settings }
  login: (token, user) => {
    setAuthToken(token);
    set({ token, user, isLoading: false });
  },

  // Called on logout or 401
  // Mirrors: clearAuthToken() + STATE = {} reset
  logout: () => {
    clearAuthToken();
    set({ token: null, user: null, isLoading: false });
  },

  // Called after /api/auth/me succeeds on app boot
  setUser: (user) => set({ user, isLoading: false }),

  // Called when /api/auth/me fails (token invalid/expired)
  clearUser: () => {
    clearAuthToken();
    set({ token: null, user: null, isLoading: false });
  },
}));

export default useAuthStore;
