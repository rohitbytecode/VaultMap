import { getRepository, getRepositoryTree } from '@vaultmap/github';
import { scanRepository } from '@vaultmap/scanner';

export async function scanGitHubRepository(url: string) {
  const { owner, name } = parseGitHubRepositoryUrl(url);

  const repository = await getRepository(owner, name);

  const tree = await getRepositoryTree(
    repository.owner,
    repository.name,
    repository.defaultBranch,
  );

  return scanRepository(repository, tree);
}

function parseGitHubRepositoryUrl(url: string): {
  owner: string;
  name: string;
} {
  const parsedUrl = new URL(url);

  if (parsedUrl.hostname !== 'github.com') {
    throw new Error('Only GitHub repositories are supported');
  }

  const segments = parsedUrl.pathname.split('/').filter(Boolean);

  if (segments.length < 2) {
    throw new Error('Invalid GitHub repository URL');
  }

  const [owner, repository] = segments as [string, string];

  const name = repository?.replace(/\.git$/, '');

  return {
    owner,
    name,
  };
}
