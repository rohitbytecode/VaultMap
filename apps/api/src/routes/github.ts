import { Router } from 'express';

import {
  clearSessionCookie,
  generateGithubStateCookie,
  getSessionUserId,
  getStateReturnTo,
  listAuthorizedRepositories,
  revokeInstallationForUser,
  setInstallationGrant,
  setSessionCookie,
  validateGithubState,
} from '../services/auth.js';
import { getGitHubApp } from '../services/github-app.js';

export const githubRouter = Router();

// ─── Start GitHub OAuth Flow ─────────────────────────────────────────────────
githubRouter.get('/auth/start', (req, res) => {
  const clientId = process.env.GITHUB_APP_CLIENT_ID;

  if (!clientId) {
    res.status(501).json({
      error: 'GitHub App is not configured on this server.',
    });
    return;
  }

  // Preserve the caller's origin/return URL if supplied
  const returnTo =
    typeof req.query.return_to === 'string' && req.query.return_to.trim()
      ? req.query.return_to.trim()
      : typeof req.headers.origin === 'string' && req.headers.origin.trim()
        ? req.headers.origin.trim()
        : undefined;

  const state = generateGithubStateCookie(res, returnTo);

  // Build the OAuth authorize URL
  const authUrl = new URL('https://github.com/login/oauth/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('scope', '');

  res.json({
    redirectUrl: authUrl.toString(),
    state,
  });
});

// ─── Auth Callback ────────────────────────────────────────────────────────────
githubRouter.get('/auth/callback', async (req, res) => {
  const { state, code, installation_id } = req.query;

  if (typeof state !== 'string') {
    res.status(400).json({ error: 'GitHub callback parameters are invalid.' });
    return;
  }

  if (!validateGithubState(req, state)) {
    res.status(400).json({ error: 'Invalid or expired GitHub state.' });
    return;
  }

  const hasCode = typeof code === 'string';
  const hasInstallationId =
    typeof installation_id === 'string' && installation_id.length > 0;

  if (!hasCode && !hasInstallationId) {
    res.status(400).json({ error: 'GitHub callback parameters are invalid.' });
    return;
  }

  const returnTo = getStateReturnTo(state);

  const clientId = process.env.GITHUB_APP_CLIENT_ID;
  const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;

  const userId = `github-user-${Date.now()}`;
  const sessionToken = setSessionCookie(res, userId);

  // ── Step 1: exchange code for user access token ──────────────────────────
  let userToken: string | null = null;

  if (hasCode && clientId && clientSecret) {
    try {
      const tokenResponse = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
          }),
        },
      );

      if (tokenResponse.ok) {
        const tokenData = (await tokenResponse.json()) as {
          access_token?: string;
          error?: string;
        };
        if (tokenData.access_token) {
          userToken = tokenData.access_token;
        }
      }
    } catch {
      // Continue without a user token — we can still try via installation_id.
    }
  }

  // ── Step 2: discover installations ──────────────────────────────────────
  const githubApp = getGitHubApp();
  let registeredAny = false;

  if (userToken && githubApp) {
    try {
      const installsResponse = await fetch(
        'https://api.github.com/user/installations',
        {
          headers: {
            Authorization: `Bearer ${userToken}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
      );

      if (installsResponse.ok) {
        const { installations } = (await installsResponse.json()) as {
          installations: Array<{ id: number }>;
        };

        for (const install of installations) {
          try {
            const client = await githubApp.getInstallationOctokit(install.id);
            const { data } =
              await client.rest.apps.listReposAccessibleToInstallation({
                per_page: 100,
              });

            for (const repo of data.repositories) {
              setInstallationGrant(
                userId,
                install.id,
                [repo.id],
                repo.owner.login,
                repo.name,
              );
            }
            registeredAny = true;
          } catch {
            // Skip installations we can't introspect.
          }
        }
      }
    } catch {
      // Fall through to installation_id fallback below.
    }
  }

  // ── Step 3: fallback — use explicit installation_id if provided ──────────
  let installId: number | null = null;
  if (hasInstallationId) {
    installId = Number(installation_id);
    if (!registeredAny && Number.isInteger(installId) && installId > 0 && githubApp) {
      try {
        const client = await githubApp.getInstallationOctokit(installId);
        const { data } =
          await client.rest.apps.listReposAccessibleToInstallation({
            per_page: 100,
          });

        for (const repo of data.repositories) {
          setInstallationGrant(
            userId,
            installId,
            [repo.id],
            repo.owner.login,
            repo.name,
          );
        }
        registeredAny = true;
      } catch {
        // Session is still created
      }
    }
  }

  // ── Redirect back to the frontend ────────────────────────────────────────
  const frontendUrl =
    returnTo ||
    process.env.FRONTEND_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://vaultmap.rohitdmore.in'
      : 'http://localhost:5173');

  const acceptsHtml =
    typeof req.headers.accept === 'string' &&
    (req.headers.accept.includes('text/html') ||
      req.headers.accept.includes('application/xhtml+xml'));

  if (!acceptsHtml) {
    res.json({
      authenticated: true,
      userId,
      token: sessionToken,
      installationId: installId ?? (hasInstallationId ? Number(installation_id) : undefined),
      registeredAny,
    });
    return;
  }

  const repoCount = listAuthorizedRepositories(userId).length;
  res.redirect(
    `${frontendUrl}/?github=connected&token=${encodeURIComponent(sessionToken)}&repos=${String(repoCount)}`,
  );
});

// ─── Manual Installation Binding ──────────────────────────────────────────────
githubRouter.post('/installations', (req, res) => {
  const {
    installationId,
    repositoryIds,
    state,
    repositoryOwner,
    repositoryName,
  } = req.body as {
    installationId?: unknown;
    repositoryIds?: unknown;
    state?: unknown;
    repositoryOwner?: unknown;
    repositoryName?: unknown;
  };

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

  if (!Number.isInteger(installationId) || (installationId as number) <= 0) {
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
    installationId as number,
    repositoryList.filter((id) => Number.isInteger(id)) as number[],
    typeof repositoryOwner === 'string' ? repositoryOwner : 'owner',
    typeof repositoryName === 'string' ? repositoryName : 'repo',
  );

  res.json({
    ok: true,
    installationId,
    repositories: listAuthorizedRepositories(userId),
  });
});

// ─── Status ───────────────────────────────────────────────────────────────────
githubRouter.get('/status', (req, res) => {
  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.json({ connected: false, repositories: [] });
    return;
  }

  const repositories = listAuthorizedRepositories(userId);
  res.json({ connected: true, repositories });
});

// ─── Repository Listing ───────────────────────────────────────────────────────
githubRouter.get('/repositories', (req, res) => {
  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required for repository listing.',
    });
    return;
  }

  res.json({ repositories: listAuthorizedRepositories(userId) });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────
githubRouter.post('/disconnect', (req, res) => {
  const userId = getSessionUserId(req as never);

  if (!userId) {
    res.status(401).json({
      error: 'Authentication required to disconnect GitHub.',
    });
    return;
  }

  const { installationId } = req.body as { installationId?: unknown };

  if (installationId !== undefined && Number.isInteger(installationId)) {
    revokeInstallationForUser(userId, installationId as number);
  }

  clearSessionCookie(res);

  res.json({ ok: true, disconnected: true });
});
