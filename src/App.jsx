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
import { toMermaidFlow, toPlantUmlFlow } from './lib/exportFlowText'
import { SAMPLE_YAML } from './lib/sampleYaml'
import { SAMPLE_JINJA2 } from './lib/sampleJinja2'
import { SAMPLE_INVENTORY, SAMPLE_HOSTVARS } from './lib/sampleInventory'
import { DEFAULT_FACTS } from './lib/defaultFacts'
import { detectContentType } from './lib/detectContentType'

import YamlEditor from './components/YamlEditor'
import FlowCanvas from './components/FlowCanvas'
import HumanSidebar from './components/HumanSidebar'
import MockContextPanel from './components/MockContextPanel'
import PlayVarsPanel from './components/PlayVarsPanel'
import FileExplorer from './components/FileExplorer'
import QuickCard from './components/QuickCard'
import PipelineView from './components/PipelineView'
import AboutPage from './components/AboutPage'
import InventoryLab from './components/InventoryLab'
import { useFileDrop } from './lib/useFileDrop'
import { startTour } from './lib/tour'

import {
  Share2, AlertCircle, RotateCcw, BookOpen,
  ClipboardPaste, Layers, Zap, FileCode,
  FlaskConical, Variable, FlaskRound, HelpCircle, Info,
} from 'lucide-react'

const MODE_PATHS = {
  landing: '/',
  playbook: '/playbook',
  snippet: '/snippet',
  jinja2: '/jinja',
  limits: '/limits',
  about: '/about',
}

function getModeFromPath(pathname) {
  if (pathname === '/playbook') return 'playbook'
  if (pathname === '/snippet') return 'snippet'
  if (pathname === '/jinja') return 'jinja2'
  if (pathname === '/limits') return 'limits'
  if (pathname === '/about' || pathname === '/legal') return 'about'
  return 'landing'
}

function getPathForMode(mode) {
  return MODE_PATHS[mode] ?? '/'
}

// Map file extension to Monaco language id
function getEditorLanguage(filename) {
  const ext = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase()
  const map = {
    yml: 'yaml', yaml: 'yaml',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    py: 'python',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript',
    ts: 'typescript',
    json: 'json',
    j2: 'handlebars', jinja2: 'handlebars', jinja: 'handlebars',
    md: 'markdown', markdown: 'markdown',
    toml: 'ini', ini: 'ini', cfg: 'ini', conf: 'ini',
    rb: 'ruby',
    go: 'go',
  }
  return map[ext] ?? 'plaintext'
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
  playbook: { label: 'Playbook', Icon: Layers,      color: 'text-cyan-400' },
  snippet:  { label: 'Snippet',  Icon: FileCode,     color: 'text-blue-400' },
  jinja2:   { label: 'Jinja2',   Icon: Zap,          color: 'text-violet-400' },
  limits:   { label: 'Limits',   Icon: FlaskRound,   color: 'text-emerald-400' },
}

