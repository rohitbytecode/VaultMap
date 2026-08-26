export interface RepositoryTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children: RepositoryTreeNode[];
  size?: number;
  extension?: string | null;
}
