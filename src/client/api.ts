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
  shutdownCommand?: string | null;
  rebootCommand?: string | null;
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

export interface DeviceGroup {
  id: string;
  name: string;
  deviceIds: string[];
}

export interface Schedule {
  id: string;
  name: string;
  action: 'wake' | 'shutdown' | 'reboot';
  timeOfDay: string;
  enabled: boolean;
  deviceId: string | null;
  groupId: string | null;
}

export interface SshKeyInfo {
  name: string;
  path: string;
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
  listSshKeys() {
    return requestJson<SshKeyInfo[]>('/api/ssh-keys');
  },
  listSites() {
    return requestJson<Site[]>('/api/sites');
  },
  createSite(site: Partial<Site>) {
    return requestJson<Site>('/api/sites', { method: 'POST', body: JSON.stringify(site) });
  },
  updateSite(id: string, site: Partial<Site>) {
    return requestJson<Site>(`/api/sites/${id}`, { method: 'PUT', body: JSON.stringify(site) });
  },
  deleteSite(id: string) {
    return requestJson<void>(`/api/sites/${id}`, { method: 'DELETE' });
  },
  testRelay(id: string) {
    return requestJson<{ ok: boolean; output: string }>(`/api/sites/${id}/test-relay`, { method: 'POST' });
  },
  listDevices() {
    return requestJson<Device[]>('/api/devices');
  },
  createDevice(device: Partial<Device>) {
    return requestJson<Device>('/api/devices', { method: 'POST', body: JSON.stringify(device) });
  },
  updateDevice(id: string, device: Partial<Device>) {
    return requestJson<Device>(`/api/devices/${id}`, { method: 'PUT', body: JSON.stringify(device) });
  },
  deleteDevice(id: string) {
    return requestJson<void>(`/api/devices/${id}`, { method: 'DELETE' });
  },
  wakeDevice(id: string) {
    return requestJson<{ ok: boolean; event: WakeEvent }>(`/api/devices/${id}/wake`, { method: 'POST' });
  },
  powerDevice(id: string, action: 'shutdown' | 'reboot') {
    return requestJson<{ ok: boolean; event: WakeEvent }>(`/api/devices/${id}/power`, { method: 'POST', body: JSON.stringify({ action }) });
  },
  deviceEvents(id: string) {
    return requestJson<WakeEvent[]>(`/api/devices/${id}/events`);
  },
  deviceStatus(id: string) {
    return requestJson<{ online: boolean }>(`/api/devices/${id}/status`);
  },
  listEvents() {
    return requestJson<WakeEvent[]>('/api/events');
  },
  listGroups() {
    return requestJson<DeviceGroup[]>('/api/groups');
  },
  createGroup(group: Partial<DeviceGroup>) {
    return requestJson<DeviceGroup>('/api/groups', { method: 'POST', body: JSON.stringify(group) });
  },
  updateGroup(id: string, group: Partial<DeviceGroup>) {
    return requestJson<DeviceGroup>(`/api/groups/${id}`, { method: 'PUT', body: JSON.stringify(group) });
  },
  deleteGroup(id: string) {
    return requestJson<void>(`/api/groups/${id}`, { method: 'DELETE' });
  },
  wakeGroup(id: string) {
    return requestJson<{ ok: boolean; events: WakeEvent[] }>(`/api/groups/${id}/wake`, { method: 'POST' });
  },
  powerGroup(id: string, action: 'shutdown' | 'reboot') {
    return requestJson<{ ok: boolean; events: WakeEvent[] }>(`/api/groups/${id}/power`, { method: 'POST', body: JSON.stringify({ action }) });
  },
  listSchedules() {
    return requestJson<Schedule[]>('/api/schedules');
  },
  createSchedule(schedule: Partial<Schedule>) {
    return requestJson<Schedule>('/api/schedules', { method: 'POST', body: JSON.stringify(schedule) });
  },
  deleteSchedule(id: string) {
    return requestJson<void>(`/api/schedules/${id}`, { method: 'DELETE' });
  },
  exportBackup() {
    return requestJson<unknown>('/api/backup');
  },
  importBackup(backup: unknown) {
    return requestJson<{ ok: boolean }>('/api/import', { method: 'POST', body: JSON.stringify(backup) });
  }
};
