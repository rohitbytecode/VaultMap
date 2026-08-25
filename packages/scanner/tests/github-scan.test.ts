import { describe, expect, it } from 'vitest';

import { getRepository, getRepositoryTree } from '@vaultmap/github';

import { scanRepository } from '../src/index.js';

describe('GitHub repository scan', () => {
  it('scans a real public repository end-to-end', async () => {
    const repository = await getRepository('facebook', 'react');

    const tree = await getRepositoryTree(
      repository.owner,
      repository.name,
      repository.defaultBranch,
    );

    const result = scanRepository(repository, tree);

    expect(result.snapshot.repository).toEqual(repository);

    expect(result.snapshot.files.length).toBeGreaterThan(0);

    expect(result.snapshot.directories.length).toBeGreaterThan(0);

    expect(result.statistics.totalFiles).toBe(result.snapshot.files.length);

    expect(result.statistics.totalDirectories).toBe(
      result.snapshot.directories.length,
    );

    expect(Object.keys(result.statistics.extensions).length).toBeGreaterThan(0);
  });
});
