/**
 * Select.jsx — searchable combobox shared by ResolveView's inventory/host
 * pickers and App.jsx's playbook switcher. A flat list of options can get
 * long (many hosts, many playbooks in a project) so this swaps a native
 * <select> for a type-to-filter popover instead of a giant scroll list.
 */
/* eslint-disable react/prop-types */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'

export default function Select({ icon: Icon, value, onChange, options, getLabel = (o) => o, getValue = (o) => o, placeholder }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [rect, setRect] = useState(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const popoverRef = useRef(null)

  const selected = useMemo(() => options.find((o) => getValue(o) === value), [options, value, getValue])

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter((o) => getLabel(o).toLowerCase().includes(q))
  }, [options, query, getLabel])

  const close = useCallback(() => { setOpen(false); setQuery(''); setActiveIndex(0) }, [])

  const openPopover = useCallback(() => {
    if (options.length === 0) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setRect(r)
    setActiveIndex(Math.max(0, options.findIndex((o) => getValue(o) === value)))
    setOpen(true)
  }, [options, value, getValue])

  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const onDown = (e) => {
      if (popoverRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      close()
    }
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
    }
  }, [open, close])

  const choose = useCallback((o) => { onChange(getValue(o)); close() }, [onChange, getValue, close])

  const onInputKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIndex]) choose(filtered[activeIndex]) }
  }, [filtered, activeIndex, choose])

  const disabled = options.length === 0
  const label = selected ? getLabel(selected) : (placeholder ?? '')

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? close() : openPopover())}
        title={label}
        className={`flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2 py-1 min-w-0 max-w-[200px] text-left
          ${disabled ? 'opacity-60 cursor-default' : 'hover:border-slate-500'}`}
      >
        <Icon size={12} className="text-slate-500 shrink-0" />
        <span className="text-[11px] font-mono text-slate-200 truncate min-w-0 flex-1">{label}</span>
        {!disabled && <ChevronDown size={11} className="text-slate-600 shrink-0" />}
      </button>

      {open && rect && createPortal(
        <div
          ref={popoverRef}
          style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, minWidth: rect.width }}
          className="z-50 max-w-[340px] rounded border border-slate-700 bg-slate-900 shadow-xl shadow-black/40 overflow-hidden flex flex-col"
        >
          <div className="flex items-center gap-1.5 border-b border-slate-800 px-2 py-1.5 shrink-0">
            <Search size={11} className="text-slate-500 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIndex(0) }}
              onKeyDown={onInputKeyDown}
              placeholder={`search ${options.length} option${options.length === 1 ? '' : 's'}…`}
              className="bg-transparent text-[11px] font-mono text-slate-200 outline-none w-full placeholder:text-slate-600"
            />
          </div>
          <div className="max-h-[260px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-2.5 py-2 text-[11px] font-mono text-slate-600">No matches</p>
            ) : (
              filtered.map((o, i) => {
                const v = getValue(o)
                const isSelected = v === value
                const isActive = i === activeIndex
                return (
                  <button
                    key={v}
                    type="button"
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => choose(o)}
                    className={`w-full text-left px-2.5 py-1.5 text-[11px] font-mono truncate transition-colors
                      ${isActive ? 'bg-slate-800 text-cyan-300' : 'text-slate-300 hover:bg-slate-800/60'}
                      ${isSelected ? 'font-semibold' : ''}`}
                  >
                    {getLabel(o)}
                  </button>
                )
              })
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
