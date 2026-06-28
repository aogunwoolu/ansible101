/**
 * RuntimeMocksPanel.jsx
 * Lists variables whose value only exists at runtime (set_fact, register,
 * vars_prompt) — auto-detected from the playbook/roles — and lets the user
 * supply a mock value so the precedence stack is complete.
 * Presentational — parent owns the mocks map.
 */
/* eslint-disable react/prop-types */
import React, { useState } from 'react'
import { Zap, ChevronDown, ChevronRight } from 'lucide-react'
import { LEVEL_LABEL } from '../lib/precedence'

const KIND_COLOR = {
  set_fact: 'text-amber-300',
  register: 'text-emerald-300',
  vars_prompt: 'text-violet-300',
}

export default function RuntimeMocksPanel({ runtimeVars = [], mocks = {}, onMockChange, defaultCollapsed = false }) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  if (runtimeVars.length === 0) return null

  return (
    <div className="rounded border border-amber-900/50 bg-amber-950/10">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-mono font-semibold uppercase tracking-widest text-amber-300 hover:text-amber-200 transition-colors"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Zap size={13} />
        Runtime Vars
        <span className="ml-1 normal-case font-normal tracking-normal text-slate-500">
          ({runtimeVars.length} detected — values only known at runtime)
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 grid grid-cols-1 gap-1.5">
          {runtimeVars.map((rv) => (
            <div key={`${rv.name}@${rv.level}`} className="flex items-center gap-2">
              <span className={`text-[9px] font-mono px-1 py-px rounded bg-slate-900 border border-slate-800 shrink-0 ${KIND_COLOR[rv.kind] ?? 'text-slate-400'}`}>
                {rv.kind}
              </span>
              <label className="text-[11px] font-mono text-slate-300 w-28 truncate shrink-0" title={`${rv.name} — ${LEVEL_LABEL[rv.level]} (level ${rv.level})`}>
                {rv.name}
              </label>
              <input
                value={mocks[rv.name] ?? ''}
                onChange={(e) => onMockChange(rv.name, e.target.value)}
                placeholder={rv.default !== undefined ? String(rv.default) : 'mock value…'}
                className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-amber-600 placeholder:text-slate-600"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
