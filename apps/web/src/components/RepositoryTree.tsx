import type { RepositoryTreeNode } from '@vaultmap/types';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useCallback, useMemo, useState, memo } from 'react';
import { FileIcon, FolderIcon } from '@react-symbols/icons/utils';

interface RepositoryTreeProps {
  nodes: RepositoryTreeNode[];
}

interface TreeNodeProps {
  node: RepositoryTreeNode;
  openPaths: Set<string>;
  onToggle: (path: string) => void;
}

function collectDirectoryPaths(nodes: RepositoryTreeNode[]): string[] {
  const paths: string[] = [];

  function visit(current: RepositoryTreeNode[]) {
    for (const node of current) {
      if (node.type !== 'directory') continue;
      paths.push(node.path);
      if (node.children?.length) visit(node.children);
    }
  }
  visit(nodes);
  return paths;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const TreeNode = memo(function TreeNode({
  node,
  openPaths,
  onToggle,
}: TreeNodeProps) {
  const isDirectory = node.type === 'directory';
  const hasChildren = isDirectory && (node.children?.length ?? 0) > 0;
  const isOpen = isDirectory && openPaths.has(node.path);

  const handleClick = useCallback(() => {
    if (isDirectory) onToggle(node.path);
  }, [isDirectory, onToggle, node.path]);

  return (
    <div className="tree-node">
      <button
        type="button"
        className={`tree-node-content ${isDirectory ? 'tree-node-directory' : 'tree-node-file'}`}
        onClick={handleClick}
        aria-expanded={isDirectory ? isOpen : undefined}
        aria-label={
          isDirectory
            ? `${isOpen ? 'Collapse' : 'Expand'} ${node.name}`
            : node.name
        }
      >
        <span className="tree-node-chevron" aria-hidden="true">
          {hasChildren ? (
            isOpen ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )
          ) : (
            <span className="tree-node-chevron-spacer" />
          )}
        </span>

        <span className="tree-node-icon" aria-hidden="true">
          {isDirectory ? (
            <FolderIcon folderName={node.name} width={18} height={18} />
          ) : (
            <FileIcon fileName={node.name} autoAssign width={18} height={18} />
          )}
        </span>

        <span className="tree-node-name">{node.name}</span>

        {node.type === 'file' && node.size !== undefined && (
          <span className="tree-node-size">{formatFileSize(node.size)}</span>
        )}
      </button>

      {isOpen && hasChildren && (
        <div className="tree-node-children">
          {node.children!.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              openPaths={openPaths}
              onToggle={onToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
});

function RepositoryTree({ nodes }: RepositoryTreeProps) {
  const directoryPaths = useMemo(() => collectDirectoryPaths(nodes), [nodes]);

  const [openPaths, setOpenPaths] = useState<Set<string>>(
    () => new Set(directoryPaths),
  );

  const handleToggle = useCallback((path: string) => {
    setOpenPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  return (
    <div className="repository-tree">
      {nodes.map((node) => (
        <TreeNode
          key={node.path}
          node={node}
          openPaths={openPaths}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

export default RepositoryTree;
