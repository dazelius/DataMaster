import { useCallback, useEffect, useState, useRef } from 'react';
import {
  ReactFlow,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { DBMLEditor } from '../../components/editor/DBMLEditor';
import { TableNode } from '../../components/canvas/TableNode';
import { RelationEdge } from '../../components/canvas/RelationEdge';
import { CanvasToolbar } from '../../components/canvas/CanvasToolbar';
import { useEditorStore } from '../../stores/editorStore';
import { useSchemaStore } from '../../stores/schemaStore';
import { parseDbml } from '../../lib/dbml/parser';
import { applyDagreLayout } from '../../lib/dbml/layout';

const nodeTypes = { table: TableNode };
const edgeTypes = { relation: RelationEdge };

function EditorPageInner() {
  const dbmlText = useEditorStore((s) => s.dbmlText);
  const setParseError = useEditorStore((s) => s.setParseError);
  const setSchema = useSchemaStore((s) => s.setSchema);
  const storedDbml = useSchemaStore((s) => s.dbml);
  const selectedTable = useSchemaStore((s) => s.selectedTable);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [panelWidth, setPanelWidth] = useState(380);
  const [showEditor, setShowEditor] = useState(false);
  const [mobileEditor, setMobileEditor] = useState(false);
  const [direction, setDirection] = useState<'LR' | 'TB'>('LR');
  const resizerRef = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    setShowEditor(mq.matches);
    const handler = (e: MediaQueryListEvent) => setShowEditor(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (storedDbml && !dbmlText) {
      useEditorStore.getState().setDbmlText(storedDbml);
    }
  }, [storedDbml]);

  useEffect(() => {
    if (!dbmlText.trim()) return;

    const timer = setTimeout(() => {
      try {
        const schema = parseDbml(dbmlText);
        setSchema(schema);
        setParseError(null);

        const newNodes: Node[] = schema.tables.map((t) => ({
          id: t.name,
          type: 'table',
          position: { x: 0, y: 0 },
          data: { label: t.name, columns: t.columns, headerColor: t.headerColor },
        }));

        const newEdges: Edge[] = schema.refs.map((r) => ({
          id: r.id,
          source: r.fromTable,
          target: r.toTable,
          type: 'relation',
          data: { relationType: r.type },
        }));

        const layoutResult = applyDagreLayout(newNodes, newEdges, direction);
        setNodes(layoutResult.nodes);
        setEdges(layoutResult.edges);
      } catch (err) {
        setParseError(err instanceof Error ? err.message : 'Parse error');
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [dbmlText]);

  useEffect(() => {
    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        data: { ...n.data, isSelected: n.id === selectedTable },
      })),
    );

    if (selectedTable) {
      const currentNodes = rf.getNodes();
      const targetNode = currentNodes.find((n) => n.id === selectedTable);
      if (targetNode) {
        rf.setCenter(
          targetNode.position.x + 140,
          targetNode.position.y + 60,
          { zoom: 1.2, duration: 400 },
        );
      }
    }
  }, [selectedTable, setNodes, rf]);

  const handleAutoLayout = useCallback(() => {
    const layoutResult = applyDagreLayout(nodes, edges, direction);
    setNodes(layoutResult.nodes);
    setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50);
  }, [nodes, edges, direction, setNodes, rf]);

  const handleToggleDirection = useCallback(() => {
    setDirection((prev) => {
      const next = prev === 'LR' ? 'TB' : 'LR';
      const layoutResult = applyDagreLayout(nodes, edges, next);
      setNodes(layoutResult.nodes);
      setTimeout(() => rf.fitView({ padding: 0.15, duration: 300 }), 50);
      return next;
    });
  }, [nodes, edges, setNodes, rf]);

  const handleExportPng = useCallback(() => {
    // TODO: implement with html-to-image
  }, []);

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = panelWidth;

    const onMove = (ev: MouseEvent) => {
      setPanelWidth(Math.max(200, Math.min(800, startWidth + ev.clientX - startX)));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [panelWidth]);

  return (
    <div className="flex h-full">
      {/* Desktop DBML editor panel */}
      {showEditor && (
        <>
          <div style={{ width: panelWidth }} className="hidden md:flex flex-col flex-shrink-0 border-r border-[var(--color-border)] relative">
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={() => setShowEditor(false)}
                className="btn-ghost rounded-[var(--radius-sm)] p-1.5"
                title="Hide Editor"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
            <DBMLEditor />
          </div>

          <div
            ref={resizerRef}
            onMouseDown={handleResizeStart}
            className="hidden md:block w-1 cursor-col-resize bg-[var(--color-border)] hover:bg-[var(--color-accent)] transition-colors flex-shrink-0"
          />
        </>
      )}

      {/* Canvas */}
      <div className="relative flex-1">
        {/* Desktop: show editor toggle */}
        {!showEditor && (
          <button
            onClick={() => setShowEditor(true)}
            className="hidden md:flex absolute left-3 top-3 z-10 btn-ghost card-elevated p-1.5"
            title="Show Editor"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {/* Mobile: DBML toggle button */}
        <button
          onClick={() => setMobileEditor(true)}
          className="md:hidden absolute left-3 top-3 z-10 btn-ghost card-elevated p-2"
          title="DBML Editor"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" />
          </svg>
        </button>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          minZoom={0.05}
          maxZoom={2.5}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ animated: false }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="var(--color-border)"
          />
          <MiniMap
            nodeColor={(n) => {
              const color = (n.data as any)?.headerColor;
              return color ?? '#3b82f6';
            }}
            maskColor="rgba(0,0,0,0.75)"
            className="!bg-[var(--color-surface-1)] !border-[var(--color-border)] !rounded-[var(--radius-lg)] !shadow-lg"
            pannable
            zoomable
          />
          <CanvasToolbar
            onAutoLayout={handleAutoLayout}
            onExportPng={handleExportPng}
            direction={direction}
            onToggleDirection={handleToggleDirection}
          />
        </ReactFlow>
      </div>

      {/* Mobile DBML bottom sheet */}
      {mobileEditor && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMobileEditor(false)} />
          <div className="relative mt-auto h-[70vh] flex flex-col bg-[var(--color-surface-1)] rounded-t-[var(--radius-xl)] border-t border-[var(--color-border)] animate-slide-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">DBML Editor</span>
              <button onClick={() => setMobileEditor(false)} className="btn-ghost p-1.5 rounded-[var(--radius-sm)]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <DBMLEditor />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditorPage() {
  return (
    <ReactFlowProvider>
      <EditorPageInner />
    </ReactFlowProvider>
  );
}
