import {
  createGitHubClient,
  getRepository,
  getRepositoryTree,
} from '@vaultmap/github';
import { scanRepository } from '@vaultmap/scanner';

import { createInstallationClientForRepository } from './github-app.js';

export type ScanAccess =
  | { kind: 'public' }
  | {
      kind: 'installation';
      installationId: number;
      repositoryId: number;
    };

export function parseGitHubRepositoryUrl(url: string): {
  owner: string;
  name: string;
  repositoryId?: number;
} {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Repository URL is required');
  }

  let parsed: URL;

  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Only GitHub repositories are supported');
  }

  if (!['github.com', 'www.github.com'].includes(parsed.hostname)) {
    throw new Error('Only GitHub repositories are supported');
  }

  const segments = parsed.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error('Malformed GitHub repository URL');
  }

  const owner = segments[0];
  const nameSegment = segments[1];

  if (!nameSegment) {
    throw new Error('Malformed GitHub repository URL');
  }

  const rawName = nameSegment.replace(/\.git$/, '');

  if (!owner || !rawName || rawName.includes('/') || owner.includes('/')) {
    throw new Error('Malformed GitHub repository URL');
  }

  return {
    owner,
    name: rawName,
  };
}

export async function scanGitHubRepository(
  url: string,
  access: ScanAccess = { kind: 'public' },
) {
  const { owner, name } = parseGitHubRepositoryUrl(url);

  const client =
    access.kind === 'installation'
      ? await createInstallationClientForRepository(
          access.installationId,
          access.repositoryId,
        )
      : createGitHubClient(process.env.GITHUB_TOKEN);

  const repository = await getRepository(client, owner, name);

  if (access.kind === 'installation' && repository.id !== access.repositoryId) {
    const error = new Error('Repository access could not be verified.');
    Object.assign(error, { status: 403 });
    throw error;
  }

  const tree = await getRepositoryTree(
    client,
    repository.owner,
    repository.name,
    repository.defaultBranch,
  );

  return scanRepository(repository, tree);
}
