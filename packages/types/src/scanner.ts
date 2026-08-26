import type { RepositorySnapshot } from './repository.js';
import type { RepositoryTreeNode } from './tree.js';

export interface ScanResult {
  snapshot: RepositorySnapshot;
  statistics: RepositoryStatistics;
  tree: RepositoryTreeNode[];
}

export interface RepositoryStatistics {
  totalFiles: number;
  totalDirectories: number;
  totalSize: number;
  extensions: Record<string, number>;
}
