/**
 * FileExplorer.jsx — resizable, collapsible file sidebar with a nested folder tree.
 *
 * Folders are derived from file paths (and from `folders`, explicit empty
 * placeholders — see buildTree). Renaming a file or folder edits its full
 * relative path, so it can move between folders; renaming a folder rewrites
 * the shared path prefix of everything under it. Right-click (or the "+"
 * buttons) on a file, folder, the main row, or empty space opens the
 * relevant actions via the shared ContextMenu.
 */
/* eslint-disable react/prop-types */
/* eslint-disable jsx-a11y/no-static-element-interactions */
/* eslint-disable jsx-a11y/click-events-have-key-events */
import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronDown, ChevronRight, Plus, Pencil, X, AlertTriangle,
  Trash2, FilePlus, FolderPlus,
} from 'lucide-react'
import { isValidRelativePath } from '../lib/filePaths'

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
 * Build a recursive tree from full relative paths, plus any explicit empty
 * folder placeholders (`extraFolders` — folders with no files yet).
 * Node: { dirs: Map<name, Node>, files: [{file,status,base}], missing: [{item,base}] }
 */
function buildTree(extraFiles, statuses, missingRefs, extraFolders = []) {
  const root = { dirs: new Map(), files: [], missing: [] }
  const ensure = (parts) => {
    let node = root
    for (const p of parts) {
      if (!node.dirs.has(p)) node.dirs.set(p, { dirs: new Map(), files: [], missing: [] })
      node = node.dirs.get(p)
    }
    return node
  }
  extraFiles.forEach((f) => {
    const parts = f.name.split('/')
    const base = parts.pop()
    ensure(parts).files.push({ file: f, status: statuses[f.id], base })
  })
  missingRefs.forEach((item) => {
    const parts = item.filename.split('/')
    const base = parts.pop()
    ensure(parts).missing.push({ item, base })
  })
  extraFolders.forEach((p) => { if (p) ensure(p.split('/')) })
  return root
}

function subtreeHasMissing(node) {
  if (node.missing.length) return true
  for (const child of node.dirs.values()) if (subtreeHasMissing(child)) return true
  return false
}

const padFor = (depth) => ({ paddingLeft: depth * 11 + 8 })

/* ─── context menu ───────────────────────────────────────── */

/**
 * Generic right-click menu, portaled to <body> and fixed-positioned at the
 * triggering event's coordinates. `items`: [{label, Icon?, onSelect, danger?,
 * disabled?} | {divider:true}].
 */
