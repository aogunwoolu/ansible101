/**
 * ExtraVarsPanel.jsx
 * GUI for the `-e` extra vars layer (always-wins precedence).
 *   - pick uploaded vars file(s) to act as `-e @file` (order preserved)
 *   - add individual key=value rows
 * Presentational — parent owns state.
 */
/* eslint-disable react/prop-types */
import React, { useState } from 'react'
import { Terminal, Plus, X, ChevronDown, ChevronRight, FileText } from 'lucide-react'

export default function ExtraVarsPanel({
  candidateFiles = [], picked = [], onTogglePick, pairs = [], onPairsChange, defaultCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [fileToAdd, setFileToAdd] = useState('')

  const updatePair = (i, patch) => onPairsChange(pairs.map((p, idx) => (idx === i ? { ...p, ...patch } : p)))
  const addPair = () => onPairsChange([...pairs, { key: '', value: '' }])
  const removePair = (i) => onPairsChange(pairs.filter((_, idx) => idx !== i))

  const available = candidateFiles.filter((f) => !picked.includes(f))

  return (
    <div className="rounded border border-rose-900/60 bg-rose-950/10">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-mono font-semibold uppercase tracking-widest text-rose-300 hover:text-rose-200 transition-colors"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Terminal size={13} />
        Extra Vars (-e)
        <span className="ml-1 normal-case font-normal tracking-normal text-slate-500">
          always wins · {picked.length + pairs.filter((p) => p.key).length} set
        </span>
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 flex flex-col gap-3">
          {/* @file picks */}
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">-e @file</p>
            <div className="flex flex-col gap-1">
              {picked.map((f) => (
                <div key={f} className="flex items-center gap-2 rounded bg-slate-900 border border-slate-800 px-2 py-1">
                  <FileText size={11} className="text-rose-300 shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-slate-300" title={f}>{f}</span>
                  <button onClick={() => onTogglePick(f)} className="text-slate-600 hover:text-rose-400" title="Remove">
                    <X size={11} />
                  </button>
                </div>
              ))}
              {available.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <select
                    value={fileToAdd}
                    onChange={(e) => setFileToAdd(e.target.value)}
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-300 outline-none focus:border-rose-600"
                  >
                    <option value="">select a vars file…</option>
                    {available.map((f) => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <button
                    onClick={() => { if (fileToAdd) { onTogglePick(fileToAdd); setFileToAdd('') } }}
                    disabled={!fileToAdd}
                    className="flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-[10px] font-mono text-slate-400 hover:text-rose-300 hover:border-rose-700 disabled:opacity-30 transition-all"
                  >
                    <Plus size={10} /> add
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* key=value rows */}
          <div>
            <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">-e key=value</p>
            <div className="flex flex-col gap-1">
              {pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={p.key}
                    onChange={(e) => updatePair(i, { key: e.target.value })}
                    placeholder="key"
                    className="w-1/3 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-rose-600 placeholder:text-slate-600"
                  />
                  <span className="text-slate-600 text-[11px] font-mono">=</span>
                  <input
                    value={p.value}
                    onChange={(e) => updatePair(i, { value: e.target.value })}
                    placeholder="value"
                    className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] font-mono text-slate-200 outline-none focus:border-rose-600 placeholder:text-slate-600"
                  />
                  <button onClick={() => removePair(i)} className="text-slate-600 hover:text-rose-400 shrink-0" title="Remove">
                    <X size={11} />
                  </button>
                </div>
              ))}
              <button
                onClick={addPair}
                className="self-start flex items-center gap-1 px-2 py-1 rounded border border-slate-700 text-[10px] font-mono text-slate-400 hover:text-rose-300 hover:border-rose-700 transition-all"
              >
                <Plus size={10} /> add pair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
