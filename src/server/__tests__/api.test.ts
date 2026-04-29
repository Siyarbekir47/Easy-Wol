import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createDatabase } from '../db.js';
import { createApp } from '../app.js';

describe('api', () => {
  function setup() {
    const db = createDatabase(':memory:');
    const localWake = vi.fn().mockResolvedValue(undefined);
    const sshWake = vi.fn().mockResolvedValue('remote sent');
    const app = createApp({ db, adminPassword: 'secret', localWake, sshWake });
    return { app, db, localWake, sshWake };
  }

  it('requires login for api routes and sets an auth cookie on valid login', async () => {
    const { app } = setup();

    await request(app).get('/api/sites').expect(401);
    const login = await request(app).post('/api/login').send({ password: 'secret' }).expect(200);

    expect(login.headers['set-cookie']?.[0]).toContain('easy_wol_session=');
  });

  it('creates sites and devices after login', async () => {
    const { app } = setup();
    const agent = request.agent(app);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);

    const site = await agent.post('/api/sites').send({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' }).expect(201);
    const device = await agent.post('/api/devices').send({ name: 'PC', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.body.id, note: '' }).expect(201);

    expect(site.body).toMatchObject({ name: 'Local', type: 'local' });
    expect(device.body).toMatchObject({ name: 'PC', macAddress: 'aa:bb:cc:00:11:22' });
    expect((await agent.get('/api/devices').expect(200)).body).toHaveLength(1);
  });

  it('routes local wake requests to the local sender and logs the event', async () => {
    const { app, db, localWake } = setup();
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({ name: 'PC', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.id, note: '' });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);

    await agent.post(`/api/devices/${device.id}/wake`).expect(200);

    expect(localWake).toHaveBeenCalledWith('aa:bb:cc:00:11:22', '192.168.1.255');
    expect((await agent.get('/api/events').expect(200)).body[0]).toMatchObject({ deviceName: 'PC', status: 'success' });
  });

  it('routes ssh wake requests to the ssh sender', async () => {
    const { app, db, sshWake } = setup();
    const site = db.createSite({ name: 'Pi', type: 'ssh', broadcastAddress: '192.168.50.255', sshHost: '100.64.0.10', sshPort: 22, sshUser: 'pi', sshKeyPath: '/key', remoteCommand: 'wakeonlan -i {broadcast} {mac}' });
    const device = db.createDevice({ name: 'Remote PC', macAddress: 'aabbcc001122', ipAddress: '192.168.50.20', siteId: site.id, note: '' });
    const agent = request.agent(app);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);

    await agent.post(`/api/devices/${device.id}/wake`).expect(200);

    expect(sshWake).toHaveBeenCalledWith(site, device);
  });
});
