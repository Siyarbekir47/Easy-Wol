import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { assertIpv4, normalizeMacAddress, parsePort } from './validation.js';

export type SiteType = 'local' | 'ssh';

export interface SiteInput {
  name: string;
  type: SiteType;
  broadcastAddress: string;
  sshHost?: string | null;
  sshPort?: number | string | null;
  sshUser?: string | null;
  sshKeyPath?: string | null;
  remoteCommand?: string | null;
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
  `);

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
      remoteCommand: input.remoteCommand?.trim() || 'wakeonlan -i {broadcast} {mac}'
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

  return {
    sqlite,
    createSite(input: SiteInput): Site {
      const site = normalizeSite(input);
      const id = randomUUID();
      const timestamp = now();
      sqlite.prepare(`INSERT INTO sites VALUES (@id, @name, @type, @broadcastAddress, @sshHost, @sshPort, @sshUser, @sshKeyPath, @remoteCommand, @createdAt, @updatedAt)`).run({ id, ...site, createdAt: timestamp, updatedAt: timestamp });
      return this.getSite(id)!;
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
      sqlite.prepare(`UPDATE sites SET name=@name, type=@type, broadcast_address=@broadcastAddress, ssh_host=@sshHost, ssh_port=@sshPort, ssh_user=@sshUser, ssh_key_path=@sshKeyPath, remote_command=@remoteCommand, updated_at=@updatedAt WHERE id=@id`).run({ id, ...site, updatedAt: now() });
      const updated = this.getSite(id);
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
      return this.getDevice(id)!;
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
      const updated = this.getDevice(id);
      if (!updated) throw new Error('Device not found');
      return updated;
    },
    deleteDevice(id: string): void {
      sqlite.prepare('DELETE FROM devices WHERE id = ?').run(id);
    },
    createWakeEvent(input: WakeEventInput): WakeEvent {
      const id = randomUUID();
      sqlite.prepare('INSERT INTO wake_events VALUES (?, ?, ?, ?, ?, ?)').run(id, input.deviceId, input.siteId, input.status, input.message, now());
      return this.listWakeEvents().find((event) => event.id === id)!;
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
    }
  };
}

export type EasyWolDatabase = ReturnType<typeof createDatabase>;
