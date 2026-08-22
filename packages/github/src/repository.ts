import type { GitHubRepository, GitHubTreeEntry } from '@vaultmap/types';

import { githubClient } from './client.js';

export async function getRepository(
  owner: string,
  name: string,
): Promise<GitHubRepository> {
  const { data } = await githubClient.rest.repos.get({
    owner,
    repo: name,
  });

  return {
    owner: data.owner.login,
    name: data.name,
    url: data.html_url,
    defaultBranch: data.default_branch,
  };
}

export async function getRepositoryTree(
  owner: string,
  name: string,
  branch: string,
): Promise<GitHubTreeEntry[]> {
  const { data } = await githubClient.rest.git.getTree({
    owner,
    repo: name,
    tree_sha: branch,
    recursive: 'true',
  });

  return data.tree
    .filter(
      (entry): entry is typeof entry & { type: 'blob' | 'tree' } =>
        entry.type === 'blob' || entry.type === 'tree',
    )
    .map((entry) => ({
      path: entry.path,
      type: entry.type,
      ...(entry.size !== undefined && {
        size: entry.size,
      }),
    }));
}
