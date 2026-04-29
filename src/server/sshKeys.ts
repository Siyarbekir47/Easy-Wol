import fs from 'node:fs';
import path from 'node:path';

export interface SshKeyInfo {
  name: string;
  path: string;
}

const ignoredNames = new Set(['config', 'known_hosts', 'authorized_keys']);

export function listSshKeys(directory: string): SshKeyInfo[] {
  if (!fs.existsSync(directory)) return [];

  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => !name.endsWith('.pub'))
    .filter((name) => !ignoredNames.has(name))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name, path: path.join(directory, name) }));
}
