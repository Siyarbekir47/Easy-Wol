import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Device, EasyWolDatabase, PowerAction, Site } from './db.js';
import { sendMagicPacket } from './wol.js';
import { buildSiteCommand, executeSshCommand, wakeViaSsh } from './sshWake.js';
import { probeTcp } from './status.js';
import type { SshKeyInfo } from './sshKeys.js';

export interface AppOptions {
  db: EasyWolDatabase;
  adminPassword: string;
  localWake?: (macAddress: string, broadcastAddress: string) => Promise<void>;
  sshWake?: (site: Site, device: Device) => Promise<string>;
  sshCommand?: (site: Site, command: string) => Promise<string>;
  sshKeyProvider?: () => SshKeyInfo[];
  enableScheduler?: boolean;
}

function param(value: string | string[] | undefined): string {
  if (typeof value !== 'string') throw new Error('Invalid route parameter');
  return value;
}

function powerTemplate(site: Site, action: PowerAction): string | null {
  if (action === 'shutdown') return site.shutdownCommand || null;
  if (action === 'reboot') return site.rebootCommand || null;
  return null;
}

export function createApp(options: AppOptions) {
  const app = express();
  const localWake = options.localWake ?? sendMagicPacket;
  const sshWake = options.sshWake ?? wakeViaSsh;
  const sshCommand = options.sshCommand ?? executeSshCommand;
  const sshKeyProvider = options.sshKeyProvider ?? (() => []);
  const token = crypto.createHash('sha256').update(options.adminPassword).digest('hex');

  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.cookies.easy_wol_session === token) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  }

  function handleError(res: express.Response, error: unknown, status = 400) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(status).json({ error: message });
  }

  async function runDeviceAction(device: Device, action: PowerAction) {
    const site = options.db.getSite(device.siteId);
    if (!site) throw new Error('Site not found');

    if (action === 'wake') {
      if (site.type === 'local') await localWake(device.macAddress, site.broadcastAddress);
      else await sshWake(site, device);
      return options.db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'success', message: 'Wake command sent' });
    }

    if (site.type !== 'ssh') throw new Error(`${action} requires an SSH relay site`);
    const template = powerTemplate(site, action);
    if (!template) throw new Error(`${action} command is not configured for this site`);
    const command = buildSiteCommand(template, site, device);
    await sshCommand(site, command);
    return options.db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'success', message: `${action} command sent` });
  }

  async function runGroupAction(groupId: string, action: PowerAction) {
    const devices = options.db.listDevicesForGroup(groupId);
    if (!devices.length) throw new Error('Group has no devices');
    const results = [];
    for (const device of devices) {
      try {
        results.push(await runDeviceAction(device, action));
      } catch (error) {
        const site = options.db.getSite(device.siteId);
        if (site) {
          const message = error instanceof Error ? error.message : `${action} failed`;
          results.push(options.db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'error', message }));
        }
      }
    }
    return results;
  }

  app.post('/api/login', (req, res) => {
    if (req.body?.password !== options.adminPassword) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    res.cookie('easy_wol_session', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ ok: true });
  });

  app.post('/api/logout', (_req, res) => {
    res.clearCookie('easy_wol_session');
    res.json({ ok: true });
  });

  app.get('/api/me', requireAuth, (_req, res) => res.json({ authenticated: true }));
  app.get('/api/ssh-keys', requireAuth, (_req, res) => res.json(sshKeyProvider()));

  app.get('/api/sites', requireAuth, (_req, res) => res.json(options.db.listSites()));
  app.post('/api/sites', requireAuth, (req, res) => {
    try { res.status(201).json(options.db.createSite(req.body)); } catch (error) { handleError(res, error); }
  });
  app.put('/api/sites/:id', requireAuth, (req, res) => {
    try { res.json(options.db.updateSite(param(req.params.id), req.body)); } catch (error) { handleError(res, error); }
  });
  app.delete('/api/sites/:id', requireAuth, (req, res) => {
    options.db.deleteSite(param(req.params.id));
    res.status(204).end();
  });
  app.post('/api/sites/:id/test-relay', requireAuth, async (req, res) => {
    try {
      const site = options.db.getSite(param(req.params.id));
      if (!site) throw new Error('Site not found');
      if (site.type !== 'ssh') throw new Error('Relay test requires an SSH site');
      const output = await sshCommand(site, 'echo easy-wol-relay-ok');
      res.json({ ok: true, output });
    } catch (error) { handleError(res, error); }
  });

  app.get('/api/devices', requireAuth, (_req, res) => res.json(options.db.listDevices()));
  app.post('/api/devices', requireAuth, (req, res) => {
    try { res.status(201).json(options.db.createDevice(req.body)); } catch (error) { handleError(res, error); }
  });
  app.put('/api/devices/:id', requireAuth, (req, res) => {
    try { res.json(options.db.updateDevice(param(req.params.id), req.body)); } catch (error) { handleError(res, error); }
  });
  app.delete('/api/devices/:id', requireAuth, (req, res) => {
    options.db.deleteDevice(param(req.params.id));
    res.status(204).end();
  });
  app.post('/api/devices/:id/wake', requireAuth, async (req, res) => {
    try {
      const device = options.db.getDevice(param(req.params.id));
      if (!device) throw new Error('Device not found');
      const event = await runDeviceAction(device, 'wake');
      res.json({ ok: true, event });
    } catch (error) {
      handleError(res, error, 500);
    }
  });
  app.post('/api/devices/:id/power', requireAuth, async (req, res) => {
    try {
      const action = req.body?.action as PowerAction;
      if (!['shutdown', 'reboot'].includes(action)) throw new Error('Invalid power action');
      const device = options.db.getDevice(param(req.params.id));
      if (!device) throw new Error('Device not found');
      const event = await runDeviceAction(device, action);
      res.json({ ok: true, event });
    } catch (error) { handleError(res, error); }
  });
  app.get('/api/devices/:id/status', requireAuth, async (req, res) => {
    const device = options.db.getDevice(param(req.params.id));
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ online: await probeTcp(device.ipAddress) });
  });
  app.get('/api/devices/:id/events', requireAuth, (req, res) => res.json(options.db.listWakeEventsForDevice(param(req.params.id))));

  app.get('/api/groups', requireAuth, (_req, res) => res.json(options.db.listGroups()));
  app.post('/api/groups', requireAuth, (req, res) => {
    try { res.status(201).json(options.db.createGroup(req.body)); } catch (error) { handleError(res, error); }
  });
  app.put('/api/groups/:id', requireAuth, (req, res) => {
    try { res.json(options.db.updateGroup(param(req.params.id), req.body)); } catch (error) { handleError(res, error); }
  });
  app.delete('/api/groups/:id', requireAuth, (req, res) => {
    options.db.deleteGroup(param(req.params.id));
    res.status(204).end();
  });
  app.post('/api/groups/:id/wake', requireAuth, async (req, res) => {
    try { res.json({ ok: true, events: await runGroupAction(param(req.params.id), 'wake') }); } catch (error) { handleError(res, error); }
  });
  app.post('/api/groups/:id/power', requireAuth, async (req, res) => {
    try {
      const action = req.body?.action as PowerAction;
      if (!['shutdown', 'reboot'].includes(action)) throw new Error('Invalid power action');
      res.json({ ok: true, events: await runGroupAction(param(req.params.id), action) });
    } catch (error) { handleError(res, error); }
  });

  app.get('/api/schedules', requireAuth, (_req, res) => res.json(options.db.listSchedules()));
  app.post('/api/schedules', requireAuth, (req, res) => {
    try { res.status(201).json(options.db.createSchedule(req.body)); } catch (error) { handleError(res, error); }
  });
  app.put('/api/schedules/:id', requireAuth, (req, res) => {
    try { res.json(options.db.updateSchedule(param(req.params.id), req.body)); } catch (error) { handleError(res, error); }
  });
  app.delete('/api/schedules/:id', requireAuth, (req, res) => {
    options.db.deleteSchedule(param(req.params.id));
    res.status(204).end();
  });

  app.get('/api/events', requireAuth, (_req, res) => res.json(options.db.listWakeEvents()));
  app.get('/api/backup', requireAuth, (_req, res) => res.json(options.db.exportBackup()));
  app.post('/api/import', requireAuth, (req, res) => {
    try {
      options.db.importBackup(req.body);
      res.json({ ok: true });
    } catch (error) { handleError(res, error); }
  });

  if (options.enableScheduler) {
    const lastRun = new Map<string, string>();
    const timer = setInterval(async () => {
      const now = new Date();
      const timeOfDay = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const dateKey = now.toISOString().slice(0, 10);
      for (const schedule of options.db.listSchedules()) {
        const runKey = `${schedule.id}:${dateKey}`;
        if (!schedule.enabled || schedule.timeOfDay !== timeOfDay || lastRun.get(schedule.id) === runKey) continue;
        lastRun.set(schedule.id, runKey);
        try {
          if (schedule.deviceId) {
            const device = options.db.getDevice(schedule.deviceId);
            if (device) await runDeviceAction(device, schedule.action);
          } else if (schedule.groupId) {
            await runGroupAction(schedule.groupId, schedule.action);
          }
        } catch {
          // Individual device action handlers already write events where possible.
        }
      }
    }, 30_000);
    timer.unref?.();
  }

  return app;
}
