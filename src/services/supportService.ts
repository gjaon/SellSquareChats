/**
 * Buyer support API (chatalog).
 *
 * Talks to the shared buyer support chain (`/api/buyer/support`, protectBuyer)
 * via the app's axios instance (bearer token + 120s timeout already applied by
 * services/api.ts). Same unified SupportTicket backend the merchant web/RN app
 * uses — only the auth chain differs.
 *
 * Attachments go to S3 through the two-step upload; reads stream back through
 * the authenticated, ticket-scoped endpoint (no public bucket URLs), so
 * rendering an attachment needs the buyer's bearer token as a header — see
 * `attachmentUrl` + the token the screen loads from SecureStore.
 */
import api from './api';
import { API_URL } from '../constants/config';

const BASE = '/api/buyer/support';

export interface SupportAttachment {
  key: string;
  url?: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video';
}

export interface SupportMessage {
  _id?: string;
  senderType: 'user' | 'admin';
  senderName?: string;
  body?: string;
  attachments?: SupportAttachment[];
  createdAt?: string;
}

export interface SupportTicket {
  _id: string;
  subject: string;
  category: string;
  status: string;
  priority?: string;
  lastMessageAt?: string;
  lastMessageSenderType?: 'user' | 'admin';
  createdAt?: string;
  messages?: SupportMessage[];
}

export interface PickedAsset {
  uri: string;
  fileName?: string | null;
  type?: string | null;
}

interface ListParams {
  page?: number;
  limit?: number;
  search?: string;
  status?: string | null;
}

export interface TicketListResponse {
  tickets: SupportTicket[];
  total: number | null;
  totalPages: number | null;
  hasMore: boolean;
}

const getTickets = async ({ page, limit, search, status }: ListParams = {}): Promise<TicketListResponse> => {
  const params = new URLSearchParams();
  if (page) params.set('page', String(page));
  if (limit) params.set('limit', String(limit));
  if (search) params.set('search', search);
  if (status) params.set('status', status);
  const { data } = await api.get(`${BASE}/tickets?${params.toString()}`);
  return {
    tickets: data?.tickets || [],
    total: typeof data?.total === 'number' ? data.total : null,
    totalPages: typeof data?.totalPages === 'number' ? data.totalPages : null,
    hasMore: Boolean(data?.hasMore),
  };
};

const getTicket = async (id: string): Promise<SupportTicket | null> =>
  (await api.get(`${BASE}/tickets/${id}`)).data?.ticket || null;

const createTicket = async (payload: {
  subject: string;
  category: string;
  body: string;
  attachments: SupportAttachment[];
}): Promise<SupportTicket | null> =>
  (await api.post(`${BASE}/tickets`, payload)).data?.ticket || null;

const reply = async (
  id: string,
  payload: { body: string; attachments: SupportAttachment[] },
): Promise<SupportTicket | null> =>
  (await api.post(`${BASE}/tickets/${id}/reply`, payload)).data?.ticket || null;

const setStatus = async (id: string, action: 'close' | 'reopen'): Promise<SupportTicket | null> =>
  (await api.post(`${BASE}/tickets/${id}/${action}`)).data?.ticket || null;

// Two-step attachment upload → S3; returns { key, url, mimeType, size, kind }.
const uploadAttachment = async (asset: PickedAsset): Promise<SupportAttachment> => {
  const form = new FormData();
  const isVideo = (asset.type || '').startsWith('video/');
  form.append('file', {
    uri: asset.uri,
    name: asset.fileName || (isVideo ? 'attachment.mp4' : 'attachment.jpg'),
    type: asset.type || (isVideo ? 'video/mp4' : 'image/jpeg'),
  } as any);
  const { data } = await api.post(`${BASE}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
};

// Absolute URL for the authenticated, ticket-scoped attachment stream. The
// caller pairs it with an Authorization header (bearer token loaded from
// SecureStore) on the <Image> source — the bucket is never public.
const attachmentUrl = (key: string) =>
  `${API_URL}${BASE}/attachments?key=${encodeURIComponent(key)}`;

const supportService = {
  getTickets,
  getTicket,
  createTicket,
  reply,
  setStatus,
  uploadAttachment,
  attachmentUrl,
};

export default supportService;
