import { describe, expect, it } from 'vitest';
import { createDatabase } from '../db.js';

describe('advanced database features', () => {
  it('stores groups, group memberships, schedules, and per-device history', () => {
    const db = createDatabase(':memory:');
    const site = db.createSite({ name: 'Office', type: 'local', broadcastAddress: '192.168.10.255' });
    const device = db.createDevice({ name: 'Workstation', macAddress: 'aabbcc001122', ipAddress: '192.168.10.20', siteId: site.id, note: '' });

    const group = db.createGroup({ name: 'Morning Startup', deviceIds: [device.id] });
    const schedule = db.createSchedule({ name: 'Weekday boot', action: 'wake', timeOfDay: '07:30', enabled: true, deviceId: device.id, groupId: null });
    db.createWakeEvent({ deviceId: device.id, siteId: site.id, status: 'success', message: 'Wake command sent' });

    expect(db.listGroups()).toMatchObject([{ id: group.id, name: 'Morning Startup', deviceIds: [device.id] }]);
    expect(db.listSchedules()).toMatchObject([{ id: schedule.id, name: 'Weekday boot', action: 'wake', timeOfDay: '07:30', enabled: true }]);
    expect(db.listWakeEventsForDevice(device.id)).toMatchObject([{ deviceName: 'Workstation', status: 'success' }]);
  });

  it('exports and imports a complete backup', () => {
    const source = createDatabase(':memory:');
    const site = source.createSite({ name: 'Remote', type: 'ssh', broadcastAddress: '192.168.20.255', sshHost: 'relay.local', sshPort: 22, sshUser: 'relay', sshKeyPath: '/key', remoteCommand: 'wakeonlan -i {broadcast} {mac}', shutdownCommand: 'ssh host sudo shutdown -h now', rebootCommand: 'ssh host sudo reboot' });
    const device = source.createDevice({ name: 'Box', macAddress: 'aabbcc001122', ipAddress: '192.168.20.20', siteId: site.id, note: 'important' });
    source.createGroup({ name: 'All', deviceIds: [device.id] });
    const backup = source.exportBackup();

    const target = createDatabase(':memory:');
    target.importBackup(backup);

    expect(target.listSites()).toMatchObject([{ name: 'Remote', shutdownCommand: 'ssh host sudo shutdown -h now' }]);
    expect(target.listDevices()).toMatchObject([{ name: 'Box', macAddress: 'aa:bb:cc:00:11:22' }]);
    expect(target.listGroups()).toMatchObject([{ name: 'All', deviceIds: [device.id] }]);
  });
});
