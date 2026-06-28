/**
 * ResizeHandle.jsx — vertical drag handle for resizing an adjacent horizontal
 * pane split. `value`/`min`/`max` are percentages of `containerRef`'s width.
 *
 * Desktop/tablet only (the `hidden md:flex` below mirrors the breakpoint at
 * which the parent layout switches from a vertical stack to a horizontal
 * row) — below md, panes stack vertically and a horizontal split has no
 * meaning, so the handle is invisible and non-interactive there.
 */
/* eslint-disable react/prop-types */
import React, { useCallback, useRef } from 'react'

export default function ResizeHandle({ containerRef, value, min, max, onChange, label, reverse = false }) {
  const dragState = useRef(null)

  const clamp = useCallback((v) => Math.min(max, Math.max(min, v)), [min, max])

  const handlePointerMove = useCallback((e) => {
    const state = dragState.current
    if (!state) return
    const containerWidth = containerRef.current?.getBoundingClientRect().width
    if (!containerWidth) return
    const rawDeltaPct = ((e.clientX - state.startX) / containerWidth) * 100
    // `value` is the width of the pane that sits to the *left* of this handle,
    // unless `reverse` — then it's the pane to the right, which grows as the
    // handle moves left (negative clientX delta), so the sign flips.
    const deltaPct = reverse ? -rawDeltaPct : rawDeltaPct
    onChange(clamp(state.startValue + deltaPct))
  }, [containerRef, onChange, clamp, reverse])

  const stopDragging = useCallback(() => {
    dragState.current = null
    document.removeEventListener('pointermove', handlePointerMove)
    document.removeEventListener('pointerup', stopDragging)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [handlePointerMove])

  const startDragging = useCallback((e) => {
    // Only the primary pointer/button starts a drag.
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    dragState.current = { startX: e.clientX, startValue: value }
    document.addEventListener('pointermove', handlePointerMove)
    document.addEventListener('pointerup', stopDragging)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [value, handlePointerMove, stopDragging])

  const handleKeyDown = useCallback((e) => {
    const step = e.shiftKey ? 8 : 2
    const sign = reverse ? -1 : 1
    if (e.key === 'ArrowLeft') { e.preventDefault(); onChange(clamp(value - sign * step)) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); onChange(clamp(value + sign * step)) }
    else if (e.key === 'Home') { e.preventDefault(); onChange(reverse ? max : min) }
    else if (e.key === 'End') { e.preventDefault(); onChange(reverse ? min : max) }
  }, [value, min, max, onChange, clamp, reverse])

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={startDragging}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onChange((min + max) / 2)}
      className="group relative z-10 hidden w-1.5 shrink-0 touch-none cursor-col-resize items-center
        justify-center outline-none transition-colors hover:bg-cyan-900/30 focus-visible:bg-cyan-900/40 md:flex"
    >
      <div className="h-10 w-[3px] rounded-full bg-slate-700 transition-colors group-hover:bg-cyan-500 group-focus-visible:bg-cyan-400" />
    </div>
  )
}
