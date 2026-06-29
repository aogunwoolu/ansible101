/**
 * ResolveView.jsx
 * Project-wide variable precedence resolver.
 *
 * Drop an Ansible project (inventory + group_vars/ + host_vars/ + roles +
 * vendored collections); pick an inventory / playbook / host; see every variable
 * resolve through Ansible's 22-level precedence, with the full shadowed stack,
 * raw + rendered values, and `-e` extra vars / runtime mocks layered in.
 */
/* eslint-disable react/prop-types */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import {
  FolderInput, Server, Layers, Users, Filter, Variable,
  ArrowRightLeft, Zap, AlertTriangle, ChevronRight, X, ExternalLink, Loader2,
} from 'lucide-react'
import { buildProjectModel, parseYamlSafe } from '../lib/projectModel'
import { parseInventoryText } from '../lib/parseInventory'
import {
  resolveHostVars, extractRuntimeVars, collectReferencedVars, LEVEL_LABEL,
} from '../lib/precedence'
import { renderJinja2 } from '../lib/jinja2Engine'
import { readFolderInput } from '../lib/useFileDrop'
import ExtraVarsPanel from './ExtraVarsPanel'
import RuntimeMocksPanel from './RuntimeMocksPanel'
import MockContextPanel from './MockContextPanel'

/** When the project has no inventory, derive a single representative host from
 *  the active playbook's hosts patterns so play/role/-e vars still resolve. */
function syntheticInventory(plays) {
  const host = 'example-host'
  const groups = { all: [host] }
  for (const p of (plays || [])) {
    const pat = Array.isArray(p?.hosts) ? p.hosts.join(':') : String(p?.hosts ?? '')
    for (const tok of pat.split(/[:,&!]/)) {
      const t = tok.trim().replace(/[*?[\]]/g, '')
      if (t && t !== 'all' && t !== '*' && /^[\w.-]+$/.test(t)) {
        if (!groups[t]) groups[t] = []
        if (!groups[t].includes(host)) groups[t].push(host)
      }
    }
  }
  return { groups, groupvars: {}, hostvars: {}, synthetic: true }
}

function parseFile(content, path) {
  if (/\.json$/i.test(path)) { try { return JSON.parse(content) || {} } catch { return {} } }
  return parseYamlSafe(content)
}

function coerce(v) {
  if (/^-?\d+$/.test(v)) return Number(v)
  if (/^-?\d*\.\d+$/.test(v)) return Number(v)
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'
  return v
}

