import { Router } from 'express';

import {
  getInstallationGrantForRepository,
  getSessionUserId,
} from '../services/auth.js';
import { findInstallationForRepository } from '../services/github-app.js';
import {
  parseGitHubRepositoryUrl,
  scanGitHubRepository,
} from '../services/repository-scan.js';

export const repositoryRouter = Router();

async function resolveRepositoryAccess(
  req: { headers: Record<string, string | string[] | undefined> },
  url: string,
  requirePrivate: boolean,
) {
  const parsed = parseGitHubRepositoryUrl(url);
  const userId = getSessionUserId(req as never);

  if (requirePrivate) {
    if (!userId) {
      const error = new Error(
        'Authentication required for private repository access.',
      );
      Object.assign(error, { status: 401 });
      throw error;
    }

    let grant = getInstallationGrantForRepository(
      userId,
      parsed.owner,
      parsed.name,
    );

    if (!grant) {
      grant = await findInstallationForRepository(parsed.owner, parsed.name);
    }

    if (!grant) {
      const error = new Error(
        'Repository access is not authorized for this user.',
      );
      Object.assign(error, { status: 403 });
      throw error;
    }

    return {
      kind: 'installation' as const,
      installationId: grant.installationId,
      repositoryId: grant.repositoryId,
    };
  }

  return { kind: 'public' as const };
}

repositoryRouter.post('/scan', async (req, res) => {
  const { url, allowPrivate, private: privateRequested } = req.body;

  if (typeof url !== 'string' || !url.trim()) {
    res.status(400).json({
      error: 'Repository URL is required',
    });

    return;
  }

  const shouldRequirePrivate = Boolean(allowPrivate || privateRequested);

  try {
    const access = await resolveRepositoryAccess(
      req,
      url,
      shouldRequirePrivate,
    );
    const result = await scanGitHubRepository(url, access);

    res.json(result);
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
          : status === 404
            ? 'Repository not found or private.'
            : error instanceof Error
              ? error.message
              : 'Failed to scan repository';

    res.status(typeof status === 'number' ? status : 400).json({
      error: message,
    });
  }
});
