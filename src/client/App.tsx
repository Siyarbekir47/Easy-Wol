import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Device, DeviceGroup, Schedule, Site, SshKeyInfo, WakeEvent } from './api';
import './styles.css';

type SiteForm = Omit<Partial<Site>, 'type'> & { type: 'local' | 'ssh' };
type DeviceForm = Partial<Device>;
type StatusMap = Record<string, 'unknown' | 'online' | 'offline' | 'checking'>;
type Selection = { kind: 'site'; id: string } | { kind: 'device'; id: string } | { kind: 'group'; id: string } | { kind: 'schedule'; id: string } | { kind: 'new-site' } | { kind: 'new-device' } | { kind: 'new-group' } | { kind: 'new-schedule' };

const defaultSiteForm: SiteForm = {
  name: '',
  type: 'local',
  broadcastAddress: '',
  sshHost: '',
  sshPort: 22,
  sshUser: '',
  sshKeyPath: '/app/ssh/id_ed25519',
  remoteCommand: 'wakeonlan -i {broadcast} {mac}',
  shutdownCommand: 'ssh {ip} sudo shutdown -h now',
  rebootCommand: 'ssh {ip} sudo reboot'
};

const defaultDeviceForm: DeviceForm = {
  name: '',
  macAddress: '',
  ipAddress: '',
  siteId: '',
  note: '',
  osType: 'windows',
  powerMethod: 'none',
  powerSshUser: '',
  powerSshKeyPath: '',
  powerSshPort: 22,
  powerShutdownCommand: '',
  powerRebootCommand: ''
};

const defaultGroupForm = { name: '', deviceIds: [] as string[] };
const defaultScheduleForm = { name: '', action: 'wake' as const, timeOfDay: '07:30', enabled: true, deviceId: '', groupId: '' };

function hydrateSiteForm(site?: Site): SiteForm {
  return site ? { ...site } : { ...defaultSiteForm };
}

