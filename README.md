# Easy-WoL

Easy-WoL is a Docker-based web interface for Wake-on-LAN across multiple networks and sites.

## Architecture

Easy-WoL runs as a central web app and sends wake commands through the sender that can actually reach the target device's local network.

- Local sites send Magic Packets directly from the Easy-WoL host/container.
- Remote sites use an SSH-capable relay host inside the target network.
- The central app stores sites, devices, groups, schedules, and event history in SQLite.

This avoids relying on routed VPN traffic for Wake-on-LAN broadcasts. The VPN/SSH connection is only used to control a relay host; the Magic Packet is generated inside the target network.

## Local quick start

```bash
npm install
npm run build
$env:ADMIN_PASSWORD="dev-password"; $env:DB_PATH="./data/easy-wol.sqlite"; npm start
```

Then open `http://localhost:8080`.

## Docker deployment

1. Set a strong `ADMIN_PASSWORD` in `docker-compose.yml`.
2. Optionally mount a directory containing SSH private keys.
3. Start the container:

```bash
docker compose up -d --build
```

`network_mode: host` is intentional. Wake-on-LAN broadcasts from Docker bridge networks can be unreliable depending on the host and network setup.

## GHCR image deployment

The repository publishes Docker images to GitHub Container Registry:

```text
ghcr.io/siyarbekir47/easy-wol:latest
```

Use the image-based Compose file on your server:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

To update later:

```bash
docker compose -f docker-compose.ghcr.yml pull
docker compose -f docker-compose.ghcr.yml up -d
```

The `latest` tag is built automatically by GitHub Actions whenever `main` is pushed. Version tags like `v1.0.0` also publish matching image tags.

## SSH relay setup

A remote site needs a reachable Linux/Unix host in the target network. Install a Wake-on-LAN tool on that relay host:

```bash
sudo apt update
sudo apt install wakeonlan
```

Authorize the Easy-WoL SSH key on the relay host:

```bash
mkdir -p ~/.ssh
chmod 700 ~/.ssh
# Add the public key to ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

Create an SSH relay site in Easy-WoL with:

- Type: `Remote per SSH Relay`
- SSH host: relay hostname, IP address, or VPN DNS name
- SSH user: for example `pi`, `relay`, or `admin`
- SSH key: choose a key from the dropdown or enter a path like `/app/ssh/id_ed25519`
- Broadcast: for example `192.168.50.255`

The default Wake-on-LAN command is:

```bash
wakeonlan -i {broadcast} {mac}
```

## Notes

- Wake-on-LAN only confirms that a Magic Packet was sent. Whether the device boots depends on BIOS/UEFI settings, NIC support, operating system power settings, and the current power state.
- Status checks use TCP probes on common ports such as 22, 80, and 3389. A powered-on device can still appear offline if none of those ports are open.
- Easy-WoL is designed for LAN/VPN/Tailscale-style access, not direct public internet exposure.

## Features

- Create and edit sites and devices.
- Wake individual devices.
- Group multiple devices and wake them together.
- Reboot or shut down devices through SSH relay command templates.
- Create daily schedules for Wake, Shutdown, and Reboot actions.
- Automatically check status after Wake attempts after 5, 15, and 30 seconds.
- Export and import sites, devices, groups, and schedules as JSON.
- Test SSH relay connectivity from the web interface.
- Select SSH private keys from a mounted key directory.

Shutdown and Reboot are intentionally only available for SSH relay sites. Commands are templates executed on the relay host:

```bash
ssh {ip} sudo shutdown -h now
ssh {ip} sudo reboot
```

Available placeholders:

- `{ip}`: target device IP address
- `{mac}`: target device MAC address
- `{broadcast}`: site broadcast address
- `{name}`: device name

## Multiple SSH keys

Mount a full key directory into the container:

```yaml
volumes:
  - ./data:/app/data
  - ~/.ssh:/app/ssh:ro
```

Easy-WoL lists private key files from `SSH_KEY_DIR` in the site form dropdown. The following files are ignored:

- `*.pub`
- `known_hosts`
- `authorized_keys`
- `config`

## Development

```bash
npm run dev
npm run test
npm run build
```
