import { Router } from 'express';

import { getRepositoryFile } from '@vaultmap/github';

export const fileRouter = Router();

fileRouter.get('/', async (req, res) => {
  const { owner, repository, path, branch } = req.query;

  if (
    typeof owner !== 'string' ||
    !owner.trim() ||
    typeof repository !== 'string' ||
    !repository.trim() ||
    typeof path !== 'string' ||
    !path.trim()
  ) {
    res.status(400).json({
      error: 'Repository owner, name, and file path are required',
    });

    return;
  }

  const resolvedBranch =
    typeof branch === 'string' && branch.trim() ? branch : 'main';

  try {
    const file = await getRepositoryFile(
      owner,
      repository,
      path,
      resolvedBranch,
    );

    res.json(file);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : 'Failed to fetch repository file';

    res.status(400).json({
      error: message,
    });
  }
});
