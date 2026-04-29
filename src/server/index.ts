import path from 'node:path';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { configureStaticServing } from './static.js';
import { listSshKeys } from './sshKeys.js';

const port = Number(process.env.PORT || 8080);
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD environment variable is required');
}

const dbPath = process.env.DB_PATH || '/app/data/easy-wol.sqlite';
const sshKeyDir = process.env.SSH_KEY_DIR || '/app/ssh';
const app = createApp({
  db: createDatabase(dbPath),
  adminPassword,
  enableScheduler: true,
  sshKeyProvider: () => listSshKeys(sshKeyDir)
});

configureStaticServing(app, path.resolve('dist/public'));

app.listen(port, () => {
  console.log(`Easy-WoL listening on ${port}`);
});
