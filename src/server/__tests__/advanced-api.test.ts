import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDatabase } from '../db.js';

describe('advanced api features', () => {
  function setup() {
    const db = createDatabase(':memory:');
    const localWake = vi.fn().mockResolvedValue(undefined);
    const sshWake = vi.fn().mockResolvedValue('wake ok');
    const sshCommand = vi.fn().mockResolvedValue('command ok');
    const app = createApp({ db, adminPassword: 'secret', localWake, sshWake, sshCommand });
    return { app, db, localWake, sshWake, sshCommand };
  }

  async function authed(app: ReturnType<typeof createApp>) {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);
    return agent;
  }

  it('edits sites and devices', async () => {
    const { app, db } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Old', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({ name: 'Old PC', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.id, note: '' });

    await agent.put(`/api/sites/${site.id}`).send({ name: 'New', type: 'local', broadcastAddress: '192.168.2.255' }).expect(200);
    await agent.put(`/api/devices/${device.id}`).send({ name: 'New PC', macAddress: 'aabbcc001122', ipAddress: '192.168.2.20', siteId: site.id, note: 'edited' }).expect(200);

    expect(db.getSite(site.id)).toMatchObject({ name: 'New', broadcastAddress: '192.168.2.255' });
    expect(db.getDevice(device.id)).toMatchObject({ name: 'New PC', note: 'edited' });
  });

  it('wakes a group and logs one event per device', async () => {
    const { app, db, localWake } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const a = db.createDevice({ name: 'A', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.id, note: '' });
    const b = db.createDevice({ name: 'B', macAddress: 'aabbcc001123', ipAddress: '192.168.1.21', siteId: site.id, note: '' });
    const group = await agent.post('/api/groups').send({ name: 'Both', deviceIds: [a.id, b.id] }).expect(201);

    await agent.post(`/api/groups/${group.body.id}/wake`).expect(200);

    expect(localWake).toHaveBeenCalledTimes(2);
    expect(db.listWakeEvents()).toHaveLength(2);
  });

  it('runs ssh relay test and shutdown command through explicit templates', async () => {
    const { app, db, sshCommand } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Relay', type: 'ssh', broadcastAddress: '192.168.9.255', sshHost: 'relay', sshPort: 22, sshUser: 'user', sshKeyPath: '/key', remoteCommand: 'wakeonlan -i {broadcast} {mac}', shutdownCommand: 'ssh {ip} sudo shutdown -h now', rebootCommand: 'ssh {ip} sudo reboot' });
    const device = db.createDevice({ name: 'Remote', macAddress: 'aabbcc001122', ipAddress: '192.168.9.20', siteId: site.id, note: '' });

    await agent.post(`/api/sites/${site.id}/test-relay`).expect(200);
    await agent.post(`/api/devices/${device.id}/power`).send({ action: 'shutdown' }).expect(200);

    expect(sshCommand).toHaveBeenCalledWith(site, 'echo easy-wol-relay-ok');
    expect(sshCommand).toHaveBeenCalledWith(site, 'ssh 192.168.9.20 sudo shutdown -h now');
  });

  it('creates schedules and imports exported backups', async () => {
    const { app, db } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({ name: 'PC', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.id, note: '' });

    await agent.post('/api/schedules').send({ name: 'Morning', action: 'wake', timeOfDay: '07:30', enabled: true, deviceId: device.id, groupId: null }).expect(201);
    const exported = await agent.get('/api/backup').expect(200);
    await agent.post('/api/import').send(exported.body).expect(200);

    expect((await agent.get('/api/schedules').expect(200)).body).toHaveLength(1);
  });
});
