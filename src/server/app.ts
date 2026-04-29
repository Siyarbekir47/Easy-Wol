import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { EasyWolDatabase, Site, Device } from './db.js';
import { sendMagicPacket } from './wol.js';
import { wakeViaSsh } from './sshWake.js';
import { probeTcp } from './status.js';

export interface AppOptions {
  db: EasyWolDatabase;
  adminPassword: string;
  localWake?: (macAddress: string, broadcastAddress: string) => Promise<void>;
  sshWake?: (site: Site, device: Device) => Promise<string>;
}

export function createApp(options: AppOptions) {
  const app = express();
  const localWake = options.localWake ?? sendMagicPacket;
  const sshWake = options.sshWake ?? wakeViaSsh;
  const token = crypto.createHash('sha256').update(options.adminPassword).digest('hex');

  app.use(express.json());
  app.use(cookieParser());

  function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
    if (req.cookies.easy_wol_session === token) {
      next();
      return;
    }
    res.status(401).json({ error: 'Unauthorized' });
  }

  function handleError(res: express.Response, error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(400).json({ error: message });
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

  app.get('/api/sites', requireAuth, (_req, res) => res.json(options.db.listSites()));
  app.post('/api/sites', requireAuth, (req, res) => {
    try {
      res.status(201).json(options.db.createSite(req.body));
    } catch (error) {
      handleError(res, error);
    }
  });
  app.put('/api/sites/:id', requireAuth, (req, res) => {
    try {
      res.json(options.db.updateSite(req.params.id, req.body));
    } catch (error) {
      handleError(res, error);
    }
  });
  app.delete('/api/sites/:id', requireAuth, (req, res) => {
    options.db.deleteSite(req.params.id);
    res.status(204).end();
  });

  app.get('/api/devices', requireAuth, (_req, res) => res.json(options.db.listDevices()));
  app.post('/api/devices', requireAuth, (req, res) => {
    try {
      res.status(201).json(options.db.createDevice(req.body));
    } catch (error) {
      handleError(res, error);
    }
  });
  app.put('/api/devices/:id', requireAuth, (req, res) => {
    try {
      res.json(options.db.updateDevice(req.params.id, req.body));
    } catch (error) {
      handleError(res, error);
    }
  });
  app.delete('/api/devices/:id', requireAuth, (req, res) => {
    options.db.deleteDevice(req.params.id);
    res.status(204).end();
  });

  app.post('/api/devices/:id/wake', requireAuth, async (req, res) => {
    const device = options.db.getDevice(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    const site = options.db.getSite(device.siteId);
    if (!site) {
      res.status(404).json({ error: 'Site not found' });
      return;
    }

    try {
      if (site.type === 'local') await localWake(device.macAddress, site.broadcastAddress);
      else await sshWake(site, device);
      const event = options.db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'success', message: 'Wake command sent' });
      res.json({ ok: true, event });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Wake failed';
      const event = options.db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'error', message });
      res.status(500).json({ ok: false, event, error: message });
    }
  });

  app.get('/api/devices/:id/status', requireAuth, async (req, res) => {
    const device = options.db.getDevice(req.params.id);
    if (!device) {
      res.status(404).json({ error: 'Device not found' });
      return;
    }
    res.json({ online: await probeTcp(device.ipAddress) });
  });

  app.get('/api/events', requireAuth, (_req, res) => res.json(options.db.listWakeEvents()));

  return app;
}
