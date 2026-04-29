import fs from 'node:fs';
import { Client } from 'ssh2';
import type { Device, Site } from './db.js';

function fillTemplate(template: string, site: Site, device?: Device): string {
  return template
    .replaceAll('{broadcast}', site.broadcastAddress)
    .replaceAll('{mac}', device?.macAddress || '')
    .replaceAll('{ip}', device?.ipAddress || '')
    .replaceAll('{name}', device?.name || '');
}

export function buildSiteCommand(template: string, site: Site, device?: Device): string {
  return fillTemplate(template, site, device).trim();
}

export async function executeSshCommand(site: Site, command: string): Promise<string> {
  const sshHost = site.sshHost;
  const sshUser = site.sshUser;
  const sshKeyPath = site.sshKeyPath;
  if (!sshHost || !sshUser || !sshKeyPath) {
    throw new Error('SSH site is missing host, user, or key path');
  }

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
              if (code === 0) resolve(output.trim() || 'remote command completed');
              else reject(new Error(`Remote command exited with code ${code}: ${output.trim()}`));
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

export async function wakeViaSsh(site: Site, device: Device): Promise<string> {
  return executeSshCommand(site, buildSiteCommand(site.remoteCommand || 'wakeonlan -i {broadcast} {mac}', site, device));
}
