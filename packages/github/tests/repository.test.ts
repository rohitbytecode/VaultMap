import { describe, expect, it } from 'vitest';

import { getRepository, getRepositoryTree } from '../src/index.js';

describe('GitHub repository adapter', () => {
  it('fetches repository metadata', async () => {
    const repository = await getRepository('facebook', 'react');

    expect(repository.owner).toBe('facebook');
    expect(repository.name).toBe('react');
    expect(repository.defaultBranch).toBeTruthy();
    expect(repository.url).toContain('github.com');
  });

  it('fetches the recursive repository tree', async () => {
    const repository = await getRepository('facebook', 'react');

    const tree = await getRepositoryTree(
      repository.owner,
      repository.name,
      repository.defaultBranch,
    );

    expect(tree.length).toBeGreaterThan(0);
    expect(tree.some((entry) => entry.type === 'tree')).toBe(true);
    expect(tree.some((entry) => entry.type === 'blob')).toBe(true);
  });
});
