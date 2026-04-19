/**
 * FlowCanvas.jsx
 * ReactFlow canvas with zoom/pan, background grid, and
 * node click -> parent callback for sync-highlight.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow'
import { Download } from 'lucide-react'
import 'reactflow/dist/style.css'
import { nodeTypes } from './FlowNodes'

const minimapStyle = {
  backgroundColor: '#1e293b',
  maskColor: '#0f172a88',
}

export default function FlowCanvas({
  nodes,
  edges,
  onNodeClick,
  onExportMermaid,
  onExportUml,
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [isCompact, setIsCompact] = useState(() => globalThis.innerWidth < 768)
  const menuRef = useRef(null)

  useEffect(() => {
    const onResize = () => setIsCompact(globalThis.innerWidth < 768)
    globalThis.addEventListener('resize', onResize)
    return () => globalThis.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false)
      }
    }
    globalThis.addEventListener('pointerdown', onPointerDown)
    return () => globalThis.removeEventListener('pointerdown', onPointerDown)
  }, [])

  const handleNodeClick = useCallback(
    (_event, node) => {
      onNodeClick?.(node)
    },
    [onNodeClick]
  )

  const handleExportMermaid = useCallback(() => {
    onExportMermaid?.()
    setMenuOpen(false)
  }, [onExportMermaid])

  const handleExportUml = useCallback(() => {
    onExportUml?.()
    setMenuOpen(false)
  }, [onExportUml])

  return (
    <div className="h-full w-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.2}
        maxZoom={2}
        attributionPosition="bottom-right"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#334155"
        />
        <Controls showInteractive={false} />
        {!isCompact && (
          <MiniMap
            style={minimapStyle}
            nodeColor={(node) => {
              switch (node.type) {
                case 'playNode': return '#1d4ed8'
                case 'taskNode': return '#334155'
                case 'loopNode': return '#7c3aed'
                case 'conditionalNode': return '#92400e'
                case 'handlerNode': return '#78350f'
                default: return '#1e293b'
              }
            }}
            maskColor="#0f172a88"
          />
        )}
      </ReactFlow>

      <div ref={menuRef} className="absolute top-3 right-3 z-20 md:top-3 md:right-3">
        <button
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            setMenuOpen((v) => !v)
          }}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 bg-slate-900/95 text-slate-300 hover:border-cyan-700 hover:text-cyan-300 text-xs font-mono transition-all"
          title="Export diagram"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
        >
          <Download size={12} />
          Export
        </button>

        {menuOpen && (
          <div
            onPointerDown={(event) => event.stopPropagation()}
            className="absolute right-0 top-full mt-1 w-40 rounded border border-slate-700 bg-slate-950/98 shadow-lg overflow-hidden"
            role="menu"
          >
            <button
              onClick={(event) => {
                event.stopPropagation()
                handleExportMermaid()
              }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-sky-300 transition-colors"
              role="menuitem"
            >
              Mermaid (.mmd)
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation()
                handleExportUml()
              }}
              className="w-full text-left px-3 py-2 text-xs font-mono text-slate-300 hover:bg-slate-800 hover:text-indigo-300 transition-colors"
              role="menuitem"
            >
              UML (.puml)
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
