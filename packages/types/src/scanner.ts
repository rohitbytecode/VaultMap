import type { RepositorySnapshot } from './repository.js';

export interface ScanResult {
  snapshot: RepositorySnapshot;
  statistics: RepositoryStatistics;
}

export interface RepositoryStatistics {
  totalFiles: number;
  totalDirectories: number;
  extensions: Record<string, number>;
}
