import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDatabase } from '../db.js';

describe('device-level power management', () => {
  function setup() {
    const db = createDatabase(':memory:');
    const sshCommand = vi.fn().mockResolvedValue('ok');
    const app = createApp({ db, adminPassword: 'secret', sshCommand });
    return { app, db, sshCommand };
  }

  async function authed(app: ReturnType<typeof createApp>) {
    const agent = request.agent(app);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);
    return agent;
  }

  it('stores device os and direct ssh power settings', () => {
    const { db } = setup();
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({
      name: 'Windows PC',
      macAddress: 'aabbcc001122',
      ipAddress: '192.168.1.20',
      siteId: site.id,
      note: '',
      osType: 'windows',
      powerMethod: 'ssh',
      powerSshUser: 'admin',
      powerSshKeyPath: '/app/ssh/windows',
      powerSshPort: 22
    });

    expect(db.getDevice(device.id)).toMatchObject({
      osType: 'windows',
      powerMethod: 'ssh',
      powerSshUser: 'admin',
      powerSshKeyPath: '/app/ssh/windows',
      powerSshPort: 22
    });
  });

  it('reboots a local Windows device through direct SSH using the OS default command', async () => {
    const { app, db, sshCommand } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({
      name: 'Windows PC',
      macAddress: 'aabbcc001122',
      ipAddress: '192.168.1.20',
      siteId: site.id,
      note: '',
      osType: 'windows',
      powerMethod: 'ssh',
      powerSshUser: 'admin',
      powerSshKeyPath: '/app/ssh/windows'
    });

    await agent.post(`/api/devices/${device.id}/power`).send({ action: 'reboot' }).expect(200);

    expect(sshCommand).toHaveBeenCalledWith(expect.objectContaining({ sshHost: '192.168.1.20', sshUser: 'admin', sshKeyPath: '/app/ssh/windows' }), 'shutdown /r /t 0');
  });

  it('shuts down a local Linux device through direct SSH using the OS default command', async () => {
    const { app, db, sshCommand } = setup();
    const agent = await authed(app);
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({
      name: 'Linux Box',
      macAddress: 'aabbcc001123',
      ipAddress: '192.168.1.21',
      siteId: site.id,
      note: '',
      osType: 'linux',
      powerMethod: 'ssh',
      powerSshUser: 'root',
      powerSshKeyPath: '/app/ssh/linux'
    });

    await agent.post(`/api/devices/${device.id}/power`).send({ action: 'shutdown' }).expect(200);

    expect(sshCommand).toHaveBeenCalledWith(expect.objectContaining({ sshHost: '192.168.1.21', sshUser: 'root', sshKeyPath: '/app/ssh/linux' }), 'sudo shutdown -h now');
  });
});
