import axios from 'axios';

// Same key vanilla JS uses: localStorage.getItem('pharmacare_jwt')
const AUTH_TOKEN_KEY = 'pharmacare_jwt';

const client = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attaches JWT to every request automatically
// Replaces the manual headers['Authorization'] = 'Bearer ' + token in authFetch()
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — if JWT expired/invalid, clear token and redirect to login
client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      window.location.href = '/';
    }
    return Promise.reject(error);
  }
);

// Auth token helpers — mirrors vanilla JS getAuthToken/setAuthToken/clearAuthToken
export const getAuthToken  = ()  => localStorage.getItem(AUTH_TOKEN_KEY) || '';
export const setAuthToken  = (t) => localStorage.setItem(AUTH_TOKEN_KEY, t);
export const clearAuthToken = () => localStorage.removeItem(AUTH_TOKEN_KEY);

export default client;
