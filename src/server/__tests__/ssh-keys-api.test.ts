import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../app.js';
import { createDatabase } from '../db.js';

describe('ssh keys api', () => {
  it('returns configured ssh keys to authenticated users', async () => {
    const app = createApp({
      db: createDatabase(':memory:'),
      adminPassword: 'secret',
      sshKeyProvider: () => [{ name: 'office', path: '/app/ssh/office' }]
    });
    const agent = request.agent(app);

    await agent.get('/api/ssh-keys').expect(401);
    await agent.post('/api/login').send({ password: 'secret' }).expect(200);

    const response = await agent.get('/api/ssh-keys').expect(200);
    expect(response.body).toEqual([{ name: 'office', path: '/app/ssh/office' }]);
  });
});
