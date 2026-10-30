import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react';
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import '@xyflow/react/dist/style.css';

import type { RepositoryTreeNode } from '@vaultmap/types';
import { buildRepositoryGraph } from '../utils/repositoryGraph';

interface GraphNodeData extends Record<string, unknown> {
  label: string;
  path: string;
  type: 'file' | 'directory';
  color: string;
  size?: number;
  extension: string | null;
  parentId: string | null;
  match: boolean;
  onSelectFile: (path: string) => void;
}

type FlowNode = Node<GraphNodeData, 'repositoryNode'>;

interface SimNode extends SimulationNodeDatum {
  id: string;
  path: string;
  name: string;
  type: 'file' | 'directory';
  extension: string | null;
  parentId: string | null;
  group: string;
  color: string;
  width: number;
  height: number;
  size?: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
}

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

function colorFor(value: string): string {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return COLORS[hash % COLORS.length];
}

function topLevelGroup(path: string): string {
  return path.split('/')[0] || 'root';
}

function GraphNodeView({ data, selected }: NodeProps<FlowNode>) {
  const isDirectory = data.type === 'directory';
  const extension = data.extension?.replace(/^\./, '').toUpperCase();

  return (
    <div
      className={[
        'force-graph-node',
        isDirectory ? 'force-graph-directory' : 'force-graph-file',
        selected ? 'force-graph-selected' : '',
        !data.match ? 'force-graph-dimmed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--node-color': data.color } as React.CSSProperties}
      title={data.path}
    >
      <Handle type="target" position={Position.Left} />

      <span className="force-graph-icon" aria-hidden="true">
        {isDirectory ? '▰' : '◇'}
      </span>

      {isDirectory ? (
        <span className="force-graph-label">{data.label}</span>
      ) : (
        <>
          <button
            type="button"
            className="force-graph-label force-graph-file-button"
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectFile(data.path);
            }}
            title={`Open ${data.path}`}
          >
            {data.label}
          </button>

          {extension && (
            <span className="force-graph-extension">{extension}</span>
          )}
        </>
      )}

      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { repositoryNode: GraphNodeView };

interface RepositoryGraphCanvasProps {
  tree: RepositoryTreeNode[];
  onFileSelect: (path: string) => void;
}