/** Render a value against the host context. Returns {raw, rendered, error, undef, unresolved}. */
function renderVal(value, ctx) {
  if (value === undefined) return { raw: '⟨undefined⟩', rendered: null, undef: true }
  if (value === null) return { raw: 'null', rendered: null }
  if (typeof value !== 'string') return { raw: JSON.stringify(value), rendered: null }
  if (!/\{\{|\{%/.test(value)) return { raw: value, rendered: null }
  const { result, error } = renderJinja2(value, ctx)
  if (error) return { raw: value, rendered: null, error }
  return { raw: value, rendered: result, unresolved: /\{\{|\{%/.test(result) }
}

function LevelChip({ level }) {
  return (
    <span
      title={`${LEVEL_LABEL[level]} (precedence ${level})`}
      className="shrink-0 text-[9px] font-mono px-1 py-px rounded bg-slate-800 border border-slate-700 text-slate-400"
    >
      L{level}
    </span>
  )
}

function Select({ icon: Icon, value, onChange, options, getLabel = (o) => o, getValue = (o) => o, placeholder }) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 min-w-0">
      <Icon size={12} className="text-slate-500 shrink-0" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[11px] font-mono text-slate-200 outline-none min-w-0 max-w-[200px]"
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={getValue(o)} value={getValue(o)}>{getLabel(o)}</option>
        ))}
      </select>
    </label>
  )
}

// Persist the resolver's selections so they survive tab switches AND reloads.
const LS_RESOLVER = 'ansible101:resolver'
function loadResolverState() {
  try { return JSON.parse(globalThis.localStorage.getItem(LS_RESOLVER)) || {} } catch { return {} }
}

export default function ResolveView({ mainPlaybook = '', mainName = 'playbook.yml', extraFiles = [], facts = {}, onFactsChange, onUseInFlow, onOpenInJinja2, onAddFiles, dropProps = {}, isDragging = false, isProcessing = false, dropError = null }) {
  const persisted = useMemo(() => loadResolverState(), [])
  // The Resolve and Flow tabs share the same content: the main editor buffer
  // (mainPlaybook) plus any dropped project files. Extra files take precedence
  // on a name clash (a dropped playbook.yml overrides the sample buffer).
  const allFiles = useMemo(() => {
    const arr = []
    if (mainPlaybook && mainPlaybook.trim()) arr.push({ id: '__main__', name: mainName, content: mainPlaybook })
    return [...arr, ...extraFiles]
  }, [mainPlaybook, mainName, extraFiles])

  const projectModel = useMemo(() => buildProjectModel(allFiles), [allFiles])
  const invCandidates = projectModel.inventoryCandidates
  const pbCandidates = projectModel.playbookCandidates

  const [invPath, setInvPath] = useState(persisted.invPath ?? '')
  const [pbPath, setPbPath] = useState(persisted.pbPath ?? '')
  const [host, setHost] = useState(persisted.host ?? '')
  const [picked, setPicked] = useState(persisted.picked ?? [])
  const [pairs, setPairs] = useState(persisted.pairs ?? [])
  const [mocks, setMocks] = useState(persisted.mocks ?? {})
  const [filter, setFilter] = useState(persisted.filter ?? '')
  const [referencedOnly, setReferencedOnly] = useState(persisted.referencedOnly ?? false)
  const [showFacts, setShowFacts] = useState(persisted.showFacts ?? false)
  const [selectedVar, setSelectedVar] = useState(null)

  const [isMobile, setIsMobile] = useState(() => globalThis.matchMedia?.('(max-width: 767px)').matches ?? false)
  useEffect(() => {
    const mq = globalThis.matchMedia('(max-width: 767px)')
    const handler = (e) => setIsMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  // Persist selections (not the transient selected-var) on any change.
  useEffect(() => {
    try {
      globalThis.localStorage.setItem(LS_RESOLVER, JSON.stringify({
        invPath, pbPath, host, picked, pairs, mocks, filter, referencedOnly, showFacts,
      }))
    } catch { /* storage blocked */ }
  }, [invPath, pbPath, host, picked, pairs, mocks, filter, referencedOnly, showFacts])

  // Auto-pick defaults only when the persisted/current choice isn't a valid
  // candidate (keeps a restored selection if it still exists in the project).
  useEffect(() => { setInvPath((p) => (invCandidates.some((c) => c.path === p) ? p : (invCandidates[0]?.path ?? ''))) }, [invCandidates])
  useEffect(() => { setPbPath((p) => (pbCandidates.some((c) => c.path === p) ? p : (pbCandidates[0]?.path ?? ''))) }, [pbCandidates])

  const activePlaybook = useMemo(() => pbCandidates.find((p) => p.path === pbPath) ?? null, [pbCandidates, pbPath])

  const inventoryData = useMemo(() => {
    const content = invPath ? projectModel.files[invPath] : ''
    if (content) {
      const r = parseInventoryText(content)
      if (r.groups) return r
    }
    // No inventory in the project — synthesize a host from the playbook so
    // play/role/-e vars still resolve and the table isn't empty.
    return syntheticInventory(activePlaybook?.plays)
  }, [invPath, projectModel, activePlaybook])

  const hosts = useMemo(() => [...new Set(Object.values(inventoryData.groups).flat())].sort(), [inventoryData])
  useEffect(() => { setHost((h) => (hosts.includes(h) ? h : (hosts[0] ?? ''))) }, [hosts])

  const varsFileCandidates = useMemo(
    () => Object.keys(projectModel.files).filter((p) => /\.(ya?ml|json)$/i.test(p)).sort(),
    [projectModel],
  )

  const extraVarsLayers = useMemo(() => {
    const layers = picked.map((p) => ({ label: `@${p}`, path: p, vars: parseFile(projectModel.files[p] ?? '', p) }))
    const kv = {}
    for (const { key, value } of pairs) if (key) kv[key] = coerce(value)
    if (Object.keys(kv).length) layers.push({ label: '-e key=value', path: '(cli)', vars: kv })
    return layers
  }, [picked, pairs, projectModel])

  const runtimeVars = useMemo(() => (activePlaybook ? extractRuntimeVars(activePlaybook, projectModel) : []), [activePlaybook, projectModel])

  const resolution = useMemo(() => {
    if (!host) return null
    return resolveHostVars(host, {
      projectModel, inventoryData, inventoryPath: invPath || '(synthetic)', activePlaybook,
      facts, runtimeMocks: mocks, extraVarsLayers,
    })
  }, [host, projectModel, inventoryData, invPath, activePlaybook, facts, mocks, extraVarsLayers])

  const referenced = useMemo(() => collectReferencedVars(projectModel, activePlaybook), [projectModel, activePlaybook])

  const renderCtx = useMemo(() => {
    const ctx = { ...facts }
    if (resolution) for (const [k, info] of Object.entries(resolution.vars)) ctx[k] = info.winner.value
    return ctx
  }, [resolution, facts])

  const rows = useMemo(() => {
    if (!resolution) return []
    let names = Object.keys(resolution.vars).sort()
    if (filter) names = names.filter((n) => n.toLowerCase().includes(filter.toLowerCase()))
    if (referencedOnly) names = names.filter((n) => referenced.has(n))
    if (!showFacts) {
      names = names.filter((n) => {
        const info = resolution.vars[n]
        const onlyFacts = info.stack.every((s) => s.level === 11)
        return !(onlyFacts && (n.startsWith('ansible_') || n === 'gather_subset' || n === 'module_setup'))
      })
    }
    return names
  }, [resolution, filter, referencedOnly, showFacts, referenced])

  const onMockChange = useCallback((name, value) => setMocks((m) => ({ ...m, [name]: value })), [])
  const togglePick = useCallback((f) => setPicked((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f])), [])

  const handleFolderPick = useCallback(async (e) => {
    const results = await readFolderInput(e.target.files)
    if (results.length) onAddFiles?.(results)
    e.target.value = ''
  }, [onAddFiles])

  const handoffContext = useCallback(() => {
    // raw winner values keyed by name — feeds Flow / Jinja2 mock context
    const out = {}
    if (resolution) for (const [k, info] of Object.entries(resolution.vars)) out[k] = info.winner.value
    return out
  }, [resolution])

  // ── empty state ──────────────────────────────────────────────────────────
  // Show the resolver whenever there's at least a playbook to resolve against
  // (the shared main editor buffer counts); only show the drop zone when there's
  // genuinely nothing.
  if (!projectModel.isProject && pbCandidates.length === 0) {
    return (
      <div
        {...dropProps}
        className={`flex h-full flex-col items-center justify-center gap-5 px-6 text-center transition-colors ${isDragging ? 'bg-cyan-950/30' : ''}`}
      >
        {isProcessing ? (
          <Loader2 size={40} className="text-cyan-400 animate-spin" />
        ) : (
          <FolderInput size={40} className="text-slate-600" />
        )}
        <div>
          <p className="text-slate-300 font-mono text-sm">
            {isProcessing ? 'Reading project files…' : 'Drop an Ansible project folder'}
          </p>
          <p className="text-slate-500 font-mono text-[11px] mt-1 max-w-md">
            inventory · group_vars/ · host_vars/ · roles/ · vendored collections — structure is preserved
            so every variable resolves through Ansible precedence.
          </p>
          {dropError && (
            <p className="text-red-400 font-mono text-[11px] mt-2 flex items-center justify-center gap-1.5">
              <AlertTriangle size={12} className="shrink-0" />
              {dropError}
            </p>
          )}
        </div>
        <label className="cursor-pointer flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-700 bg-cyan-950/40 hover:bg-cyan-950/70 hover:border-cyan-500 text-cyan-300 text-sm font-mono transition-all">
          <FolderInput size={14} />
          Choose project folder
          <input type="file" webkitdirectory="" directory="" multiple className="hidden" onChange={handleFolderPick} />
        </label>
        <p className="text-slate-600 font-mono text-[10px]">…or drop a folder / .zip anywhere here</p>
      </div>
    )
  }

  // ── main ─────────────────────────────────────────────────────────────────
  const selInfo = selectedVar && resolution ? resolution.vars[selectedVar] : null

  return (
    <div {...dropProps} className={`flex h-full flex-col overflow-hidden ${isDragging ? 'bg-cyan-950/20' : ''}`}>
      {/* Toolbar */}
      <div className="shrink-0 border-b border-slate-800 bg-slate-950 px-3 py-2 flex flex-col gap-2">
        {inventoryData.synthetic && (
          <div className="flex items-start gap-1.5 rounded border border-amber-900/50 bg-amber-950/10 px-2.5 py-1.5 text-[10px] font-mono text-amber-300/90">
            <AlertTriangle size={11} className="mt-px shrink-0" />
            <span>
              No inventory in this project — resolving against a synthetic <span className="text-amber-200">example-host</span> derived
              from the playbook&apos;s <code className="text-amber-200">hosts:</code>. Add an inventory (drop a folder, or add an
              <code className="text-amber-200"> inventory</code> file) to resolve real group_vars / host_vars.
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <div data-tour="resolver-pickers" className="flex flex-wrap items-center gap-2">
            {invCandidates.length > 0 ? (
              <Select icon={Server} value={invPath} onChange={setInvPath}
                options={invCandidates} getValue={(o) => o.path} getLabel={(o) => o.path} />
            ) : (
              <span className="flex items-center gap-1.5 rounded border border-slate-800 bg-slate-900 px-2 py-1 text-[11px] font-mono text-slate-500">
                <Server size={12} /> synthetic inventory
              </span>
            )}
            <Select icon={Layers} value={pbPath} onChange={setPbPath}
              options={pbCandidates} getValue={(o) => o.path} getLabel={(o) => o.path}
              placeholder={pbCandidates.length ? 'inventory only' : 'no playbook found'} />
            <Select icon={Server} value={host} onChange={setHost} options={hosts}
              placeholder={hosts.length ? undefined : 'no hosts'} />
          </div>
          <div className="flex-1" />
          {resolution && (
            <div data-tour="resolver-actions" className="flex items-center gap-2">
              <button
                onClick={() => onUseInFlow?.(handoffContext())}
                title="Load this host's resolved vars into the Flow view"
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 text-[11px] font-mono text-slate-400 hover:text-cyan-300 hover:border-cyan-700 transition-all"
              >
                <ArrowRightLeft size={12} /> Use in Flow
              </button>
              <button
                onClick={() => onOpenInJinja2?.(handoffContext())}
                title="Load this host's resolved vars into the Jinja2 sandbox"
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-slate-700 text-[11px] font-mono text-slate-400 hover:text-violet-300 hover:border-violet-700 transition-all"
              >
                <Zap size={12} /> Jinja2
              </button>
            </div>
          )}
        </div>

        {/* host group membership */}
        {resolution && (
          <div data-tour="resolver-groups" className="flex flex-wrap items-center gap-1.5">
            <Users size={11} className="text-emerald-500" />
            <span className="text-[10px] font-mono text-slate-500">groups:</span>
            {resolution.hostGroups.length === 0 && <span className="text-[10px] font-mono text-slate-600 italic">all only</span>}
            {resolution.hostGroups.map((g) => (
              <span key={g} className="text-[10px] font-mono px-1.5 py-px rounded-full bg-slate-900 border border-slate-800 text-emerald-300">{g}</span>
            ))}
            {resolution.plays.length > 0 && (
              <>
                <span className="ml-2 text-[10px] font-mono text-slate-500">plays:</span>
                {resolution.plays.map((p, i) => (
                  <span key={i} className="text-[10px] font-mono px-1.5 py-px rounded-full bg-slate-900 border border-slate-800 text-cyan-300">{p}</span>
                ))}
              </>
            )}
          </div>
        )}

        {/* filters */}
        <div data-tour="resolver-filters" className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 flex-1 min-w-[140px]">
            <Filter size={12} className="text-slate-500 shrink-0" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="filter variables…"
              className="bg-transparent text-[11px] font-mono text-slate-200 outline-none w-full placeholder:text-slate-600"
            />
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 cursor-pointer">
            <input type="checkbox" checked={referencedOnly} onChange={(e) => setReferencedOnly(e.target.checked)} />
            referenced only
          </label>
          <label className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400 cursor-pointer">
            <input type="checkbox" checked={showFacts} onChange={(e) => setShowFacts(e.target.checked)} />
            show facts
          </label>
        </div>

        {/* extra vars */}
        <div data-tour="resolver-extravars">
          <ExtraVarsPanel
            candidateFiles={varsFileCandidates}
            picked={picked}
            onTogglePick={togglePick}
            pairs={pairs}
            onPairsChange={setPairs}
            defaultCollapsed={isMobile}
          />
        </div>

        {/* runtime mocks + mock facts */}
        <div data-tour="resolver-mocks">
          <RuntimeMocksPanel runtimeVars={runtimeVars} mocks={mocks} onMockChange={onMockChange} defaultCollapsed={isMobile} />
          {onFactsChange && (
            <MockContextPanel facts={facts} onFactsChange={onFactsChange} defaultCollapsed />
          )}
        </div>
      </div>

      {/* Body: table (+ desktop stack panel; mobile uses a bottom drawer) */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Var table */}
        <div className="flex-1 min-w-0 overflow-auto" data-tour="resolver-table">
          {!host ? (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono px-6 text-center">
              No hosts in this inventory.
            </div>
          ) : rows.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs font-mono px-6 text-center">
              No variables match. {referencedOnly && 'Try turning off "referenced only".'}
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-950 z-10">
                <tr className="text-[9px] font-mono uppercase tracking-widest text-slate-600 text-left">
                  <th className="px-3 py-2 font-medium">Variable</th>
                  <th className="px-3 py-2 font-medium">Value</th>
                  <th className="px-3 py-2 font-medium">Winning source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((name) => {
                  const info = resolution.vars[name]
                  const v = renderVal(info.winner.value, renderCtx)
                  const active = selectedVar === name
                  const shadowed = info.stack.length - 1
                  return (
                    <tr
                      key={name}
                      onClick={() => setSelectedVar(name)}
                      className={`border-t border-slate-900 cursor-pointer transition-colors ${active ? 'bg-slate-800/60' : 'hover:bg-slate-900/60'}`}
                    >
                      <td className="px-3 py-1.5 align-top">
                        <span className={`text-[11px] font-mono ${referenced.has(name) ? 'text-cyan-300' : 'text-slate-300'}`}>{name}</span>
                        {shadowed > 0 && (
                          <span className="ml-1.5 text-[9px] font-mono text-amber-600" title={`${shadowed} shadowed value(s)`}>+{shadowed}</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 align-top max-w-[280px]">
                        {v.rendered != null
                          ? (
                            <div className="flex flex-col">
                              <span className={`text-[11px] font-mono break-all ${v.unresolved ? 'text-amber-300' : 'text-emerald-300'}`}>{v.rendered || '⟨empty⟩'}</span>
                              <span className="text-[9px] font-mono text-slate-600 break-all">{v.raw}</span>
                            </div>
                          )
                          : (
                            <span className={`text-[11px] font-mono break-all ${v.undef ? 'text-rose-400' : v.error ? 'text-amber-400' : 'text-slate-200'}`}>{v.raw}</span>
                          )}
                        {v.error && <span className="block text-[9px] font-mono text-amber-500">{v.error}</span>}
                      </td>
                      <td className="px-3 py-1.5 align-top">
                        <div className="flex items-center gap-1.5">
                          <LevelChip level={info.winner.level} />
                          <span className="text-[10px] font-mono text-slate-400 truncate max-w-[180px]" title={info.winner.source?.path || info.winner.source?.label}>
                            {info.winner.source?.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Precedence stack — desktop side panel */}
        {!isMobile && (
          <div data-tour="resolver-stack" className="w-[40%] min-w-[280px] shrink-0 border-l border-slate-800 overflow-y-auto bg-slate-950">
            {!selInfo ? (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-slate-700 px-6 text-center">
                <Variable size={26} />
                <p className="text-[11px] font-mono">Select a variable to see its precedence stack.</p>
              </div>
            ) : (
              <StackBody selectedVar={selectedVar} selInfo={selInfo} renderCtx={renderCtx} />
            )}
          </div>
        )}
      </div>

      {/* Precedence stack — mobile bottom drawer */}
      {isMobile && selInfo && createPortal(
        <>
          <button
            aria-label="Close precedence stack"
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[1px]"
            onClick={() => setSelectedVar(null)}
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[72vh] rounded-t-xl border border-slate-800 bg-slate-950 flex flex-col overflow-hidden animate-slide-in-drawer">
            <div className="flex items-center gap-2 px-3 py-2.5 border-b border-slate-800 shrink-0 bg-slate-900">
              <Variable size={13} className="text-cyan-400 shrink-0" />
              <span className="text-[12px] font-mono font-semibold text-cyan-300 break-all flex-1">{selectedVar}</span>
              <button onClick={() => setSelectedVar(null)} className="text-slate-500 hover:text-white p-1 rounded hover:bg-slate-800" title="Close">
                <X size={15} />
              </button>
            </div>
            <div className="overflow-y-auto">
              <StackBody selectedVar={selectedVar} selInfo={selInfo} renderCtx={renderCtx} hideHeader />
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

/** Shared precedence-stack body used by the desktop side panel and mobile drawer. */
function StackBody({ selectedVar, selInfo, renderCtx, hideHeader = false }) {
  return (
    <div className="p-3">
      {!hideHeader && (
        <div className="flex items-center gap-2 mb-3">
          <Variable size={13} className="text-cyan-400" />
          <span className="text-[12px] font-mono font-semibold text-cyan-300 break-all">{selectedVar}</span>
        </div>
      )}
      <p className="text-[9px] font-mono uppercase tracking-widest text-slate-600 mb-2 flex items-center gap-1.5">
        <span>precedence stack — {selInfo.stack.length} candidate{selInfo.stack.length !== 1 ? 's' : ''} (winner on top)</span>
        <a
          href="https://docs.ansible.com/ansible/latest/playbook_guide/playbooks_variables.html#variable-precedence-where-should-i-put-a-variable"
          target="_blank"
          rel="noopener noreferrer"
          title="Official Ansible docs: variable precedence order"
          className="text-slate-600 hover:text-cyan-400 shrink-0"
        >
          <ExternalLink size={10} />
        </a>
      </p>
      <div className="flex flex-col gap-1.5">
        {[...selInfo.stack].reverse().map((s, i) => {
          const isWinner = i === 0
          const v = renderVal(s.value, renderCtx)
          return (
            <div
              key={`${s.level}-${i}`}
              className={`rounded border px-2.5 py-2 ${isWinner ? 'border-emerald-700 bg-emerald-950/30' : 'border-slate-800 bg-slate-900/60 opacity-70'}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                {isWinner ? <ChevronRight size={11} className="text-emerald-400" /> : <span className="w-[11px]" />}
                <LevelChip level={s.level} />
                <span className="text-[10px] font-mono text-slate-300 truncate flex-1" title={s.source?.label}>{s.source?.label}</span>
                {isWinner && <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-wider">wins</span>}
              </div>
              <div className="pl-[20px] flex flex-col gap-0.5">
                <span className={`text-[11px] font-mono break-all ${v.undef ? 'text-rose-400' : 'text-slate-200'}`}>{v.raw}</span>
                {v.rendered != null && (
                  <span className={`text-[10px] font-mono break-all ${v.unresolved ? 'text-amber-300' : 'text-emerald-300'}`}>→ {v.rendered || '⟨empty⟩'}</span>
                )}
                {v.error && <span className="text-[9px] font-mono text-amber-500 flex items-center gap-1"><AlertTriangle size={9} />{v.error}</span>}
                {s.source?.path && <span className="text-[9px] font-mono text-slate-600 break-all">{s.source.path}</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
