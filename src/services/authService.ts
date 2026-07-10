import api from './api';

export const register = (data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  // Optional multi-country location captured at signup so the Discover feed
  // can rank stores closest-first.
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  street?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: string;
}) => api.post('/api/buyer/auth/register', data);

export const login = (data: { email: string; password: string }) =>
  api.post('/api/buyer/auth/login', data);

export const logout = () => api.post('/api/buyer/auth/logout');

export const getMe = () => api.get('/api/buyer/auth/me');

// Edit names + phone (non-sensitive, direct).
export const updateBuyerProfile = (data: {
  firstName?: string;
  lastName?: string;
  phone?: string;
}) => api.patch('/api/buyer/profile', data);

// Password change — no old password; confirm via a 6-digit emailed code.
export const sendPasswordChangeCode = () => api.post('/api/buyer/password/change/send-code');
export const confirmPasswordChange = (data: { code: string; newPassword: string }) =>
  api.post('/api/buyer/password/change/confirm', data);

// Email change — self-service: we email a confirmation link to the new address.
export const requestEmailChange = (data: { newEmail: string }) =>
  api.post('/api/buyer/email-change/request', data);
export const getEmailChangeRequests = () => api.get('/api/buyer/email-change/mine');

// Set/update the signed-in buyer's location (the "add your location" prompt).
export const updateBuyerLocation = (data: {
  country?: string;
  countryCode?: string;
  state?: string;
  city?: string;
  street?: string;
  latitude?: number | null;
  longitude?: number | null;
  locationSource?: string;
}) => api.patch('/api/buyer/location', data);