function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose() }
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  // Keep the menu on-screen near the click point.
  const left = Math.min(x, globalThis.innerWidth - 180)
  const top = Math.min(y, globalThis.innerHeight - items.length * 28 - 16)

  return createPortal(
    <div
      ref={ref}
      style={{ position: 'fixed', left: Math.max(4, left), top: Math.max(4, top), zIndex: 100 }}
      className="min-w-[160px] rounded border border-slate-700 bg-slate-900 py-1 shadow-xl shadow-black/50"
    >
      {items.map((item, i) => (item.divider ? (
        <div key={`d${i}`} className="my-1 h-px bg-slate-800" />
      ) : (
        <button
          key={item.label}
          disabled={item.disabled}
          onClick={() => { item.onSelect(); onClose() }}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] font-mono transition-colors
            ${item.disabled ? 'opacity-40 cursor-not-allowed' : item.danger ? 'text-red-400 hover:bg-red-950/40' : 'text-slate-300 hover:bg-slate-800'}`}
        >
          {item.Icon && <item.Icon size={11} className="shrink-0" />}
          {item.label}
        </button>
      )))}
    </div>,
    document.body,
  )
}

/* ─── row components ─────────────────────────────────────── */

function MainRow({ name, active, onSwitch, onContextMenu, renaming, onRename, onCancelRename, validate }) {
  const inputRef = useRef(null)
  const [renameError, setRenameError] = useState(null)

  useEffect(() => {
    if (!renaming) return undefined
    setRenameError(null)
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    return () => clearTimeout(t)
  }, [renaming])

  const commitRename = useCallback(() => {
    const val = inputRef.current?.value?.trim()
    if (!val || val === name) { onCancelRename(); return }
    const err = validate(val)
    if (err) { setRenameError(err); return }
    onRename(val)
  }, [name, onRename, onCancelRename, validate])

  return (
    <div
      onClick={renaming ? undefined : onSwitch}
      onContextMenu={onContextMenu}
      className={`w-full flex items-center gap-2 pl-2 pr-2 h-[26px] text-left transition-colors border-l-[2px] cursor-pointer
        ${active
          ? 'border-l-cyan-500 bg-slate-800/70'
          : 'border-l-transparent hover:bg-slate-800/30'
        }`}
    >
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={name}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          className={`flex-1 bg-slate-700 text-[10px] font-mono text-white px-1.5 py-px rounded outline-none ring-1 min-w-0
            ${renameError ? 'ring-red-500' : 'ring-cyan-500/40'}`}
        />
      ) : (
        <span className={`text-[10px] font-mono flex-1 truncate font-medium ${active ? 'text-cyan-300' : 'text-slate-400'}`}>
          {name}
        </span>
      )}
      {renaming && renameError ? (
        <span className="text-red-400 text-[8px] font-mono shrink-0" title={renameError}>!</span>
      ) : (
        <span className="text-[8px] font-mono text-slate-700 shrink-0">main</span>
      )}
    </div>
  )
}

function FileRow({
  file, status, rel, depth = 0, active, renaming, onSwitch, onRemove, onRename, onStartRename, onCancelRename,
  onContextMenu, validate, hasError = false, onDragStart, onDragOver, onDrop, isDragOver,
}) {
  const inputRef = useRef(null)
  const [renameError, setRenameError] = useState(null)

  useEffect(() => {
    if (!renaming) return undefined
    setRenameError(null)
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    return () => clearTimeout(t)
  }, [renaming])

  const commitRename = useCallback(() => {
    const val = inputRef.current?.value?.trim()
    if (!val || val === file.name) { onCancelRename(); return }
    const err = validate(val)
    if (err) { setRenameError(err); return }
    onRename(val)
  }, [file.name, onRename, onCancelRename, validate])

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
      onContextMenu={onContextMenu}
      style={padFor(depth)}
      className={`group flex items-center gap-1 pr-1 h-[24px] border-l-[2px] cursor-pointer transition-colors
        ${isDragOver ? 'border-l-cyan-400 bg-cyan-950/30' : borderColor}
        ${active && !isDragOver ? 'bg-slate-800/70' : !isDragOver ? 'hover:bg-slate-800/30' : ''}`}
      onClick={renaming ? undefined : onSwitch}
    >
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={file.name}
          className={`flex-1 bg-slate-700 text-[10px] font-mono text-white px-1.5 py-px rounded outline-none ring-1 min-w-0
            ${renameError ? 'ring-red-500' : 'ring-cyan-500/40'}`}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className={`flex-1 min-w-0 font-mono text-[10px] truncate ${textColor}`} title={file.name}>
          {rel}
        </span>
      )}
      {renaming && renameError && (
        <span className="text-red-400 text-[8px] font-mono shrink-0 px-1" title={renameError}>!</span>
      )}
      {!renaming && hasError && (
        <span className="w-1 h-1 rounded-full bg-red-500 shrink-0 mr-px" title="YAML error" />
      )}
      {!renaming && (
        <span className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={(e) => { e.stopPropagation(); onStartRename() }} className="p-px text-slate-600 hover:text-slate-300" title="Rename">
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

function MissingRow({ item, rel, depth = 0, onAdd }) {
  return (
    <div style={padFor(depth)} className="group flex items-center gap-1 pr-1 h-[24px] border-l-[2px] border-l-orange-700/40 hover:bg-orange-950/10 transition-colors">
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

function FolderRow({ path, name, open, onToggle, hasMissing, depth = 0, renaming, onRename, onCancelRename, onContextMenu, validate }) {
  const inputRef = useRef(null)
  const [renameError, setRenameError] = useState(null)

  useEffect(() => {
    if (!renaming) return undefined
    setRenameError(null)
    const t = setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
    return () => clearTimeout(t)
  }, [renaming])

  const commitRename = useCallback(() => {
    const val = inputRef.current?.value?.trim()
    if (!val || val === path) { onCancelRename(); return }
    const err = validate(val)
    if (err) { setRenameError(err); return }
    onRename(val)
  }, [path, onRename, onCancelRename, validate])

  return (
    <div
      onClick={renaming ? undefined : onToggle}
      onContextMenu={onContextMenu}
      style={padFor(depth)}
      className="w-full flex items-center gap-1 pr-1 h-[22px] group hover:bg-slate-800/30 transition-colors cursor-pointer"
    >
      <span
        className="text-[8px] font-mono text-slate-600 transition-transform duration-100 shrink-0 leading-none select-none"
        style={{ display: 'inline-block', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
      >
        ▾
      </span>
      {renaming ? (
        <input
          ref={inputRef}
          defaultValue={path}
          onClick={(e) => e.stopPropagation()}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          className={`flex-1 bg-slate-700 text-[9px] font-mono text-white px-1 py-px rounded outline-none ring-1 min-w-0
            ${renameError ? 'ring-red-500' : 'ring-cyan-500/40'}`}
        />
      ) : (
        <span className="text-[9px] font-mono text-slate-500 group-hover:text-slate-400 truncate transition-colors flex-1 text-left">
          {name}/
        </span>
      )}
      {!renaming && hasMissing && <span className="shrink-0 w-1 h-1 rounded-full bg-orange-600/70" />}
      {renaming && renameError && <span className="text-red-400 text-[8px] font-mono shrink-0 px-1" title={renameError}>!</span>}
    </div>
  )
}

/* ─── recursive tree renderer ─────────────────────────────── */

function TreeLevel({ node, path, depth, openDirs, toggleDir, ctx }) {
  const dirNames = [...node.dirs.keys()].sort((a, b) => a.localeCompare(b))
  const files = [...node.files].sort((a, b) => a.base.localeCompare(b.base))
  const missing = [...node.missing].sort((a, b) => a.base.localeCompare(b.base))

  return (
    <>
      {dirNames.map((name) => {
        const childPath = path ? `${path}/${name}` : name
        const child = node.dirs.get(name)
        const open = openDirs[childPath] !== false
        return (
          <React.Fragment key={childPath}>
            <FolderRow
              path={childPath}
              name={name}
              open={open}
              onToggle={() => toggleDir(childPath)}
              hasMissing={subtreeHasMissing(child)}
              depth={depth}
              renaming={ctx.renamingFolderPath === childPath}
              onRename={(val) => { ctx.onRenameFolder(childPath, val); ctx.setRenamingFolderPath(null) }}
              onCancelRename={() => ctx.setRenamingFolderPath(null)}
              validate={(val) => ctx.validateFolderRename(childPath, val)}
              onContextMenu={(e) => ctx.openMenu(e, [
                { label: 'New file here', Icon: FilePlus, onSelect: () => ctx.onAdd(childPath) },
                { label: 'New folder here', Icon: FolderPlus, onSelect: () => ctx.onAddFolder(childPath) },
                { label: 'Rename', Icon: Pencil, onSelect: () => ctx.setRenamingFolderPath(childPath) },
                { divider: true },
                { label: 'Delete', Icon: Trash2, danger: true, onSelect: () => ctx.onRemoveFolder(childPath) },
              ])}
            />
            {open && <TreeLevel node={child} path={childPath} depth={depth + 1} openDirs={openDirs} toggleDir={toggleDir} ctx={ctx} />}
          </React.Fragment>
        )
      })}
      {files.map(({ file, status, base }) => (
        <FileRow
          key={file.id}
          file={file}
          status={status}
          rel={base}
          depth={depth}
          active={ctx.activeId === file.id}
          renaming={ctx.renamingFileId === file.id}
          onSwitch={() => ctx.onSwitch(file.id)}
          onRemove={() => ctx.onRemove(file.id)}
          onRename={(val) => { ctx.onRename(file.id, val); ctx.setRenamingFileId(null) }}
          onStartRename={() => ctx.setRenamingFileId(file.id)}
          onCancelRename={() => ctx.setRenamingFileId(null)}
          validate={(val) => ctx.validateRename(file.id, val)}
          hasError={!!ctx.fileErrors[file.id]}
          onDragStart={() => ctx.setDragId(file.id)}
          onDragOver={() => ctx.setOverId(file.id)}
          onDrop={() => ctx.commitDrop(file.id)}
          isDragOver={ctx.overId === file.id && ctx.dragId !== file.id}
          onContextMenu={(e) => ctx.openMenu(e, [
            { label: 'Rename', Icon: Pencil, onSelect: () => ctx.setRenamingFileId(file.id) },
            { label: 'Delete', Icon: Trash2, danger: true, onSelect: () => ctx.onRemove(file.id) },
          ])}
        />
      ))}
      {missing.map(({ item, base }) => (
        <MissingRow key={item.filename} item={item} rel={base} depth={depth} onAdd={() => ctx.onAddNamed(item.filename)} />
      ))}
    </>
  )
}

/* ─── main export ────────────────────────────────────────── */

/**
 * Full-height sidebar to the left of the editor.
 * - Drag the right edge to resize.
 * - Click the chevron to collapse to a thin strip.
 * - Files are grouped into a nested, collapsible folder tree by their path.
 * - Right-click a file/folder/the main row/empty space for actions.
 */
export default function FileExplorer({
  files,
  folders = [],
  activeId,
  onSwitch,
  onAdd,
  onAddNamed,
  onRemove,
  onRename,
  onRenameMain,
  onReorder,
  onAddFolder,
  onRenameFolder,
  onRemoveFolder,
  nodes = [],
  fileErrors = {},
  isMobile = false,
}) {
  const [collapsed, setCollapsed] = useState(false)
  const [width, setWidth] = useState(140)
  const [openDirs, setOpenDirs] = useState({})
  const [dragId, setDragId] = useState(null)   // id being dragged
  const [overId, setOverId] = useState(null)   // id being hovered over
  const [renamingFileId, setRenamingFileId] = useState(null)
  const [renamingFolderPath, setRenamingFolderPath] = useState(null)
  const [menu, setMenu] = useState(null) // { x, y, items }
  const isResizing = useRef(false)
  const dragStartX = useRef(0)
  const dragStartW = useRef(0)

  const mainFile = files[0]
  const extraFiles = useMemo(() => files.slice(1), [files])

  const statuses = useMemo(() => buildStatusMap(extraFiles, nodes), [extraFiles, nodes])
  const missingRefs = useMemo(() => buildMissingRefs(extraFiles, nodes), [extraFiles, nodes])
  const tree = useMemo(() => buildTree(extraFiles, statuses, missingRefs, folders), [extraFiles, statuses, missingRefs, folders])

  const toggleDir = useCallback((path) => {
    setOpenDirs((prev) => ({ ...prev, [path]: prev[path] === false }))
  }, [])

  // Auto-open every ancestor folder that contains an unresolved missing ref
  useEffect(() => {
    const toOpen = {}
    missingRefs.forEach((item) => {
      const parts = item.filename.split('/')
      parts.pop()
      let acc = ''
      for (const p of parts) { acc = acc ? `${acc}/${p}` : p; toOpen[acc] = true }
    })
    setOpenDirs((prev) => {
      let changed = false
      const next = { ...prev }
      for (const key of Object.keys(toOpen)) {
        if (next[key] !== true) { next[key] = true; changed = true }
      }
      return changed ? next : prev
    })
  }, [missingRefs])

  const commitDrop = useCallback((targetId) => {
    if (!dragId || !targetId || dragId === targetId) { setDragId(null); setOverId(null); return }
    onReorder?.(dragId, targetId)
    setDragId(null)
    setOverId(null)
  }, [dragId, onReorder])

  const closeMenu = useCallback(() => setMenu(null), [])
  const openMenu = useCallback((e, items) => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, items })
  }, [])

  // A file may take the main row's slot — exclude its own id from collisions.
  const validateRename = useCallback((excludeId, candidate) => {
    if (!isValidRelativePath(candidate)) return 'Invalid path'
    if (files.some((f) => f.id !== excludeId && f.name === candidate)) return 'A file with that name already exists'
    return null
  }, [files])

  // Folder rename only conflicts with files OUTSIDE the folder being renamed
  // (its own contents move with it).
  const validateFolderRename = useCallback((oldPrefix, candidate) => {
    if (!isValidRelativePath(candidate)) return 'Invalid path'
    const collides = files.some((f) => f.name === candidate && f.name !== oldPrefix && !f.name.startsWith(`${oldPrefix}/`))
    if (collides) return 'A file with that name already exists'
    return null
  }, [files])

  const treeCtx = useMemo(() => ({
    activeId, onSwitch, onRemove, onRename, onAddNamed, fileErrors,
    setDragId, setOverId, commitDrop, dragId, overId,
    renamingFileId, setRenamingFileId, validateRename,
    renamingFolderPath, setRenamingFolderPath, validateFolderRename,
    onAdd, onAddFolder, onRemoveFolder, onRenameFolder, openMenu,
  }), [
    activeId, onSwitch, onRemove, onRename, onAddNamed, fileErrors, commitDrop, dragId, overId,
    renamingFileId, validateRename, renamingFolderPath, validateFolderRename,
    onAdd, onAddFolder, onRemoveFolder, onRenameFolder, openMenu,
  ])

  const onResizeStart = useCallback((e) => {
    e.preventDefault()
    isResizing.current = true
    dragStartX.current = e.clientX
    dragStartW.current = width
    const onMove = (mv) => {
      if (!isResizing.current) return
      setWidth(Math.max(80, Math.min(320, dragStartW.current + mv.clientX - dragStartX.current)))
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
                  title={file.name}
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

  const backgroundMenuItems = [
    { label: 'New file', Icon: FilePlus, onSelect: () => onAdd() },
    { label: 'New folder', Icon: FolderPlus, onSelect: () => onAddFolder() },
  ]

  /* ── Expanded ── */
  return (
    <div
      className="relative flex flex-col border-r border-slate-800 bg-slate-950 select-none shrink-0 overflow-hidden"
      style={{ width: `${width}px` }}
    >
      {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={closeMenu} />}

      {/* Header */}
      <div className="flex items-center h-[26px] px-2 shrink-0 gap-0.5">
        <span className="text-[8px] font-mono uppercase tracking-[0.14em] text-slate-600 flex-1">files</span>
        {missingRefs.length > 0 && (
          <span className="flex items-center gap-px text-[8px] font-mono text-orange-700/80">
            <AlertTriangle size={7} />{missingRefs.length}
          </span>
        )}
        <button onClick={() => onAddFolder()} title="New folder" className="p-0.5 text-slate-600 hover:text-cyan-400 transition-colors shrink-0">
          <FolderPlus size={10} />
        </button>
        <button onClick={() => onAdd()} title="New file" className="p-0.5 text-slate-600 hover:text-cyan-400 transition-colors shrink-0">
          <Plus size={10} />
        </button>
        <button onClick={() => setCollapsed(true)} title="Collapse" className="p-0.5 text-slate-700 hover:text-slate-400 transition-colors shrink-0">
          <ChevronDown size={10} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" onContextMenu={(e) => openMenu(e, backgroundMenuItems)}>
        <MainRow
          name={mainFile.name}
          active={activeId === mainFile.id}
          onSwitch={() => onSwitch(mainFile.id)}
          renaming={renamingFileId === mainFile.id}
          onRename={(val) => { onRenameMain(val); setRenamingFileId(null) }}
          onCancelRename={() => setRenamingFileId(null)}
          validate={(val) => validateRename(mainFile.id, val)}
          onContextMenu={(e) => openMenu(e, [
            { label: 'Rename', Icon: Pencil, onSelect: () => setRenamingFileId(mainFile.id) },
          ])}
        />

        <TreeLevel node={tree} path="" depth={0} openDirs={openDirs} toggleDir={toggleDir} ctx={treeCtx} />

        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={() => onAdd()}
            className="flex-1 flex items-center gap-1 px-2 h-[20px] text-[8px] font-mono text-slate-700 hover:text-slate-500 transition-colors"
          >
            <Plus size={7} /><span>new file</span>
          </button>
          <button
            onClick={() => onAddFolder()}
            className="flex items-center gap-1 px-2 h-[20px] text-[8px] font-mono text-slate-700 hover:text-slate-500 transition-colors"
          >
            <FolderPlus size={7} /><span>new folder</span>
          </button>
        </div>
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