export default function RepositoryGraphCanvas({
  tree,
  onFileSelect,
}: RepositoryGraphCanvasProps) {
  const [query, setQuery] = useState('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Keep the latest callback in a ref so the layout doesn't re-run
  // when the parent passes a new function identity.
  const onFileSelectRef = useRef(onFileSelect);
  useEffect(() => {
    onFileSelectRef.current = onFileSelect;
  }, [onFileSelect]);

  const handleSelectFile = useCallback((path: string) => {
    onFileSelectRef.current(path);
  }, []);

  const graph = useMemo(() => buildRepositoryGraph(tree), [tree]);

  const layout = useMemo(() => {
    const simulationNodes: SimNode[] = graph.nodes.map((node) => {
      const group = topLevelGroup(node.path);

      return {
        id: node.id,
        path: node.path,
        name: node.name,
        type: node.type,
        extension: node.extension ?? null,
        parentId: node.parentId,
        group,
        color: colorFor(group),
        width: node.type === 'directory' ? 154 : 128,
        height: node.type === 'directory' ? 32 : 26,
        size: node.size,
        x: 0,
        y: 0,
      };
    });

    const nodeById = new Map(simulationNodes.map((node) => [node.id, node]));

    // Give each top-level directory its own starting region.
    const groups = [...new Set(simulationNodes.map((node) => node.group))];
    const groupCenters = new Map<string, { x: number; y: number }>();
    const orbit = Math.max(260, groups.length * 34);

    groups.forEach((group, index) => {
      const angle = (index / Math.max(1, groups.length)) * Math.PI * 2;
      groupCenters.set(group, {
        x: Math.cos(angle) * orbit,
        y: Math.sin(angle) * orbit * 0.72,
      });
    });

    simulationNodes.forEach((node, index) => {
      const center = groupCenters.get(node.group) ?? { x: 0, y: 0 };
      const angle = (index * 2.399963) % (Math.PI * 2);
      const radius = 18 + (index % 7) * 9;

      node.x = center.x + Math.cos(angle) * radius;
      node.y = center.y + Math.sin(angle) * radius;
    });

    const simulationLinks: SimLink[] = graph.edges
      .filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target))
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      }));

    const linkForce = forceLink<SimNode, SimLink>(simulationLinks)
      .id((node) => node.id)
      .distance((link) => {
        const source = link.source as SimNode;
        return source.parentId === null ? 115 : 72;
      })
      .strength(0.8);

    const simulation = forceSimulation<SimNode>(simulationNodes)
      .force('link', linkForce)
      .force(
        'charge',
        forceManyBody<SimNode>().strength((node) =>
          node.type === 'directory' ? -210 : -95,
        ),
      )
      .force(
        'collide',
        forceCollide<SimNode>()
          .radius((node) => Math.max(node.width, node.height) * 0.58)
          .iterations(2),
      )
      .force(
        'x',
        forceX<SimNode>(
          (node) => groupCenters.get(node.group)?.x ?? 0,
        ).strength(0.055),
      )
      .force(
        'y',
        forceY<SimNode>(
          (node) => groupCenters.get(node.group)?.y ?? 0,
        ).strength(0.055),
      )
      .stop();

    // Run synchronously so the initial graph is positioned before rendering.
    for (let tick = 0; tick < 260; tick += 1) {
      simulation.tick();
    }

    return {
      nodes: simulationNodes.map((node): FlowNode => ({
        id: node.id,
        type: 'repositoryNode',
        position: {
          x: (node.x ?? 0) - node.width / 2,
          y: (node.y ?? 0) - node.height / 2,
        },
        data: {
          label: node.name,
          path: node.path,
          type: node.type,
          color: node.color,
          size: node.size,
          extension: node.extension,
          parentId: node.parentId,
          match: true,
          onSelectFile: handleSelectFile,
        },
        style: {
          width: node.width,
          height: node.height,
        },
      })),
      edges: simulationLinks.map((link): Edge => ({
        id: link.id,
        source: typeof link.source === 'string' ? link.source : link.source.id,
        target: typeof link.target === 'string' ? link.target : link.target.id,
        type: 'straight',
        style: {
          stroke: 'rgba(139, 153, 180, 0.28)',
          strokeWidth: 1,
        },
      })),
    };
  }, [graph, handleSelectFile]);

  const searchedNodes = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    return layout.nodes.map((node) => {
      const matches =
        !normalized ||
        node.data.label.toLowerCase().includes(normalized) ||
        node.data.path.toLowerCase().includes(normalized);

      return {
        ...node,
        data: { ...node.data, match: matches },
        style: {
          ...node.style,
          opacity: matches ? 1 : 0.14,
        },
      };
    });
  }, [layout.nodes, query]);

  const searchedEdges = useMemo(() => {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
      return layout.edges;
    }

    const matchingIds = new Set(
      searchedNodes.filter((node) => node.data.match).map((node) => node.id),
    );

    return layout.edges.map((edge) => {
      const highlighted =
        matchingIds.has(edge.source) || matchingIds.has(edge.target);

      return {
        ...edge,
        style: {
          stroke: highlighted
            ? 'rgba(165, 180, 252, 0.78)'
            : 'rgba(139, 153, 180, 0.045)',
          strokeWidth: highlighted ? 1.5 : 0.6,
        },
      };
    });
  }, [layout.edges, query, searchedNodes]);

  const [flowNodes, setFlowNodes, onNodesChange] =
    useNodesState<FlowNode>(searchedNodes);
  const [flowEdges, setFlowEdges, onEdgesChange] =
    useEdgesState<Edge>(searchedEdges);

  // Tracks which layout the current positions belong to, so dragged
  // positions survive search updates but reset when the tree changes.
  const layoutRef = useRef<typeof layout | null>(null);

  useEffect(() => {
    const sameLayout = layoutRef.current === layout;
    layoutRef.current = layout;

    setFlowNodes((previous) => {
      if (!sameLayout) return searchedNodes;

      const previousPositions = new Map(
        previous.map((node) => [node.id, node.position]),
      );

      return searchedNodes.map((node) => ({
        ...node,
        position: previousPositions.get(node.id) ?? node.position,
      }));
    });
    setFlowEdges(searchedEdges);
  }, [layout, searchedNodes, searchedEdges, setFlowNodes, setFlowEdges]);

  const isValidConnection = useCallback(() => false, []);
  const selectedNode = flowNodes.find((node) => node.id === selectedNodeId);
  const highlightedEdges = selectedNode
    ? flowEdges.map((edge) => {
        const isRelated =
          edge.source === selectedNode.id || edge.target === selectedNode.id;

        return isRelated
          ? {
              ...edge,
              style: {
                ...edge.style,
                stroke: selectedNode.data.color,
                strokeWidth: 2.5,
              },
            }
          : edge;
      })
    : flowEdges;

  return (
    <section className="graph-panel">
      <header className="graph-toolbar">
        <div>
          <p className="graph-eyebrow">REPOSITORY ANALYSIS</p>
          <h3>Graph Overview</h3>
          <p className="graph-description">
            Explore repository files as an interactive, force-directed map.
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
        <>
          <div className="graph-canvas force-graph-canvas">
            <ReactFlow
              nodes={flowNodes}
              edges={highlightedEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={(_, node) => setSelectedNodeId(node.id)}
              onPaneClick={() => setSelectedNodeId(null)}
              isValidConnection={isValidConnection}
              fitView
              fitViewOptions={{ padding: 0.12, maxZoom: 1 }}
              minZoom={0.04}
              maxZoom={2.5}
              nodesDraggable
              nodesConnectable={false}
              onlyRenderVisibleElements
              proOptions={{ hideAttribution: true }}
            >
              <Background color="#263044" gap={24} size={1} />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) =>
                  String((node.data as GraphNodeData).color ?? '#818cf8')
                }
                maskColor="rgba(5, 7, 14, 0.78)"
              />
            </ReactFlow>
          </div>
          {selectedNode && (
            <aside className="graph-inspector">
              <div className="graph-inspector-heading">
                <div>
                  <span className="graph-inspector-eyebrow">
                    {selectedNode.data.type === 'directory'
                      ? 'DIRECTORY'
                      : 'FILE'}
                  </span>
                  <h4>{selectedNode.data.label}</h4>
                </div>

                <button
                  type="button"
                  className="graph-inspector-close"
                  onClick={() => setSelectedNodeId(null)}
                  aria-label="Close node details"
                >
                  ×
                </button>
              </div>

              <div className="graph-inspector-row">
                <span>Path</span>
                <code>{selectedNode.data.path}</code>
              </div>

              <div className="graph-inspector-row">
                <span>Type</span>
                <strong>{selectedNode.data.type}</strong>
              </div>

              {selectedNode.data.extension && (
                <div className="graph-inspector-row">
                  <span>Extension</span>
                  <strong>{selectedNode.data.extension}</strong>
                </div>
              )}

              {selectedNode.data.size !== undefined && (
                <div className="graph-inspector-row">
                  <span>Size</span>
                  <strong>
                    {selectedNode.data.size.toLocaleString()} bytes
                  </strong>
                </div>
              )}

              {selectedNode.data.type === 'file' && (
                <button
                  type="button"
                  className="graph-inspector-open"
                  onClick={() =>
                    onFileSelectRef.current(selectedNode.data.path)
                  }
                >
                  Open file viewer
                </button>
              )}
            </aside>
          )}
        </>
      )}
    </section>
  );
}
