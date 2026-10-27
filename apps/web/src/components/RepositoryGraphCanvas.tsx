import { useCallback, useEffect, useMemo } from 'react';
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
  onSelectFile?: (path: string) => void;
}

type FlowNode = Node<GraphNodeData, 'repositoryNode'>;

const COLORS = [
  '#34d499',
  '#60a5fa',
  '#f472b6',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#a3e635',
];

function getDirectoryColor(path: string): string {
  const parent = path.split('/').slice(0, -1).join('/');
  let hash = 0;

  for (const char of parent || path) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return COLORS[hash % COLORS.length];
}

function RepositoryGraphNodeView({ data, selected }: NodeProps<FlowNode>) {
  const isDirectory = data.type === 'directory';

  return (
    <div
      className={[
        'graph-node',
        isDirectory ? 'graph-node-directory' : 'graph-node-file',
        selected ? 'graph-node-selected' : '',
      ].join(' ')}
      style={{ '--node-color': data.color } as React.CSSProperties}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} />
      {isDirectory ? (
        <>
          <span className="graph-folder-dot" />
          <span className="graph-node-label">{data.label}</span>
          <span className="graph-node-kind">DIR</span>
        </>
      ) : (
        <>
          <span className="graph-file-dot" />
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
        </>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = {
  repositoryNode: RepositoryGraphNodeView,
};

function layoutNodes(
  graphNodes: RepositoryGraphNode[],
  onSelectFile: (path: string) => void,
): FlowNode[] {
  const rowsByDepth = new Map<number, number>();

  return graphNodes.map((node) => {
    const row = rowsByDepth.get(node.depth) ?? 0;
    rowsByDepth.set(node.depth, row + 1);

    return {
      id: node.id,
      type: 'repositoryNode',
      position: {
        x: 80 + node.depth * 270,
        y: 80 + row * 82,
      },
      data: {
        label: node.name,
        path: node.path,
        type: node.type,
        extension: node.extension,
        size: node.size,
        depth: node.depth,
        parentId: node.parentId,
        color: getDirectoryColor(node.path),
        onSelectFile,
      },
      style: {
        width: node.type === 'directory' ? 190 : 220,
      },
    };
  });
}

function layoutEdges(
  graphEdges: { id: string; source: string; target: string }[],
): Edge[] {
  return graphEdges.map((edge) => ({
    ...edge,
    type: 'smoothstep',
    animated: false,
    style: {
      stroke: 'rgba(129, 140, 248, 0.32)',
      strokeWidth: 1.2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 10,
      height: 10,
      color: 'rgba(129, 140, 248, 0.45)',
    },
  }));
}

interface RepositoryGraphCanvasProps {
  tree: RepositoryTreeNode[];
  onFileSelect: (path: string) => void;
}

export default function RepositoryGraphCanvas({
  tree,
  onFileSelect,
}: RepositoryGraphCanvasProps) {
  const graph = useMemo(() => buildRepositoryGraph(tree), [tree]);

  const initialNodes = useMemo(
    () => layoutNodes(graph.nodes, onFileSelect),
    [graph.nodes, onFileSelect],
  );

  const initialEdges = useMemo(() => layoutEdges(graph.edges), [graph.edges]);

  const [nodes, setNodes, onNodesChange] =
    useNodesState<FlowNode>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initialEdges);

  useEffect(() => {
    setNodes(layoutNodes(graph.nodes, onFileSelect));
    setEdges(layoutEdges(graph.edges));
  }, [graph, onFileSelect, setNodes, setEdges]);

  const isValidConnection = useCallback(() => false, []);

  return (
    <section className="graph-panel">
      <header className="graph-toolbar">
        <div>
          <p className="graph-eyebrow"> Repository Analysis</p>
          <h3>Graph Overview</h3>
          <p className="graph-description">
            Explore files and directories through their actual folder
            relationships.
          </p>
        </div>

        <div className="graph-counts">
          <span>{graph.totalFiles.toLocaleString()} files</span>
          <span>{graph.totalDirectories.toLocaleString()} folders</span>
          <span>{graph.edges.length.toLocaleString()} links</span>
        </div>
      </header>

      {graph.nodes.length === 0 ? (
        <div className="graph-empty">
          No repository nodes were found in this scan.
        </div>
      ) : (
        <div className="graph-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            isValidConnection={isValidConnection}
            fitView
            fitViewOptions={{ padding: 0.18, maxZoom: 1.1 }}
            minZoom={0.08}
            maxZoom={2}
            defaultEdgeOptions={{ type: 'smoothstep' }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#202536" gap={24} size={1} />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              nodeColor={(node) =>
                String((node.data as GraphNodeData).color ?? '#818cf8')
              }
              maskColor="rgba(5, 7, 14, 0.72)"
            />
          </ReactFlow>
        </div>
      )}
    </section>
  );
}
