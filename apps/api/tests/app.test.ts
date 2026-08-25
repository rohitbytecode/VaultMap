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

  it('scans a public GitHub repository', async () => {
    const response = await request(app).post('/api/repositories/scan').send({
      url: 'https://github.com/facebook/react',
    });

    expect(response.status).toBe(200);

    expect(response.body.snapshot.repository).toMatchObject({
      owner: 'facebook',
      name: 'react',
      defaultBranch: expect.any(String),
    });

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
