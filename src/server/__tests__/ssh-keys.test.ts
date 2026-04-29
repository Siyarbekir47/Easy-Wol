import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { listSshKeys } from '../sshKeys.js';

describe('ssh key listing', () => {
  it('lists private key files from the configured directory and ignores public/metadata files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-wol-keys-'));
    fs.writeFileSync(path.join(dir, 'office_ed25519'), 'private');
    fs.writeFileSync(path.join(dir, 'lab.pem'), 'private');
    fs.writeFileSync(path.join(dir, 'office_ed25519.pub'), 'public');
    fs.writeFileSync(path.join(dir, 'config'), 'host config');

    expect(listSshKeys(dir)).toEqual([
      { name: 'lab.pem', path: path.join(dir, 'lab.pem') },
      { name: 'office_ed25519', path: path.join(dir, 'office_ed25519') }
    ]);
  });

  it('returns an empty list when the directory does not exist', () => {
    expect(listSshKeys(path.join(os.tmpdir(), 'easy-wol-missing-keys'))).toEqual([]);
  });
});
