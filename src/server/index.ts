import path from 'node:path';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { configureStaticServing } from './static.js';

const port = Number(process.env.PORT || 8080);
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminPassword) {
  throw new Error('ADMIN_PASSWORD environment variable is required');
}

const dbPath = process.env.DB_PATH || '/app/data/easy-wol.sqlite';
const app = createApp({ db: createDatabase(dbPath), adminPassword });

configureStaticServing(app, path.resolve('dist/public'));

app.listen(port, () => {
  console.log(`Easy-WoL listening on ${port}`);
});
