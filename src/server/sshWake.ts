import fs from 'node:fs';
import { Client } from 'ssh2';
import type { Device, Site } from './db.js';

function buildWakeCommand(template: string, site: Site, device: Device): string {
  return template.replaceAll('{broadcast}', site.broadcastAddress).replaceAll('{mac}', device.macAddress);
}

export async function wakeViaSsh(site: Site, device: Device): Promise<string> {
  if (!site.sshHost || !site.sshUser || !site.sshKeyPath) {
    throw new Error('SSH site is missing host, user, or key path');
  }

  const sshHost = site.sshHost;
  const sshUser = site.sshUser;
  const sshKeyPath = site.sshKeyPath;
  const command = buildWakeCommand(site.remoteCommand || 'wakeonlan -i {broadcast} {mac}', site, device);
  const privateKey = fs.readFileSync(sshKeyPath, 'utf8');
  const client = new Client();

  return await new Promise<string>((resolve, reject) => {
    let output = '';
    client
      .on('ready', () => {
        client.exec(command, (error, stream) => {
          if (error) {
            client.end();
            reject(error);
            return;
          }
          stream
            .on('close', (code: number) => {
              client.end();
              if (code === 0) resolve(output.trim() || 'remote wake command completed');
              else reject(new Error(`Remote wake command exited with code ${code}`));
            })
            .on('data', (chunk: Buffer) => {
              output += chunk.toString();
            })
            .stderr.on('data', (chunk: Buffer) => {
              output += chunk.toString();
            });
        });
      })
      .on('error', reject)
      .connect({ host: sshHost, port: site.sshPort || 22, username: sshUser, privateKey, readyTimeout: 10000 });
  });
}

