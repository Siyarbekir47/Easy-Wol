# Easy-WoL

Easy-WoL ist eine Docker-Weboberflaeche fuer Wake-on-LAN ueber mehrere Standorte.

## Architektur

- Die Webapp laeuft zentral auf deiner NAS `dunas01`.
- PCs im NAS-Netz werden direkt vom Container/Host geweckt.
- PCs im zweiten Standort werden ueber den Raspberry Pi Zero W geweckt: Easy-WoL verbindet sich per SSH ueber Tailscale zum Pi, und der Pi sendet lokal das Magic Packet.

## Schnellstart lokal

```bash
npm install
npm run build
$env:ADMIN_PASSWORD="dev-password"; $env:DB_PATH="./data/easy-wol.sqlite"; npm start
```

Dann `http://localhost:8080` oeffnen.

## Docker auf dunas01

1. Passwort in `docker-compose.yml` setzen.
2. Optional SSH-Key fuer den Raspberry Pi mounten.
3. Container starten:

```bash
docker compose up -d --build
```

`network_mode: host` ist absichtlich gesetzt. Wake-on-LAN-Broadcasts aus Docker-Bridge-Netzen sind je nach NAS/Router unzuverlaessig.

## Raspberry Pi vorbereiten

Auf dem Pi muss ein WoL-Tool verfuegbar sein:

```bash
sudo apt update
sudo apt install wakeonlan
```

SSH-Key der NAS/Webapp auf dem Pi autorisieren:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Public Key in ~/.ssh/authorized_keys eintragen
chmod 600 ~/.ssh/authorized_keys
```

In Easy-WoL legst du fuer diesen Standort an:

- Typ: `Remote / Raspberry Pi SSH`
- SSH Host: Tailscale-IP oder Tailscale-DNS des Pi
- SSH Benutzer: z. B. `pi`
- SSH Key im Container: `/app/ssh/id_ed25519`
- Broadcast: z. B. `192.168.50.255`

Der Standardbefehl ist:

```bash
wakeonlan -i {broadcast} {mac}
```

## Hinweise

- Wake-on-LAN bestaetigt nur, dass das Magic Packet gesendet wurde. Ob der PC wirklich bootet, haengt von BIOS/UEFI, Netzwerkkarte, Windows-Schnellstart und Stromzustand ab.
- Die Statuspruefung nutzt TCP-Probes auf typische Ports wie 22, 80 und 3389. Wenn kein Port offen ist, kann ein eingeschalteter PC trotzdem als offline erscheinen.
- Die App ist fuer LAN/Tailscale gedacht, nicht fuer direktes Internet-Exposure.

## Erweiterte Funktionen

- Standorte und Geraete koennen ueber die Weboberflaeche bearbeitet werden.
- Gruppen koennen mehrere Geraete zusammen starten oder per SSH-Relay rebooten.
- Zeitplaene fuehren Wake/Shutdown/Reboot taeglich zur eingestellten Uhrzeit aus.
- Nach einem Wake prueft die UI automatisch nach 5, 15 und 30 Sekunden den Status.
- Backup/Restore exportiert und importiert Standorte, Geraete, Gruppen und Zeitplaene als JSON.
- SSH-Relay-Test prueft, ob der entfernte Sender erreichbar ist.

Shutdown und Reboot sind bewusst nur fuer SSH-Relay-Standorte aktiv. Die Befehle sind Templates und werden auf dem Relay-Host ausgefuehrt:

```bash
ssh {ip} sudo shutdown -h now
ssh {ip} sudo reboot
```

Verfuegbare Platzhalter:

- `{ip}`: IP-Adresse des Zielgeraets
- `{mac}`: MAC-Adresse des Zielgeraets
- `{broadcast}`: Broadcast-Adresse des Standorts
- `{name}`: Geraetename

## Entwicklung

```bash
npm run dev
npm run test
npm run build
```
