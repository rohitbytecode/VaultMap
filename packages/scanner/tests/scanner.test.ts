import { describe, expect, it } from 'vitest';

import { scanRepository } from '../src/index.js';

const repository = {
  owner: 'example',
  name: 'project',
  url: 'https://github.com/example/project',
  defaultBranch: 'main',
};

describe('scanRepository', () => {
  it('separates files and directories', () => {
    const result = scanRepository(repository, [
      {
        path: 'src',
        type: 'tree',
      },
      {
        path: 'src/index.ts',
        type: 'blob',
        size: 100,
      },
      {
        path: 'README.md',
        type: 'blob',
        size: 200,
      },
    ]);

    expect(result.snapshot.directories).toHaveLength(1);
    expect(result.snapshot.files).toHaveLength(2);
  });

  it('extracts file names and extensions', () => {
    const result = scanRepository(repository, [
      {
        path: 'src/index.ts',
        type: 'blob',
      },
      {
        path: 'src/App.tsx',
        type: 'blob',
      },
      {
        path: 'package.json',
        type: 'blob',
      },
      {
        path: 'LICENSE',
        type: 'blob',
      },
    ]);

    expect(result.snapshot.files).toEqual([
      {
        path: 'src/index.ts',
        name: 'index.ts',
        extension: '.ts',
      },
      {
        path: 'src/App.tsx',
        name: 'App.tsx',
        extension: '.tsx',
      },
      {
        path: 'package.json',
        name: 'package.json',
        extension: '.json',
      },
      {
        path: 'LICENSE',
        name: 'LICENSE',
        extension: null,
      },
    ]);
  });

  it('calculates repository statistics', () => {
    const result = scanRepository(repository, [
      {
        path: 'src',
        type: 'tree',
      },
      {
        path: 'src/index.ts',
        type: 'blob',
      },
      {
        path: 'src/App.tsx',
        type: 'blob',
      },
      {
        path: 'src/utils.ts',
        type: 'blob',
      },
      {
        path: 'README.md',
        type: 'blob',
      },
    ]);

    expect(result.statistics).toEqual({
      totalFiles: 4,
      totalDirectories: 1,
      extensions: {
        '.ts': 2,
        '.tsx': 1,
        '.md': 1,
      },
      totalSize: 0,
    });
  });

  it('preserves file sizes', () => {
    const result = scanRepository(repository, [
      {
        path: 'src/index.ts',
        type: 'blob',
        size: 512,
      },
    ]);

    expect(result.snapshot.files[0]).toEqual({
      path: 'src/index.ts',
      name: 'index.ts',
      extension: '.ts',
      size: 512,
    });
  });

  it('calculates total repository size', () => {
    const result = scanRepository(repository, [
      {
        path: 'src/index.ts',
        type: 'blob',
        size: 100,
      },
      {
        path: 'src/App.tsx',
        type: 'blob',
        size: 250,
      },
      {
        path: 'README.md',
        type: 'blob',
        size: 50,
      },
    ]);

    expect(result.statistics.totalSize).toBe(400);
  });

  it('builds the repository tree', () => {
    const result = scanRepository(repository, [
      {
        path: 'src',
        type: 'tree',
      },
      {
        path: 'src/index.ts',
        type: 'blob',
      },
      {
        path: 'README.md',
        type: 'blob',
      },
    ]);

    expect(result.tree).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          {
            name: 'index.ts',
            path: 'src/index.ts',
            type: 'file',
            children: [],
            extension: '.ts',
          },
        ],
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file',
        children: [],
        extension: '.md',
      },
    ]);
  });
});