function hydrateDeviceForm(device?: Device, firstSiteId = ''): DeviceForm {
  return device ? { ...device } : { ...defaultDeviceForm, siteId: firstSiteId };
}

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [groups, setGroups] = useState<DeviceGroup[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [sshKeys, setSshKeys] = useState<SshKeyInfo[]>([]);
  const [events, setEvents] = useState<WakeEvent[]>([]);
  const [selection, setSelection] = useState<Selection>({ kind: 'new-site' });
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [backupText, setBackupText] = useState('');
  const [siteForm, setSiteForm] = useState<SiteForm>(defaultSiteForm);
  const [deviceForm, setDeviceForm] = useState<DeviceForm>(defaultDeviceForm);
  const [groupForm, setGroupForm] = useState(defaultGroupForm);
  const [scheduleForm, setScheduleForm] = useState(defaultScheduleForm);

  async function refresh() {
    const [nextSites, nextDevices, nextGroups, nextSchedules, nextEvents, nextSshKeys] = await Promise.all([
      api.listSites(), api.listDevices(), api.listGroups(), api.listSchedules(), api.listEvents(), api.listSshKeys()
    ]);
    setSites(nextSites);
    setDevices(nextDevices);
    setGroups(nextGroups);
    setSchedules(nextSchedules);
    setEvents(nextEvents);
    setSshKeys(nextSshKeys);
    setDeviceForm((current) => ({ ...current, siteId: current.siteId || nextSites[0]?.id || '' }));
    setScheduleForm((current) => ({ ...current, deviceId: current.deviceId || nextDevices[0]?.id || '' }));
  }

  useEffect(() => {
    api.me().then(() => setAuthenticated(true)).then(refresh).catch(() => setAuthenticated(false));
  }, []);

  useEffect(() => {
    if (selection.kind === 'site') setSiteForm(hydrateSiteForm(sites.find((site) => site.id === selection.id)));
    if (selection.kind === 'device') setDeviceForm(hydrateDeviceForm(devices.find((device) => device.id === selection.id), sites[0]?.id || ''));
    if (selection.kind === 'group') {
      const group = groups.find((item) => item.id === selection.id);
      if (group) setGroupForm({ name: group.name, deviceIds: group.deviceIds });
    }
    if (selection.kind === 'schedule') {
      const schedule = schedules.find((item) => item.id === selection.id);
      if (schedule) setScheduleForm({ name: schedule.name, action: schedule.action, timeOfDay: schedule.timeOfDay, enabled: schedule.enabled, deviceId: schedule.deviceId || '', groupId: schedule.groupId || '' });
    }
    if (selection.kind === 'new-site') setSiteForm(hydrateSiteForm());
    if (selection.kind === 'new-device') setDeviceForm(hydrateDeviceForm(undefined, sites[0]?.id || ''));
    if (selection.kind === 'new-group') setGroupForm(defaultGroupForm);
    if (selection.kind === 'new-schedule') setScheduleForm({ ...defaultScheduleForm, deviceId: devices[0]?.id || '' });
  }, [selection, sites, devices, groups, schedules]);

  const devicesBySite = useMemo(() => sites.map((site) => ({ site, devices: devices.filter((device) => device.siteId === site.id) })), [sites, devices]);
  const selectedTitle = selection.kind.replace('new-', 'new ');

  function showError(error: unknown, fallback: string) {
    setMessage(error instanceof Error ? error.message : fallback);
  }

  async function login(event: FormEvent) {
    event.preventDefault();
    try {
      await api.login(password);
      setAuthenticated(true);
      await refresh();
    } catch (error) { showError(error, 'Login failed'); }
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    try {
      if (selection.kind === 'site') await api.updateSite(selection.id, siteForm);
      else await api.createSite(siteForm);
      setMessage('Site saved.');
      await refresh();
    } catch (error) { showError(error, 'Could not save site'); }
  }

  async function saveDevice(event: FormEvent) {
    event.preventDefault();
    try {
      if (selection.kind === 'device') await api.updateDevice(selection.id, deviceForm);
      else await api.createDevice(deviceForm);
      setMessage('Device saved.');
      await refresh();
    } catch (error) { showError(error, 'Could not save device'); }
  }

  async function saveGroup(event: FormEvent) {
    event.preventDefault();
    try {
      if (selection.kind === 'group') await api.updateGroup(selection.id, groupForm);
      else await api.createGroup(groupForm);
      setMessage('Group saved.');
      await refresh();
    } catch (error) { showError(error, 'Could not save group'); }
  }

  async function saveSchedule(event: FormEvent) {
    event.preventDefault();
    try {
      const target = scheduleForm.groupId ? { groupId: scheduleForm.groupId, deviceId: null } : { deviceId: scheduleForm.deviceId, groupId: null };
      if (selection.kind === 'schedule') await api.updateSchedule(selection.id, { ...scheduleForm, ...target });
      else await api.createSchedule({ ...scheduleForm, ...target });
      setMessage('Schedule saved.');
      await refresh();
    } catch (error) { showError(error, 'Could not save schedule'); }
  }

  async function wake(device: Device) {
    setBusyDevice(device.id);
    setMessage(`Sending wake for ${device.name}...`);
    try {
      await api.wakeDevice(device.id);
      setMessage(`Wake command for ${device.name} was sent. Status will be checked automatically...`);
      await refresh();
      setTimeout(() => checkStatus(device), 5000);
      setTimeout(() => checkStatus(device), 15000);
      setTimeout(() => checkStatus(device), 30000);
    } catch (error) { showError(error, 'Wake failed'); }
    finally { setBusyDevice(null); }
  }

  async function power(device: Device, action: 'shutdown' | 'reboot') {
    if (!window.confirm(`${action === 'shutdown' ? 'Shutdown' : 'Reboot'} ${device.name}?`)) return;
    try {
      await api.powerDevice(device.id, action);
      setMessage(`${action} command for ${device.name} was sent.`);
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

  async function deleteSelected() {
    if (!window.confirm('Delete selected item? This cannot be undone.')) return;
    if (selection.kind === 'site') await api.deleteSite(selection.id);
    if (selection.kind === 'device') await api.deleteDevice(selection.id);
    if (selection.kind === 'group') await api.deleteGroup(selection.id);
    if (selection.kind === 'schedule') await api.deleteSchedule(selection.id);
    setSelection({ kind: 'new-site' });
    await refresh();
  }

  async function exportBackup() {
    setBackupText(JSON.stringify(await api.exportBackup(), null, 2));
    setMessage('Backup created.');
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
          <p className="eyebrow">Network Operations Console</p>
          <h1>Easy-WoL</h1>
          <p className="muted">Wake, schedule, and power-manage devices across local networks and SSH relay sites.</p>
          <form onSubmit={login} className="stack-form">
            <label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
            <button className="primary" type="submit">Open console</button>
          </form>
          {message && <p className="alert">{message}</p>}
        </section>
      </main>
    );
  }

  return (
    <main className="ops-shell">
      <aside className="rail">
        <div className="rail-logo">EW</div>
        <button onClick={() => setSelection({ kind: 'new-site' })}>New site</button>
        <button onClick={() => setSelection({ kind: 'new-device' })}>New device</button>
        <button onClick={() => setSelection({ kind: 'new-group' })}>New group</button>
        <button onClick={() => setSelection({ kind: 'new-schedule' })}>New schedule</button>
      </aside>

      <section className="ops-main">
        <header className="ops-hero">
          <div>
            <p className="eyebrow">Easy-WoL Command Deck</p>
            <h1>Network power control without guesswork.</h1>
            <p className="muted">Local wake packets, SSH relays, direct SSH power actions, schedules, and grouped operations in one console.</p>
          </div>
          <div className="hero-stats">
            <span><strong>{sites.length}</strong> Sites</span>
            <span><strong>{devices.length}</strong> Devices</span>
            <span><strong>{groups.length}</strong> Groups</span>
            <span><strong>{schedules.length}</strong> Schedules</span>
          </div>
        </header>

        {message && <p className="toast">{message}</p>}

        <div className="ops-grid">
          <section className="command-board">
            {devicesBySite.map(({ site, devices }) => (
              <article className="site-card" key={site.id}>
                <div className="site-card-head">
                  <button className="site-title" onClick={() => setSelection({ kind: 'site', id: site.id })}>
                    <span>{site.type === 'local' ? 'Local sender' : 'SSH relay'}</span>
                    <strong>{site.name}</strong>
                    <small>{site.broadcastAddress}</small>
                  </button>
                  {site.type === 'ssh' && <button className="ghost" onClick={() => api.testRelay(site.id).then((r) => setMessage(`Relay OK: ${r.output}`)).catch((e) => showError(e, 'Relay test failed'))}>Test relay</button>}
                </div>
                <div className="device-table">
                  {devices.map((device) => {
                    const status = statusMap[device.id] || 'unknown';
                    return (
                      <div className="device-card" key={device.id} onClick={() => setSelection({ kind: 'device', id: device.id })}>
                        <div className={`status-dot ${status}`} />
                        <div>
                          <strong>{device.name}</strong>
                          <span>{device.ipAddress} · {device.osType} · {device.powerMethod === 'ssh' ? 'direct SSH power' : site.type === 'ssh' ? 'relay power' : 'wake only'}</span>
                        </div>
                        <div className="row-actions" onClick={(event) => event.stopPropagation()}>
                          <button className="ghost" onClick={() => checkStatus(device)}>{status === 'checking' ? 'Checking' : 'Status'}</button>
                          <button className="primary" disabled={busyDevice === device.id} onClick={() => wake(device)}>{busyDevice === device.id ? 'Sending' : 'Wake'}</button>
                          <button className="ghost" onClick={() => power(device, 'reboot')}>Reboot</button>
                          <button className="ghost danger" onClick={() => power(device, 'shutdown')}>Shutdown</button>
                        </div>
                      </div>
                    );
                  })}
                  {!devices.length && <p className="muted">No devices at this site yet.</p>}
                </div>
              </article>
            ))}
            {!sites.length && <div className="empty-panel">Create a site first, then add devices and power rules.</div>}

            <section className="lower-grid">
              <div className="site-card">
                <div className="site-card-head"><div><span className="eyebrow">Batch actions</span><h2>Groups</h2></div></div>
                {groups.map((group) => <div className="mini-row" key={group.id}><button onClick={() => setSelection({ kind: 'group', id: group.id })}>{group.name}</button><span>{group.deviceIds.length} devices</span><button className="primary" onClick={() => api.wakeGroup(group.id).then(refresh)}>Wake</button></div>)}
                {!groups.length && <p className="muted">No groups yet.</p>}
              </div>
              <div className="site-card">
                <div className="site-card-head"><div><span className="eyebrow">Automation</span><h2>Schedules</h2></div></div>
                {schedules.map((schedule) => <div className="mini-row" key={schedule.id}><button onClick={() => setSelection({ kind: 'schedule', id: schedule.id })}>{schedule.name}</button><span>{schedule.timeOfDay} · {schedule.action}</span></div>)}
                {!schedules.length && <p className="muted">No schedules yet.</p>}
              </div>
            </section>

            <section className="event-card">
              <h2>Eventlog</h2>
              {events.slice(0, 8).map((event) => <div className="event-line" key={event.id}><span className={event.status}>{event.status}</span><strong>{event.deviceName}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.message}</small></div>)}
              {!events.length && <p className="muted">No wake attempts yet.</p>}
            </section>
          </section>

          <aside className="inspector">
            <div className="inspector-head">
              <div><p className="eyebrow">Inspector</p><h2>{selectedTitle}</h2></div>
              {['site', 'device', 'group', 'schedule'].includes(selection.kind) && <button className="ghost danger" onClick={deleteSelected}>Delete</button>}
            </div>

            {(selection.kind === 'site' || selection.kind === 'new-site') && <SiteEditor form={siteForm} setForm={setSiteForm} sshKeys={sshKeys} onSubmit={saveSite} />}
            {(selection.kind === 'device' || selection.kind === 'new-device') && <DeviceEditor form={deviceForm} setForm={setDeviceForm} sites={sites} sshKeys={sshKeys} onSubmit={saveDevice} />}
            {(selection.kind === 'group' || selection.kind === 'new-group') && <GroupEditor form={groupForm} setForm={setGroupForm} devices={devices} onSubmit={saveGroup} />}
            {(selection.kind === 'schedule' || selection.kind === 'new-schedule') && <ScheduleEditor form={scheduleForm} setForm={setScheduleForm} devices={devices} groups={groups} onSubmit={saveSchedule} />}

            <section className="backup-box">
              <h3>Backup</h3>
              <div className="row-actions"><button className="ghost" onClick={exportBackup}>Export</button><button className="ghost" onClick={importBackup} disabled={!backupText.trim()}>Import</button></div>
              <textarea value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="Backup JSON appears here, or you can paste it here for import." />
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function SiteEditor({ form, setForm, sshKeys, onSubmit }: { form: SiteForm; setForm: (form: SiteForm) => void; sshKeys: SshKeyInfo[]; onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit} className="stack-form">
    <label>Name<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>Type<select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as 'local' | 'ssh' })}><option value="local">Local sender</option><option value="ssh">SSH relay</option></select></label>
    <label>Broadcast<input value={form.broadcastAddress || ''} onChange={(e) => setForm({ ...form, broadcastAddress: e.target.value })} placeholder="192.168.1.255" /></label>
    {form.type === 'ssh' && <>
      <label>SSH host<input value={form.sshHost || ''} onChange={(e) => setForm({ ...form, sshHost: e.target.value })} /></label>
      <label>SSH user<input value={form.sshUser || ''} onChange={(e) => setForm({ ...form, sshUser: e.target.value })} /></label>
      <label>SSH key<select value={form.sshKeyPath || ''} onChange={(e) => setForm({ ...form, sshKeyPath: e.target.value })}><option value="">Select key</option>{sshKeys.map((key) => <option key={key.path} value={key.path}>{key.name}</option>)}</select></label>
      <label>Manual key path<input value={form.sshKeyPath || ''} onChange={(e) => setForm({ ...form, sshKeyPath: e.target.value })} /></label>
      <label>Wake command<input value={form.remoteCommand || ''} onChange={(e) => setForm({ ...form, remoteCommand: e.target.value })} /></label>
      <label>Relay shutdown command<input value={form.shutdownCommand || ''} onChange={(e) => setForm({ ...form, shutdownCommand: e.target.value })} /></label>
      <label>Relay reboot command<input value={form.rebootCommand || ''} onChange={(e) => setForm({ ...form, rebootCommand: e.target.value })} /></label>
    </>}
    <button className="primary" type="submit">Save site</button>
  </form>;
}

