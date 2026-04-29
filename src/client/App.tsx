import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Device, DeviceGroup, Schedule, Site, SshKeyInfo, WakeEvent } from './api';
import './styles.css';

const emptySite = { name: '', type: 'local', broadcastAddress: '', sshHost: '', sshPort: 22, sshUser: '', sshKeyPath: '/app/ssh/id_ed25519', remoteCommand: 'wakeonlan -i {broadcast} {mac}', shutdownCommand: 'ssh {ip} sudo shutdown -h now', rebootCommand: 'ssh {ip} sudo reboot' };
const emptyDevice = { name: '', macAddress: '', ipAddress: '', siteId: '', note: '' };
const emptyGroup = { name: '', deviceIds: [] as string[] };
const emptySchedule = { name: '', action: 'wake' as const, timeOfDay: '07:30', enabled: true, deviceId: '', groupId: '' };

type StatusMap = Record<string, 'unknown' | 'online' | 'offline' | 'checking'>;

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([]);
  const [events, setEvents] = useState<WakeEvent[]>([]);
  const [siteForm, setSiteForm] = useState(emptySite);
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [groupForm, setGroupForm] = useState(emptyGroup);
  const [scheduleForm, setScheduleForm] = useState(emptySchedule);
  const [backupText, setBackupText] = useState('');
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [nextSites, nextDevices, nextGroups, nextSchedules, nextEvents, nextSshKeys] = await Promise.all([api.listSites(), api.listDevices(), api.listGroups(), api.listSchedules(), api.listEvents(), api.listSshKeys()]);
    setSites(nextSites);
    setDevices(nextDevices);
    setGroups(nextGroups);
    setSchedules(nextSchedules);
    setEvents(nextEvents);
    setSshKeys(nextSshKeys);
    setDeviceForm((current) => ({ ...current, siteId: current.siteId || nextSites[0]?.id || '' }));
    setScheduleForm((current) => ({ ...current, deviceId: current.deviceId || nextDevices[0]?.id || '', groupId: current.groupId || '' }));
  }

  useEffect(() => {
    api.me().then(() => setAuthenticated(true)).then(refresh).catch(() => setAuthenticated(false));
  }, []);

  const devicesBySite = useMemo(() => sites.map((site) => ({ site, devices: devices.filter((device) => device.siteId === site.id) })), [sites, devices]);

  function showError(error: unknown, fallback: string) {
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.login(password);
      setAuthenticated(true);
      await refresh();
    } catch (error) { showError(error, 'Login failed'); }
  }

  async function createSite(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createSite(siteForm);
      setSiteForm(emptySite);
      await refresh();
    } catch (error) { showError(error, 'Could not create site'); }
  }

  async function createDevice(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createDevice(deviceForm);
      setDeviceForm({ ...emptyDevice, siteId: sites[0]?.id || '' });
      await refresh();
    } catch (error) { showError(error, 'Could not create device'); }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    try {
      await api.createGroup(groupForm);
      setGroupForm(emptyGroup);
      await refresh();
    } catch (error) { showError(error, 'Could not create group'); }
  }

  async function createSchedule(event: FormEvent) {
    event.preventDefault();
    try {
      const target = scheduleForm.groupId ? { groupId: scheduleForm.groupId, deviceId: null } : { deviceId: scheduleForm.deviceId, groupId: null };
      await api.createSchedule({ ...scheduleForm, ...target });
      setScheduleForm({ ...emptySchedule, deviceId: devices[0]?.id || '' });
      await refresh();
    } catch (error) { showError(error, 'Could not create schedule'); }
  }

  async function wake(device: Device) {
    setBusyDevice(device.id);
    setMessage(`Wake for ${device.name}...`);
    try {
      await api.wakeDevice(device.id);
      setMessage(`Wake command for ${device.name} was sent. Status will be checked automatically...`);
      await refresh();
      setTimeout(() => checkStatus(device), 5000);
      setTimeout(() => checkStatus(device), 15000);
      setTimeout(() => checkStatus(device), 30000);
    } catch (error) {
      showError(error, 'Wake failed');
      await refresh();
    } finally { setBusyDevice(null); }
  }

  async function power(device: Device, action: 'shutdown' | 'reboot') {
    if (!window.confirm(`${action === 'shutdown' ? 'Shutdown' : 'Reboot'} for ${device.name}?`)) return;
    try {
      await api.powerDevice(device.id, action);
      setMessage(`${action} for ${device.name} was sent.`);
      await refresh();
    } catch (error) { showError(error, `${action} failed`); }
  }

  async function checkStatus(device: Device) {
    setStatusMap((current) => ({ ...current, [device.id]: 'checking' }));
    try {
      const result = await api.deviceStatus(device.id);
      setStatusMap((current) => ({ ...current, [device.id]: result.online ? 'online' : 'offline' }));
    } catch { setStatusMap((current) => ({ ...current, [device.id]: 'offline' })); }
  }

  async function editSite(site: Site) {
    const name = window.prompt('Site name', site.name);
    if (!name) return;
    const broadcastAddress = window.prompt('Broadcast address', site.broadcastAddress);
    if (!broadcastAddress) return;
    await api.updateSite(site.id, { ...site, name, broadcastAddress });
    await refresh();
  }

  async function editDevice(device: Device) {
    const name = window.prompt('Device name', device.name);
    if (!name) return;
    const ipAddress = window.prompt('IP address', device.ipAddress);
    if (!ipAddress) return;
    await api.updateDevice(device.id, { ...device, name, ipAddress });
    await refresh();
  }

  async function deleteSite(site: Site) {
    const confirmed = window.confirm(`Really delete site "${site.name}"?\n\nAll assigned devices and wake events will also be removed.`);
    if (!confirmed) return;
    await api.deleteSite(site.id);
    await refresh();
  }

  async function exportBackup() {
    const backup = await api.exportBackup();
    setBackupText(JSON.stringify(backup, null, 2));
    setMessage('Backup created. You can save or copy the JSON text.');
  }

  async function importBackup() {
    if (!window.confirm('Import backup? Current sites, devices, groups, and schedules will be replaced.')) return;
    await api.importBackup(JSON.parse(backupText));
    setBackupText('');
    await refresh();
    setMessage('Backup imported.');
  }

  if (!authenticated) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">EW</div>
          <p className="eyebrow">Multi-Site Wake Control</p>
          <h1>Easy-WoL</h1>
          <p className="muted">One control center for devices across multiple networks. Local sites send directly; remote sites use an SSH-capable relay host.</p>
          <form onSubmit={login} className="stack-form">
            <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
            <button className="primary" type="submit">Open Control Center</button>
          </form>
          {message && <p className="alert">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Easy-WoL Control Center</p>
          <h1>Wake-on-LAN for multiple networks.</h1>
          <p className="muted">Magic packets are created at the right site: directly in the local network or through a reachable SSH relay in the target network.</p>
        </div>
        <div className="hero-stats">
          <span><strong>{sites.length}</strong> Sites</span>
          <span><strong>{devices.length}</strong> Devices</span>
          <span><strong>{groups.length}</strong> Groups</span>
          <span><strong>{schedules.length}</strong> Schedules</span>
        </div>
      </header>

      {message && <p className="toast">{message}</p>}

      <section className="grid-layout">
        <div className="workspace">
          {devicesBySite.length === 0 && <div className="empty-panel">Create a site first. Then you can assign and start devices.</div>}
          {devicesBySite.map(({ site, devices }) => (
            <section className="site-panel" key={site.id}>
              <div className="site-header">
                <div>
                  <p className="eyebrow">{site.type === 'local' ? 'Local sender' : 'SSH Relay'}</p>
                  <h2>{site.name}</h2>
                  <p>{site.broadcastAddress}{site.sshHost ? ` · ${site.sshUser}@${site.sshHost}:${site.sshPort || 22}` : ''}</p>
                </div>
                <div className="row-actions">
                  {site.type === 'ssh' && <button className="ghost" onClick={() => api.testRelay(site.id).then((r) => setMessage(`Relay OK: ${r.output}`)).catch((e) => showError(e, 'Relay test failed'))}>Test relay</button>}
                  <button className="ghost" onClick={() => editSite(site)}>Edit</button>
                  <button className="ghost danger" onClick={() => deleteSite(site)}>Delete</button>
                </div>
              </div>

              <div className="device-list">
                {devices.length === 0 && <p className="muted">No devices at this site yet.</p>}
                {devices.map((device) => {
                  const status = statusMap[device.id] || 'unknown';
                  return (
                    <article className="device-row" key={device.id}>
                      <div className={`status-dot ${status}`} />
                      <div className="device-main">
                        <strong>{device.name}</strong>
                        <span>{device.ipAddress} · {device.macAddress}</span>
                        {device.note && <small>{device.note}</small>}
                      </div>
                      <div className="row-actions">
                        <button className="ghost" onClick={() => checkStatus(device)}>{status === 'checking' ? 'Checking...' : 'Status'}</button>
                        <button className="primary" disabled={busyDevice === device.id} onClick={() => wake(device)}>{busyDevice === device.id ? 'Sending...' : 'Wake'}</button>
                        <button className="ghost" onClick={() => power(device, 'reboot')}>Reboot</button>
                        <button className="ghost" onClick={() => power(device, 'shutdown')}>Shutdown</button>
                        <button className="ghost" onClick={() => editDevice(device)}>Edit</button>
                        <button className="ghost danger" onClick={() => api.deleteDevice(device.id).then(refresh)}>Remove</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}

          <section className="site-panel">
            <div className="site-header"><div><p className="eyebrow">Batch actions</p><h2>Groups</h2></div></div>
            <div className="device-list">
              {groups.map((group) => <article className="device-row" key={group.id}><div className="status-dot online" /><div className="device-main"><strong>{group.name}</strong><span>{group.deviceIds.length} Devices</span></div><div className="row-actions"><button className="primary" onClick={() => api.wakeGroup(group.id).then(refresh)}>Wake group</button><button className="ghost" onClick={() => api.powerGroup(group.id, 'reboot').then(refresh)}>Reboot</button><button className="ghost danger" onClick={() => api.deleteGroup(group.id).then(refresh)}>Delete</button></div></article>)}
              {!groups.length && <p className="muted">No groups yet.</p>}
            </div>
          </section>
        </div>

        <aside className="side-panel">
          <section className="form-card">
            <h2>Site</h2>
            <form onSubmit={createSite} className="stack-form">
              <label>Name<input value={siteForm.name} onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })} placeholder="Office site" /></label>
              <label>Type<select value={siteForm.type} onChange={(event) => setSiteForm({ ...siteForm, type: event.target.value as 'local' | 'ssh' })}><option value="local">Send locally</option><option value="ssh">Remote per SSH Relay</option></select></label>
              <label>Broadcast<input value={siteForm.broadcastAddress} onChange={(event) => setSiteForm({ ...siteForm, broadcastAddress: event.target.value })} placeholder="192.168.1.255" /></label>
              {siteForm.type === 'ssh' && <>
                <label>SSH Host<input value={siteForm.sshHost} onChange={(event) => setSiteForm({ ...siteForm, sshHost: event.target.value })} placeholder="100.x.y.z" /></label>
                <label>SSH user<input value={siteForm.sshUser} onChange={(event) => setSiteForm({ ...siteForm, sshUser: event.target.value })} placeholder="relay" /></label>
                <label>SSH Key<select value={siteForm.sshKeyPath} onChange={(event) => setSiteForm({ ...siteForm, sshKeyPath: event.target.value })}><option value="">Select key</option>{sshKeys.map((key) => <option key={key.path} value={key.path}>{key.name}</option>)}<option value={siteForm.sshKeyPath}>Manual path: {siteForm.sshKeyPath}</option></select></label>
                <label>Manual key path<input value={siteForm.sshKeyPath} onChange={(event) => setSiteForm({ ...siteForm, sshKeyPath: event.target.value })} placeholder="/app/ssh/id_ed25519" /></label>
                <label>Shutdown command<input value={siteForm.shutdownCommand} onChange={(event) => setSiteForm({ ...siteForm, shutdownCommand: event.target.value })} /></label>
                <label>Reboot command<input value={siteForm.rebootCommand} onChange={(event) => setSiteForm({ ...siteForm, rebootCommand: event.target.value })} /></label>
              </>}
              <button className="primary" type="submit">Save site</button>
            </form>
          </section>

          <section className="form-card">
            <h2>Device</h2>
            <form onSubmit={createDevice} className="stack-form">
              <label>Name<input value={deviceForm.name} onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })} placeholder="Workstation" /></label>
              <label>Site<select value={deviceForm.siteId} onChange={(event) => setDeviceForm({ ...deviceForm, siteId: event.target.value })}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              <label>MAC<input value={deviceForm.macAddress} onChange={(event) => setDeviceForm({ ...deviceForm, macAddress: event.target.value })} placeholder="AA:BB:CC:00:11:22" /></label>
              <label>IP<input value={deviceForm.ipAddress} onChange={(event) => setDeviceForm({ ...deviceForm, ipAddress: event.target.value })} placeholder="192.168.1.40" /></label>
              <label>Note<input value={deviceForm.note} onChange={(event) => setDeviceForm({ ...deviceForm, note: event.target.value })} placeholder="Office desk" /></label>
              <button className="primary" type="submit" disabled={!sites.length}>Add device</button>
            </form>
          </section>

          <section className="form-card">
            <h2>Group</h2>
            <form onSubmit={createGroup} className="stack-form">
              <label>Name<input value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} placeholder="Morning startup" /></label>
              <div className="check-list">{devices.map((device) => <label key={device.id}><input type="checkbox" checked={groupForm.deviceIds.includes(device.id)} onChange={(event) => setGroupForm((current) => ({ ...current, deviceIds: event.target.checked ? [...current.deviceIds, device.id] : current.deviceIds.filter((id) => id !== device.id) }))} /> {device.name}</label>)}</div>
              <button className="primary" type="submit" disabled={!devices.length}>Save group</button>
            </form>
          </section>

          <section className="form-card">
            <h2>Schedule</h2>
            <form onSubmit={createSchedule} className="stack-form">
              <label>Name<input value={scheduleForm.name} onChange={(event) => setScheduleForm({ ...scheduleForm, name: event.target.value })} placeholder="Daily startup" /></label>
              <label>Action<select value={scheduleForm.action} onChange={(event) => setScheduleForm({ ...scheduleForm, action: event.target.value as 'wake' | 'shutdown' | 'reboot' })}><option value="wake">Wake</option><option value="shutdown">Shutdown</option><option value="reboot">Reboot</option></select></label>
              <label>Time<input type="time" value={scheduleForm.timeOfDay} onChange={(event) => setScheduleForm({ ...scheduleForm, timeOfDay: event.target.value })} /></label>
              <label>Target group<select value={scheduleForm.groupId} onChange={(event) => setScheduleForm({ ...scheduleForm, groupId: event.target.value, deviceId: '' })}><option value="">Use single device</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
              {!scheduleForm.groupId && <label>Device<select value={scheduleForm.deviceId} onChange={(event) => setScheduleForm({ ...scheduleForm, deviceId: event.target.value })}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>}
              <button className="primary" type="submit" disabled={!devices.length && !groups.length}>Save schedule</button>
            </form>
            <div className="mini-list">{schedules.map((schedule) => <div key={schedule.id}><strong>{schedule.timeOfDay}</strong> {schedule.name} · {schedule.action} <button className="ghost danger" onClick={() => api.deleteSchedule(schedule.id).then(refresh)}>x</button></div>)}</div>
          </section>

          <section className="event-card">
            <h2>Backup</h2>
            <div className="row-actions"><button className="ghost" onClick={exportBackup}>Export</button><button className="ghost" onClick={importBackup} disabled={!backupText.trim()}>Import</button></div>
            <textarea value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="Backup JSON appears here, or you can paste it here for import." />
          </section>

          <section className="event-card">
            <h2>Eventlog</h2>
            {events.slice(0, 8).map((event) => <div className="event-line" key={event.id}><span className={event.status}>{event.status}</span><strong>{event.deviceName}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.message}</small></div>)}
            {!events.length && <p className="muted">No wake attempts yet.</p>}
          </section>
        </aside>
      </section>
    </main>
  );
}

