export interface GitHubRepository {
  id?: number;
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
  private?: boolean;
}

export interface GitHubTreeEntry {
  path: string;
  type: 'blob' | 'tree';
  size?: number;
}
