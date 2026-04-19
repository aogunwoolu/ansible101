/**
 * FileExplorer.jsx — resizable, collapsible file sidebar with folder tree.
 */
/* eslint-disable react/prop-types */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { ChevronDown, ChevronRight, Plus, Pencil, X, AlertTriangle } from 'lucide-react'

/* ─── helpers ──────────────────────────────────────────────── */

function buildStatusMap(extraFiles, nodes) {
  const resolvedLabels = new Set(
    nodes.filter((n) => n.type === 'includeNode').map((n) => n.data?.label).filter(Boolean)
  )
  const result = {}
  extraFiles.forEach((f) => {
    // Non-YAML files have no Ansible relationship — mark as 'other' (neutral display)
    if (!/\.(ya?ml)$/i.test(f.name)) { result[f.id] = 'other'; return }
    if (resolvedLabels.has(f.name)) { result[f.id] = 'resolved'; return }
    const m = f.name.match(/^roles\/(.+?)\/tasks\/main\.yml$/)
    if (m && resolvedLabels.has(`role: ${m[1]}`)) { result[f.id] = 'resolved'; return }
    result[f.id] = 'unused'
  })
  return result
}

function buildMissingRefs(extraFiles, nodes) {
  const known = new Set(extraFiles.map((f) => f.name))
  const seen = new Set()
  const out = []
  nodes.forEach((n) => {
    if (n.type !== 'missingFileNode') return
    const label = n.data?.label
    if (!label || seen.has(label)) return
    seen.add(label)
    const filename = label.startsWith('role: ')
      ? `roles/${label.slice(6)}/tasks/main.yml`
      : label
    if (!known.has(filename)) out.push({ label, filename })
  })
  return out
}

/**
 * Groups extraFiles + missingRefs into a shallow tree.
 * Files whose name contains a '/' are grouped under their first path segment.
 * Returns array of: { kind:'file'|'missing'|'dir', ... }
 */
function buildTree(extraFiles, statuses, missingRefs) {
  const roots = []
  const dirs = new Map()
  const ensureDir = (name) => {
    if (!dirs.has(name)) dirs.set(name, [])
    return dirs.get(name)
  }

  extraFiles.forEach((f) => {
    const i = f.name.indexOf('/')
    if (i === -1) roots.push({ kind: 'file', file: f, status: statuses[f.id], rel: f.name })
    else ensureDir(f.name.slice(0, i)).push({ kind: 'file', file: f, status: statuses[f.id], rel: f.name.slice(i + 1) })
  })

  missingRefs.forEach((item) => {
    const i = item.filename.indexOf('/')
    if (i === -1) roots.push({ kind: 'missing', item, rel: item.filename })
    else ensureDir(item.filename.slice(0, i)).push({ kind: 'missing', item, rel: item.filename.slice(i + 1) })
  })

  const dirEntries = []
  dirs.forEach((children, name) => dirEntries.push({ kind: 'dir', name, children }))
  return [...roots, ...dirEntries]
}

/* ─── row components ─────────────────────────────────────── */

function MainRow({ active, onSwitch }) {
  return (
    <button
      onClick={onSwitch}
      className={`w-full flex items-center gap-2 pl-2 pr-2 h-[26px] text-left transition-colors border-l-[2px]
        ${active
          ? 'border-l-cyan-500 bg-slate-800/70'
          : 'border-l-transparent hover:bg-slate-800/30'
        }`}
    >
      <span className={`text-[10px] font-mono flex-1 truncate font-medium ${active ? 'text-cyan-300' : 'text-slate-400'}`}>
        playbook.yml
      </span>
      <span className="text-[8px] font-mono text-slate-700 shrink-0">main</span>
    </button>
  )
}

