import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';

describe('database', () => {
  it('creates sites, devices, and wake events', () => {
    const db = createDatabase(':memory:');

    const site = db.createSite({
      name: 'Pi Standort',
      type: 'ssh',
      broadcastAddress: '192.168.50.255',
      sshHost: '100.64.0.10',
      sshPort: 22,
      sshUser: 'pi',
      sshKeyPath: '/app/ssh/id_ed25519',
      remoteCommand: 'wakeonlan -i {broadcast} {mac}'
    });

    const device = db.createDevice({
      name: 'Gaming PC',
      macAddress: 'AA-BB-CC-00-11-22',
      ipAddress: '192.168.50.20',
      siteId: site.id,
      note: 'Desk'
    });

    const event = db.createWakeEvent({
      deviceId: device.id,
      siteId: site.id,
      status: 'success',
      message: 'sent'
    });

    expect(db.listSites()).toMatchObject([{ id: site.id, name: 'Pi Standort', type: 'ssh' }]);
    expect(db.listDevices()).toMatchObject([{ id: device.id, name: 'Gaming PC', macAddress: 'aa:bb:cc:00:11:22' }]);
    expect(db.listWakeEvents()).toMatchObject([{ id: event.id, deviceName: 'Gaming PC', siteName: 'Pi Standort', status: 'success' }]);
  });

  it('updates and deletes devices without deleting the site', () => {
    const db = createDatabase(':memory:');
    const site = db.createSite({ name: 'Local', type: 'local', broadcastAddress: '192.168.1.255' });
    const device = db.createDevice({ name: 'Old', macAddress: 'aabbcc001122', ipAddress: '192.168.1.20', siteId: site.id, note: '' });

    db.updateDevice(device.id, { name: 'New', macAddress: 'aabbcc001122', ipAddress: '192.168.1.21', siteId: site.id, note: 'updated' });
    expect(db.getDevice(device.id)).toMatchObject({ name: 'New', ipAddress: '192.168.1.21', note: 'updated' });

    db.deleteDevice(device.id);
    expect(db.getDevice(device.id)).toBeUndefined();
    expect(db.listSites()).toHaveLength(1);
  });
});
