import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  MarkerType,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { RepositoryTreeNode } from '@vaultmap/types';
import {
  buildRepositoryGraph,
  type RepositoryGraphNode,
} from '../utils/repositoryGraph';

interface GraphNodeData extends Record<string, unknown> {
  label: string;
  path: string;
  type: 'file' | 'directory';
  extension: string | null;
  size?: number;
  depth: number;
  parentId: string | null;
  color: string;
  isCluster?: boolean;
  match?: boolean;
  onSelectFile?: (path: string) => void;
}

type FlowNode = Node<GraphNodeData>;

const COLORS = [
  '#34d399',
  '#60a5fa',
  '#f472b6',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
];

const NODE_WIDTH = 190;
const NODE_HEIGHT = 38;
const COLUMN_GAP = 22;
const ROW_GAP = 12;
const CLUSTER_PADDING = 24;
const CLUSTER_HEADER = 54;
const CLUSTER_GAP = 34;
const MAX_COLUMNS = 4;
const TARGET_ROW_WIDTH = 2800;

function getColor(value: string): string {
  let hash = 0;

  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return COLORS[hash % COLORS.length];
}

function GraphEntryNode({ data, selected }: NodeProps<FlowNode>) {
  const isDirectory = data.type === 'directory';

  return (
    <div
      className={[
        'graph-node',
        isDirectory ? 'graph-node-directory' : 'graph-node-file',
        selected ? 'graph-node-selected' : '',
        data.match === false ? 'graph-node-dimmed' : '',
      ].join(' ')}
      style={{ '--node-color': data.color } as React.CSSProperties}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} />

      <span className={isDirectory ? 'graph-folder-dot' : 'graph-file-dot'} />

      {isDirectory ? (
        <span className="graph-node-label">{data.label}</span>
      ) : (
        <button
          type="button"
          className="graph-file-label"
          onClick={(event) => {
            event.stopPropagation();
            data.onSelectFile?.(data.path);
          }}
          title={`Open ${data.path}`}
        >
          {data.label}
        </button>
      )}

      {isDirectory && <span className="graph-node-kind">DIR</span>}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

function DirectoryCluster({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className="graph-cluster"
      style={{ '--cluster-color': data.color } as React.CSSProperties}
    >
      <div className="graph-cluster-header">
        <span className="graph-cluster-indicator" />
        <span className="graph-cluster-title">{data.label}</span>
        <span className="graph-cluster-count">{data.size ?? 0} items</span>
      </div>
      <div className="graph-cluster-path">{data.path}</div>
    </div>
  );
}

const nodeTypes = {
  repositoryNode: GraphEntryNode,
  directoryCluster: DirectoryCluster,
};

interface PositionedCluster {
  root: RepositoryTreeNode;
  nodes: RepositoryGraphNode[];
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

function collectSubtree(root: RepositoryTreeNode): RepositoryGraphNode[] {
  const result: RepositoryGraphNode[] = [];
  const stack = [{ node: root, depth: 0, parentId: null as string | null }];

  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;

    const { node, depth, parentId } = current;

    result.push({
      id: node.path,
      name: node.name,
      path: node.path,
      type: node.type,
      extension:
        node.extension ??
        (node.type === 'file' && node.name.includes('.')
          ? node.name.slice(node.name.lastIndexOf('.'))
          : null),
      size: node.size,
      depth,
      parentId,
    });

    if (node.type === 'directory') {
      for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--) {
        const child = node.children[index];
        if (child) {
          stack.push({
            node: child,
            depth: depth + 1,
            parentId: node.path,
          });
        }
      }
    }
  }

  return result;
}

function getClusterDimensions(nodes: RepositoryGraphNode[]) {
  const columns = Math.min(MAX_COLUMNS, Math.max(1, nodes.length));
  const rows = Math.ceil(nodes.length / MAX_COLUMNS);

  return {
    width:
      CLUSTER_PADDING * 2 +
      columns * NODE_WIDTH +
      Math.max(0, columns - 1) * COLUMN_GAP,
    height:
      CLUSTER_HEADER +
      CLUSTER_PADDING * 2 +
      Math.max(1, rows) * NODE_HEIGHT +
      Math.max(0, rows - 1) * ROW_GAP,
  };
}

function buildClusterLayout(tree: RepositoryTreeNode[]) {
  const roots = tree.length ? tree : [];
  const positioned: PositionedCluster[] = roots.map((root) => {
    const nodes = collectSubtree(root);
    const dimensions = getClusterDimensions(nodes);

    return {
      root,
      nodes,
      ...dimensions,
      x: 0,
      y: 0,
      color: getColor(root.path),
    };
  });

  // Place clusters in rows, keeping the map compact rather than one tall tree.
  const targetRowWidth = TARGET_ROW_WIDTH;
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const cluster of positioned) {
    if (x > 0 && x + cluster.width > targetRowWidth) {
      x = 0;
      y += rowHeight + CLUSTER_GAP;
      rowHeight = 0;
    }

    cluster.x = x;
    cluster.y = y;
    x += cluster.width + CLUSTER_GAP;
    rowHeight = Math.max(rowHeight, cluster.height);
  }

  return positioned;
}