function DeviceEditor({ form, setForm, sites, sshKeys, onSubmit }: { form: DeviceForm; setForm: (form: DeviceForm) => void; sites: Site[]; sshKeys: SshKeyInfo[]; onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit} className="stack-form">
    <label>Name<input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>Site<select value={form.siteId || ''} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
    <label>MAC<input value={form.macAddress || ''} onChange={(e) => setForm({ ...form, macAddress: e.target.value })} /></label>
    <label>IP<input value={form.ipAddress || ''} onChange={(e) => setForm({ ...form, ipAddress: e.target.value })} /></label>
    <label>OS<select value={form.osType || 'other'} onChange={(e) => setForm({ ...form, osType: e.target.value as Device['osType'] })}><option value="windows">Windows</option><option value="linux">Linux</option><option value="macos">macOS</option><option value="other">Other</option></select></label>
    <label>Power method<select value={form.powerMethod || 'none'} onChange={(e) => setForm({ ...form, powerMethod: e.target.value as Device['powerMethod'] })}><option value="none">Wake only / relay defaults</option><option value="ssh">Direct SSH to device</option></select></label>
    {form.powerMethod === 'ssh' && <>
      <label>Power SSH user<input value={form.powerSshUser || ''} onChange={(e) => setForm({ ...form, powerSshUser: e.target.value })} /></label>
      <label>Power SSH key<select value={form.powerSshKeyPath || ''} onChange={(e) => setForm({ ...form, powerSshKeyPath: e.target.value })}><option value="">Select key</option>{sshKeys.map((key) => <option key={key.path} value={key.path}>{key.name}</option>)}</select></label>
      <label>Manual key path<input value={form.powerSshKeyPath || ''} onChange={(e) => setForm({ ...form, powerSshKeyPath: e.target.value })} /></label>
      <label>SSH port<input type="number" value={form.powerSshPort || 22} onChange={(e) => setForm({ ...form, powerSshPort: Number(e.target.value) })} /></label>
      <label>Custom shutdown command<input value={form.powerShutdownCommand || ''} onChange={(e) => setForm({ ...form, powerShutdownCommand: e.target.value })} placeholder="Leave empty for OS default" /></label>
      <label>Custom reboot command<input value={form.powerRebootCommand || ''} onChange={(e) => setForm({ ...form, powerRebootCommand: e.target.value })} placeholder="Leave empty for OS default" /></label>
    </>}
    <label>Note<input value={form.note || ''} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
    <button className="primary" type="submit">Save device</button>
  </form>;
}

