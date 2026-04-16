/**
 * FlowNodes.jsx
 * Custom ReactFlow node types for the Cyber-Blueprint theme.
 */
import React from 'react'
import { Handle, Position } from 'reactflow'
import {
  Package, Terminal, FileCog, Activity, RefreshCw,
  Bell, Layers, HelpCircle, SkipForward, GitMerge,
} from 'lucide-react'

// ── Module → icon map ────────────────────────────────────────────
const MODULE_ICONS = {
  apt: Package, yum: Package, dnf: Package, pip: Package,
  shell: Terminal, command: Terminal,
  copy: FileCog, template: FileCog, file: FileCog,
  service: Activity, systemd: Activity,
}

function ModuleIcon({ module, size = 14 }) {
  const Icon = MODULE_ICONS[module] || HelpCircle
  return <Icon size={size} />
}

// ── Shared handle styles ────────────────────────────────────────
const handleStyle = {
  background: '#22d3ee',
  border: '2px solid #0f172a',
  width: 10,
  height: 10,
}

// ────────────────────────────────────────────────────────────────
// Play Node — blue header card
// ────────────────────────────────────────────────────────────────
export function PlayNode({ data, selected }) {
  return (
    <div
      className={`rounded-lg border-2 px-4 py-3 min-w-[220px] shadow-lg transition-all
        ${selected
          ? 'border-cyber-cyan shadow-[0_0_12px_#22d3ee]'
          : 'border-blue-500 shadow-blue-900'
        }
        bg-blue-950`}
    >
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div className="flex items-center gap-2">
        <Layers size={16} className="text-blue-400" />
        <span className="text-blue-300 text-xs font-semibold uppercase tracking-widest">Play</span>
      </div>
      <div className="mt-1 text-white font-mono font-semibold text-sm truncate">
        {data.label}
      </div>
      {data.hosts && (
        <div className="text-blue-400 text-xs mt-0.5">hosts: {data.hosts}</div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Task Node — rectangular card
// ────────────────────────────────────────────────────────────────
export function TaskNode({ data, selected }) {
  const isWarn = data.module === 'shell' || data.module === 'command'
  return (
    <div
      className={`rounded border-2 px-3 py-2 min-w-[200px] max-w-[260px] shadow transition-all
        ${selected
          ? 'border-cyber-cyan shadow-[0_0_10px_#22d3ee]'
          : isWarn
            ? 'border-amber-500'
            : 'border-slate-600'
        }
        bg-slate-800`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div className="flex items-center gap-2">
        <span className={isWarn ? 'text-amber-400' : 'text-cyan-400'}>
          <ModuleIcon module={data.module} size={14} />
        </span>
        {data.module && (
          <span className="text-xs text-slate-400 font-mono">{data.module}</span>
        )}
        {isWarn && (
          <span title="Non-idempotent" className="ml-auto text-amber-400 text-xs">⚠</span>
        )}
      </div>
      <div className="mt-1 text-white text-xs font-mono leading-tight truncate" title={data.label}>
        {data.label}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Loop Node — task with a "repeat" badge
// ────────────────────────────────────────────────────────────────
export function LoopNode({ data, selected }) {
  return (
    <div
      className={`rounded border-2 px-3 py-2 min-w-[200px] max-w-[260px] shadow transition-all
        ${selected
          ? 'border-cyber-cyan shadow-[0_0_10px_#22d3ee]'
          : 'border-violet-500'
        }
        bg-slate-800`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div className="flex items-center gap-2">
        <RefreshCw size={13} className="text-violet-400" />
        <span className="text-xs text-violet-400 font-mono">loop</span>
      </div>
      <div className="mt-1 text-white text-xs font-mono leading-tight truncate" title={data.label}>
        {data.label}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Conditional Node — diamond shape
// ────────────────────────────────────────────────────────────────
export function ConditionalNode({ data, selected }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: 160, height: 80 }}>
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, top: 2 }} />
      {/* Diamond via SVG polygon — avoids squash from rotating a non-square div */}
      <svg className="absolute inset-0" width="160" height="80" style={{ overflow: 'visible' }}>
        <defs>
          <filter id="cond-glow" x="-20%" y="-40%" width="140%" height="180%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polygon
          points="80,3 157,40 80,77 3,40"
          fill="#1c0f00"
          stroke={selected ? '#22d3ee' : '#f59e0b'}
          strokeWidth={2}
          filter={selected ? 'url(#cond-glow)' : undefined}
        />
      </svg>
      <div className="relative z-10 text-center" style={{ maxWidth: 100 }}>
        <div className="text-amber-400 text-[10px] font-mono leading-tight break-words">
          {data.label}
        </div>
      </div>
      {/* True handle right, False handle left */}
      <Handle
        type="source"
        position={Position.Right}
        id="true"
        style={{ ...handleStyle, background: '#4ade80', right: 2 }}
      />
      <Handle
        type="source"
        position={Position.Left}
        id="false"
        style={{ ...handleStyle, background: '#f87171', left: 2 }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Skip Node — grey pill shown on False branch
// ────────────────────────────────────────────────────────────────
export function SkipNode({ selected }) {
  return (
    <div
      className={`rounded-full border px-4 py-1 text-xs text-slate-400 font-mono
        bg-slate-900 transition-all
        ${selected ? 'border-cyber-cyan' : 'border-slate-600'}`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <SkipForward size={12} className="inline mr-1" />
      skip
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Merge Node — small convergence dot
// ────────────────────────────────────────────────────────────────
export function MergeNode() {
  return (
    <div className="w-3 h-3 rounded-full bg-slate-500 border border-slate-400">
      <Handle type="target" position={Position.Top} style={{ ...handleStyle, width: 8, height: 8 }} />
      <Handle type="source" position={Position.Bottom} style={{ ...handleStyle, width: 8, height: 8 }} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Handler Node — amber dashed card
// ────────────────────────────────────────────────────────────────
export function HandlerNode({ data, selected }) {
  return (
    <div
      className={`rounded border-2 border-dashed px-3 py-2 min-w-[160px] max-w-[220px] transition-all
        ${selected ? 'border-cyber-cyan shadow-[0_0_10px_#22d3ee]' : 'border-amber-500'}
        bg-amber-950`}
    >
      <Handle type="target" position={Position.Top} style={handleStyle} />
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      <div className="flex items-center gap-2">
        <Bell size={12} className="text-amber-400" />
        <span className="text-amber-400 text-xs font-mono uppercase tracking-wider">handler</span>
      </div>
      <div className="mt-1 text-white text-xs font-mono truncate">{data.label}</div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// Section Node — label divider header
// ────────────────────────────────────────────────────────────────
export function SectionNode({ data }) {
  return (
    <div className="px-4 py-2 rounded border border-slate-600 bg-slate-900 text-slate-400 text-xs font-mono tracking-widest uppercase">
      <Handle type="source" position={Position.Bottom} style={handleStyle} />
      {data.label}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// nodeTypes map — pass to <ReactFlow>
// ────────────────────────────────────────────────────────────────
export const nodeTypes = {
  playNode: PlayNode,
  taskNode: TaskNode,
  loopNode: LoopNode,
  conditionalNode: ConditionalNode,
  skipNode: SkipNode,
  mergeNode: MergeNode,
  handlerNode: HandlerNode,
  sectionNode: SectionNode,
}
