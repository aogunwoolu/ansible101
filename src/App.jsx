/**
 * App.jsx  Ansible101.com root component
 *
 * Modes:
 *   'landing'   paste-invite screen (Ctrl+V)
 *   'playbook'  3-pane: Editor | FlowChart | Human Sidebar
 *   'snippet'   Editor | Quick-Card
 *   'jinja2'    Editor | Pipeline View
 */
/* eslint-disable react/prop-types */
/* eslint-disable jsx-a11y/no-static-element-interactions */
import React, {
  useState, useCallback, useEffect, useMemo, useRef,
} from 'react'
import yaml from 'js-yaml'
import { parsePlaybook } from './lib/parseYamlToFlow'
import { pushToUrl, loadFromUrl } from './lib/shareUrl'
import { SAMPLE_YAML } from './lib/sampleYaml'
import { SAMPLE_JINJA2 } from './lib/sampleJinja2'
import { DEFAULT_FACTS } from './lib/defaultFacts'
import { detectContentType } from './lib/detectContentType'

import YamlEditor from './components/YamlEditor'
import FlowCanvas from './components/FlowCanvas'
import HumanSidebar from './components/HumanSidebar'
import MockContextPanel from './components/MockContextPanel'
import QuickCard from './components/QuickCard'
import PipelineView from './components/PipelineView'
import AboutPage from './components/AboutPage'

import {
  Share2, AlertCircle, RotateCcw, BookOpen,
  ClipboardPaste, Layers, Zap, FileCode,
  FlaskConical,
} from 'lucide-react'

const MODE_PATHS = {
  landing: '/',
  playbook: '/playbook',
  snippet: '/snippet',
  jinja2: '/jinja',
  about: '/about',
}

function getModeFromPath(pathname) {
  if (pathname === '/playbook') return 'playbook'
  if (pathname === '/snippet') return 'snippet'
  if (pathname === '/jinja') return 'jinja2'
  if (pathname === '/about' || pathname === '/legal') return 'about'
  return 'landing'
}

function getPathForMode(mode) {
  return MODE_PATHS[mode] ?? '/'
}

function getContentModeFromState(state) {
  if (!state?.yaml) return 'playbook'
  const detected = detectContentType(state.yaml)
  return detected === 'unknown' ? 'playbook' : detected
}

function getModeFromLocation(state) {
  const pathMode = getModeFromPath(globalThis.location.pathname)
  if (pathMode !== 'landing') return pathMode
  if (state?.yaml) return getContentModeFromState(state)
  return 'landing'
}

function updateBrowserPath(mode, method = 'replaceState') {
  const nextPath = getPathForMode(mode)
  const nextUrl = `${nextPath}${globalThis.location.hash}`
  if (`${globalThis.location.pathname}${globalThis.location.hash}` !== nextUrl) {
    globalThis.history[method](null, '', nextUrl)
  }
}

//  Debounce helper 
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

//  Mode meta 
const MODE_META = {
  playbook: { label: 'Playbook', Icon: Layers,   color: 'text-cyan-400' },
  snippet:  { label: 'Snippet',  Icon: FileCode,  color: 'text-blue-400' },
  jinja2:   { label: 'Jinja2',   Icon: Zap,       color: 'text-violet-400' },
}

