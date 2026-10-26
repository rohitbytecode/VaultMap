import { App } from 'octokit';
import type { Octokit } from 'octokit';

function normalizePrivateKey(privateKey: string): string {
  const cleaned = privateKey.trim().replace(/\\n/g, '\n').replace(/\r/g, '');
  const headerMatch = cleaned.match(/(-----BEGIN[^-]+-----)(.+)(-----END[^-]+-----)/s);
  if (headerMatch && headerMatch[1] && headerMatch[2] && headerMatch[3]) {
    const header = headerMatch[1].trim();
    const body = headerMatch[2].replace(/\s+/g, '');
    const footer = headerMatch[3].trim();
    const bodyLines = body.match(/.{1,64}/g)?.join('\n') ?? body;
    return `${header}\n${bodyLines}\n${footer}\n`;
  }
  return cleaned;
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

export async function listAllAccessibleRepositories(): Promise<
  Array<{
    installationId: number;
    repositoryId: number;
    repositoryOwner: string;
    repositoryName: string;
  }>
> {
  const githubApp = getGitHubApp();
  if (!githubApp) return [];

  try {
    const { data: installations } = await githubApp.octokit.request(
      'GET /app/installations',
      { per_page: 100 },
    );

    const results: Array<{
      installationId: number;
      repositoryId: number;
      repositoryOwner: string;
      repositoryName: string;
    }> = [];

    for (const installation of installations) {
      try {
        const client = await githubApp.getInstallationOctokit(installation.id);
        const { data } =
          await client.rest.apps.listReposAccessibleToInstallation({
            per_page: 100,
          });

        for (const repo of data.repositories) {
          results.push({
            installationId: installation.id,
            repositoryId: repo.id,
            repositoryOwner: repo.owner.login,
            repositoryName: repo.name,
          });
        }
      } catch {
        // Skip inaccessible installations
      }
    }

    return results;
  } catch {
    return [];
  }
}