function FileRow({ file, status, rel, active, onSwitch, onRemove, onRename, indent = false, hasError = false, onDragStart, onDragOver, onDrop, isDragOver }) {
  const inputRef = useRef(null)
  const [renaming, setRenaming] = useState(false)

  const startRename = useCallback((e) => {
    e.stopPropagation()
    setRenaming(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
  }, [])

  const commitRename = useCallback(() => {
    const val = inputRef.current?.value?.trim()
    if (val && val !== rel) onRename(val)
    setRenaming(false)
  }, [rel, onRename])

  const textColor = active ? 'text-white'
    : hasError ? 'text-red-400'
    : status === 'resolved' ? 'text-teal-300'
    : status === 'other' ? 'text-slate-400'
    : 'text-slate-500'
  const borderColor = active
    ? hasError ? 'border-l-red-500' : status === 'resolved' ? 'border-l-teal-400' : 'border-l-slate-500'
    : 'border-l-transparent'

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver?.() }}
      onDrop={onDrop}
      onDragEnd={() => onDrop?.(null, true)}
      className={`group flex items-center gap-1 ${indent ? 'pl-5' : 'pl-2'} pr-1 h-[24px] border-l-[2px] cursor-pointer transition-colors
        ${isDragOver ? 'border-l-cyan-400 bg-cyan-950/30' : borderColor}
        ${active && !isDragOver ? 'bg-slate-800/70' : !isDragOver ? 'hover:bg-slate-800/30' : ''}`}
      onClick={renaming ? undefined : onSwitch}
    >
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={rel}
          className="flex-1 bg-slate-700 text-[10px] font-mono text-white px-1.5 py-px rounded outline-none ring-1 ring-cyan-500/40 min-w-0"
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') setRenaming(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`flex-1 min-w-0 font-mono text-[10px] truncate ${textColor}`} title={file.name}>
          {rel}
        </span>
      )}
      {!renaming && hasError && (
        <span className="w-1 h-1 rounded-full bg-red-500 shrink-0 mr-px" title="YAML error" />
      )}
      {!renaming && (
        <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={startRename} className="p-px text-slate-600 hover:text-slate-300" title="Rename">
            <Pencil size={8} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); onRemove() }} className="p-px text-slate-600 hover:text-red-400" title="Remove">
            <X size={8} />
          </button>
        </span>
      )}
    </div>
  )
}

function MissingRow({ item, rel, onAdd, indent = false }) {
  return (
    <div className={`group flex items-center gap-1 ${indent ? 'pl-5' : 'pl-2'} pr-1 h-[24px] border-l-[2px] border-l-orange-700/40 hover:bg-orange-950/10 transition-colors`}>
      <span className="flex-1 min-w-0 font-mono text-[10px] truncate text-orange-700/60" title={item.filename}>
        {rel}
      </span>
      <button
        onClick={onAdd}
        className="shrink-0 flex items-center gap-px text-[8px] font-mono px-1 py-px rounded
          text-orange-600 border border-orange-800/60 hover:border-orange-500 hover:text-orange-400 transition-all"
      >
        <Plus size={7} />add
      </button>
    </div>
  )
}

function FolderRow({ name, open, onToggle, hasMissing }) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-1 pl-2 pr-1 h-[22px] group hover:bg-slate-800/30 transition-colors"
    >
      <span
        className="text-[8px] font-mono text-slate-600 transition-transform duration-100 shrink-0 leading-none select-none"
        style={{ display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      >
        ▾
      </span>
      <span className="text-[9px] font-mono text-slate-500 group-hover:text-slate-400 truncate transition-colors flex-1 text-left">
        {name}/
      </span>
      {hasMissing && <span className="shrink-0 w-1 h-1 rounded-full bg-orange-600/70" />}
    </button>
  )
}

/* ─── main export ────────────────────────────────────────── */

/**
 * Full-height sidebar to the left of the editor.
 * - Drag the right edge to resize.
 * - Click the chevron to collapse to a thin strip.
 * - Files with a '/' in their name are grouped under a collapsible folder.
 */
