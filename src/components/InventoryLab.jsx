/**
 * InventoryLab.jsx
 * Full-page sandbox for building an Ansible inventory and testing
 * --limit patterns against it.
 *
 * Layout:
 *   Left  — Inventory builder (groups + hosts, visual editor + import)
 *   Right — Limit tester (pattern input + per-group result breakdown)
 */
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import {
  Server, Users, Plus, Trash2, Filter, X,
  CheckCircle2, XCircle, ChevronRight, AlertTriangle,
  RefreshCw, ChevronDown, Upload, ClipboardPaste, FileInput, Copy, Check,
} from 'lucide-react'
import { matchHostPattern } from '../lib/ansibleLimit'
import { parseInventoryText, mergeInventories } from '../lib/parseInventory'

// ── Default sandbox inventory ────────────────────────────────────────────────
const DEFAULT_INVENTORY = {
  all:        ['web-01', 'web-02', 'db-01', 'db-02', 'cache-01'],
  web:        ['web-01', 'web-02'],
  db:         ['db-01', 'db-02'],
  cache:      ['cache-01'],
  production: ['web-01', 'db-01', 'cache-01'],
  staging:    ['web-02', 'db-02'],
}

// ── Replace/Append modal ─────────────────────────────────────────────────────

function ImportModal({ parsed, format, onConfirm, onCancel }) {
  const groupCount = Object.keys(parsed).length
  const hostCount  = new Set(Object.values(parsed).flat()).size
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div
        className="rounded-xl border border-slate-700 bg-slate-900 shadow-2xl p-6 w-[380px] flex flex-col gap-4 animate-scale-in">
        <div className="flex items-center gap-2">
          <FileInput size={16} className="text-emerald-400" />
          <span className="text-emerald-400 font-mono font-semibold text-sm uppercase tracking-widest">Import Inventory</span>
        </div>
        <p className="text-slate-300 text-xs leading-relaxed">
          Detected <span className="text-amber-300 font-mono">{format.toUpperCase()}</span> inventory with{' '}
          <span className="text-cyan-300 font-mono">{groupCount} group{groupCount !== 1 ? 's' : ''}</span> and{' '}
          <span className="text-cyan-300 font-mono">{hostCount} unique host{hostCount !== 1 ? 's' : ''}</span>.
        </p>
        <p className="text-slate-400 text-xs">What would you like to do with your existing inventory?</p>
        <div className="flex gap-2">
          <button
            onClick={() => onConfirm('replace')}
            className="flex-1 py-2 rounded border border-red-800 bg-red-950 text-red-300
              text-xs font-mono hover:border-red-600 hover:text-red-200 transition-all"
          >
            Replace
          </button>
          <button
            onClick={() => onConfirm('append')}
            className="flex-1 py-2 rounded border border-emerald-700 bg-emerald-950 text-emerald-300
              text-xs font-mono hover:border-emerald-500 hover:text-emerald-200 transition-all"
          >
            Append
          </button>
          <button
            onClick={onCancel}
            className="px-3 py-2 rounded border border-slate-700 text-slate-500
              text-xs font-mono hover:text-slate-300 transition-all"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Inventory Editor ─────────────────────────────────────────────────────────

function HostPill({ name, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">
      {name}
      <button
        onClick={onRemove}
        className="text-slate-600 hover:text-red-400 transition-colors ml-0.5"
      >
        <XCircle size={11} />
      </button>
    </span>
  )
}

function GroupRow({ groupName, hosts, allHosts, onAddHost, onRemoveHost, onRemoveGroup, isAll }) {
  const [input, setInput] = useState('')
  const [open, setOpen] = useState(false)

  const handleAdd = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onAddHost(groupName, trimmed)
    setInput('')
  }

  return (
    <div className="rounded border border-slate-800 bg-slate-900 mb-2 overflow-hidden">
      {/* Group header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800/60 border-b border-slate-800">
        <button onClick={() => setOpen(v => !v)} className="text-slate-500 hover:text-slate-300 transition-colors">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Users size={12} className="text-emerald-500 shrink-0" />
        <span className="text-emerald-300 font-mono text-xs font-semibold flex-1">{groupName}</span>
        <span className="text-slate-600 text-[10px] font-mono">{hosts.length} host{hosts.length !== 1 ? 's' : ''}</span>
        {!isAll && (
          <button
            onClick={() => onRemoveGroup(groupName)}
            className="text-slate-700 hover:text-red-400 transition-colors ml-1"
            title="Remove group"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {open && (
        <div className="px-3 py-2 animate-fade-in">
          {/* Host pills */}
          <div className="flex flex-wrap gap-1.5 mb-2">
            {hosts.length === 0 && (
              <span className="text-slate-700 text-[10px] font-mono italic">no hosts</span>
            )}
            {hosts.map((h) => (
              <HostPill
                key={h}
                name={h}
                onRemove={() => onRemoveHost(groupName, h)}
              />
            ))}
          </div>

          {/* Add host row */}
          <div className="flex items-center gap-1.5 mt-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="hostname…"
              list={`hosts-datalist-${groupName}`}
              className="flex-1 bg-slate-950 border border-slate-700 focus:border-emerald-600
                rounded px-2 py-0.5 text-[10px] font-mono text-slate-200
                outline-none transition-colors placeholder:text-slate-700 min-w-0"
            />
            <datalist id={`hosts-datalist-${groupName}`}>
              {allHosts.filter((h) => !hosts.includes(h)).map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            <button
              onClick={handleAdd}
              disabled={!input.trim()}
              className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700
                text-[10px] font-mono text-slate-500 hover:text-emerald-300 hover:border-emerald-700
                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Plus size={10} />
              add
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function InventoryEditor({ inventory, onInventoryChange, onHostvarsChange }) {
  const [newGroup, setNewGroup]       = useState('')
  const [isDragging, setIsDragging]   = useState(false)
  const [importError, setImportError] = useState(null)
  const [pending, setPending]         = useState(null)
  const [cmdCopied, setCmdCopied]     = useState(false)
  const fileInputRef = useRef(null)

  const allHosts = useMemo(() => [...new Set(Object.values(inventory).flat())].sort(), [inventory])

  // ── Mutation helpers ──────────────────────────────────────────
  const handleAddHost = useCallback((group, host) => {
    const trimmed = host.trim()
    if (!trimmed) return
    onInventoryChange((prev) => ({
      ...prev,
      [group]: prev[group].includes(trimmed) ? prev[group] : [...prev[group], trimmed],
      ...(group !== 'all' && prev.all && !prev.all.includes(trimmed)
        ? { all: [...prev.all, trimmed] }
        : {}),
    }))
  }, [onInventoryChange])

  const handleRemoveHost = useCallback((group, host) => {
    onInventoryChange((prev) => ({
      ...prev,
      [group]: prev[group].filter((h) => h !== host),
    }))
  }, [onInventoryChange])

  const handleRemoveGroup = useCallback((group) => {
    onInventoryChange((prev) => {
      const next = { ...prev }
      delete next[group]
      return next
    })
  }, [onInventoryChange])

  const handleAddGroup = () => {
    const name = newGroup.trim()
    if (!name || inventory[name]) return
    onInventoryChange((prev) => ({ ...prev, [name]: [] }))
    setNewGroup('')
  }

  const handleReset = () => { onInventoryChange(DEFAULT_INVENTORY); onHostvarsChange({}) }

  // ── Import pipeline ───────────────────────────────────────────
  const tryImport = useCallback((text) => {
    setImportError(null)
    const { groups, format, hostvars, error } = parseInventoryText(text)
    if (error || !groups) {
      setImportError(error || 'Could not parse inventory.')
      return
    }
    setPending({ groups, format, hostvars: hostvars ?? {} })
  }, [])

  const handleConfirm = useCallback((mode) => {
    if (!pending) return
    onInventoryChange((prev) => mergeInventories(prev, pending.groups, mode))
    if (mode === 'replace') {
      onHostvarsChange(pending.hostvars ?? {})
    } else {
      onHostvarsChange((prev) => ({ ...prev, ...(pending.hostvars ?? {}) }))
    }
    setPending(null)
  }, [pending, onInventoryChange, onHostvarsChange])

  // File upload
  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => tryImport(ev.target.result)
    reader.readAsText(file)
    e.target.value = ''
  }, [tryImport])

  // Drag & drop
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])
  const handleDragLeave = useCallback(() => setIsDragging(false), [])
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (ev) => tryImport(ev.target.result)
      reader.readAsText(file)
    } else {
      // Plain text dragged in
      const text = e.dataTransfer.getData('text/plain')
      if (text) tryImport(text)
    }
  }, [tryImport])

  // Paste anywhere on this panel
  const handlePaste = useCallback((e) => {
    const text = e.clipboardData?.getData('text/plain')
    if (text && text.trim()) {
      e.preventDefault()
      tryImport(text)
    }
  }, [tryImport])

  const groupOrder = ['all', ...Object.keys(inventory).filter((g) => g !== 'all').sort()]

  return (
    <>
      {pending && (
        <ImportModal
          parsed={pending.groups}
          format={pending.format}
          onConfirm={handleConfirm}
          onCancel={() => setPending(null)}
        />
      )}

      <div
        className={`flex flex-col h-full overflow-hidden transition-colors
          ${isDragging ? 'bg-emerald-950/20' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        {/* Drag overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <div className="rounded-xl border-2 border-dashed border-emerald-500/60 bg-emerald-950/70 px-8 py-6 flex flex-col items-center gap-2">
              <Upload size={24} className="text-emerald-400" />
              <span className="text-emerald-300 text-xs font-mono">Drop inventory file</span>
            </div>
          </div>
        )}

        {/* Section header */}
        <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 shrink-0">
          <Server size={14} className="text-emerald-400" />
          <span className="text-emerald-400 text-xs font-mono font-semibold uppercase tracking-widest flex-1">
            Inventory
          </span>
          <span className="text-slate-600 text-[10px] font-mono">{allHosts.length} host{allHosts.length !== 1 ? 's' : ''}</span>
          <button
            data-tour="inventory-import"
            onClick={() => fileInputRef.current?.click()}
            title="Upload inventory file"
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700
              text-[10px] font-mono text-slate-500 hover:text-emerald-300 hover:border-emerald-700 transition-all"
          >
            <Upload size={10} />
            Import
          </button>
          <input ref={fileInputRef} type="file" accept=".ini,.cfg,.yml,.yaml,.inv,*" className="hidden" onChange={handleFileChange} />
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-700
              text-[10px] font-mono text-slate-500 hover:text-slate-300 hover:border-slate-500 transition-all"
          >
            <RefreshCw size={10} />
            Reset
          </button>
        </div>

        {/* Command hint + import bar */}
        <div className="px-4 py-2 border-b border-slate-800/60 bg-slate-950 flex flex-col gap-1.5 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 text-[10px] font-mono">Export from Ansible:</span>
            <code className="flex-1 bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[10px] font-mono text-emerald-300 select-all">
              ansible-inventory -i &lt;source&gt; --list &gt; inventory.json
            </code>
            <button
              onClick={() => {
                navigator.clipboard.writeText('ansible-inventory -i <source> --list > inventory.json')
                setCmdCopied(true)
                setTimeout(() => setCmdCopied(false), 2000)
              }}
              title="Copy command"
              className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-mono transition-all
                ${cmdCopied
                  ? 'border-emerald-700 text-emerald-300 bg-emerald-950'
                  : 'border-slate-700 text-slate-500 hover:text-emerald-300 hover:border-emerald-700'}`}
            >
              {cmdCopied ? <Check size={10} /> : <Copy size={10} />}
              {cmdCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-600 text-[10px] font-mono flex items-center gap-1.5">
              Then <ClipboardPaste size={10} /> paste · <Upload size={10} /> drag &amp; drop · or click Import — supports JSON, INI &amp; YAML
            </span>
            {importError && (
              <span className="ml-auto flex items-center gap-1 text-red-400 text-[10px] font-mono">
                <AlertTriangle size={10} />{importError}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 relative">
          {groupOrder.map((group) => (
            inventory[group] !== undefined && (
              <GroupRow
                key={group}
                groupName={group}
                hosts={inventory[group]}
                allHosts={allHosts}
                onAddHost={handleAddHost}
                onRemoveHost={handleRemoveHost}
                onRemoveGroup={handleRemoveGroup}
                isAll={group === 'all'}
              />
            )
          ))}

          {/* Add group row */}
          <div className="flex items-center gap-2 mt-2">
            <input
              type="text"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()}
              placeholder="new group name…"
              className="flex-1 bg-slate-900 border border-slate-800 focus:border-emerald-700
                rounded px-2 py-1 text-[10px] font-mono text-slate-300
                outline-none transition-colors placeholder:text-slate-700"
            />
            <button
              onClick={handleAddGroup}
              disabled={!newGroup.trim() || !!inventory[newGroup.trim()]}
              className="flex items-center gap-1 px-3 py-1 rounded border border-slate-700
                text-[10px] font-mono text-slate-500 hover:text-emerald-300 hover:border-emerald-700
                disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              <Plus size={10} />
              Add Group
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Host detail modal ─────────────────────────────────────────────────────────────

// ── Host detail sidebar ──────────────────────────────────────────────────────────

function HostDetailSidebar({ host, hostvars, inventory, onClose, onGroupClick }) {
  const attrs = hostvars?.[host] ?? {}
  const entries = Object.entries(attrs)
  const [copiedKey, setCopiedKey] = useState(null)

  const copyValue = useCallback((k, v) => {
    navigator.clipboard?.writeText(String(v))
    setCopiedKey(k)
    setTimeout(() => setCopiedKey(null), 2000)
  }, [])

  const groups = useMemo(
    () => Object.entries(inventory)
      .filter(([g, hosts]) => g !== 'all' && hosts.includes(host))
      .map(([g]) => g)
      .sort(),
    [host, inventory]
  )

  return (
    <div className="w-64 shrink-0 border-l border-slate-800 bg-slate-950 flex flex-col overflow-hidden animate-slide-in-drawer">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 shrink-0 bg-slate-900">
        <Server size={13} className="text-emerald-400 shrink-0" />
        <span className="text-emerald-300 font-mono font-semibold text-xs flex-1 truncate" title={host}>{host}</span>
        <button
          onClick={onClose}
          className="text-slate-500 hover:text-white transition-colors rounded p-0.5 hover:bg-slate-700"
          title="Close (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Group membership */}
        <div className="px-4 py-3 border-b border-slate-800/60">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-2">Member of</p>
          {groups.length === 0 ? (
            <span className="text-slate-700 text-[10px] font-mono italic">no groups</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => onGroupClick?.(g)}
                  title={`Add \"${g}\" to limit filter`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono
                    bg-slate-900 border border-slate-700 text-slate-300
                    hover:border-emerald-600 hover:text-emerald-300 hover:bg-emerald-950/30
                    transition-all cursor-pointer"
                >
                  <Users size={8} className="text-emerald-500 shrink-0" />
                  {g}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Host variables */}
        <div className="px-4 py-3">
          <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-3">Host Variables</p>
          {entries.length === 0 ? (
            <p className="text-slate-600 text-[11px] font-mono leading-relaxed">
              No variables — import a JSON inventory to see <code className="text-slate-500">_meta.hostvars</code>.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {entries.map(([k, v]) => (
                <div key={k}>
                  <p className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mb-0.5">{k}</p>
                  <div className="bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 flex items-center gap-2 group">
                    <span className="text-[11px] font-mono text-cyan-300 break-all flex-1">{String(v)}</span>
                    <button
                      onClick={() => copyValue(k, v)}
                      title="Copy value"
                      className={`shrink-0 transition-colors ${
                        copiedKey === k ? 'text-emerald-400' : 'text-slate-600 hover:text-cyan-400'
                      }`}
                    >
                      {copiedKey === k ? <Check size={10} /> : <Copy size={10} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Limit autocomplete input ───────────────────────────────────────────────────

function LimitInput({ value, onChange, inventory, dataTour }) {
  const [showSugg, setShowSugg] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef(null)

  const allGroups = useMemo(() => Object.keys(inventory).sort(), [inventory])
  const allHosts  = useMemo(() => [...new Set(Object.values(inventory).flat())].sort(), [inventory])

  // Token currently being typed — text after the last operator char
  const currentToken = useMemo(() => {
    const m = value.match(/(?:^|[:|!&,])([^:|!&,]*)$/)
    return m ? m[1] : ''
  }, [value])

  const suggestions = useMemo(() => {
    if (!currentToken) return []
    const q = currentToken.toLowerCase()
    const groups = allGroups
      .filter((g) => g.toLowerCase().startsWith(q))
      .map((g) => ({ name: g, kind: 'group' }))
    const hosts = allHosts
      .filter((h) => h.toLowerCase().startsWith(q) && !allGroups.includes(h))
      .map((h) => ({ name: h, kind: 'host' }))
    return [...groups, ...hosts].slice(0, 14)
  }, [currentToken, allGroups, allHosts])

  const apply = useCallback((name) => {
    const next = value.replace(/([^:|!&,]*)$/, name)
    onChange(next)
    setShowSugg(false)
    inputRef.current?.focus()
  }, [value, onChange])

  const handleKeyDown = (e) => {
    if (!showSugg || suggestions.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Tab' || e.key === 'Enter') { e.preventDefault(); apply(suggestions[activeIdx]?.name ?? '') }
    if (e.key === 'Escape')    { setShowSugg(false) }
  }

  return (
    <div data-tour={dataTour} className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => { onChange(e.target.value); setShowSugg(true); setActiveIdx(0) }}
        onKeyDown={handleKeyDown}
        onFocus={() => { setShowSugg(true); setActiveIdx(0) }}
        onBlur={() => setTimeout(() => setShowSugg(false), 150)}
        placeholder="e.g. web:&production  or  web-0*  or  all:!staging"
        className="w-full bg-slate-900 border border-slate-700 focus:border-amber-600
          rounded px-3 py-1.5 text-[12px] font-mono text-slate-200
          outline-none transition-colors placeholder:text-slate-700"
      />
      {showSugg && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-30 mt-1 rounded border border-slate-700 bg-slate-900 shadow-xl overflow-hidden animate-slide-down">
          {suggestions.map((s, i) => (
            <button
              key={s.name}
              onMouseDown={(e) => { e.preventDefault(); apply(s.name) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono text-left transition-colors
                ${i === activeIdx ? 'bg-amber-950 text-amber-200' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'}`}
            >
              <span className={`text-[9px] px-1.5 py-px rounded font-bold
                ${s.kind === 'group' ? 'bg-emerald-900 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                {s.kind === 'group' ? 'G' : 'H'}
              </span>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Host result badge ─────────────────────────────────────────────────────────────


function MatchedHostBadge({ name, matched, hasHostvars, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={style}
      title={hasHostvars ? 'Click to view host attributes' : name}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono border transition-all animate-pop-in
        ${matched
          ? 'bg-emerald-950 border-emerald-700 text-emerald-300 hover:border-emerald-500 hover:bg-emerald-900'
          : 'bg-slate-900 border-slate-800 text-slate-600 line-through hover:border-slate-600'
        }
        ${hasHostvars ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {matched ? <CheckCircle2 size={9} /> : <XCircle size={9} />}
      {name}
      {hasHostvars && <Server size={8} className="opacity-40 ml-0.5" />}
    </button>
  )
}

// ── Group result card ────────────────────────────────────────────────────────

const EXAMPLE_PATTERNS = [
  { pattern: 'web',              desc: 'single group' },
  { pattern: 'web:db',           desc: 'union' },
  { pattern: 'production:&web',  desc: 'intersection' },
  { pattern: 'all:!staging',     desc: 'exclude group' },
  { pattern: 'web-0*',           desc: 'wildcard' },
  { pattern: 'web-01,db-01',     desc: 'comma list' },
]

function GroupResultCard({ groupName, groupHosts, matchedSet, limit, hostvars, onHostClick }) {
  const hasLimit = limit && limit.trim()
  const matchCount = groupHosts.filter((h) => matchedSet.has(h)).length

  const isFullMatch = matchCount === groupHosts.length
  const isNoMatch   = matchCount === 0
  const isPartial   = !isFullMatch && !isNoMatch

  let borderColor = 'border-slate-800'
  if (hasLimit) {
    if (isFullMatch && groupHosts.length > 0) borderColor = 'border-emerald-800'
    else if (isNoMatch && groupHosts.length > 0) borderColor = 'border-red-900/60'
    else if (isPartial) borderColor = 'border-amber-800/60'
  }

  return (
    <div className={`rounded border ${borderColor} bg-slate-900 p-3 mb-2`}>
      <div className="flex items-center gap-2 mb-2">
        <Users size={11} className="text-emerald-500 shrink-0" />
        <span className="text-emerald-300 font-mono text-xs font-semibold">{groupName}</span>
        {hasLimit && groupHosts.length > 0 && (
          <span className={`ml-auto text-[10px] font-mono
            ${isFullMatch ? 'text-emerald-400' : isNoMatch ? 'text-red-400' : 'text-amber-400'}`}
          >
            {matchCount}/{groupHosts.length} matched
          </span>
        )}
        {!hasLimit && (
          <span className="ml-auto text-slate-600 text-[10px] font-mono">
            {groupHosts.length} host{groupHosts.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {groupHosts.length === 0 && (
          <span className="text-slate-700 text-[10px] italic">empty</span>
        )}
        {groupHosts.map((h, idx) => (
          <MatchedHostBadge
            key={h}
            name={h}
            matched={!hasLimit || matchedSet.has(h)}
            hasHostvars={!!(hostvars?.[h] && Object.keys(hostvars[h]).length > 0)}
            onClick={() => onHostClick?.(h)}
            style={{ animationDelay: `${idx * 18}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

function LimitTester({ inventory, hostvars, selectedHost, onHostClick, limit, onLimitChange }) {
  const [showRef, setShowRef] = useState(false)

  // Also support comma-separated (ansible accepts both : and ,)
  const normalisedLimit = limit.replace(/,/g, ':')

  const matchedSet = useMemo(() => {
    if (!normalisedLimit.trim()) return null
    return matchHostPattern(normalisedLimit, inventory)
  }, [normalisedLimit, inventory])

  const allHosts = useMemo(() => [...new Set(Object.values(inventory).flat())].sort(), [inventory])

  const totalMatched = matchedSet ? matchedSet.size : allHosts.length

  const groupOrder = ['all', ...Object.keys(inventory).filter((g) => g !== 'all').sort()]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 shrink-0">
        <Filter size={14} className="text-amber-400" />
        <span className="text-amber-400 text-xs font-mono font-semibold uppercase tracking-widest flex-1">
          --limit Tester
        </span>
        {matchedSet && (
          <span className={`text-[10px] font-mono ${totalMatched === 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalMatched} / {allHosts.length} host{allHosts.length !== 1 ? 's' : ''} matched
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Pattern input */}
        <div className="mb-4">
          <label className="block text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-1.5">
            Limit Pattern
          </label>
          <div className="flex items-center gap-2">
            <code className="text-slate-600 text-[11px] font-mono shrink-0">--limit</code>
            <LimitInput
              value={limit}
              onChange={onLimitChange}
              inventory={inventory}
              dataTour="limit-input"
            />
            {limit && (
              <button
                onClick={() => onLimitChange('')}
                className="text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
              >
                clear
              </button>
            )}
          </div>

          {/* Zero-match warning */}
          {matchedSet && totalMatched === 0 && (
            <div className="mt-2 flex items-center gap-1.5 text-red-400 text-[11px] font-mono">
              <AlertTriangle size={11} />
              No hosts match this pattern — the play would be skipped entirely.
            </div>
          )}
        </div>

        {/* Examples + Syntax reference — collapsible */}
        <div className="mb-4 rounded border border-slate-800 overflow-hidden">
          <button
            onClick={() => setShowRef((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2 bg-slate-900 hover:bg-slate-800 transition-colors text-left"
          >
            <ChevronRight size={12} className={`text-slate-500 transition-transform ${showRef ? 'rotate-90' : ''}`} />
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">Examples &amp; Pattern Syntax</span>
          </button>

          {showRef && (
            <div className="px-3 pb-3 bg-slate-900/60 flex flex-col gap-3 pt-2">
              {/* Examples */}
              <div className="grid grid-cols-2 gap-1.5">
                {EXAMPLE_PATTERNS.map(({ pattern, desc }) => (
                  <button
                    key={pattern}
                    onClick={() => onLimitChange(pattern)}
                    className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded border text-[10px] font-mono text-left transition-all
                      ${limit === pattern
                        ? 'border-amber-700 bg-amber-950 text-amber-300'
                        : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                      }`}
                  >
                    <span>{pattern}</span>
                    <span className="text-slate-600 text-[9px]">{desc}</span>
                  </button>
                ))}
              </div>

              {/* Syntax reference */}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px] font-mono border-t border-slate-800 pt-2">
                <code className="text-amber-300">group1:group2</code><span className="text-slate-400">union — hosts in either group</span>
                <code className="text-amber-300">group1:&amp;group2</code><span className="text-slate-400">intersection — hosts in both groups</span>
                <code className="text-amber-300">group1:!group2</code><span className="text-slate-400">difference — in group1 but not group2</span>
                <code className="text-amber-300">web-0*</code><span className="text-slate-400">wildcard — fnmatch-style glob</span>
                <code className="text-amber-300">all</code><span className="text-slate-400">every host in the inventory</span>
                <code className="text-amber-300">host1,host2</code><span className="text-slate-400">comma-separated explicit hosts</span>
              </div>
            </div>
          )}
        </div>

        {/* Per-group breakdown */}
        <div data-tour="limit-results">
        <div className="text-[10px] font-mono text-slate-600 uppercase tracking-wider mb-2">
          Groups
        </div>
        {groupOrder.map((group) => (
          inventory[group] !== undefined && (
            <GroupResultCard
              key={group}
              groupName={group}
              groupHosts={inventory[group]}
              matchedSet={matchedSet ?? new Set(allHosts)}
              limit={limit}
              hostvars={hostvars}
              onHostClick={onHostClick}
            />
          )
        ))}
        </div>
      </div>
    </div>
  )
}

// ── Page root ────────────────────────────────────────────────────────────────

const LS_INVENTORY = 'ansible101:inventory'
const LS_HOSTVARS  = 'ansible101:hostvars'

function loadInventory() {
  try {
    const raw = localStorage.getItem(LS_INVENTORY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return DEFAULT_INVENTORY
}

function loadHostvars() {
  try {
    const raw = localStorage.getItem(LS_HOSTVARS)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {}
}

export default function InventoryLab() {
  const [inventory, setInventoryRaw] = useState(loadInventory)
  const [hostvars, setHostvarsRaw]   = useState(loadHostvars)
  const [selectedHost, setSelectedHost] = useState(null)
  const [limit, setLimit] = useState('')

  const handleGroupClick = useCallback((g) => {
    setLimit((prev) => prev ? prev + ':' + g : g)
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') setSelectedHost(null) }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [])

  const setInventory = useCallback((updater) => {
    setInventoryRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(LS_INVENTORY, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  const setHostvars = useCallback((updater) => {
    setHostvarsRaw((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      try { localStorage.setItem(LS_HOSTVARS, JSON.stringify(next)) } catch {}
      return next
    })
  }, [])

  return (
    <div className="flex flex-1 overflow-hidden animate-fade-up">
      {/* Left — inventory builder */}
      <div data-tour="inventory-editor" className="w-[40%] min-w-[280px] border-r border-slate-800 overflow-hidden flex flex-col relative">
        <InventoryEditor
          inventory={inventory}
          onInventoryChange={setInventory}
          onHostvarsChange={setHostvars}
        />
      </div>

      {/* Middle — limit tester */}
      <div className="flex-1 overflow-hidden flex flex-col min-w-0">
        <LimitTester
          inventory={inventory}
          hostvars={hostvars}
          selectedHost={selectedHost}
          onHostClick={setSelectedHost}
          limit={limit}
          onLimitChange={setLimit}
        />
      </div>

      {/* Right — host detail sidebar (slides in when a host is selected) */}
      {selectedHost && (
        <HostDetailSidebar
          host={selectedHost}
          hostvars={hostvars}
          inventory={inventory}
          onClose={() => setSelectedHost(null)}
          onGroupClick={handleGroupClick}
        />
      )}
    </div>
  )
}
