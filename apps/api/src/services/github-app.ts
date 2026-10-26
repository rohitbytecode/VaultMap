import { App } from 'octokit';
import type { Octokit } from 'octokit';

function normalizePrivateKey(privateKey: string): string {
  return privateKey
    .trim()
    .replace(/\\n/g, '\n')
    .replace(/\r/g, '')
    .split(/\s+/)
    .join('\n');
}

export function getGitHubApp(): App | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    return null;
  }

  return new App({
    appId,
    privateKey: normalizePrivateKey(privateKey),
  });
}

export async function createInstallationClient(
  installationId: number,
): Promise<Octokit> {
  const githubApp = getGitHubApp();

  if (!githubApp) {
    const error = new Error('GitHub App is not configured on the server.');
    Object.assign(error, { status: 500 });
    throw error;
  }

  return githubApp.getInstallationOctokit(installationId);
}

export async function findInstallationForRepository(
  owner: string,
  name: string,
): Promise<{ installationId: number; repositoryId: number } | null> {
  const githubApp = getGitHubApp();

  if (!githubApp) {
    return null;
  }

  const { data: installations } = await githubApp.octokit.request(
    'GET /app/installations',
    { per_page: 100 },
  );

  for (const installation of installations) {
    const client = await githubApp.getInstallationOctokit(installation.id);
    const { data } = await client.rest.apps.listReposAccessibleToInstallation({
      per_page: 100,
    });

    const repository = data.repositories.find(
      (repo) =>
        repo.full_name === `${owner}/${name}` ||
        (repo.owner.login === owner && repo.name === name),
    );

    if (repository) {
      return {
        installationId: installation.id,
        repositoryId: repository.id,
      };
    }
  }

  return null;
}

export async function createInstallationClientForRepository(
  installationId: number,
  repositoryId?: number,
): Promise<Octokit> {
  const client = await createInstallationClient(installationId);

  if (repositoryId !== undefined) {
    const { data } = await client.rest.apps.listReposAccessibleToInstallation();

    const isAccessible = data.repositories.some(
      (repo) => repo.id === repositoryId,
    );

    if (!isAccessible) {
      const error = new Error(
        'Repository is outside the authorized installation scope.',
      );
      Object.assign(error, { status: 403 });
      throw error;
    }
  }

  return client;
}
