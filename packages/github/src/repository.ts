import type { Octokit } from 'octokit';
import type { GitHubRepository, GitHubTreeEntry } from '@vaultmap/types';

export async function getRepository(
  client: Octokit,
  owner: string,
  name: string,
): Promise<GitHubRepository> {
  const { data } = await client.rest.repos.get({
    owner,
    repo: name,
  });

  return {
    id: data.id,
    owner: data.owner.login,
    name: data.name,
    url: data.html_url,
    defaultBranch: data.default_branch,
    private: data.private,
  };
}

export async function getRepositoryTree(
  client: Octokit,
  owner: string,
  name: string,
  branch: string,
): Promise<GitHubTreeEntry[]> {
  const { data } = await client.rest.git.getTree({
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
