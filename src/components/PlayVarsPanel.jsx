/**
 * PlayVarsPanel.jsx
 * Detects Jinja2 variables referenced in the YAML that are NOT
 * ansible built-in facts, then lets the user set values to simulate
 * the rendered output.
 */
import React, { useMemo, useCallback, useState } from 'react'
import { Variable, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'

// Identifiers that are Ansible internals — never shown as user vars
const ANSIBLE_INTERNALS = new Set([
  'ansible_check_mode', 'ansible_config_file', 'ansible_dependent_role_names',
  'ansible_diff_mode', 'ansible_facts', 'ansible_forks', 'ansible_inventory_sources',
  'ansible_limit', 'ansible_loop', 'ansible_loop_var', 'ansible_parent_role_names',
  'ansible_parent_role_paths', 'ansible_play_batch', 'ansible_play_hosts',
  'ansible_play_hosts_all', 'ansible_play_name', 'ansible_play_role_names',
  'ansible_playbook_python', 'ansible_role_name', 'ansible_role_names',
  'ansible_run_tags', 'ansible_search_path', 'ansible_skip_tags',
  'ansible_verbosity', 'ansible_version', 'environment',
  'groups', 'hostvars', 'inventory_dir', 'inventory_file',
  'omit', 'play_hosts', 'playbook_dir', 'role_path',
  // loop variables
  'item', 'loop', 'loop_var',
])

function isInternal(name) {
  if (ANSIBLE_INTERNALS.has(name)) return true
  if (name.startsWith('ansible_')) return true
  if (name.startsWith('inventory_')) return true
  return false
}

/**
 * Extract all `{{ varname }}` / `{% if varname %}` identifiers from raw YAML text,
 * excluding ansible internals, filters, and tests.
 */
export function extractJinja2Vars(yamlText) {
  // Match the first identifier after {{ or after keywords like if/elif/for ... in
  const re = /\{\{[\s-]*([a-zA-Z_][a-zA-Z0-9_]*)|(?:if|elif|unless|for\s+\w+\s+in)\s+([a-zA-Z_][a-zA-Z0-9_]*)/g
  const found = new Set()
  let m
  while ((m = re.exec(yamlText)) !== null) {
    const name = m[1] || m[2]
    if (name && !isInternal(name)) found.add(name)
  }
  return [...found].sort()
}

export default function PlayVarsPanel({ yamlText, plays, userVars, onUserVarsChange }) {
  const [collapsed, setCollapsed] = useState(true)

  // All variable names found in the YAML that aren't ansible internals
  const detectedVars = useMemo(() => extractJinja2Vars(yamlText || ''), [yamlText])

  // Merge: play.vars values win over empty strings as initial defaults
  const playVarsDefaults = useMemo(() => {
    const merged = {}
    if (!plays) return merged
    for (const play of plays) {
      if (play?.vars && typeof play.vars === 'object') {
        for (const [k, v] of Object.entries(play.vars)) {
          if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            merged[k] = String(v)
          }
        }
      }
    }
    return merged
  }, [plays])

  const handleChange = useCallback((key, value) => {
    onUserVarsChange({ ...userVars, [key]: value })
  }, [userVars, onUserVarsChange])

  const handleReset = useCallback(() => {
    onUserVarsChange(playVarsDefaults)
  }, [playVarsDefaults, onUserVarsChange])

  // Get the display value for a var: user-set → play.vars default → ''
  const getValue = (name) =>
    userVars[name] !== undefined ? userVars[name] : (playVarsDefaults[name] ?? '')

  if (detectedVars.length === 0) return null

  return (
    <div className="flex flex-col border-t border-slate-700 bg-slate-950">
      {/* Header */}
      <div className="flex flex-col gap-2 border-b border-slate-800 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center gap-2 min-h-[40px] text-left text-xs font-mono font-semibold uppercase tracking-widest text-violet-400 hover:text-violet-300 transition-colors sm:w-auto sm:min-h-0"
        >
          {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <Variable size={13} />
          Playbook Vars
          <span className="ml-1 text-slate-500 normal-case font-normal tracking-normal">
            ({detectedVars.length} detected)
          </span>
        </button>

        {!collapsed && (
          <button
            onClick={handleReset}
            title="Reset to playbook defaults"
            className="inline-flex items-center justify-center gap-1 rounded border border-slate-700 px-2 py-2 min-h-[40px] text-[10px] font-mono text-slate-500 transition-all hover:border-slate-500 hover:text-slate-300 sm:ml-auto sm:min-h-0 sm:py-1"
          >
            <RefreshCw size={10} />
            Reset
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="px-3 py-3 grid grid-cols-1 gap-2.5 md:grid-cols-[auto_1fr] md:gap-x-3 md:gap-y-1.5 md:items-center">
          {detectedVars.map((name) => {
            const fromPlay = playVarsDefaults[name] !== undefined
            return (
              <div key={name} className="grid grid-cols-1 gap-1 md:contents">
                <label
                  htmlFor={`pv-${name}`}
                  className="text-[11px] font-mono text-slate-400 md:whitespace-nowrap"
                  title={fromPlay ? 'Defined in play vars' : 'Referenced but not defined in vars'}
                >
                  <span className={fromPlay ? 'text-violet-300' : 'text-slate-400'}>
                    {name}
                  </span>
                  {fromPlay && (
                    <span className="ml-1 text-[9px] text-violet-600">play</span>
                  )}
                </label>
                <input
                  id={`pv-${name}`}
                  type="text"
                  value={getValue(name)}
                  placeholder={fromPlay ? playVarsDefaults[name] : 'value…'}
                  onChange={(e) => handleChange(name, e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 focus:border-violet-600
                    rounded px-2 py-2 min-h-[40px] text-[11px] font-mono text-slate-200
                    outline-none transition-colors placeholder:text-slate-600"
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
