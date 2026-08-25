import {
  GitHubRepository,
  GitHubTreeEntry,
  RepositoryDirectory,
  RepositoryFile,
  RepositoryStatistics,
  RepositorySnapshot,
  ScanResult,
} from '@vaultmap/types';

export function scanRepository(
  repository: GitHubRepository,
  tree: GitHubTreeEntry[],
): ScanResult {
  const files: RepositoryFile[] = [];
  const directories: RepositoryDirectory[] = [];

  for (const entry of tree) {
    const name = getEntryName(entry.path);

    if (entry.type === 'tree') {
      directories.push({
        path: entry.path,
        name,
      });

      continue;
    }

    files.push({
      path: entry.path,
      name,
      extension: getFileExtension(name),
      ...(entry.size !== undefined && {
        size: entry.size,
      }),
    });
  }

  const statistics = createStatistics(files, directories);

  const snapshot: RepositorySnapshot = {
    repository,
    files,
    directories,
  };

  return {
    snapshot,
    statistics,
  };
}

function getEntryName(path: string): string {
  const segments = path.split('/');

  return segments.at(-1) ?? path;
}

function getFileExtension(name: string): string | null {
  const lastDot = name.lastIndexOf('.');

  if (lastDot <= 0) {
    return null;
  }

  return name.slice(lastDot).toLowerCase();
}

function createStatistics(
  files: RepositoryFile[],
  directories: RepositoryDirectory[],
): RepositoryStatistics {
  const extensions: Record<string, number> = {};

  for (const file of files) {
    if (!file.extension) {
      continue;
    }
    extensions[file.extension] = (extensions[file.extension] ?? 0) + 1;
  }

  return {
    totalFiles: files.length,
    totalDirectories: directories.length,
    extensions,
  };
}
