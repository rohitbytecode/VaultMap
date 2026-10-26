import { Router } from 'express';

import {
  createGitHubClient,
  getRepository,
  getRepositoryFile,
} from '@vaultmap/github';

import {
  getInstallationGrantForRepository,
  getSessionUserId,
} from '../services/auth.js';
import {
  createInstallationClient,
  findInstallationForRepository,
} from '../services/github-app.js';

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
    const userId = getSessionUserId(req as never);

    if (userId) {
      let grant = getInstallationGrantForRepository(userId, owner, repository);

      if (!grant) {
        grant = await findInstallationForRepository(owner, repository);
      }

      if (grant) {
        const client = await createInstallationClient(grant.installationId);
        const metadata = await getRepository(client, owner, repository);

        if (metadata.id !== grant.repositoryId) {
          const error = new Error('Repository access could not be verified.');
          Object.assign(error, { status: 403 });
          throw error;
        }

        const file = await getRepositoryFile(
          client,
          owner,
          repository,
          path,
          resolvedBranch,
        );

        res.json(file);
        return;
      }
    }

    let client = createGitHubClient(process.env.GITHUB_TOKEN);

    try {
      await getRepository(client, owner, repository);
    } catch (error) {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? error.status
          : undefined;

      if (status === 401 || status === 403 || status === 404) {
        const authError = new Error(
          'Authentication required for private repository access.',
        );
        Object.assign(authError, { status: 401 });
        throw authError;
      }

      throw error;
    }

    const file = await getRepositoryFile(
      client,
      owner,
      repository,
      path,
      resolvedBranch,
    );

    res.json(file);
    return;
  } catch (error) {
    const status =
      typeof error === 'object' && error !== null && 'status' in error
        ? error.status
        : undefined;
    const message =
      status === 401
        ? 'Authentication required for private repository access.'
        : status === 403
          ? 'Repository access is not authorized for this user.'
          : error instanceof Error
            ? error.message
            : 'Failed to fetch repository file';

    res.status(typeof status === 'number' ? status : 400).json({
      error: message,
    });
  }
});