export default function App() {
  const urlState = useMemo(() => loadFromUrl(), [])
  const initialMode = useMemo(() => getModeFromLocation(urlState), [urlState])
  const [isMobile, setIsMobile] = useState(() => globalThis.innerWidth < 768)

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
  const [extraFiles, setExtraFiles]                 = useState(() => urlState?.extraFiles ?? [])
  const [activeFileId, setActiveFileId]             = useState('main')
  const [parseError, setParseError]                 = useState(null)
  const [selectedNode, setSelectedNode]             = useState(null)
  const [highlightLines, setHighlightLines]         = useState(null)
  const [copySuccess, setCopySuccess]               = useState(false)
  const [showMockPanel, setShowMockPanel]           = useState(false)
  const [showVarsPanel, setShowVarsPanel]           = useState(true)
  const [userVars, setUserVars]                     = useState({})
  const [limitsShareState, setLimitsShareState]     = useState(() => urlState?.limits ?? null)

  useEffect(() => {
    const onResize = () => setIsMobile(globalThis.innerWidth < 768)
    globalThis.addEventListener('resize', onResize)
    return () => globalThis.removeEventListener('resize', onResize)
  }, [])

  // Debounce each mode's buffer independently — prevents stale cross-mode text
  // reaching the wrong parser when switching modes.
  const debouncedPlaybook  = useDebounce(texts.playbook, 400)
  const debouncedSnippet   = useDebounce(texts.snippet,  400)
  const debouncedFacts = useDebounce(facts, 300)
  const debouncedExtraFiles = useDebounce(extraFiles, 400)
  // Merge user-supplied playbook vars on top of ansible facts for rendering
  const mergedFacts = useMemo(() => ({ ...debouncedFacts, ...userVars }), [debouncedFacts, userVars])

  // Build file registry: { filename -> parsed Task[] } from extra YAML files only.
  // Also collect parse errors per file id so the explorer can show indicators.
  // Non-YAML files (scripts, etc.) are stored as-is and never parsed.
  const { fileRegistry, fileErrors } = useMemo(() => {
    const registry = {}
    const errors = {}
    debouncedExtraFiles.forEach((f) => {
      if (!/\.(ya?ml)$/i.test(f.name)) return  // skip non-YAML files
      try {
        const parsed = yaml.load(f.content)
        if (parsed) {
          registry[f.name] = Array.isArray(parsed) ? parsed : [parsed]
        }
      } catch (e) {
        errors[f.id] = { message: e.message, line: e.mark?.line ?? 0, column: e.mark?.column ?? 0 }
      }
    })
    return { fileRegistry: registry, fileErrors: errors }
  }, [debouncedExtraFiles])

  useEffect(() => {
    if (mode === 'landing' && globalThis.location.pathname !== '/' && !globalThis.location.hash) {
      updateBrowserPath('landing')
      return
    }
    if (mode !== 'landing') updateBrowserPath(mode)
  }, [mode])

  // Auto-persist state into the URL hash so refresh restores everything
  // (uses replaceState — doesn't add browser history entries)
  useEffect(() => {
    if (mode !== 'playbook') return
    pushToUrl(debouncedPlaybook, debouncedFacts, debouncedExtraFiles)
  }, [mode, debouncedPlaybook, debouncedFacts, debouncedExtraFiles])

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
      if (nextState?.extraFiles) {
        setExtraFiles(nextState.extraFiles)
      } else {
        setExtraFiles([])
      }
      setLimitsShareState(nextState?.limits ?? null)
      setActiveFileId('main')
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
      const parsed = yaml.load(debouncedPlaybook)
      setParseError(null)
      if (!parsed) return { plays: [], nodes: [], edges: [] }
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      const { nodes, edges } = parsePlaybook(arr, debouncedPlaybook, mergedFacts, fileRegistry)
      return { plays: arr, nodes, edges }
    } catch (e) {
      setParseError({ message: e.message, line: e.mark?.line ?? 0, column: e.mark?.column ?? 0 })
      return { plays: [], nodes: [], edges: [] }
    }
  }, [mode, debouncedPlaybook, debouncedFacts, fileRegistry])

  // Parse snippet task (snippet mode)
  const snippetTask = useMemo(() => {
    if (mode !== 'snippet') return null
    try {
      const parsed = yaml.load(debouncedSnippet)
      if (!parsed) return null
      if (Array.isArray(parsed)) return parsed[0] ?? null
      return parsed
    } catch { return null }
  }, [mode, debouncedSnippet])

  // Node click
  const handleNodeClick = useCallback((node) => {
    setSelectedNode(node)
    const taskName = node.data?.label
    if (taskName && !taskName.startsWith('[')) {
      const lines = debouncedPlaybook.split('\n')
      const idx = lines.findIndex((l) => l.includes(taskName))
      if (idx !== -1) setHighlightLines({ start: idx + 1, end: idx + 1 })
    }
  }, [debouncedPlaybook])

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
      // Let the Limits page handle its own paste (inventory import)
      if (mode === 'limits') return
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

  // Share — encode current mode state into URL
  const handleShare = useCallback(() => {
    updateBrowserPath(mode)
    if (mode === 'limits') {
      const inventory = limitsShareState?.inventory ?? {}
      const hasInventoryHosts = Object.values(inventory).some((hosts) => Array.isArray(hosts) && hosts.length > 0)
      const hasHostvars = Object.keys(limitsShareState?.hostvars ?? {}).length > 0
      const hasLimit = Boolean((limitsShareState?.limit ?? '').trim())
      if (!hasInventoryHosts && !hasHostvars && !hasLimit) return

      pushToUrl('', facts, [], {
        mode: 'limits',
        limits: {
          inventory,
          hostvars: limitsShareState?.hostvars ?? {},
          limit: limitsShareState?.limit ?? '',
        },
      })
    } else {
      pushToUrl(yamlText, facts, extraFiles)
    }
    globalThis.navigator.clipboard?.writeText(globalThis.location.href).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2500)
    })
  }, [mode, yamlText, facts, extraFiles, limitsShareState])

  const canShare = useMemo(() => {
    if (mode === 'limits') {
      const inventory = limitsShareState?.inventory ?? {}
      const hasInventoryHosts = Object.values(inventory).some((hosts) => Array.isArray(hosts) && hosts.length > 0)
      const hasHostvars = Object.keys(limitsShareState?.hostvars ?? {}).length > 0
      const hasLimit = Boolean((limitsShareState?.limit ?? '').trim())
      return hasInventoryHosts || hasHostvars || hasLimit
    }
    return Boolean((yamlText ?? '').trim()) || extraFiles.length > 0
  }, [mode, yamlText, extraFiles.length, limitsShareState])

  const downloadTextFile = useCallback((filename, content) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = globalThis.URL.createObjectURL(blob)
    const a = globalThis.document.createElement('a')
    a.href = url
    a.download = filename
    globalThis.document.body.appendChild(a)
    a.click()
    a.remove()
    globalThis.URL.revokeObjectURL(url)
  }, [])

  const handleExportMermaid = useCallback(() => {
    if (mode !== 'playbook' || nodes.length === 0) return
    const content = toMermaidFlow(nodes, edges)
    downloadTextFile('ansible101-flow.mmd', content)
  }, [mode, nodes, edges, downloadTextFile])

  const handleExportUml = useCallback(() => {
    if (mode !== 'playbook' || nodes.length === 0) return
    const content = toPlantUmlFlow(nodes, edges)
    downloadTextFile('ansible101-flow.puml', content)
  }, [mode, nodes, edges, downloadTextFile])

  // Reset
  const handleReset = useCallback(() => {
    setTexts({ playbook: SAMPLE_YAML, snippet: '', jinja2: SAMPLE_JINJA2 })
    setFacts(DEFAULT_FACTS)
    setExtraFiles([])
    setActiveFileId('main')
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

  const handleLoadInventorySample = useCallback(() => {
    try {
      globalThis.localStorage.setItem('ansible101:inventory', JSON.stringify(SAMPLE_INVENTORY))
      globalThis.localStorage.setItem('ansible101:hostvars', JSON.stringify(SAMPLE_HOSTVARS))
    } catch {
      // Best-effort persistence only; continue navigation even if storage is blocked.
    }
    updateBrowserPath('limits', 'pushState')
    setMode('limits')
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  const handleStartPlaybookTour = useCallback(() => {
    updateBrowserPath('playbook', 'pushState')
    setMode('playbook')
    setSelectedNode(null)
    setHighlightLines(null)
    globalThis.setTimeout(() => startTour('playbook'), 120)
  }, [])

  // Extra file management handlers
  const handleAddFile = useCallback(() => {
    const id = `file-${Date.now()}`
    const count = extraFiles.length + 1
    const newFile = {
      id,
      name: `tasks/new-${count}.yml`,
      content: `# Tasks file — rename tab to match your include_tasks reference\n- name: Example task\n  debug:\n    msg: "Replace with your tasks"\n`,
    }
    setExtraFiles((prev) => [...prev, newFile])
    setActiveFileId(id)
  }, [extraFiles.length])

  const handleRemoveFile = useCallback((id) => {
    setExtraFiles((prev) => prev.filter((f) => f.id !== id))
    setActiveFileId((prev) => (prev === id ? 'main' : prev))
  }, [])

  const handleRenameFile = useCallback((id, name) => {
    setExtraFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
  }, [])

  // Reorder a file by dragging it before another
  const handleReorderFile = useCallback((dragId, targetId) => {
    setExtraFiles((prev) => {
      const from = prev.findIndex((f) => f.id === dragId)
      const to = prev.findIndex((f) => f.id === targetId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }, [])

  // Quick-add a file with a pre-filled name (from a missing-reference row)
  const handleAddFileNamed = useCallback((filename) => {
    const id = `file-${Date.now()}`
    const isRole = filename.startsWith('roles/')
    const newFile = {
      id,
      name: filename,
      content: isRole
        ? `# Role tasks — ${filename}\n- name: Example role task\n  debug:\n    msg: "Replace with your role tasks"\n`
        : `# Tasks file — ${filename}\n- name: Example task\n  debug:\n    msg: "Replace with your tasks"\n`,
    }
    setExtraFiles((prev) => [...prev, newFile])
    setActiveFileId(id)
  }, [])

  // Drop files into the editor area (YAML or ZIP → extract YAML)
  const handleDropFiles = useCallback((dropped) => {
    const newFiles = dropped.map(({ name, content }) => ({
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name,
      content,
    }))
    setExtraFiles((prev) => {
      // Deduplicate by name — last write wins
      const map = new Map(prev.map((f) => [f.name, f]))
      newFiles.forEach((f) => map.set(f.name, f))
      return Array.from(map.values())
    })
    if (newFiles.length > 0) setActiveFileId(newFiles[newFiles.length - 1].id)
  }, [])

  const { isDragging, dropProps } = useFileDrop(handleDropFiles)

  // Language for the Monaco editor — depends on mode and active file extension
  const editorLanguage = useMemo(() => {
    if (mode === 'jinja2') return 'handlebars'
    if (activeFileId === 'main' || mode !== 'playbook') return 'yaml'
    const activeFile = extraFiles.find((f) => f.id === activeFileId)
    return activeFile ? getEditorLanguage(activeFile.name) : 'yaml'
  }, [mode, activeFileId, extraFiles])

  // Error for the currently active file (used for Monaco squiggle + EmptyFlow)
  // Only applies to YAML files — non-YAML files never have parse errors shown
  const activeFileError = useMemo(() => {
    if (activeFileId === 'main') return parseError
    const f = extraFiles.find((x) => x.id === activeFileId)
    if (!f || !/\.(ya?ml)$/i.test(f.name)) return null
    return fileErrors[activeFileId] ?? null
  }, [activeFileId, parseError, extraFiles, fileErrors])

  // Value shown in the editor — depends on active tab
  const editorValue = useMemo(() => {
    if (mode !== 'playbook') return yamlText
    if (activeFileId === 'main') return texts.playbook
    return extraFiles.find((f) => f.id === activeFileId)?.content ?? ''
  }, [mode, activeFileId, texts.playbook, extraFiles, yamlText])

  const handleEditorChange = useCallback((v) => {
    if (mode !== 'playbook' || activeFileId === 'main') {
      setCurrentText(v ?? '')
    } else {
      setExtraFiles((prev) => prev.map((f) => (f.id === activeFileId ? { ...f, content: v ?? '' } : f)))
    }
  }, [mode, activeFileId, setCurrentText])

  if (mode === 'landing') {
    return (
      <LandingScreen
        onPaste={handlePasteContent}
        onLoadSample={handleLoadSample}
        onLoadInventorySample={handleLoadInventorySample}
        onOpenLimits={() => handleSetMode('limits')}
        onStartPlaybookTour={handleStartPlaybookTour}
        onOpenAbout={() => handleSetMode('about')}
      />
    )
  }

  if (mode === 'about') {
    return <AboutPage onNavigateHome={() => handleSetMode('landing')} />
  }

  return (
    <div className="flex min-h-screen md:h-screen flex-col bg-slate-950 text-white overflow-x-hidden md:overflow-hidden">
      {/* Top Bar */}
      <header className="flex shrink-0 flex-col gap-3 border-b border-slate-800 bg-slate-950 px-3 py-3 z-10 md:flex-row md:items-center md:justify-between md:gap-2 md:px-4 md:py-2">
        <div className="flex items-center gap-2 shrink-0">
          <BookOpen size={16} className="text-cyan-400" />
          <button
            onClick={() => handleSetMode('landing')}
            className="text-cyan-400 font-mono font-bold tracking-wider text-sm hover:text-cyan-300 transition-colors"
          >
            Ansible<sup className="text-cyan-400 text-[8px] align-super">®</sup><span className="text-white">101</span>
          </button>
        </div>

        {/* Mode selector */}
        <div className="flex w-full flex-col gap-1 md:w-auto md:gap-0">
          <span className="px-1 text-[10px] font-mono uppercase tracking-[0.16em] text-slate-600 md:hidden">
            Main Features
          </span>
          <div data-tour="mode-tabs" className="grid w-full grid-cols-2 gap-1 rounded-lg border border-slate-800 p-1 md:flex md:w-auto md:flex-nowrap md:items-center md:gap-1 md:p-0.5">
            {Object.entries(MODE_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => handleSetMode(key)}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded text-xs font-mono transition-all duration-200 border md:justify-start md:py-1
                  ${mode === key
                    ? `${meta.color} bg-slate-800 border-slate-700 shadow-sm`
                    : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
              >
                <meta.Icon size={11} />
                {meta.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 md:justify-end">
          <button
            data-tour="btn-vars"
            onClick={() => setShowVarsPanel((v) => !v)}
            title="Toggle Playbook Vars panel"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs font-mono transition-all
              ${mode !== 'playbook' ? 'hidden' : ''}
              ${showVarsPanel && mode === 'playbook'
                ? 'border-violet-600 text-violet-300 bg-violet-950'
                : 'border-slate-700 text-slate-500 hover:text-violet-400 hover:border-violet-700'
              }`}
          >
            <Variable size={12} />
            Vars
          </button>

          {parseError && mode === 'playbook' && (
            <div className="flex items-center gap-1.5 rounded bg-red-950 border border-red-800 px-2 py-1 max-w-full md:max-w-[220px] animate-fade-in">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <span className="text-red-300 text-[10px] font-mono truncate">{parseError?.message}</span>
            </div>
          )}

          <button
            onClick={() => handleSetMode('about')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white text-xs font-mono transition-all"
          >
            About
          </button>
          <button
            data-tour="btn-facts"
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
            onClick={() => startTour(mode)}
            title="Start walkthrough for this page"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-700 text-slate-400 hover:border-cyan-700 hover:text-cyan-400 text-xs font-mono transition-all"
          >
            <HelpCircle size={12} />
            Tour
          </button>

          {canShare && (
            <div className="flex items-center gap-1.5">
              <button
                data-tour="btn-share"
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
              <span
                className="inline-flex items-center justify-center text-slate-600 hover:text-slate-400 transition-colors"
                title="Share stores data in the URL hash only. No server upload is performed."
                aria-label="Sharing privacy note"
              >
                <Info size={12} />
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {mode === 'limits' && (
          <InventoryLab
            initialShareState={limitsShareState}
            onShareStateChange={setLimitsShareState}
          />
        )}

        {/* Left pane: editor — hidden in limits mode */}
        {mode !== 'limits' && (
        <div
          data-tour="editor-pane"
          {...(mode === 'playbook' ? dropProps : {})}
          className={`relative shrink-0 flex flex-col border-b border-slate-800 md:border-b-0 md:border-r overflow-visible md:overflow-hidden transition-colors
            ${mode === 'playbook' && isDragging ? 'bg-cyan-950/30 border-cyan-700' : ''}
            ${mode === 'jinja2'
              ? 'w-full h-[45vh] md:h-auto md:w-[48%]'
              : mode === 'playbook'
                ? 'w-full h-auto md:h-auto md:w-[35%] md:min-w-[260px]'
                : 'w-full h-[42vh] md:h-auto md:w-[30%] md:min-w-[240px]'
            }`}>
          {mode === 'playbook' && isDragging && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none gap-2">
              <div className="rounded-lg border-2 border-dashed border-cyan-500/60 bg-cyan-950/60 px-8 py-6 flex flex-col items-center gap-2">
                <span className="text-cyan-400 text-xs font-mono">Drop files or ZIP</span>
                <span className="text-slate-500 text-[10px] font-mono">YAML · scripts · any text file</span>
              </div>
            </div>
          )}
          <PaneHeader
            label={mode === 'jinja2' ? 'Jinja2 Expression' : 'Playbook YAML'}
            color={mode === 'jinja2' ? 'text-violet-400' : 'text-cyan-400'}
          />
          <div className="flex flex-col overflow-visible md:flex-1 md:flex-row md:overflow-hidden">
            {mode === 'playbook' && (
              <div data-tour="file-explorer" className="contents">
                <FileExplorer
                  files={[{ id: 'main', name: 'playbook.yml' }, ...extraFiles]}
                  activeId={activeFileId}
                  onSwitch={setActiveFileId}
                  onAdd={handleAddFile}
                  onAddNamed={handleAddFileNamed}
                  onRemove={handleRemoveFile}
                  onRename={handleRenameFile}
                  onReorder={handleReorderFile}
                  nodes={nodes}
                  fileErrors={fileErrors}
                  isMobile={isMobile}
                />
              </div>
            )}
            <div className="flex flex-col flex-1 overflow-visible md:overflow-hidden">
              <div className="h-[42vh] min-h-[280px] shrink-0 overflow-hidden md:flex-1 md:h-auto md:min-h-0">
                <YamlEditor
                  value={editorValue}
                  onChange={handleEditorChange}
                  highlightLines={activeFileId === 'main' ? highlightLines : null}
                  language={editorLanguage}
                  parseError={activeFileError}
                />
              </div>
              {showVarsPanel && mode === 'playbook' && (
                <PlayVarsPanel
                  yamlText={debouncedPlaybook}
                  plays={plays}
                  userVars={userVars}
                  onUserVarsChange={setUserVars}
                />
              )}
              {showMockPanel && (
                <MockContextPanel facts={facts} onFactsChange={setFacts} />
              )}
            </div>
          </div>
        </div>
        )} {/* end mode !== 'limits' left pane */}

        {/* Right area  mode-specific */}
        {mode === 'playbook' && (
          <>
            <div className="flex shrink-0 flex-col w-full h-[55vh] overflow-hidden border-b border-slate-800 animate-fade-up md:h-auto md:min-h-0 md:flex-1 md:border-b-0 md:border-r" data-tour="flow-pane">
              <PaneHeader label="Execution Flow" color="text-slate-400" />
              <div className="flex-1 overflow-hidden">
                {nodes.length > 0 ? (
                  <FlowCanvas
                    nodes={nodes}
                    edges={edges}
                    onNodeClick={handleNodeClick}
                    onExportMermaid={handleExportMermaid}
                    onExportUml={handleExportUml}
                  />
                ) : (
                  <EmptyFlow parseError={parseError} />
                )}
              </div>
            </div>
            <div className="flex shrink-0 flex-col w-full h-[38vh] overflow-hidden animate-fade-up md:h-auto md:w-[26%] md:min-w-[200px] md:min-h-0" data-tour="human-sidebar" style={{ animationDelay: '40ms' }}>
              <HumanSidebar plays={plays} selectedNode={selectedNode} />
            </div>
          </>
        )}

        {mode === 'snippet' && (
          <div className="flex-1 shrink-0 h-[42vh] overflow-hidden animate-fade-up md:h-auto md:min-h-0" data-tour="snippet-pane">
            {snippetTask
              ? <QuickCard task={snippetTask} facts={facts} />
              : <EmptyQuickCard />
            }
          </div>
        )}

        {mode === 'jinja2' && (
          <div className="flex-1 shrink-0 h-[42vh] overflow-hidden animate-fade-up md:h-auto md:min-h-0" data-tour="jinja2-pane">
            <PipelineView expression={jinja2Text} facts={mergedFacts} />
          </div>
        )}
      </div>

      {/* Disclaimer footer */}
      <footer className="shrink-0 border-t border-slate-800 px-4 py-1.5 text-center text-slate-600 text-[10px] font-mono">
        Ansible101 is an independent community tool &mdash; not affiliated with, endorsed by, or sponsored by Red&nbsp;Hat,&nbsp;Inc.
        Ansible® is a trademark of Red&nbsp;Hat,&nbsp;LLC, registered in the United States and other countries.
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

function EmptyFlow({ parseError }) {
  if (parseError) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 px-8">
        <div className="flex flex-col items-center gap-2">
          <AlertCircle size={28} className="text-red-500" />
          <p className="text-red-400 text-[11px] font-mono font-semibold tracking-wider uppercase">YAML Syntax Error</p>
        </div>
        <div className="w-full max-w-sm bg-red-950/40 border border-red-900/60 rounded-md p-3 space-y-1.5">
          <p className="text-red-300 text-[11px] font-mono leading-relaxed break-words">{parseError.message}</p>
          {parseError.line !== undefined && (
            <p className="text-red-700 text-[10px] font-mono pt-1 border-t border-red-900/50">
              Line {parseError.line + 1}, Column {parseError.column + 1}
            </p>
          )}
        </div>
        <p className="text-slate-600 text-[9px] font-mono">Fix the error in the editor to see the flow</p>
      </div>
    )
  }
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-slate-700">
      <Layers size={34} />
      <p className="text-xs font-mono text-center px-8">Write a valid Ansible playbook to see the flow.</p>
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

function LandingScreen({
  onPaste,
  onLoadSample,
  onLoadInventorySample,
  onOpenLimits,
  onStartPlaybookTour,
  onOpenAbout,
}) {
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
      className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center gap-8 px-4 py-10 sm:px-6"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <BookOpen size={28} className="text-cyan-400" />
          <h1 className="text-3xl font-mono font-bold tracking-tight">
            <span className="text-cyan-400">Ansible</span><sup className="text-cyan-400 text-base align-super">®</sup>
            <span className="text-white">101</span>
          </h1>
        </div>
        <p className="text-slate-400 text-sm font-mono text-center max-w-md">
          Visual debugger, logic explainer and Jinja2 sandbox for Ansible playbooks.
        </p>
      </div>

      <div
        className={`w-full max-w-xl rounded-2xl border-2 border-dashed p-6 sm:p-12 flex flex-col items-center gap-4 transition-all
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

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            onClick={onLoadSample}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-cyan-700 bg-cyan-950/40 hover:bg-cyan-950/70 hover:border-cyan-500 text-cyan-300 hover:text-cyan-200 text-sm font-mono transition-all"
          >
            <BookOpen size={14} />
            Load sample playbook
          </button>
          <button
            onClick={onOpenLimits}
            className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white text-sm font-mono transition-all"
          >
            <FlaskConical size={14} />
            Open Limits Lab
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono">
          <button
            onClick={onLoadInventorySample}
            className="text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Load demo inventory into Limits
          </button>
          <span className="text-slate-700">•</span>
          <button
            onClick={onStartPlaybookTour}
            className="text-cyan-400 hover:text-cyan-300 transition-colors"
          >
            Start guided walkthrough
          </button>
        </div>
      </div>

      <p className="text-slate-600 text-[10px] font-mono text-center max-w-sm">
        Ansible101 is an independent community tool and is not affiliated with,
        endorsed by, or sponsored by Red&nbsp;Hat,&nbsp;Inc. Ansible® is a trademark of Red&nbsp;Hat,&nbsp;LLC, registered in the United States and other countries.
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
