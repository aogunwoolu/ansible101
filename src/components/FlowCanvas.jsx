/**
 * FlowCanvas.jsx
 * ReactFlow canvas with zoom/pan, background grid, and
 * node click -> parent callback for sync-highlight.
 */
import React, { useCallback } from 'react'
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { nodeTypes } from './FlowNodes'

const minimapStyle = {
  backgroundColor: '#1e293b',
  maskColor: '#0f172a88',
}

export default function FlowCanvas({ nodes, edges, onNodeClick }) {
  const handleNodeClick = useCallback(
    (_event, node) => {
      onNodeClick?.(node)
    },
    [onNodeClick]
  )

  return (
    <div className="h-full w-full">
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
      </ReactFlow>
    </div>
  )
}
