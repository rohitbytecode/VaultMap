import type { RepositoryTreeNode } from '@vaultmap/types';

export interface RepositoryGraphNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  extension: string | null;
  size?: number;
  depth: number;
  parentId: string | null;
}

export interface RepositoryGraphEdge {
  id: string;
  source: string;
  target: string;
}

export interface RepositoryGraph {
  nodes: RepositoryGraphNode[];
  edges: RepositoryGraphEdge[];
  totalFiles: number;
  totalDirectories: number;
}

export function buildRepositoryGraph(
  tree: RepositoryTreeNode[],
): RepositoryGraph {
  const nodes: RepositoryGraphNode[] = [];
  const edges: RepositoryGraphEdge[] = [];
  let totalFiles = 0;
  let totalDirectories = 0;

  function visit(
    entries: RepositoryTreeNode[],
    parentId: string | null,
    depth: number,
  ): void {
    for (const entry of entries) {
      const id = entry.path;

      nodes.push({
        id,
        name: entry.name,
        path: entry.path,
        type: entry.type,
        extension:
          entry.extension ??
          (entry.type === 'file'
            ? entry.name.includes('.')
              ? entry.name.slice(entry.name.lastIndexOf('.'))
              : null
            : null),
        size: entry.size,
        depth,
        parentId,
      });

      if (entry.type === 'file') {
        totalFiles += 1;
      } else {
        totalDirectories += 1;
      }

      if (parentId !== null) {
        edges.push({
          id: `${parentId}->${id}`,
          source: parentId,
          target: id,
        });
      }

      if (entry.type === 'directory' && entry.children?.length) {
        visit(entry.children, id, depth + 1);
      }
    }
  }

  visit(tree, null, 0);

  return {
    nodes,
    edges,
    totalFiles,
    totalDirectories,
  };
}
