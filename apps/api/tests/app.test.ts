import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { app } from '../src/app.js';

describe('API', () => {
  it('returns a healthy status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      message: 'Backend is online',
    });
  });

  it('allows credentialed browser requests from localhost', async () => {
    const response = await request(app)
      .options('/api/github/auth/start')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('accepts a GitHub App installation callback without an OAuth code', async () => {
    process.env.GITHUB_APP_CLIENT_ID = 'test-client-id';

    const startResponse = await request(app).get('/api/github/auth/start');
    const state = startResponse.body.state;
    const cookieHeader = startResponse.headers['set-cookie']?.[0] ?? '';

    const response = await request(app)
      .get('/api/github/auth/callback')
      .query({ state, installation_id: '123' })
      .set('Cookie', cookieHeader.split(';')[0]);

    expect(response.status).toBe(200);
    expect(response.body.authenticated).toBe(true);
    expect(response.body.installationId).toBe(123);
  });

  it('rejects a missing repository URL', async () => {
    const response = await request(app).post('/api/repositories/scan').send({});

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Repository URL is required',
    });
  });

  it('rejects an invalid repository URL', async () => {
    const response = await request(app).post('/api/repositories/scan').send({
      url: 'https://gitlab.com/example/project',
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: 'Only GitHub repositories are supported',
    });
  });

  it('requires authentication for private repository scans', async () => {
    const response = await request(app).post('/api/repositories/scan').send({
      url: 'https://github.com/acme/private-repo',
      allowPrivate: true,
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/authentication|login|session/i);
  });

  it('requires authentication for private file reads', async () => {
    const response = await request(app).get('/api/repositories/file').query({
      owner: 'acme',
      repository: 'private-repo',
      path: 'README.md',
      branch: 'main',
    });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/authentication|login|session/i);
  });

  it('rejects GitHub App installation binding without a valid server-side state', async () => {
    const response = await request(app)
      .post('/api/github/installations')
      .send({
        installationId: 123,
        repositoryIds: [789],
        state: 'bad-state',
      });

    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/state|invalid/i);
  });

  it('scans a public GitHub repository', async () => {
    const response = await request(app).post('/api/repositories/scan').send({
      url: 'https://github.com/facebook/react',
    });

    expect(response.status).toBe(200);

    expect(response.body.snapshot.repository).toMatchObject({
      name: 'react',
      defaultBranch: expect.any(String),
    });
    expect(response.body.snapshot.repository.owner).toMatch(/react|facebook/);

    expect(response.body.snapshot.files.length).toBeGreaterThan(0);

    expect(response.body.snapshot.directories.length).toBeGreaterThan(0);

    expect(response.body.statistics.totalFiles).toBe(
      response.body.snapshot.files.length,
    );

    expect(response.body.statistics.totalDirectories).toBe(
      response.body.snapshot.directories.length,
    );
  });
});
