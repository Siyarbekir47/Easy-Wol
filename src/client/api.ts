export type SiteType = 'local' | 'ssh';

export interface Site {
  id: string;
  name: string;
  type: SiteType;
  broadcastAddress: string;
  sshHost?: string | null;
  sshPort?: number | null;
  sshUser?: string | null;
  sshKeyPath?: string | null;
  remoteCommand?: string | null;
}

export interface Device {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  siteId: string;
  siteName?: string;
  note: string;
}

export interface WakeEvent {
  id: string;
  deviceId: string;
  siteId: string;
  deviceName?: string;
  siteName?: string;
  status: 'success' | 'error';
  message: string;
  createdAt: string;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || response.statusText);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  login(password: string) {
    return requestJson<{ ok: true }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
  },
  me() {
    return requestJson<{ authenticated: true }>('/api/me');
  },
  logout() {
    return requestJson<{ ok: true }>('/api/logout', { method: 'POST' });
  },
  listSites() {
    return requestJson<Site[]>('/api/sites');
  },
  createSite(site: Partial<Site>) {
    return requestJson<Site>('/api/sites', { method: 'POST', body: JSON.stringify(site) });
  },
  deleteSite(id: string) {
    return requestJson<void>(`/api/sites/${id}`, { method: 'DELETE' });
  },
  listDevices() {
    return requestJson<Device[]>('/api/devices');
  },
  createDevice(device: Partial<Device>) {
    return requestJson<Device>('/api/devices', { method: 'POST', body: JSON.stringify(device) });
  },
  deleteDevice(id: string) {
    return requestJson<void>(`/api/devices/${id}`, { method: 'DELETE' });
  },
  wakeDevice(id: string) {
    return requestJson<{ ok: boolean; event: WakeEvent }>(`/api/devices/${id}/wake`, { method: 'POST' });
  },
  deviceStatus(id: string) {
    return requestJson<{ online: boolean }>(`/api/devices/${id}/status`);
  },
  listEvents() {
    return requestJson<WakeEvent[]>('/api/events');
  }
};
