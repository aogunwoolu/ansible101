/**
 * FileTabBar.jsx
 * Horizontal tab bar for managing multiple YAML files in playbook mode.
 * The main "playbook.yml" tab is always present and cannot be removed/renamed.
 * Extra files (include_tasks targets, role task files, etc.) can be added,
 * renamed (double-click), and removed.
 */
import React, { useRef, useState } from 'react'
import { Plus, X, FileCode } from 'lucide-react'

export default function FileTabBar({ files, activeId, onSwitch, onAdd, onRemove, onRename }) {
  return (
    <div className="flex items-center border-b border-slate-800 bg-slate-900 overflow-x-auto shrink-0 min-h-[33px]">
      {files.map((f) => (
        <FileTab
          key={f.id}
          file={f}
          active={activeId === f.id}
          onSwitch={() => onSwitch(f.id)}
          onRemove={f.id !== 'main' ? () => onRemove(f.id) : null}
          onRename={f.id !== 'main' ? (name) => onRename(f.id, name) : null}
        />
      ))}
      <button
        onClick={onAdd}
        title="Add a file — name it to match an include_tasks or roles/name/tasks/main.yml reference"
        className="flex items-center gap-1 px-2.5 py-1.5 text-slate-500 hover:text-cyan-400 text-xs font-mono transition-colors shrink-0 whitespace-nowrap"
      >
        <Plus size={11} />
        <span className="text-[10px]">add file</span>
      </button>
    </div>
  )
}

function FileTab({ file, active, onSwitch, onRemove, onRename }) {
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)

  const startEdit = () => {
    if (!onRename) return
    setEditing(true)
    setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select() }, 0)
  }

  const commitEdit = () => {
    const val = inputRef.current?.value?.trim()
    if (val && val !== file.name) onRename(val)
    setEditing(false)
  }

  return (
    <div
      className={`flex items-center gap-1.5 px-3 border-r border-slate-800 cursor-pointer shrink-0 group select-none h-[33px]
        ${active
          ? 'bg-slate-800 text-cyan-300 border-b-[2px] border-b-cyan-500'
          : 'text-slate-500 hover:text-slate-300 hover:bg-slate-900'
        }`}
      onClick={onSwitch}
      onDoubleClick={startEdit}
    >
      <FileCode size={10} className="shrink-0 opacity-60" />
      {editing ? (
        <input
          ref={inputRef}
          defaultValue={file.name}
          className="bg-slate-700 text-[11px] font-mono text-white px-1 rounded outline-none w-[160px]"
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit()
            if (e.key === 'Escape') setEditing(false)
          }}
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="text-[11px] font-mono max-w-[180px] truncate" title={file.name}>
          {file.name}
        </span>
      )}
      {onRemove && (
        <button
          onClick={(e) => { e.stopPropagation(); onRemove() }}
          className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-slate-500 hover:text-red-400 transition-all ml-0.5"
          title="Remove file"
        >
          <X size={10} />
        </button>
      )}
    </div>
  )
}