export default function FileExplorer({
  files,
  activeId,
  onSwitch,
  onAdd,
  onAddNamed,
  onRemove,
  onRename,
  onReorder,
  nodes = [],
  fileErrors = {},
  isMobile = false,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(120)
  const [openDirs, setOpenDirs] = useState({})
  const [dragId, setDragId] = useState(null)   // id being dragged
  const [overId, setOverId] = useState(null)   // id being hovered over
  const isResizing = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  const mainFile = files[0]
  const extraFiles = files.slice(1)

  const statuses = useMemo(() => buildStatusMap(extraFiles, nodes), [extraFiles, nodes])
  const missingRefs = useMemo(() => buildMissingRefs(extraFiles, nodes), [extraFiles, nodes])
  const tree = useMemo(() => buildTree(extraFiles, statuses, missingRefs), [extraFiles, statuses, missingRefs])

  const toggleDir = useCallback((name) => {
    setOpenDirs((prev) => ({ ...prev, [name]: prev[name] === false }))
  }, [])

  // Auto-open any folder that contains an unresolved missing ref
  useEffect(() => {
    const toOpen = {}
    missingRefs.forEach((item) => {
      const i = item.filename.indexOf('/')
      if (i !== -1) toOpen[item.filename.slice(0, i)] = true
    })
    if (Object.keys(toOpen).length) setOpenDirs((prev) => ({ ...prev, ...toOpen }))
  }, [missingRefs])

  const commitDrop = useCallback((targetId) => {
    if (!dragId || !targetId || dragId === targetId) { setDragId(null); setOverId(null); return }
    onReorder?.(dragId, targetId)
    setDragId(null)
    setOverId(null)
  }, [dragId, onReorder])

  const onResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizing.current = true
    dragStartX.current = e.clientX
    dragStartW.current = width
    const onMove = (mv) => {
      if (!isResizing.current) return
      setWidth(Math.max(80, Math.min(260, dragStartW.current + mv.clientX - dragStartX.current)))
    }
    const onUp = () => {
      isResizing.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [width])

  if (isMobile) {
    return (
      <div className="border-b border-slate-800 bg-slate-950 shrink-0">
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-[9px] font-mono uppercase tracking-[0.14em] text-slate-600 flex-1">files</span>
          {missingRefs.length > 0 && (
            <span className="flex items-center gap-1 text-[9px] font-mono text-orange-700/80">
              <AlertTriangle size={9} />{missingRefs.length}
            </span>
          )}
          <button onClick={onAdd} title="New file" className="p-1 text-slate-600 hover:text-cyan-400 transition-colors shrink-0">
            <Plus size={12} />
          </button>
        </div>

        <div className="overflow-x-auto px-3 pb-3">
          <div className="flex items-center gap-2 min-w-max">
            {files.map((file) => {
              const isMain = file.id === mainFile.id
              const hasError = !!fileErrors[file.id]
              const status = isMain ? 'main' : statuses[file.id]
              return (
                <button
                  key={file.id}
                  onClick={() => onSwitch(file.id)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] font-mono transition-all ${
                    activeId === file.id
                      ? 'border-cyan-500 bg-cyan-950/50 text-cyan-300'
                      : hasError
                        ? 'border-red-800 bg-red-950/30 text-red-300'
                        : status === 'resolved'
                          ? 'border-teal-800 bg-teal-950/30 text-teal-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                  }`}
                >
                  {file.name}
                </button>
              )
            })}

            {missingRefs.map((item) => (
              <button
                key={item.filename}
                onClick={() => onAddNamed(item.filename)}
                className="rounded-full border border-orange-800/60 bg-orange-950/20 px-3 py-1.5 text-[10px] font-mono text-orange-400 transition-all"
              >
                + {item.filename}
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  /* ── Collapsed strip ── */
  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-r border-slate-800 bg-slate-950 select-none shrink-0 w-5">
        <button
          onClick={() => setCollapsed(false)}
          title="Expand"
          className="flex flex-col items-center w-full pt-2 gap-1.5 group flex-1"
        >
          <ChevronRight size={10} className="text-slate-600 group-hover:text-cyan-500 transition-colors" />
          {missingRefs.length > 0 && (
            <span className="w-1 h-1 rounded-full bg-orange-600" />
          )}
        </button>
      </div>
    )
  }

  /* ── Expanded ── */
  return (
    <div
      className="relative flex flex-col border-r border-slate-800 bg-slate-950 select-none shrink-0 overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {/* Header */}
      <div className="flex items-center h-[26px] px-2 shrink-0 gap-0.5">
        <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-slate-600 flex-1">files</span>
        {missingRefs.length > 0 && (
          <span className="flex items-center gap-px text-[8px] font-mono text-orange-700/80">
            <AlertTriangle size={7} />{missingRefs.length}
          </span>
        )}
        <button onClick={onAdd} title="New file" className="p-0.5 text-slate-600 hover:text-cyan-400 transition-colors shrink-0">
          <Plus size={10} />
        </button>
        <button onClick={() => setCollapsed(true)} title="Collapse" className="p-0.5 text-slate-700 hover:text-slate-400 transition-colors shrink-0">
          <ChevronDown size={10} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <MainRow active={activeId === mainFile.id} onSwitch={() => onSwitch(mainFile.id)} />

        {tree.map((node) => {
          if (node.kind === 'file') {
            return (
              <FileRow
                key={node.file.id}
                file={node.file}
                status={node.status}
                rel={node.rel}
                active={activeId === node.file.id}
                onSwitch={() => onSwitch(node.file.id)}
                onRemove={() => onRemove(node.file.id)}
                onRename={(newRel) => onRename(node.file.id, newRel)}
                hasError={!!fileErrors[node.file.id]}
                onDragStart={() => setDragId(node.file.id)}
                onDragOver={() => setOverId(node.file.id)}
                onDrop={() => commitDrop(node.file.id)}
                isDragOver={overId === node.file.id && dragId !== node.file.id}
              />
            )
          }
          if (node.kind === 'missing') {
            return (
              <MissingRow
                key={node.item.filename}
                item={node.item}
                rel={node.rel}
                onAdd={() => onAddNamed(node.item.filename)}
              />
            )
          }
          if (node.kind === 'dir') {
            const isOpen = openDirs[node.name] !== false
            const hasMissing = node.children.some((c) => c.kind === 'missing')
            return (
              <React.Fragment key={node.name}>
                <FolderRow
                  name={node.name}
                  open={isOpen}
                  onToggle={() => toggleDir(node.name)}
                  hasMissing={hasMissing}
                />
                {isOpen && node.children.map((child) => {
                  if (child.kind === 'file') {
                    return (
                      <FileRow
                        key={child.file.id}
                        file={child.file}
                        status={child.status}
                        rel={child.rel}
                        active={activeId === child.file.id}
                        onSwitch={() => onSwitch(child.file.id)}
                        onRemove={() => onRemove(child.file.id)}
                        onRename={(newRel) => onRename(child.file.id, `${node.name}/${newRel}`)}
                        indent
                        hasError={!!fileErrors[child.file.id]}
                        onDragStart={() => setDragId(child.file.id)}
                        onDragOver={() => setOverId(child.file.id)}
                        onDrop={() => commitDrop(child.file.id)}
                        isDragOver={overId === child.file.id && dragId !== child.file.id}
                      />
                    )
                  }
                  if (child.kind === 'missing') {
                    return (
                      <MissingRow
                        key={child.item.filename}
                        item={child.item}
                        rel={child.rel}
                        onAdd={() => onAddNamed(child.item.filename)}
                        indent
                      />
                    )
                  }
                  return null
                })}
              </React.Fragment>
            )
          }
          return null
        })}

        <button
          onClick={onAdd}
          className="w-full flex items-center gap-1 px-2 h-[20px] text-[8px] font-mono text-slate-700 hover:text-slate-500 transition-colors mt-1"
        >
          <Plus size={7} /><span>new file</span>
        </button>
      </div>

      {/* Resize handle — drag right edge to resize */}
      <div
        className="absolute right-0 top-0 bottom-0 w-[3px] cursor-ew-resize z-10 group/resize"
        onMouseDown={onResizeStart}
      >
        <div className="absolute inset-0 opacity-0 group-hover/resize:opacity-100 bg-cyan-500/25 transition-opacity" />
      </div>
    </div>
  )
}
