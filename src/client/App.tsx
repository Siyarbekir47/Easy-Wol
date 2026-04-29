import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api, Device, Site, WakeEvent } from './api';
import './styles.css';

const emptySite = { name: '', type: 'local', broadcastAddress: '', sshHost: '', sshPort: 22, sshUser: '', sshKeyPath: '/app/ssh/id_ed25519', remoteCommand: 'wakeonlan -i {broadcast} {mac}' };
const emptyDevice = { name: '', macAddress: '', ipAddress: '', siteId: '', note: '' };

type StatusMap = Record<string, 'unknown' | 'online' | 'offline' | 'checking'>;

export default function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [sites, setSites] = useState<Site[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [events, setEvents] = useState<WakeEvent[]>([]);
  const [siteForm, setSiteForm] = useState(emptySite);
  const [deviceForm, setDeviceForm] = useState(emptyDevice);
  const [statusMap, setStatusMap] = useState<StatusMap>({});
  const [busyDevice, setBusyDevice] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function refresh() {
    const [nextSites, nextDevices, nextEvents] = await Promise.all([api.listSites(), api.listDevices(), api.listEvents()]);
    setSites(nextSites);
    setDevices(nextDevices);
    setEvents(nextEvents);
    setDeviceForm((current) => ({ ...current, siteId: current.siteId || nextSites[0]?.id || '' }));
  }

  useEffect(() => {
    api.me().then(() => setAuthenticated(true)).then(refresh).catch(() => setAuthenticated(false));
  }, []);

  const devicesBySite = useMemo(() => {
    return sites.map((site) => ({ site, devices: devices.filter((device) => device.siteId === site.id) }));
  }, [sites, devices]);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.login(password);
      setAuthenticated(true);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login fehlgeschlagen');
    }
  }

  async function createSite(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.createSite(siteForm);
      setSiteForm(emptySite);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Standort konnte nicht angelegt werden');
    }
  }

  async function createDevice(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    try {
      await api.createDevice(deviceForm);
      setDeviceForm({ ...emptyDevice, siteId: sites[0]?.id || '' });
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Geraet konnte nicht angelegt werden');
    }
  }

  async function wake(device: Device) {
    setBusyDevice(device.id);
    setMessage(`Wake fuer ${device.name} wird gesendet...`);
    try {
      await api.wakeDevice(device.id);
      setMessage(`Wake-Befehl fuer ${device.name} wurde gesendet.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wake fehlgeschlagen');
      await refresh();
    } finally {
      setBusyDevice(null);
    }
  }

  async function checkStatus(device: Device) {
    setStatusMap((current) => ({ ...current, [device.id]: 'checking' }));
    try {
      const result = await api.deviceStatus(device.id);
      setStatusMap((current) => ({ ...current, [device.id]: result.online ? 'online' : 'offline' }));
    } catch {
      setStatusMap((current) => ({ ...current, [device.id]: 'offline' }));
    }
  }

  async function deleteSite(site: Site) {
    const confirmed = window.confirm(
      `Standort "${site.name}" wirklich loeschen?\n\nAlle zugeordneten Geraete und Wake-Events werden ebenfalls entfernt.`
    );
    if (!confirmed) return;
    await api.deleteSite(site.id);
    await refresh();
  }

  if (!authenticated) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="brand-mark">EW</div>
          <p className="eyebrow">Multi-Site Wake Control</p>
          <h1>Easy-WoL</h1>
          <p className="muted">Ein zentraler Startknopf fuer Geraete in mehreren Netzwerken. Lokale Standorte senden direkt, entfernte Standorte nutzen einen SSH-faehigen Relay-Host.</p>
          <form onSubmit={login} className="stack-form">
            <label>Admin-Passwort<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus /></label>
            <button className="primary" type="submit">Control Center oeffnen</button>
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
          <h1>Wake-on-LAN fuer mehrere Netzwerke.</h1>
          <p className="muted">Magic Packets werden am passenden Standort erzeugt: direkt im lokalen Netz oder ueber einen erreichbaren SSH-Relay im Zielnetz.</p>
        </div>
        <div className="hero-stats">
          <span><strong>{sites.length}</strong> Standorte</span>
          <span><strong>{devices.length}</strong> PCs</span>
          <span><strong>{events.length}</strong> Events</span>
        </div>
      </header>

      {message && <p className="toast">{message}</p>}

      <section className="grid-layout">
        <div className="workspace">
          {devicesBySite.length === 0 && <div className="empty-panel">Lege zuerst einen Standort an. Danach kannst du PCs zuordnen und starten.</div>}
          {devicesBySite.map(({ site, devices }) => (
            <section className="site-panel" key={site.id}>
              <div className="site-header">
                <div>
                  <p className="eyebrow">{site.type === 'local' ? 'Lokaler Sender' : 'SSH Relay'}</p>
                  <h2>{site.name}</h2>
                  <p>{site.broadcastAddress}{site.sshHost ? ` · ${site.sshUser}@${site.sshHost}:${site.sshPort || 22}` : ''}</p>
                </div>
                <button className="ghost danger" onClick={() => deleteSite(site)}>Standort loeschen</button>
              </div>

              <div className="device-list">
                {devices.length === 0 && <p className="muted">Noch keine PCs an diesem Standort.</p>}
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
                        <button className="ghost" onClick={() => checkStatus(device)}>{status === 'checking' ? 'Pruefe...' : 'Status'}</button>
                        <button className="primary" disabled={busyDevice === device.id} onClick={() => wake(device)}>{busyDevice === device.id ? 'Sendet...' : 'Wake'}</button>
                        <button className="ghost danger" onClick={() => api.deleteDevice(device.id).then(refresh)}>Entfernen</button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <aside className="side-panel">
          <section className="form-card">
            <h2>Standort</h2>
            <form onSubmit={createSite} className="stack-form">
              <label>Name<input value={siteForm.name} onChange={(event) => setSiteForm({ ...siteForm, name: event.target.value })} placeholder="Buero Standort" /></label>
              <label>Typ<select value={siteForm.type} onChange={(event) => setSiteForm({ ...siteForm, type: event.target.value as 'local' | 'ssh' })}><option value="local">Lokal senden</option><option value="ssh">Remote per SSH Relay</option></select></label>
              <label>Broadcast<input value={siteForm.broadcastAddress} onChange={(event) => setSiteForm({ ...siteForm, broadcastAddress: event.target.value })} placeholder="192.168.1.255" /></label>
              {siteForm.type === 'ssh' && <>
                <label>SSH Host<input value={siteForm.sshHost} onChange={(event) => setSiteForm({ ...siteForm, sshHost: event.target.value })} placeholder="100.x.y.z" /></label>
                <label>SSH Benutzer<input value={siteForm.sshUser} onChange={(event) => setSiteForm({ ...siteForm, sshUser: event.target.value })} placeholder="pi" /></label>
                <label>SSH Key im Container<input value={siteForm.sshKeyPath} onChange={(event) => setSiteForm({ ...siteForm, sshKeyPath: event.target.value })} /></label>
              </>}
              <button className="primary" type="submit">Standort speichern</button>
            </form>
          </section>

          <section className="form-card">
            <h2>PC</h2>
            <form onSubmit={createDevice} className="stack-form">
              <label>Name<input value={deviceForm.name} onChange={(event) => setDeviceForm({ ...deviceForm, name: event.target.value })} placeholder="Gaming PC" /></label>
              <label>Standort<select value={deviceForm.siteId} onChange={(event) => setDeviceForm({ ...deviceForm, siteId: event.target.value })}>{sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
              <label>MAC<input value={deviceForm.macAddress} onChange={(event) => setDeviceForm({ ...deviceForm, macAddress: event.target.value })} placeholder="AA:BB:CC:00:11:22" /></label>
              <label>IP<input value={deviceForm.ipAddress} onChange={(event) => setDeviceForm({ ...deviceForm, ipAddress: event.target.value })} placeholder="192.168.1.40" /></label>
              <label>Notiz<input value={deviceForm.note} onChange={(event) => setDeviceForm({ ...deviceForm, note: event.target.value })} placeholder="Buerotisch" /></label>
              <button className="primary" type="submit" disabled={!sites.length}>PC hinzufuegen</button>
            </form>
          </section>

          <section className="event-card">
            <h2>Eventlog</h2>
            {events.slice(0, 8).map((event) => <div className="event-line" key={event.id}><span className={event.status}>{event.status}</span><strong>{event.deviceName}</strong><small>{new Date(event.createdAt).toLocaleString()}</small></div>)}
            {!events.length && <p className="muted">Noch keine Wake-Versuche.</p>}
          </section>
        </aside>
      </section>
    </main>
  );
}