function GroupEditor({ form, setForm, devices, onSubmit }: { form: { name: string; deviceIds: string[] }; setForm: (form: { name: string; deviceIds: string[] }) => void; devices: Device[]; onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit} className="stack-form">
    <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <div className="check-list">{devices.map((device) => <label key={device.id}><input type="checkbox" checked={form.deviceIds.includes(device.id)} onChange={(e) => setForm({ ...form, deviceIds: e.target.checked ? [...form.deviceIds, device.id] : form.deviceIds.filter((id) => id !== device.id) })} /> {device.name}</label>)}</div>
    <button className="primary" type="submit">Save group</button>
  </form>;
}

function ScheduleEditor({ form, setForm, devices, groups, onSubmit }: { form: typeof defaultScheduleForm; setForm: (form: typeof defaultScheduleForm) => void; devices: Device[]; groups: DeviceGroup[]; onSubmit: (event: FormEvent) => void }) {
  return <form onSubmit={onSubmit} className="stack-form">
    <label>Name<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
    <label>Action<select value={form.action} onChange={(e) => setForm({ ...form, action: e.target.value as typeof form.action })}><option value="wake">Wake</option><option value="shutdown">Shutdown</option><option value="reboot">Reboot</option></select></label>
    <label>Time<input type="time" value={form.timeOfDay} onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })} /></label>
    <label>Target group<select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value, deviceId: '' })}><option value="">Use single device</option>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    {!form.groupId && <label>Device<select value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })}>{devices.map((device) => <option key={device.id} value={device.id}>{device.name}</option>)}</select></label>}
    <button className="primary" type="submit">Save schedule</button>
  </form>;
}
