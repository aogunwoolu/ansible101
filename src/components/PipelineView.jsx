/**
 * PipelineView.jsx
 * "Transformation Trace" — vertical step-by-step view for Jinja2 expressions.
 * Shows: Input → Filter 1 → Filter 2 → … → Final Output.
 */
import React, { useMemo } from 'react'
import {
  ArrowDown, CheckCircle, AlertTriangle, Terminal,
  Layers, Zap, Info,
} from 'lucide-react'
import { parseJinja2Pipeline, evaluatePipeline } from '../lib/parseJinja2Pipeline'

function formatValue(val) {
  if (val === null || val === undefined) return <span className="text-slate-500 italic">undefined</span>
  if (typeof val === 'string') {
    return <span className="text-green-300">"{val}"</span>
  }
  if (typeof val === 'boolean') {
    return <span className={val ? 'text-green-400' : 'text-red-400'}>{String(val)}</span>
  }
  if (typeof val === 'number') {
    return <span className="text-amber-300">{val}</span>
  }
  // Array or object
  try {
    const str = JSON.stringify(val, null, 2)
    return (
      <pre className="text-cyan-300 text-[10px] whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
        {str}
      </pre>
    )
  } catch {
    return <span className="text-slate-400">{String(val)}</span>
  }
}

function StepBadge({ type }) {
  if (type === 'input') {
    return (
      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-blue-900 text-blue-300 border border-blue-700 uppercase tracking-wider">
        Input
      </span>
    )
  }
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-violet-900 text-violet-300 border border-violet-700 uppercase tracking-wider">
      Filter
    </span>
  )
}

function PipelineStep({ step, isLast }) {
  const hasError = !!step.error

  return (
    <div className="flex flex-col">
      {/* Card */}
      <div
        className={`rounded border p-3 transition-all
          ${hasError
            ? 'border-red-700 bg-red-950'
            : isLast
              ? 'border-cyan-600 bg-cyan-950 shadow-[0_0_8px_#22d3ee33]'
              : 'border-slate-700 bg-slate-900'
          }`}
      >
        {/* Top row */}
        <div className="flex items-center gap-2 mb-2">
          <StepBadge type={step.type} />
          <span className="text-white text-xs font-mono font-semibold">{step.label}</span>
          {hasError ? (
            <AlertTriangle size={12} className="ml-auto text-red-400" />
          ) : isLast ? (
            <CheckCircle size={12} className="ml-auto text-cyan-400" />
          ) : null}
        </div>

        {/* Description */}
        <p className="text-slate-400 text-[11px] leading-relaxed mb-2">{step.desc}</p>

        {/* Token */}
        <div className="flex items-start gap-1.5 mb-2">
          <Terminal size={11} className="text-slate-500 mt-0.5 shrink-0" />
          <code className="text-amber-300 text-[10px] font-mono break-all">{step.token}</code>
        </div>

        {/* Result */}
        <div className="rounded bg-slate-950 border border-slate-800 p-2 text-[11px] font-mono">
          <div className="text-slate-500 text-[9px] uppercase tracking-wider mb-1">
            {isLast ? 'Final Output' : 'Intermediate Value'}
          </div>
          {hasError ? (
            <span className="text-red-400">{step.error}</span>
          ) : (
            formatValue(step.result)
          )}
        </div>
      </div>

      {/* Connector arrow */}
      {!isLast && (
        <div className="flex justify-center py-1">
          <ArrowDown size={16} className="text-slate-600" />
        </div>
      )}
    </div>
  )
}

export default function PipelineView({ expression, facts }) {
  const steps = useMemo(() => {
    if (!expression || !expression.trim()) return []
    try {
      const raw = parseJinja2Pipeline(expression)
      return evaluatePipeline(raw, facts || {})
    } catch {
      return []
    }
  }, [expression, facts])

  if (!expression || !expression.trim()) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-600 p-6">
        <Layers size={32} />
        <p className="text-sm font-mono text-center">
          Paste a Jinja2 expression like<br />
          <code className="text-cyan-500">{'{{ groups["all"] | map(attribute="hostname") | sort | join(", ") }}'}</code>
        </p>
      </div>
    )
  }

  if (steps.length === 0) {
    return (
      <div className="p-4 text-slate-500 text-sm font-mono">
        Could not parse the expression.
      </div>
    )
  }

  const finalStep = steps[steps.length - 1]
  const hasAnyError = steps.some((s) => s.error)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2 shrink-0">
        <Zap size={14} className="text-violet-400" />
        <span className="text-violet-400 text-xs font-mono font-semibold uppercase tracking-widest">
          Transformation Trace
        </span>
        <span className="ml-auto text-slate-500 text-[10px] font-mono">
          {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Expression display */}
      <div className="px-4 py-2 border-b border-slate-800 bg-slate-950">
        <code className="text-amber-300 text-xs font-mono break-all">{expression}</code>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-4 space-y-0">
        {steps.map((step, i) => (
          <PipelineStep
            key={i}
            step={step}
            isLast={i === steps.length - 1}
          />
        ))}
      </div>

      {/* Summary bar */}
      {!hasAnyError && (
        <div className="px-4 py-2 border-t border-slate-700 bg-slate-900 flex items-center gap-2 shrink-0">
          <Info size={12} className="text-cyan-400" />
          <span className="text-cyan-400 text-xs font-mono">
            Final:&nbsp;
          </span>
          <span className="text-cyan-300 text-xs font-mono truncate">
            {JSON.stringify(finalStep?.result)}
          </span>
        </div>
      )}
    </div>
  )
}
