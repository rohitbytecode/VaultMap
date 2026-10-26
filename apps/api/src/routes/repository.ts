import { Router } from 'express';

import { scanGitHubRepository } from '../services/repository-scan.js';

export const repositoryRouter = Router();

repositoryRouter.post('/scan', async (req, res) => {
  const { url } = req.body;

  if (typeof url !== 'string' || !url.trim()) {
    res.status(400).json({
      error: 'Repository URL is required',
    });

    return;
  }

  try {
    const result = await scanGitHubRepository(url);

    res.json(result);
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : undefined;
    const message =
      status === 404
        ? 'Repository not found or private. Private repository support is currently under development; please use a public repository.'
        : error instanceof Error
          ? error.message
          : 'Failed to scan repository';

    res.status(status === 404 ? 404 : 400).json({
      error: message,
    });
  }
});
