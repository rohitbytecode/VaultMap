import type { RepositoryTreeNode } from '@vaultmap/types';

interface RepositoryTreeProps {
  nodes: RepositoryTreeNode[];
}

interface TreeNodeProps {
  node: RepositoryTreeNode;
}

function RepositoryTree({ nodes }: RepositoryTreeProps) {
  return (
    <div className="repository-tree">
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}

function TreeNode({ node }: TreeNodeProps) {
  const isDirectory = node.type === 'directory';

  return (
    <div className="tree-node">
      <div className="tree-node-content">
        <span className="tree-node-icon">{isDirectory ? '📁' : '📄'}</span>

        <span className="tree-node-name">{node.name}</span>

        {node.type === 'file' && node.size !== undefined && (
          <span className="tree-node-size">
            {`${(node.size / 1024).toFixed(1)} KB`}
          </span>
        )}
      </div>

      {isDirectory && node.children.length > 0 && (
        <div className="tree-node-children">
          <TreeNodeList nodes={node.children} />
        </div>
      )}
    </div>
  );
}

function TreeNodeList({ nodes }: RepositoryTreeProps) {
  return (
    <>
      {nodes.map((node) => (
        <TreeNode key={node.path} node={node} />
      ))}
    </>
  );
}

export default RepositoryTree;
