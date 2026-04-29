# Easy-WoL

Easy-WoL is a self-hosted web interface for Wake-on-LAN across one or more networks.

It is designed for home labs, small offices, and multi-site setups where some devices are in the same network as the server and others need to be woken through a remote relay host.

## What It Does

- Wake devices with Wake-on-LAN from a browser.
- Manage multiple sites/networks.
- Use local Wake-on-LAN for devices in the server's network.
- Use an SSH relay host for devices in remote networks.
- Reboot or shut down devices over direct SSH, even when they belong to a local site.
- Manage devices, groups, schedules, and wake history.
- Store all app data in a local SQLite database.
- Run as a Docker container.

## Quick Start With Docker Compose

Create a folder for Easy-WoL:

```bash
mkdir easy-wol
cd easy-wol
mkdir data ssh-keys
```

Create `docker-compose.yml`:

```yaml
services:
  easy-wol:
    image: ghcr.io/siyarbekir47/easy-wol:latest
    container_name: easy-wol
    restart: unless-stopped
    network_mode: host
    environment:
      PORT: "8080"
      ADMIN_PASSWORD: "change-this-password"
      DB_PATH: "/app/data/easy-wol.sqlite"
      SSH_KEY_DIR: "/app/ssh"
    volumes:
      - ./data:/app/data
      - ./ssh-keys:/app/ssh:ro
```

Start it:

```bash
docker compose up -d
```

Open:

```text
http://localhost:8080
```

Use the password from `ADMIN_PASSWORD`.

## Quick Start With Docker Run

```bash
docker run -d \
  --name easy-wol \
  --restart unless-stopped \
  --network host \
  -e PORT=8080 \
  -e ADMIN_PASSWORD=change-this-password \
  -e DB_PATH=/app/data/easy-wol.sqlite \
  -e SSH_KEY_DIR=/app/ssh \
  -v ./data:/app/data \
  -v ./ssh-keys:/app/ssh:ro \
  ghcr.io/siyarbekir47/easy-wol:latest
```

Open:

```text
http://localhost:8080
```

## Updating

With Docker Compose:

```bash
docker compose pull
docker compose up -d
```

With Docker Run:

```bash
docker pull ghcr.io/siyarbekir47/easy-wol:latest
docker stop easy-wol
docker rm easy-wol
# run the docker run command again
```

## Environment Variables

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PORT` | No | `8080` | HTTP port used inside the container. With `network_mode: host`, this is also the host port. |
| `ADMIN_PASSWORD` | Yes | none | Password for the web interface. Set a strong value before deploying. |
| `DB_PATH` | No | `/app/data/easy-wol.sqlite` | SQLite database path inside the container. |
| `SSH_KEY_DIR` | No | `/app/ssh` | Directory inside the container where SSH private keys are listed for selection. |

## Volumes

| Container path | Purpose |
| --- | --- |
| `/app/data` | Persistent SQLite database and app data. |
| `/app/ssh` | Optional read-only directory containing private SSH keys for remote relay sites. |

Recommended mounts:

```yaml
volumes:
  - ./data:/app/data
  - ./ssh-keys:/app/ssh:ro
```

## Why `network_mode: host`?

Wake-on-LAN uses UDP broadcast packets. Docker bridge networking can block or rewrite broadcast traffic depending on the host and network stack.

For reliable local Wake-on-LAN, host networking is recommended:

```yaml
network_mode: host
```

On Docker Desktop for Windows/macOS, host networking behaves differently than on Linux. For production Wake-on-LAN, run Easy-WoL on the Linux host/NAS/server that is connected to the target network.

## Sites

Easy-WoL supports two site types.

### Local Site

Use this when the Easy-WoL server is in the same network as the target device.

Required fields:

- Site name
- Broadcast address, for example `192.168.1.255`

Wake behavior:

```text
Easy-WoL container -> UDP Magic Packet -> local broadcast address
```

Shutdown and reboot for devices in a local site require device-level power settings. Configure the device with:

- OS type: `Windows`, `Linux`, `macOS`, or `Other`
- Power method: `Direct SSH to device`
- SSH user
- SSH private key
- Optional custom shutdown/reboot commands

This lets a local Windows or Linux device receive power commands directly over SSH while Wake-on-LAN still uses the local broadcast network.

### SSH Relay Site

Use this when the target device is in another network.

Required fields:

- Site name
- Broadcast address of the remote network
- SSH host
- SSH user
- SSH key

Wake behavior:

```text
Easy-WoL container -> SSH relay host -> wakeonlan command -> remote network broadcast
```

Default Wake-on-LAN command:

```bash
wakeonlan -i {broadcast} {mac}
```

## Preparing an SSH Relay Host

Install `wakeonlan` on the relay host:

```bash
sudo apt update
sudo apt install wakeonlan
```

Authorize the public key that belongs to the private key mounted into Easy-WoL:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Add the public key to ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Put private keys into your host-side key folder:

```bash
./ssh-keys/id_ed25519
./ssh-keys/site-office
./ssh-keys/site-lab
```

Easy-WoL lists private key files from `SSH_KEY_DIR` in the site form dropdown.

Ignored files:

- `*.pub`
- `known_hosts`
- `authorized_keys`
- `config`

## Command Templates

SSH relay sites can use command templates.

Default wake command:

```bash
wakeonlan -i {broadcast} {mac}
```

Example shutdown command:

```bash
ssh {ip} sudo shutdown -h now
```

Example reboot command:

```bash
ssh {ip} sudo reboot
```

Available placeholders:

| Placeholder | Description |
| --- | --- |
| `{ip}` | Target device IP address |
| `{mac}` | Target device MAC address |
| `{broadcast}` | Site broadcast address |
| `{name}` | Device name |

Shutdown and reboot need an authenticated command channel. Easy-WoL supports two models:

- SSH relay site: commands run on the relay host and can target devices in that remote network.
- Direct SSH device power: commands run directly on the target device, including devices in a local site.

Default direct SSH commands by OS:

| OS | Shutdown | Reboot |
| --- | --- | --- |
| Windows | `shutdown /s /t 0` | `shutdown /r /t 0` |
| Linux | `sudo shutdown -h now` | `sudo reboot` |
| macOS | `sudo shutdown -h now` | `sudo reboot` |
| Other | custom command required | custom command required |

## Features

- Site management
- Device management
- OS-aware device power management
- Direct SSH power actions for local devices
- Wake individual devices
- Wake groups of devices
- Shutdown and reboot through SSH relay command templates
- Daily schedules for Wake, Shutdown, and Reboot
- Automatic status checks after Wake attempts
- Event history
- JSON backup and restore
- SSH relay connectivity test
- SSH key dropdown from mounted key directory

## Backup And Restore

Use the Backup panel in the web interface.

The exported JSON contains:

- Sites
- Devices
- Groups
- Schedules

Wake event history is not included in backups.

## Security Notes

- Do not expose Easy-WoL directly to the public internet.
- Use it behind a LAN, VPN, reverse proxy with authentication, or Tailscale-style private network.
- Set a strong `ADMIN_PASSWORD`.
- Mount SSH keys read-only.
- Use dedicated SSH keys with limited access where possible.

## Development

For local development from source:

```bash
npm install
npm run dev
```

Run checks:

```bash
npm run test
npm run build
```

Build the image locally:

```bash
docker build -t easy-wol .
```

## License

Easy-WoL is released under the MIT License.

You may use, copy, modify, fork, distribute, and use the project commercially. The copyright notice and license text must remain included in copies or substantial portions of the software.

Copyright (c) 2026 Siyarbekir47. See [LICENSE](LICENSE).
