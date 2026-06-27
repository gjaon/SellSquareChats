import api from './api';

export const register = (data: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
}) => api.post('/api/buyer/auth/register', data);

export const login = (data: { email: string; password: string }) =>
  api.post('/api/buyer/auth/login', data);

export const logout = () => api.post('/api/buyer/auth/logout');

export const getMe = () => api.get('/api/buyer/auth/me');
