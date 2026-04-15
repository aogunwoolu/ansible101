/**
 * MockContextPanel.jsx
 * JSON editor side-panel for editing ansible_facts used in
 * Dry-Run evaluation and Jinja2 rendering.
 */
import React, { useState, useCallback } from 'react'
import { Database, RefreshCw, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { DEFAULT_FACTS } from '../lib/defaultFacts'

export default function MockContextPanel({ facts, onFactsChange }) {
  const [jsonText, setJsonText] = useState(() => JSON.stringify(facts, null, 2))
  const [jsonError, setJsonError] = useState(null)
  const [collapsed, setCollapsed] = useState(false)

  const handleChange = useCallback((text) => {
    setJsonText(text)
    try {
      const parsed = JSON.parse(text)
      setJsonError(null)
      onFactsChange(parsed)
    } catch (e) {
      setJsonError(e.message)
    }
  }, [onFactsChange])

  const handleReset = useCallback(() => {
    const text = JSON.stringify(DEFAULT_FACTS, null, 2)
    setJsonText(text)
    setJsonError(null)
    onFactsChange(DEFAULT_FACTS)
  }, [onFactsChange])

  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-950">
      {/* Header */}
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex items-center gap-2 px-3 py-2 text-xs font-mono font-semibold uppercase tracking-widest text-amber-400 hover:text-amber-300 transition-colors w-full text-left"
      >
        {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        <Database size={13} />
        Mock Facts
        {jsonError && (
          <AlertCircle size={12} className="ml-auto text-red-400" title={jsonError} />
        )}
      </button>

      {!collapsed && (
        <>
          {/* Quick-set buttons for common OS families */}
          <div className="flex items-center gap-1 px-3 pb-1 flex-wrap">
            {['Debian', 'RedHat', 'Archlinux', 'Suse'].map((os) => (
              <button
                key={os}
                onClick={() => {
                  try {
                    const current = JSON.parse(jsonText)
                    current.ansible_os_family = os
                    const updated = JSON.stringify(current, null, 2)
                    setJsonText(updated)
                    onFactsChange(current)
                  } catch { /* ignore */ }
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-all
                  ${facts?.ansible_os_family === os
                    ? 'border-amber-500 text-amber-300 bg-amber-950'
                    : 'border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                  }`}
              >
                {os}
              </button>
            ))}
            <button
              onClick={handleReset}
              title="Reset to defaults"
              className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all"
            >
              <RefreshCw size={10} />
              Reset
            </button>
          </div>

          {/* JSON textarea */}
          <div className="flex-1 relative px-3 pb-3">
            {jsonError && (
              <div className="text-red-400 text-[10px] font-mono mb-1 truncate">{jsonError}</div>
            )}
            <textarea
              value={jsonText}
              onChange={(e) => handleChange(e.target.value)}
              spellCheck={false}
              className={`w-full h-44 bg-slate-900 text-slate-200 text-[11px] font-mono
                border rounded p-2 resize-none outline-none leading-relaxed
                transition-colors
                ${jsonError
                  ? 'border-red-700 focus:border-red-500'
                  : 'border-slate-700 focus:border-amber-600'
                }`}
            />
          </div>
        </>
      )}
    </div>
  )
}
