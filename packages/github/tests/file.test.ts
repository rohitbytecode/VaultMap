import { describe, expect, it } from 'vitest';

import { getRepositoryFile } from '../src/index.js';

describe('GitHub file adapter', () => {
  it('fetches and decodes a repository file', async () => {
    const file = await getRepositoryFile(
      'facebook',
      'react',
      'README.md',
      'main',
    );

    expect(file.path).toBe('README.md');
    expect(file.name).toBe('README.md');
    expect(file.extension).toBe('.md');
    expect(file.encoding).toBe('base64');
    expect(file.size).toBeGreaterThan(0);
    expect(file.content.length).toBeGreaterThan(0);
    expect(file.content).toContain('React');
  });

  it('rejects a directory path', async () => {
    await expect(
      getRepositoryFile('facebook', 'react', 'packages', 'main'),
    ).rejects.toThrow();
  });
});
