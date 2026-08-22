import type { GitHubRepository } from './github.js';

export interface RepositorySnapshot {
  repository: GitHubRepository;
  files: RepositoryFile[];
  directories: RepositoryDirectory[];
}

export interface RepositoryFile {
  path: string;
  name: string;
  extension: string | null;
  size?: number;
}

export interface RepositoryDirectory {
  path: string;
  name: string;
}
