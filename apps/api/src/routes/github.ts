import { Router } from 'express';

import {
  clearSessionCookie,
  generateGithubStateCookie,
  getSessionUserId,
  listAuthorizedRepositories,
  revokeInstallationForUser,
  setInstallationGrant,
  setSessionCookie,
  validateGithubState,
} from '../services/auth.js';
import { createInstallationClient } from '../services/github-app.js';

export const githubRouter = Router();

githubRouter.get('/auth/start', (_req, res) => {
  const state = generateGithubStateCookie(res);

  if (!process.env.GITHUB_APP_CLIENT_ID) {
    res.status(501).json({
      error: 'GitHub App is not configured on this server.',
    });
    return;
  }

  const appSlug = process.env.GITHUB_APP_NAME ?? 'vaultmap';
  const configuredSetupUrl = process.env.GITHUB_APP_SETUP_URL;
  const redirectUrl = new URL(
    configuredSetupUrl ??
      `https://github.com/apps/${appSlug}/installations/new`,
  );

  redirectUrl.searchParams.set('state', state);

  res.json({
    redirectUrl: redirectUrl.toString(),
    state,
  });
});

githubRouter.get('/auth/callback', async (req, res) => {
  const { state, code, installation_id } = req.query;

  if (typeof state !== 'string') {
    res.status(400).json({
      error: 'GitHub callback parameters are invalid.',
    });
    return;
  }

  if (!validateGithubState(req, state)) {
    res.status(400).json({
      error: 'Invalid or expired GitHub state.',
    });
    return;
  }

  if (typeof code !== 'string' && typeof installation_id !== 'string') {
    res.status(400).json({
      error: 'GitHub callback parameters are invalid.',
    });
    return;
  }

  const userId = `github-user-${Date.now()}`;
  setSessionCookie(res, userId);

  let installationId: number | null = null;

  if (typeof installation_id === 'string') {
    installationId = Number(installation_id);

    if (Number.isInteger(installationId) && installationId > 0) {
      try {
        const client = await createInstallationClient(installationId);
        const { data } =
          await client.rest.apps.listReposAccessibleToInstallation({
            per_page: 100,
          });

        for (const repo of data.repositories) {
          setInstallationGrant(
            userId,
            installationId,
            [repo.id],
            repo.owner.login,
            repo.name,
          );
        }
      } catch {
        // The callback may still succeed even if repository metadata lookup fails;
        // the session will still be created and the user can retry access.
      }
    }
  }

  const frontendUrl =
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://vaultmap-web.vercel.app'
      : 'http://localhost:5173');

  const acceptsHtml =
    typeof req.headers.accept === 'string' &&
    (req.headers.accept.includes('text/html') ||
      req.headers.accept.includes('application/xhtml+xml'));

  if (!acceptsHtml) {
    res.json({
      authenticated: true,
      userId,
      installationId,
    });
    return;
  }

  res.redirect(`${frontendUrl}/?github=connected`);
});

githubRouter.post('/installations', (req, res) => {
  const {
    installationId,
    repositoryIds,
    state,
    repositoryOwner,
    repositoryName,
  } = req.body;

  if (typeof state !== 'string' || !validateGithubState(req, state)) {
    res.status(400).json({
      error: 'Invalid or expired GitHub state.',
    });
    return;
  }

  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required for GitHub App installation binding.',
    });
    return;
  }

  if (!Number.isInteger(installationId) || installationId <= 0) {
    res.status(400).json({
      error: 'Installation ID is required.',
    });
    return;
  }

  const repositoryList = Array.isArray(repositoryIds) ? repositoryIds : [];

  if (!repositoryList.length) {
    res.status(400).json({
      error: 'At least one repository ID is required.',
    });
    return;
  }

  setInstallationGrant(
    userId,
    installationId,
    repositoryList.filter((id) => Number.isInteger(id)),
    typeof repositoryOwner === 'string' ? repositoryOwner : 'owner',
    typeof repositoryName === 'string' ? repositoryName : 'repo',
  );

  res.json({
    ok: true,
    installationId,
    repositories: listAuthorizedRepositories(userId),
  });
});

githubRouter.get('/repositories', (req, res) => {
  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required for repository listing.',
    });
    return;
  }

  res.json({
    repositories: listAuthorizedRepositories(userId),
  });
});

githubRouter.post('/disconnect', (req, res) => {
  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required to disconnect GitHub.',
    });
    return;
  }

  const { installationId } = req.body;

  if (installationId !== undefined && Number.isInteger(installationId)) {
    revokeInstallationForUser(userId, installationId);
  }

  clearSessionCookie(res);

  res.json({
    ok: true,
    disconnected: true,
  });
});
