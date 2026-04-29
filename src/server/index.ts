import path from 'node:path';
import express from 'express';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 8080);
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD environment variable is required');
}

const dbPath = process.env.DB_PATH || '/app/data/easy-wol.sqlite';
const app = createApp({ db: createDatabase(dbPath), adminPassword });
const publicDir = path.resolve('dist/public');

app.use(express.static(publicDir));
app.get('*', (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

app.listen(port, () => {
  console.log(`Easy-WoL listening on ${port}`);
});