function buildLayoutNodes(
  clusters: PositionedCluster[],
  onSelectFile: (path: string) => void,
  query: string,
): FlowNode[] {
  const result: FlowNode[] = [];
  const normalizedQuery = query.trim().toLowerCase();

  for (const cluster of clusters) {
    const clusterPath = cluster.root.path;
    const clusterId = `__cluster__:${clusterPath}`;

    result.push({
      id: clusterId,
      type: 'directoryCluster',
      position: { x: cluster.x, y: cluster.y },
      draggable: false,
      selectable: false,
      connectable: false,
      zIndex: -1,
      data: {
        label: cluster.root.name,
        path: clusterPath,
        type: 'directory',
        extension: null,
        depth: 0,
        parentId: null,
        color: cluster.color,
        size: cluster.nodes.length,
        isCluster: true,
      },
      style: {
        width: cluster.width,
        height: cluster.height,
        zIndex: -1,
      },
    });

    // Single grid per cluster, in tree (pre-order) sequence so children
    // follow their parent directory.
    cluster.nodes.forEach((node, index) => {
      const column = index % MAX_COLUMNS;
      const row = Math.floor(index / MAX_COLUMNS);

      const x =
        cluster.x + CLUSTER_PADDING + column * (NODE_WIDTH + COLUMN_GAP);

      const y =
        cluster.y +
        CLUSTER_HEADER +
        CLUSTER_PADDING +
        row * (NODE_HEIGHT + ROW_GAP);

      const matches =
        !normalizedQuery ||
        node.name.toLowerCase().includes(normalizedQuery) ||
        node.path.toLowerCase().includes(normalizedQuery);

      result.push({
        id: node.id,
        type: 'repositoryNode',
        position: { x, y },
        data: {
          label: node.name,
          path: node.path,
          type: node.type,
          extension: node.extension,
          size: node.size,
          depth: node.depth,
          parentId: node.parentId,
          color:
            node.type === 'directory' ? getColor(node.path) : cluster.color,
          match: matches,
          onSelectFile,
        },
        style: {
          width: NODE_WIDTH,
          opacity: matches ? 1 : 0.22,
        },
      });
    });
  }

  return result;
}

function buildLayoutEdges(
  edges: { id: string; source: string; target: string }[],
  query: string,
  nodes: FlowNode[],
): Edge[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingIds = new Set(
    nodes
      .filter(
        (node) =>
          !normalizedQuery ||
          node.data.label.toLowerCase().includes(normalizedQuery) ||
          node.data.path.toLowerCase().includes(normalizedQuery),
      )
      .map((node) => node.id),
  );

  return edges.map((edge) => {
    const highlighted =
      !normalizedQuery ||
      matchingIds.has(edge.source) ||
      matchingIds.has(edge.target);

    return {
      ...edge,
      type: 'smoothstep',
      animated: false,
      style: {
        stroke: highlighted
          ? 'rgba(129, 140, 248, 0.42)'
          : 'rgba(129, 140, 248, 0.08)',
        strokeWidth: highlighted ? 1.25 : 0.7,
      },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 8,
        height: 8,
        color: 'rgba(129, 140, 248, 0.35)',
      },
    };
  });
}

interface RepositoryGraphCanvasProps {
  tree: RepositoryTreeNode[];
  onFileSelect: (path: string) => void;
}

export default function RepositoryGraphCanvas({
  tree,
  onFileSelect,
}: RepositoryGraphCanvasProps) {
  const [query, setQuery] = useState('');

  const graph = useMemo(() => buildRepositoryGraph(tree), [tree]);
  const clusters = useMemo(() => buildClusterLayout(tree), [tree]);

  const nodes = useMemo(
    () => buildLayoutNodes(clusters, onFileSelect, query),
    [clusters, onFileSelect, query],
  );

  const edges = useMemo(
    () => buildLayoutEdges(graph.edges, query, nodes),
    [graph.edges, query, nodes],
  );

  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<FlowNode>(nodes);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(edges);

  // Tracks which layout the current positions belong to, so dragged
  // positions survive search/callback updates but reset when the tree changes.
  const layoutRef = useRef<PositionedCluster[] | null>(null);

  useEffect(() => {
    const sameLayout = layoutRef.current === clusters;
    layoutRef.current = clusters;

    setFlowNodes((previous) => {
      if (!sameLayout) return nodes;

      const positions = new Map(
        previous.map((node) => [node.id, node.position]),
      );

      return nodes.map((node) =>
        node.data.isCluster
          ? node
          : { ...node, position: positions.get(node.id) ?? node.position },
      );
    });
    setFlowEdges(edges);
  }, [clusters, nodes, edges, setFlowNodes, setFlowEdges]);

  const isValidConnection = useCallback(() => false, []);

  return (
    <section className="graph-panel">
      <header className="graph-toolbar">
        <div>
          <p className="graph-eyebrow">REPOSITORY ANALYSIS</p>
          <h3>Graph Overview</h3>
          <p className="graph-description">
            Explore your repository through compact, color-coded directory
            clusters.
          </p>
        </div>

        <div className="graph-counts">
          <span>{graph.totalFiles.toLocaleString()} files</span>
          <span>{graph.totalDirectories.toLocaleString()} folders</span>
          <span>{graph.edges.length.toLocaleString()} links</span>
        </div>
      </header>

      <div className="graph-search-bar">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search files or directories..."
          aria-label="Search repository graph"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')}>
            Clear
          </button>
        )}
      </div>

      {graph.nodes.length === 0 ? (
        <div className="graph-empty">
          No repository nodes were found in this scan.
        </div>
      ) : (
        <div className="graph-canvas">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            isValidConnection={isValidConnection}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 0.8 }}
            minZoom={0.04}
            maxZoom={2}
            nodesDraggable
            nodesConnectable={false}
            elementsSelectable
            onlyRenderVisibleElements
            defaultEdgeOptions={{ type: 'smoothstep' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#202536" gap={22} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) => {
                const data = node.data as GraphNodeData;
                return data.isCluster ? '#161d2c' : data.color;
              }}
              maskColor="rgba(5, 7, 14, 0.76)"
            />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
