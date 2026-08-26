import type {
  RepositoryDirectory,
  RepositoryFile,
  RepositoryTreeNode,
} from '@vaultmap/types';

export function buildRepositoryTree(
  files: RepositoryFile[],
  directories: RepositoryDirectory[],
): RepositoryTreeNode[] {
  const root: RepositoryTreeNode[] = [];

  for (const directory of directories) {
    insertDirectory(root, directory);
  }

  for (const file of files) {
    insertFile(root, file);
  }

  return sortNodes(root);
}

function insertDirectory(
  nodes: RepositoryTreeNode[],
  directory: RepositoryDirectory,
): void {
  const segments = directory.path.split('/');
  let currentNodes = nodes;
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

    let node = currentNodes.find(
      (entry) => entry.type === 'directory' && entry.name === segment,
    );

    if (!node) {
      node = {
        name: segment,
        path: currentPath,
        type: 'directory',
        children: [],
      };

      currentNodes.push(node);
    }

    currentNodes = node.children;
  }
}

function insertFile(nodes: RepositoryTreeNode[], file: RepositoryFile): void {
  const segments = file.path.split('/');
  const fileName = segments.pop();

  if (!fileName) {
    return;
  }

  let currentNodes = nodes;
  let currentPath = '';

  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;

    let node = currentNodes.find(
      (entry) => entry.type === 'directory' && entry.name === segment,
    );

    if (!node) {
      node = {
        name: segment,
        path: currentPath,
        type: 'directory',
        children: [],
      };

      currentNodes.push(node);
    }

    currentNodes = node.children;
  }

  currentNodes.push({
    name: fileName,
    path: file.path,
    type: 'file',
    children: [],
    extension: file.extension,
    ...(file.size !== undefined && { size: file.size }),
  });
}

function sortNodes(nodes: RepositoryTreeNode[]): RepositoryTreeNode[] {
  nodes.sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'directory' ? -1 : 1;
    }

    return a.name.localeCompare(b.name);
  });
  for (const node of nodes) {
    if (node.children.length > 0) {
      sortNodes(node.children);
    }
  }
  return nodes;
}
