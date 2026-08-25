import { Router } from 'express';

import { scanGitHubRepository } from '../services/repository-scan.js';
import { error } from 'console';

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
    const message =
      error instanceof Error ? error.message : 'Failed to scan repository';

    res.status(400).json({
      error: message,
    });
  }
});