export default function App() {
  const urlState = useMemo(() => loadFromUrl(), [])
  const initialMode = useMemo(() => getModeFromLocation(urlState), [urlState])

  const [mode, setMode] = useState(initialMode)

  // ── Per-mode independent text buffers ─────────────────────────
  const [texts, setTexts] = useState(() => ({
    playbook: initialMode === 'playbook' && urlState?.yaml ? urlState.yaml : SAMPLE_YAML,
    snippet: initialMode === 'snippet' && urlState?.yaml ? urlState.yaml : '',
    jinja2: initialMode === 'jinja2' && urlState?.yaml ? urlState.yaml : SAMPLE_JINJA2,
  }))

  const setCurrentText = useCallback((v, forMode) => {
    setTexts((prev) => ({ ...prev, [forMode ?? mode]: v ?? '' }))
  }, [mode])

  const yamlText    = texts[mode] ?? ''              // text for the active mode
  const jinja2Text  = texts.jinja2                   // always available for PipelineView

  const [facts, setFacts]                           = useState(() => urlState?.facts ?? DEFAULT_FACTS)
  const [parseError, setParseError]                 = useState(null)
  const [selectedNode, setSelectedNode]             = useState(null)
  const [highlightLines, setHighlightLines]         = useState(null)
  const [copySuccess, setCopySuccess]               = useState(false)
  const [showMockPanel, setShowMockPanel]           = useState(false)

  const debouncedYaml  = useDebounce(yamlText, 400)
  const debouncedFacts = useDebounce(facts, 300)

  useEffect(() => {
    if (mode === 'landing' && globalThis.location.pathname !== '/' && !globalThis.location.hash) {
      updateBrowserPath('landing')
      return
    }
    if (mode !== 'landing') updateBrowserPath(mode)
  }, [mode])

  useEffect(() => {
    const onPopState = () => {
      const nextState = loadFromUrl()
      const nextMode = getModeFromLocation(nextState)
      setMode(nextMode)
      if (nextState?.yaml) {
        setTexts((prev) => ({
          ...prev,
          [nextMode === 'landing' ? getContentModeFromState(nextState) : nextMode]: nextState.yaml,
        }))
      }
      if (nextState?.facts) setFacts(nextState.facts)
      setSelectedNode(null)
      setHighlightLines(null)
    }

    globalThis.addEventListener('popstate', onPopState)
    return () => globalThis.removeEventListener('popstate', onPopState)
  }, [])

  // Manual mode switch — keep buffers independent
  const handleSetMode = useCallback((newMode) => {
    updateBrowserPath(newMode, 'pushState')
    setMode(newMode)
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  // Parse YAML → plays + flow (playbook mode)
  const { plays, nodes, edges } = useMemo(() => {
    if (mode !== 'playbook') return { plays: [], nodes: [], edges: [] }
    try {
      const parsed = yaml.load(debouncedYaml)
      setParseError(null)
      if (!parsed) return { plays: [], nodes: [], edges: [] }
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const { nodes, edges } = parsePlaybook(arr, debouncedYaml, debouncedFacts)
      return { plays: arr, nodes, edges }
    } catch (e) {
      setParseError(e.message)
      return { plays: [], nodes: [], edges: [] }
    }
  }, [mode, debouncedYaml, debouncedFacts])

  // Parse snippet task (snippet mode)
  const snippetTask = useMemo(() => {
    if (mode !== 'snippet') return null
    try {
      const parsed = yaml.load(debouncedYaml)
      if (!parsed) return null
      if (Array.isArray(parsed)) return parsed[0] ?? null
      return parsed
    } catch { return null }
  }, [mode, debouncedYaml])

  // Node click
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
    const taskName = node.data?.label
    if (taskName && !taskName.startsWith('[')) {
      const lines = debouncedYaml.split('\n')
      const idx = lines.findIndex((l) => l.includes(taskName))
      if (idx !== -1) setHighlightLines({ start: idx + 1, end: idx + 1 })
    }
  }, [debouncedYaml])

  // Magic Paste — put content into the right buffer
  const handlePasteContent = useCallback((text) => {
    if (!text?.trim()) return
    const detected = detectContentType(text)
    const targetMode = detected === 'unknown' ? 'snippet' : detected
    setTexts((prev) => ({ ...prev, [targetMode]: text }))
    updateBrowserPath(targetMode, 'pushState')
    setMode(targetMode)
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  // Global Ctrl+V / paste listener
  useEffect(() => {
    const onPaste = (e) => {
      const target = e.target
      const tag = target?.tagName?.toLowerCase()
      const isEditable = tag === 'textarea' || tag === 'input' ||
        target?.isContentEditable ||
        target?.closest?.('.monaco-editor')
      if (isEditable && mode !== 'landing') return
      const text = e.clipboardData?.getData('text/plain')
      if (text) handlePasteContent(text)
    }
    globalThis.addEventListener('paste', onPaste)
    return () => globalThis.removeEventListener('paste', onPaste)
  }, [mode, handlePasteContent])

  // Share — encode current mode's text
  const handleShare = useCallback(() => {
    updateBrowserPath(mode)
    pushToUrl(yamlText, facts)
    globalThis.navigator.clipboard?.writeText(globalThis.location.href).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2500)
    })
  }, [mode, yamlText, facts])

  // Reset
  const handleReset = useCallback(() => {
    setTexts({ playbook: SAMPLE_YAML, snippet: '', jinja2: SAMPLE_JINJA2 })
    setFacts(DEFAULT_FACTS)
    updateBrowserPath('playbook', 'pushState')
    setMode('playbook')
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  const handleLoadSample = useCallback(() => {
    setTexts((prev) => ({ ...prev, playbook: SAMPLE_YAML }))
    updateBrowserPath('playbook', 'pushState')
    setMode('playbook')
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  if (mode === 'landing') {
    return <LandingScreen onPaste={handlePasteContent} onLoadSample={handleLoadSample} onOpenAbout={() => handleSetMode('about')} />
  }

  if (mode === 'about') {
    return <AboutPage onNavigateHome={() => handleSetMode('landing')} />
  }

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">
      {/* Top Bar */}
      <header className="flex items-center justify-between px-4 py-2 border-b border-slate-800 bg-slate-950 shrink-0 z-10 gap-2">
        <div className="flex items-center gap-2 shrink-0">
          <BookOpen size={16} className="text-cyan-400" />
          <button
            onClick={() => handleSetMode('landing')}
            className="text-cyan-400 font-mono font-bold tracking-wider text-sm hover:text-cyan-300 transition-colors"
          >
            Ansible<span className="text-white">101</span>
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex items-center gap-1 rounded-lg border border-slate-800 p-0.5">
          {Object.entries(MODE_META).map(([key, meta]) => (
            <button
              key={key}
              onClick={() => handleSetMode(key)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all
                ${mode === key
                  ? `${meta.color} bg-slate-800 border border-slate-700`
                  : 'text-slate-500 hover:text-slate-300'
                }`}
            >
              <meta.Icon size={11} />
              {meta.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => handleSetMode('about')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white text-xs font-mono transition-all"
          >
            About
          </button>

          {parseError && mode === 'playbook' && (
            <div className="flex items-center gap-1.5 rounded bg-red-950 border border-red-800 px-2 py-1 max-w-[220px]">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <span className="text-red-300 text-[10px] font-mono truncate">{parseError}</span>
            </div>
          )}

          <button
            onClick={() => setShowMockPanel((v) => !v)}
            title="Toggle Mock Facts panel"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-all
              ${showMockPanel
                ? 'border-amber-600 text-amber-300 bg-amber-950'
                : 'border-slate-700 text-slate-500 hover:text-amber-400 hover:border-amber-700'
              }`}
          >
            <FlaskConical size={12} />
            Facts
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-xs font-mono transition-all"
          >
            <RotateCcw size={12} />
            Reset
          </button>

          <button
            onClick={handleShare}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-all
              ${copySuccess
                ? 'border-green-500 text-green-400 bg-green-950'
                : 'border-cyan-800 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300'
              }`}
          >
            <Share2 size={12} />
            {copySuccess ? 'Copied!' : 'Share'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left pane: editor */}
        <div className={`flex flex-col border-r border-slate-800 overflow-hidden
          ${mode === 'jinja2' ? 'w-[48%]' : 'w-[30%] min-w-[240px]'}`}>
          <PaneHeader
            label={mode === 'jinja2' ? 'Jinja2 Expression' : 'Playbook YAML'}
            color={mode === 'jinja2' ? 'text-violet-400' : 'text-cyan-400'}
          />
          <div className="flex-1 overflow-hidden">
            <YamlEditor
              value={yamlText}
              onChange={(v) => setCurrentText(v ?? '')}
              highlightLines={highlightLines}
              language={mode === 'jinja2' ? 'handlebars' : 'yaml'}
            />
          </div>
          {showMockPanel && (
            <MockContextPanel facts={facts} onFactsChange={setFacts} />
          )}
        </div>

        {/* Right area  mode-specific */}
        {mode === 'playbook' && (
          <>
            <div className="flex flex-col flex-1 overflow-hidden border-r border-slate-800">
              <PaneHeader label="Execution Flow" color="text-slate-400" />
              <div className="flex-1 overflow-hidden">
                {nodes.length > 0 ? (
                  <FlowCanvas nodes={nodes} edges={edges} onNodeClick={handleNodeClick} />
                ) : (
                  <EmptyFlow hasError={!!parseError} />
                )}
              </div>
            </div>
            <div className="flex flex-col w-[26%] min-w-[200px] overflow-hidden">
              <HumanSidebar plays={plays} selectedNodeData={selectedNode?.data} />
            </div>
          </>
        )}

        {mode === 'snippet' && (
          <div className="flex-1 overflow-hidden">
            {snippetTask
              ? <QuickCard task={snippetTask} facts={facts} />
              : <EmptyQuickCard />
            }
          </div>
        )}

        {mode === 'jinja2' && (
          <div className="flex-1 overflow-hidden">
            <PipelineView expression={jinja2Text} facts={facts} />
          </div>
        )}
      </div>

      {/* Disclaimer footer */}
      <footer className="shrink-0 border-t border-slate-800 px-4 py-1.5 text-center text-slate-600 text-[10px] font-mono">
        Ansible101 is an independent community tool &mdash; not affiliated with, endorsed by, or sponsored by Red&nbsp;Hat,&nbsp;Inc.
        Ansible® is a registered trademark of Red&nbsp;Hat,&nbsp;Inc.
      </footer>
    </div>
  )
}

function PaneHeader({ label, color = 'text-slate-400' }) {
  return (
    <div className={`px-4 py-2 border-b border-slate-800 text-[11px] font-mono font-semibold uppercase tracking-widest shrink-0 ${color}`}>
      {label}
    </div>
  )
}

function EmptyFlow({ hasError }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-700">
      <Layers size={34} />
      {hasError
        ? <p className="text-red-500 text-xs font-mono text-center px-8">Fix the YAML error to visualize the flow.</p>
        : <p className="text-xs font-mono text-center px-8">Write a valid Ansible playbook to see the flow.</p>
      }
    </div>
  )
}

function EmptyQuickCard() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-700">
      <FileCode size={34} />
      <p className="text-xs font-mono text-center px-8">Paste a task snippet to see its Quick Card.</p>
    </div>
  )
}

function LandingScreen({ onPaste, onLoadSample, onOpenAbout }) {
  const [dragOver, setDragOver] = useState(false)
  const dropRef = useRef(null)

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragOver(false)
    // Prefer file contents over plain-text drag
    const file = e.dataTransfer?.files?.[0]
    if (file) {
      file.text().then((result) => { if (result) onPaste(result) })
      return
    }
    const text = e.dataTransfer?.getData('text/plain')
    if (text) onPaste(text)
  }, [onPaste])

  const handleDragLeave = useCallback((e) => {
    // Only clear when pointer truly leaves the outer container
    if (!dropRef.current?.contains(e.relatedTarget)) setDragOver(false)
  }, [])

  return (
    <div
      ref={dropRef}
      className="h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-8 px-6"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <BookOpen size={28} className="text-cyan-400" />
          <h1 className="text-3xl font-mono font-bold tracking-tight">
            <span className="text-cyan-400">Ansible</span>
            <span className="text-white">101</span>
          </h1>
        </div>
        <p className="text-slate-400 text-sm font-mono text-center max-w-md">
          Visual debugger, logic explainer and Jinja2 sandbox for Ansible playbooks.
        </p>
      </div>

      <div
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-12 flex flex-col items-center gap-4 transition-all
          ${dragOver
            ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_30px_#22d3ee22]'
            : 'border-slate-700 hover:border-slate-600'
          }`}
      >
        <ClipboardPaste size={36} className="text-slate-600" />
        <div className="text-center">
          <p className="text-white font-mono text-lg font-semibold flex items-center justify-center gap-1.5">
            <span>Press</span>
            <kbd className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-cyan-400 text-sm font-mono mx-1">Ctrl+V</kbd>
            <span>to paste</span>
          </p>
          <p className="text-slate-500 text-xs font-mono mt-1">
            or drag & drop your YAML, task snippet, or Jinja2 expression
          </p>
        </div>

        <div className="flex items-center gap-3 w-full max-w-xs">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-slate-600 text-xs font-mono">or</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        <button
          onClick={onLoadSample}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-cyan-800 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300 text-sm font-mono transition-all"
        >
          <BookOpen size={14} />
          Load sample playbook
        </button>
      </div>

      <div className="flex gap-4 flex-wrap justify-center">
        {[
          { Icon: Layers,   color: 'text-cyan-400',   label: 'Full Playbook', desc: ' 3-pane visualizer' },
          { Icon: FileCode, color: 'text-blue-400',   label: 'Task Snippet',  desc: ' Quick Card view' },
          { Icon: Zap,      color: 'text-violet-400', label: 'Jinja2 Expr',   desc: ' Pipeline trace' },
        ].map(({ Icon, color, label, desc }) => (
          <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-800 bg-slate-900">
            <Icon size={14} className={color} />
            <div>
              <div className={`text-xs font-mono font-semibold ${color}`}>{label}</div>
              <div className="text-slate-500 text-[10px] font-mono">{desc}</div>
            </div>
          </div>
        ))}
      </div>

      <p className="text-slate-600 text-[10px] font-mono text-center max-w-sm">
        Ansible101 is an independent community tool and is not affiliated with,
        endorsed by, or sponsored by Red&nbsp;Hat,&nbsp;Inc. Ansible® is a registered
        trademark of Red&nbsp;Hat,&nbsp;Inc.
      </p>

      <button
        onClick={onOpenAbout}
        className="text-[11px] font-mono text-slate-500 transition-colors hover:text-cyan-400"
      >
        About / Legal
      </button>
    </div>
  )
}
