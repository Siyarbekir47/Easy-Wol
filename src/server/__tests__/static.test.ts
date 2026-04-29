import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { configureStaticServing } from '../static.js';

describe('static serving', () => {
  it('serves index.html for client-side routes', async () => {
    const publicDir = fs.mkdtempSync(path.join(os.tmpdir(), 'easy-wol-public-'));
    fs.writeFileSync(path.join(publicDir, 'index.html'), '<main>Easy-WoL</main>');
    const app = express();

    configureStaticServing(app, publicDir);

    const response = await request(app).get('/sites/remote').expect(200);
    expect(response.text).toContain('Easy-WoL');
  });
});
