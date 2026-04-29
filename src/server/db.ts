import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { assertIpv4, normalizeMacAddress, parsePort } from './validation.js';

export type SiteType = 'local' | 'ssh';
export type PowerAction = 'wake' | 'shutdown' | 'reboot';

export interface SiteInput {
  name: string;
  type: SiteType;
  broadcastAddress: string;
  sshHost?: string | null;
  sshPort?: number | string | null;
  sshUser?: string | null;
  sshKeyPath?: string | null;
  remoteCommand?: string | null;
  shutdownCommand?: string | null;
  rebootCommand?: string | null;
}

export interface Site extends Required<Omit<SiteInput, 'sshPort'>> {
  id: string;
  sshPort: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceInput {
  name: string;
  macAddress: string;
  ipAddress: string;
  siteId: string;
  note?: string | null;
}

export interface Device {
  id: string;
  name: string;
  macAddress: string;
  ipAddress: string;
  siteId: string;
  siteName?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface WakeEventInput {
  deviceId: string;
  siteId: string;
  status: 'success' | 'error';
  message: string;
}

export interface WakeEvent extends WakeEventInput {
  id: string;
  deviceName?: string;
  siteName?: string;
  createdAt: string;
}

export interface GroupInput {
  name: string;
  deviceIds: string[];
}

export interface DeviceGroup extends GroupInput {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  name: string;
  action: PowerAction;
  timeOfDay: string;
  enabled: boolean;
  deviceId?: string | null;
  groupId?: string | null;
}

export interface Schedule extends Required<ScheduleInput> {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface BackupData {
  version: 1;
  exportedAt: string;
  sites: Site[];
  devices: Device[];
  groups: DeviceGroup[];
  schedules: Schedule[];
}

export function createDatabase(filename: string) {
  const sqlite = new Database(filename);
  sqlite.pragma('foreign_keys = ON');
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('local', 'ssh')),
      broadcast_address TEXT NOT NULL,
      ssh_host TEXT,
      ssh_port INTEGER,
      ssh_user TEXT,
      ssh_key_path TEXT,
      remote_command TEXT,
      shutdown_command TEXT,
      reboot_command TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS devices (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mac_address TEXT NOT NULL,
      ip_address TEXT NOT NULL,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS wake_events (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      site_id TEXT NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('success', 'error')),
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_devices (
      group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
      device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      PRIMARY KEY (group_id, device_id)
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('wake', 'shutdown', 'reboot')),
      time_of_day TEXT NOT NULL,
      enabled INTEGER NOT NULL,
      device_id TEXT REFERENCES devices(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES groups(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK ((device_id IS NOT NULL AND group_id IS NULL) OR (device_id IS NULL AND group_id IS NOT NULL))
    );
  `);

  for (const statement of [
    'ALTER TABLE sites ADD COLUMN shutdown_command TEXT',
    'ALTER TABLE sites ADD COLUMN reboot_command TEXT'
  ]) {
    try { sqlite.exec(statement); } catch { /* existing database already has the column */ }
  }

  const now = () => new Date().toISOString();

  function normalizeSite(input: SiteInput) {
    const type = input.type;
    if (type !== 'local' && type !== 'ssh') throw new Error('Invalid site type');
    const name = input.name.trim();
    if (!name) throw new Error('Site name is required');
    const broadcastAddress = assertIpv4(input.broadcastAddress, 'broadcast address');
    const sshPort = input.sshPort === undefined || input.sshPort === null || input.sshPort === '' ? null : parsePort(input.sshPort);

    return {
      name,
      type,
      broadcastAddress,
      sshHost: input.sshHost?.trim() || null,
      sshPort,
      sshUser: input.sshUser?.trim() || null,
      sshKeyPath: input.sshKeyPath?.trim() || null,
      remoteCommand: input.remoteCommand?.trim() || 'wakeonlan -i {broadcast} {mac}',
      shutdownCommand: input.shutdownCommand?.trim() || null,
      rebootCommand: input.rebootCommand?.trim() || null
    };
  }

  function normalizeDevice(input: DeviceInput) {
    const name = input.name.trim();
    if (!name) throw new Error('Device name is required');
    return {
      name,
      macAddress: normalizeMacAddress(input.macAddress),
      ipAddress: assertIpv4(input.ipAddress, 'device IP address'),
      siteId: input.siteId,
      note: input.note?.trim() ?? ''
    };
  }

  function normalizeGroup(input: GroupInput) {
    const name = input.name.trim();
    if (!name) throw new Error('Group name is required');
    return { name, deviceIds: [...new Set(input.deviceIds || [])] };
  }

  function normalizeSchedule(input: ScheduleInput) {
    const name = input.name.trim();
    if (!name) throw new Error('Schedule name is required');
    if (!['wake', 'shutdown', 'reboot'].includes(input.action)) throw new Error('Invalid schedule action');
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.timeOfDay)) throw new Error('Invalid schedule time');
    const deviceId = input.deviceId || null;
    const groupId = input.groupId || null;
    if ((deviceId && groupId) || (!deviceId && !groupId)) throw new Error('Schedule needs exactly one target');
    return { name, action: input.action, timeOfDay: input.timeOfDay, enabled: Boolean(input.enabled), deviceId, groupId };
  }

  function mapSite(row: any): Site {
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      broadcastAddress: row.broadcast_address,
      sshHost: row.ssh_host,
      sshPort: row.ssh_port,
      sshUser: row.ssh_user,
      sshKeyPath: row.ssh_key_path,
      remoteCommand: row.remote_command,
      shutdownCommand: row.shutdown_command,
      rebootCommand: row.reboot_command,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapDevice(row: any): Device {
    return {
      id: row.id,
      name: row.name,
      macAddress: row.mac_address,
      ipAddress: row.ip_address,
      siteId: row.site_id,
      siteName: row.site_name,
      note: row.note,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  function mapSchedule(row: any): Schedule {
    return {
      id: row.id,
      name: row.name,
      action: row.action,
      timeOfDay: row.time_of_day,
      enabled: Boolean(row.enabled),
      deviceId: row.device_id,
      groupId: row.group_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  const api = {
    sqlite,
    createSite(input: SiteInput): Site {
      const site = normalizeSite(input);
      const id = randomUUID();
      const timestamp = now();
      sqlite.prepare(`INSERT INTO sites (id, name, type, broadcast_address, ssh_host, ssh_port, ssh_user, ssh_key_path, remote_command, shutdown_command, reboot_command, created_at, updated_at) VALUES (@id, @name, @type, @broadcastAddress, @sshHost, @sshPort, @sshUser, @sshKeyPath, @remoteCommand, @shutdownCommand, @rebootCommand, @createdAt, @updatedAt)`).run({ id, ...site, createdAt: timestamp, updatedAt: timestamp });
      return api.getSite(id)!;
    },
    listSites(): Site[] {
      return sqlite.prepare('SELECT * FROM sites ORDER BY name').all().map(mapSite);
    },
    getSite(id: string): Site | undefined {
      const row = sqlite.prepare('SELECT * FROM sites WHERE id = ?').get(id);
      return row ? mapSite(row) : undefined;
    },
    updateSite(id: string, input: SiteInput): Site {
      const site = normalizeSite(input);
      sqlite.prepare(`UPDATE sites SET name=@name, type=@type, broadcast_address=@broadcastAddress, ssh_host=@sshHost, ssh_port=@sshPort, ssh_user=@sshUser, ssh_key_path=@sshKeyPath, remote_command=@remoteCommand, shutdown_command=@shutdownCommand, reboot_command=@rebootCommand, updated_at=@updatedAt WHERE id=@id`).run({ id, ...site, updatedAt: now() });
      const updated = api.getSite(id);
      if (!updated) throw new Error('Site not found');
      return updated;
    },
    deleteSite(id: string): void {
      sqlite.prepare('DELETE FROM sites WHERE id = ?').run(id);
    },
    createDevice(input: DeviceInput): Device {
      const device = normalizeDevice(input);
      const id = randomUUID();
      const timestamp = now();
      sqlite.prepare(`INSERT INTO devices VALUES (@id, @name, @macAddress, @ipAddress, @siteId, @note, @createdAt, @updatedAt)`).run({ id, ...device, createdAt: timestamp, updatedAt: timestamp });
      return api.getDevice(id)!;
    },
    listDevices(): Device[] {
      return sqlite.prepare(`SELECT devices.*, sites.name AS site_name FROM devices JOIN sites ON sites.id = devices.site_id ORDER BY sites.name, devices.name`).all().map(mapDevice);
    },
    getDevice(id: string): Device | undefined {
      const row = sqlite.prepare(`SELECT devices.*, sites.name AS site_name FROM devices JOIN sites ON sites.id = devices.site_id WHERE devices.id = ?`).get(id);
      return row ? mapDevice(row) : undefined;
    },
    updateDevice(id: string, input: DeviceInput): Device {
      const device = normalizeDevice(input);
      sqlite.prepare(`UPDATE devices SET name=@name, mac_address=@macAddress, ip_address=@ipAddress, site_id=@siteId, note=@note, updated_at=@updatedAt WHERE id=@id`).run({ id, ...device, updatedAt: now() });
      const updated = api.getDevice(id);
      if (!updated) throw new Error('Device not found');
      return updated;
    },
    deleteDevice(id: string): void {
      sqlite.prepare('DELETE FROM devices WHERE id = ?').run(id);
    },
    createWakeEvent(input: WakeEventInput): WakeEvent {
      const id = randomUUID();
      sqlite.prepare('INSERT INTO wake_events VALUES (?, ?, ?, ?, ?, ?)').run(id, input.deviceId, input.siteId, input.status, input.message, now());
      return api.listWakeEvents().find((event) => event.id === id)!;
    },
    listWakeEvents(): WakeEvent[] {
      return sqlite.prepare(`
        SELECT wake_events.*, devices.name AS device_name, sites.name AS site_name
        FROM wake_events
        JOIN devices ON devices.id = wake_events.device_id
        JOIN sites ON sites.id = wake_events.site_id
        ORDER BY wake_events.created_at DESC
        LIMIT 100
      `).all().map((row: any) => ({
        id: row.id,
        deviceId: row.device_id,
        siteId: row.site_id,
        deviceName: row.device_name,
        siteName: row.site_name,
        status: row.status,
        message: row.message,
        createdAt: row.created_at
      }));
    },
    listWakeEventsForDevice(deviceId: string): WakeEvent[] {
      return api.listWakeEvents().filter((event) => event.deviceId === deviceId);
    },
    createGroup(input: GroupInput): DeviceGroup {
      const group = normalizeGroup(input);
      const id = randomUUID();
      const timestamp = now();
      sqlite.prepare('INSERT INTO groups VALUES (?, ?, ?, ?)').run(id, group.name, timestamp, timestamp);
      for (const deviceId of group.deviceIds) sqlite.prepare('INSERT INTO group_devices VALUES (?, ?)').run(id, deviceId);
      return api.getGroup(id)!;
    },
    listGroups(): DeviceGroup[] {
      return sqlite.prepare('SELECT * FROM groups ORDER BY name').all().map((row: any) => api.getGroup(row.id)!);
    },
    getGroup(id: string): DeviceGroup | undefined {
      const row: any = sqlite.prepare('SELECT * FROM groups WHERE id = ?').get(id);
      if (!row) return undefined;
      const deviceIds = sqlite.prepare('SELECT device_id FROM group_devices WHERE group_id = ? ORDER BY device_id').all(id).map((item: any) => item.device_id);
      return { id: row.id, name: row.name, deviceIds, createdAt: row.created_at, updatedAt: row.updated_at };
    },
    updateGroup(id: string, input: GroupInput): DeviceGroup {
      const group = normalizeGroup(input);
      sqlite.prepare('UPDATE groups SET name = ?, updated_at = ? WHERE id = ?').run(group.name, now(), id);
      sqlite.prepare('DELETE FROM group_devices WHERE group_id = ?').run(id);
      for (const deviceId of group.deviceIds) sqlite.prepare('INSERT INTO group_devices VALUES (?, ?)').run(id, deviceId);
      const updated = api.getGroup(id);
      if (!updated) throw new Error('Group not found');
      return updated;
    },
    deleteGroup(id: string): void {
      sqlite.prepare('DELETE FROM groups WHERE id = ?').run(id);
    },
    listDevicesForGroup(id: string): Device[] {
      return sqlite.prepare(`SELECT devices.*, sites.name AS site_name FROM group_devices JOIN devices ON devices.id = group_devices.device_id JOIN sites ON sites.id = devices.site_id WHERE group_devices.group_id = ? ORDER BY devices.name`).all(id).map(mapDevice);
    },
    createSchedule(input: ScheduleInput): Schedule {
      const schedule = normalizeSchedule(input);
      const id = randomUUID();
      const timestamp = now();
      sqlite.prepare(`INSERT INTO schedules VALUES (@id, @name, @action, @timeOfDay, @enabled, @deviceId, @groupId, @createdAt, @updatedAt)`).run({ id, ...schedule, enabled: schedule.enabled ? 1 : 0, createdAt: timestamp, updatedAt: timestamp });
      return api.getSchedule(id)!;
    },
    listSchedules(): Schedule[] {
      return sqlite.prepare('SELECT * FROM schedules ORDER BY time_of_day, name').all().map(mapSchedule);
    },
    getSchedule(id: string): Schedule | undefined {
      const row = sqlite.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
      return row ? mapSchedule(row) : undefined;
    },
    updateSchedule(id: string, input: ScheduleInput): Schedule {
      const schedule = normalizeSchedule(input);
      sqlite.prepare(`UPDATE schedules SET name=@name, action=@action, time_of_day=@timeOfDay, enabled=@enabled, device_id=@deviceId, group_id=@groupId, updated_at=@updatedAt WHERE id=@id`).run({ id, ...schedule, enabled: schedule.enabled ? 1 : 0, updatedAt: now() });
      const updated = api.getSchedule(id);
      if (!updated) throw new Error('Schedule not found');
      return updated;
    },
    deleteSchedule(id: string): void {
      sqlite.prepare('DELETE FROM schedules WHERE id = ?').run(id);
    },
    exportBackup(): BackupData {
      return { version: 1, exportedAt: now(), sites: api.listSites(), devices: api.listDevices(), groups: api.listGroups(), schedules: api.listSchedules() };
    },
    importBackup(backup: BackupData): void {
      if (backup.version !== 1) throw new Error('Unsupported backup version');
      const tx = sqlite.transaction(() => {
        sqlite.prepare('DELETE FROM schedules').run();
        sqlite.prepare('DELETE FROM group_devices').run();
        sqlite.prepare('DELETE FROM groups').run();
        sqlite.prepare('DELETE FROM wake_events').run();
        sqlite.prepare('DELETE FROM devices').run();
        sqlite.prepare('DELETE FROM sites').run();
        for (const site of backup.sites) sqlite.prepare(`INSERT INTO sites (id, name, type, broadcast_address, ssh_host, ssh_port, ssh_user, ssh_key_path, remote_command, shutdown_command, reboot_command, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(site.id, site.name, site.type, site.broadcastAddress, site.sshHost, site.sshPort, site.sshUser, site.sshKeyPath, site.remoteCommand, site.shutdownCommand, site.rebootCommand, site.createdAt, site.updatedAt);
        for (const device of backup.devices) sqlite.prepare('INSERT INTO devices VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(device.id, device.name, normalizeMacAddress(device.macAddress), device.ipAddress, device.siteId, device.note || '', device.createdAt, device.updatedAt);
        for (const group of backup.groups) {
          sqlite.prepare('INSERT INTO groups VALUES (?, ?, ?, ?)').run(group.id, group.name, group.createdAt, group.updatedAt);
          for (const deviceId of group.deviceIds) sqlite.prepare('INSERT INTO group_devices VALUES (?, ?)').run(group.id, deviceId);
        }
        for (const schedule of backup.schedules) sqlite.prepare('INSERT INTO schedules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(schedule.id, schedule.name, schedule.action, schedule.timeOfDay, schedule.enabled ? 1 : 0, schedule.deviceId, schedule.groupId, schedule.createdAt, schedule.updatedAt);
      });
      tx();
    }
  };

  return api;
}

export type EasyWolDatabase = ReturnType<typeof createDatabase>;
