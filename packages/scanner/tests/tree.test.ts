import { describe, expect, it } from 'vitest';

import { buildRepositoryTree } from '../src/index.js';

describe('buildRepositoryTree', () => {
  it('builds a tree from nested repository paths', () => {
    const tree = buildRepositoryTree(
      [
        {
          path: 'README.md',
          name: 'README.md',
          extension: '.md',
          size: 100,
        },
        {
          path: 'src/App.tsx',
          name: 'App.tsx',
          extension: '.tsx',
          size: 200,
        },
        {
          path: 'src/components/Button.tsx',
          name: 'Button.tsx',
          extension: '.tsx',
          size: 300,
        },
      ],
      [
        {
          path: 'src',
          name: 'src',
        },
        {
          path: 'src/components',
          name: 'components',
        },
      ],
    );

    expect(tree).toEqual([
      {
        name: 'src',
        path: 'src',
        type: 'directory',
        children: [
          {
            name: 'components',
            path: 'src/components',
            type: 'directory',
            children: [
              {
                name: 'Button.tsx',
                path: 'src/components/Button.tsx',
                type: 'file',
                children: [],
                extension: '.tsx',
                size: 300,
              },
            ],
          },
          {
            name: 'App.tsx',
            path: 'src/App.tsx',
            type: 'file',
            children: [],
            extension: '.tsx',
            size: 200,
          },
        ],
      },
      {
        name: 'README.md',
        path: 'README.md',
        type: 'file',
        children: [],
        extension: '.md',
        size: 100,
      },
    ]);
  });

  it('creates missing directories from file paths', () => {
    const tree = buildRepositoryTree(
      [
        {
          path: 'src/components/Button.tsx',
          name: 'Button.tsx',
          extension: '.tsx',
        },
      ],
      [],
    );

    expect(tree[0]).toMatchObject({
      name: 'src',
      type: 'directory',
    });

    expect(tree[0].children[0]).toMatchObject({
      name: 'components',
      type: 'directory',
    });
  });

  it('keeps root-level files at the root', () => {
    const tree = buildRepositoryTree(
      [
        {
          path: 'package.json',
          name: 'package.json',
          extension: '.json',
        },
        {
          path: 'README.md',
          name: 'README.md',
          extension: '.md',
        },
      ],
      [],
    );

    expect(tree.map((node) => node.name)).toEqual([
      'package.json',
      'README.md',
    ]);
  });

  it('places directories before files', () => {
    const tree = buildRepositoryTree(
      [
        {
          path: 'src.ts',
          name: 'src.ts',
          extension: '.ts',
        },
      ],
      [
        {
          path: 'src',
          name: 'src',
        },
      ],
    );

    expect(tree[0].type).toBe('directory');
    expect(tree[1].type).toBe('file');
  });
});
