export interface GitHubRepository {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}
