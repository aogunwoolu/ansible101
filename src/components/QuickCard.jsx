/**
 * QuickCard.jsx
 * Focused detail card for a single task snippet (Type B paste).
 * Shows module, args, human explanation, warnings, and Jinja2 values.
 */
import React, { useMemo } from 'react'
import {
  Package, Terminal, FileCog, Activity, RefreshCw,
  Bell, AlertTriangle, CheckCircle, HelpCircle, Info,
  Clipboard, Zap,
} from 'lucide-react'
import { getModuleName, getTaskLabel } from '../lib/parseYamlToFlow'
import { generateExplanation } from '../lib/humanSpeak'
import { renderJinja2 } from '../lib/jinja2Engine'

const MODULE_COLORS = {
  apt:          'text-green-400 border-green-700 bg-green-950',
  yum:          'text-green-400 border-green-700 bg-green-950',
  dnf:          'text-green-400 border-green-700 bg-green-950',
  pip:          'text-green-400 border-green-700 bg-green-950',
  copy:         'text-blue-400 border-blue-700 bg-blue-950',
  template:     'text-blue-400 border-blue-700 bg-blue-950',
  file:         'text-blue-400 border-blue-700 bg-blue-950',
  fetch:        'text-blue-400 border-blue-700 bg-blue-950',
  service:      'text-cyan-400 border-cyan-700 bg-cyan-950',
  systemd:      'text-cyan-400 border-cyan-700 bg-cyan-950',
  shell:        'text-purple-400 border-purple-700 bg-purple-950',
  command:      'text-purple-400 border-purple-700 bg-purple-950',
  debug:        'text-slate-400 border-slate-700 bg-slate-900',
  set_fact:     'text-amber-400 border-amber-700 bg-amber-950',
  lineinfile:   'text-teal-400 border-teal-700 bg-teal-950',
}

function getModuleColor(module) {
  return MODULE_COLORS[module] || 'text-slate-300 border-slate-700 bg-slate-900'
}

function ArgRow({ label, value, facts }) {
  // Check if value contains Jinja2
  const hasJinja = typeof value === 'string' && /\{\{.*?\}\}/.test(value)
  const rendered = hasJinja ? renderJinja2(value, facts) : null

  return (
    <div className="flex items-start gap-2 py-1 border-b border-slate-800 last:border-0">
      <span className="text-slate-500 text-[11px] font-mono min-w-[100px] shrink-0">{label}:</span>
      <div className="flex-1 min-w-0">
        <span className="text-slate-200 text-[11px] font-mono break-all">
          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
        </span>
        {hasJinja && rendered && (
          <div className="mt-0.5 flex items-center gap-1">
            <Zap size={10} className={rendered.error ? 'text-red-400' : 'text-cyan-400'} />
            <span className={`text-[10px] font-mono ${rendered.error ? 'text-red-400' : 'text-cyan-300'}`}>
              → {rendered.error ? rendered.error : rendered.result}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function QuickCard({ task, facts }) {
  const module = useMemo(() => getModuleName(task), [task])
  const label = useMemo(() => getTaskLabel(task), [task])
  const { text, warning, icon } = useMemo(() => generateExplanation(task), [task])
  const colorClass = getModuleColor(module)
  const moduleArgs = task[module]

  // Flatten module args for display
  const argEntries = useMemo(() => {
    if (!moduleArgs) return []
    if (typeof moduleArgs === 'string') return [['cmd / value', moduleArgs]]
    if (typeof moduleArgs === 'object' && !Array.isArray(moduleArgs)) {
      return Object.entries(moduleArgs)
    }
    return [['value', moduleArgs]]
  }, [moduleArgs])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-950">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 shrink-0 flex items-center gap-2">
        <Clipboard size={14} className="text-cyan-400" />
        <span className="text-cyan-400 text-xs font-mono font-semibold uppercase tracking-widest">
          Quick Card
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Task name */}
        {task.name && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Task Name</div>
            <div className="text-white font-mono text-sm font-semibold">{task.name}</div>
          </div>
        )}

        {/* Module badge */}
        {module && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Module</div>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-mono font-semibold ${colorClass}`}>
              {module}
            </span>
          </div>
        )}

        {/* Human explanation */}
        <div className="rounded border border-slate-700 bg-slate-900 p-3">
          <div className="flex items-start gap-2">
            <CheckCircle size={14} className="text-cyan-400 mt-0.5 shrink-0" />
            <p className="text-slate-200 text-xs leading-relaxed">{text}</p>
          </div>
        </div>

        {/* Warning */}
        {warning && (
          <div className="rounded border border-amber-700 bg-amber-950 p-3 flex items-start gap-2">
            <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <p className="text-amber-300 text-xs leading-relaxed">{warning}</p>
          </div>
        )}

        {/* Module args */}
        {argEntries.length > 0 && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-2">Arguments</div>
            <div className="rounded border border-slate-700 bg-slate-900 px-3 divide-y divide-slate-800">
              {argEntries.map(([k, v]) => (
                <ArgRow key={k} label={k} value={v} facts={facts} />
              ))}
            </div>
          </div>
        )}

        {/* Conditionals */}
        {task.when && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Condition</div>
            <div className="rounded border border-amber-800 bg-amber-950 p-2">
              <code className="text-amber-300 text-xs font-mono">
                {Array.isArray(task.when) ? task.when.join(' AND ') : task.when}
              </code>
            </div>
          </div>
        )}

        {/* Loop */}
        {(task.loop || task.with_items) && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Loop Items</div>
            <div className="rounded border border-violet-800 bg-violet-950 p-2 flex items-start gap-2">
              <RefreshCw size={12} className="text-violet-400 mt-0.5 shrink-0" />
              <code className="text-violet-300 text-xs font-mono">
                {JSON.stringify(task.loop || task.with_items)}
              </code>
            </div>
          </div>
        )}

        {/* Notify */}
        {task.notify && (
          <div>
            <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">Notifies Handler</div>
            <div className="rounded border border-amber-700 bg-amber-950 p-2 flex items-center gap-2">
              <Bell size={12} className="text-amber-400" />
              <code className="text-amber-300 text-xs font-mono">
                {Array.isArray(task.notify) ? task.notify.join(', ') : task.notify}
              </code>
            </div>
          </div>
        )}

        {/* Register */}
        {task.register && (
          <div className="flex items-center gap-2 text-slate-400 text-xs font-mono">
            <Info size={11} />
            Result stored in variable: <code className="text-cyan-300">{task.register}</code>
          </div>
        )}
      </div>
    </div>
  )
}
