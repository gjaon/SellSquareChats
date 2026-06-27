import api from './api';

export const getSavedStores = () => api.get('/api/buyer/stores');

export const saveStore = (data: {
  storeToken: string;
  businessName: string;
  businessLogo?: string;
}) => api.post('/api/buyer/stores', data);

export const removeStore = (storeToken: string) =>
  api.delete(`/api/buyer/stores/${storeToken}`);

export const updateStorePreview = (
  storeToken: string,
  data: { lastMessagePreview: string; unreadCount: number }
) => api.patch(`/api/buyer/stores/${storeToken}`, data);
