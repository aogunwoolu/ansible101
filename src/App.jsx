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
  useState, useCallback, useEffect, useMemo, useRef, Suspense, lazy,
} from 'react'
import yaml from 'js-yaml'
import { parsePlaybook } from './lib/parseYamlToFlow'
import { persistState, buildShareUrl, loadFromUrl, loadFallbackFromIndexedDb } from './lib/shareUrl'
import { toMermaidFlow, toPlantUmlFlow } from './lib/exportFlowText'
import { SAMPLE_YAML, SAMPLE_SNIPPET } from './lib/sampleYaml'
import { SAMPLE_JINJA2 } from './lib/sampleJinja2'
import { SAMPLE_INVENTORY, SAMPLE_HOSTVARS } from './lib/sampleInventory'
import { DEFAULT_FACTS } from './lib/defaultFacts'
import { detectContentType } from './lib/detectContentType'

import HumanSidebar from './components/HumanSidebar'
import MockContextPanel from './components/MockContextPanel'
import PlayVarsPanel from './components/PlayVarsPanel'
import FileExplorer from './components/FileExplorer'
import QuickCard from './components/QuickCard'
import PipelineView from './components/PipelineView'
import AboutPage from './components/AboutPage'
import InventoryLab from './components/InventoryLab'
import ResolveView from './components/ResolveView'
import ResizeHandle from './components/ResizeHandle'
import Select from './components/Select'
import ImportControls from './components/ImportControls'
import { useFileDrop, readDataTransferFiles } from './lib/useFileDrop'
import { isProject, buildProjectModel, parseYamlSafe } from './lib/projectModel'
import { parseInventoryText, buildInventoryJson, syntheticInventory } from './lib/parseInventory'
import { isValidRelativePath, pathCollides } from './lib/filePaths'
import { startTour } from './lib/tour'

import {
  Share2, AlertCircle, RotateCcw, BookOpen,
  ClipboardPaste, Layers, Zap, FileCode,
  FlaskConical, Variable, FlaskRound, HelpCircle, Info,
  GitBranch, Network, MoreVertical, Loader2,
} from 'lucide-react'

const MODE_PATHS = {
  landing: '/',
  playbook: '/playbook',
  snippet: '/snippet',
  jinja2: '/jinja',
  limits: '/limits',
  about: '/about',
}

const YamlEditor = lazy(() => import('./components/YamlEditor'))
const FlowCanvas = lazy(() => import('./components/FlowCanvas'))

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

function normaliseExtraFiles(files = []) {
  if (!Array.isArray(files)) return []
  return files
    .filter((f) => f && typeof f.name === 'string')
    .map((f, idx) => ({
      id: f.id || `url-file-${idx}-${f.name}`,
      name: f.name,
      content: typeof f.content === 'string' ? f.content : '',
    }))
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map((v) => stableStringify(v)).join(',')}]`
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b))
  const entries = keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
  return '{' + entries.join(',') + '}'
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

//  Playbook pane widths (resizable, desktop/tablet only)
const PANE_WIDTHS_KEY = 'ansible101:paneWidths'
const EDITOR_WIDTH_DEFAULT = 35
const EDITOR_WIDTH_MIN = 22
const EDITOR_WIDTH_MAX = 55
const SIDEBAR_WIDTH_DEFAULT = 26
const SIDEBAR_WIDTH_MIN = 16
const SIDEBAR_WIDTH_MAX = 42

function loadPaneWidths() {
  try {
    const raw = globalThis.localStorage.getItem(PANE_WIDTHS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
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
  // A restored session (even a project-only import with no root playbook
  // file, i.e. yaml === '') must win over the sample — only fall back to
  // SAMPLE_* when there's truly no saved/shared state at all. Checking
  // `urlState?.yaml` here previously treated "" as falsy and silently
  // replaced a real (but empty) imported playbook with the sample on every
  // refresh.
  const [texts, setTexts] = useState(() => ({
    playbook: initialMode === 'playbook' && urlState ? (urlState.yaml ?? '') : SAMPLE_YAML,
    snippet: initialMode === 'snippet' && urlState ? (urlState.yaml ?? '') : SAMPLE_SNIPPET,
    jinja2: initialMode === 'jinja2' && urlState ? (urlState.yaml ?? '') : SAMPLE_JINJA2,
  }))

  const setCurrentText = useCallback((v, forMode) => {
    setTexts((prev) => ({ ...prev, [forMode ?? mode]: v ?? '' }))
  }, [mode])

  const yamlText    = texts[mode] ?? ''              // text for the active mode
  const jinja2Text  = texts.jinja2                   // always available for PipelineView

  const [facts, setFacts]                           = useState(() => urlState?.facts ?? DEFAULT_FACTS)
  const [extraFiles, setExtraFiles]                 = useState(() => normaliseExtraFiles(urlState?.extraFiles))
  // Folders with no files yet (created via "New folder") — purely an editor
  // organizational aid, not meaningful Ansible state, so session-only.
  const [extraFolders, setExtraFolders]             = useState([])
  // Missing-reference filenames the user has dismissed via "Ignore" — persisted
  // so dismissals stick across reloads.
  const [ignoredMissingRefs, setIgnoredMissingRefs] = useState(() => {
    try { return JSON.parse(globalThis.localStorage.getItem('ansible101:ignoredMissing')) || [] } catch { return [] }
  })
  const [activeFileId, setActiveFileId]             = useState('main')
  // Real filename of whatever's currently in texts.playbook — lets FileExplorer
  // and the playbook switcher show/select the actual imported name instead of
  // a hardcoded placeholder.
  const [mainPath, setMainPath]                     = useState(() => urlState?.mainPath ?? 'playbook.yml')
  const [parseError, setParseError]                 = useState(null)
  const [selectedNode, setSelectedNode]             = useState(null)
  const [highlightLines, setHighlightLines]         = useState(null)
  const [copySuccess, setCopySuccess]               = useState(false)
  const [shareTooLarge, setShareTooLarge]           = useState(false)
  const [showMockPanel, setShowMockPanel]           = useState(false)
  const [showVarsPanel, setShowVarsPanel]           = useState(true)
  const [userVars, setUserVars]                     = useState({})
  const [limitsShareState, setLimitsShareState]     = useState(() => urlState?.limits ?? null)
  // Restore the last view tab (Flow/Resolve) across reloads — otherwise a
  // refresh always lands back on Resolve once a project is detected (see the
  // auto-switch effect below), discarding whichever tab the user was on.
  const loadViewModeState = () => {
    try { return JSON.parse(globalThis.localStorage.getItem('ansible101:viewMode')) ?? {} } catch { return {} }
  }
  const [viewMode, setViewMode]                     = useState(() => loadViewModeState().viewMode ?? 'flow')   // playbook mode: 'flow' | 'resolve'
  const userPickedView                              = useRef(loadViewModeState().picked ?? false)

  useEffect(() => {
    try { globalThis.localStorage.setItem('ansible101:viewMode', JSON.stringify({ viewMode, picked: userPickedView.current })) } catch { /* storage blocked */ }
  }, [viewMode])
  const [actionsMenuOpen, setActionsMenuOpen]       = useState(false)    // mobile/tablet "⋯" actions menu
  const actionsMenuRef                              = useRef(null)

  // Resizable playbook panes (Editor | Flow | Human sidebar) — desktop/tablet only
  const [editorWidthPct, setEditorWidthPct]   = useState(() => loadPaneWidths().editor ?? EDITOR_WIDTH_DEFAULT)
  const [sidebarWidthPct, setSidebarWidthPct] = useState(() => loadPaneWidths().sidebar ?? SIDEBAR_WIDTH_DEFAULT)
  const bodyRowRef = useRef(null)
  const flowRowRef = useRef(null)

  useEffect(() => {
    try {
      globalThis.localStorage.setItem(PANE_WIDTHS_KEY, JSON.stringify({ editor: editorWidthPct, sidebar: sidebarWidthPct }))
    } catch {
      // Best-effort persistence only.
    }
  }, [editorWidthPct, sidebarWidthPct])

  // Close the mobile actions menu on outside click
  useEffect(() => {
    if (!actionsMenuOpen) return undefined
    const onDown = (e) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target)) setActionsMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [actionsMenuOpen])

  // Ensure URL state is fully applied after first mount.
  // This avoids rare cases where initial render falls back to defaults
  // and only reparses after the user edits content.
  useEffect(() => {
    if (!urlState) return

    const hydratedMode = getModeFromLocation(urlState)
    setMode(hydratedMode)

    const contentMode = hydratedMode === 'landing' ? getContentModeFromState(urlState) : hydratedMode
    setTexts((prev) => ({ ...prev, [contentMode]: urlState.yaml ?? '' }))

    if (urlState.facts) setFacts(urlState.facts)
    setExtraFiles(normaliseExtraFiles(urlState.extraFiles))
    setLimitsShareState(urlState?.limits ?? null)
    setMainPath(urlState.mainPath ?? 'playbook.yml')
    setActiveFileId('main')

    // A shared link carried its state in the hash. Only playbook mode mirrors
    // its content into localStorage (auto-persist), so only then can we strip
    // the hash and still restore on refresh. snippet/jinja/limits shares have
    // no localStorage mirror, so keep their hash — it's what restores them.
    if (urlState.fromHash && contentMode === 'playbook') {
      globalThis.history.replaceState(null, '', globalThis.location.pathname)
    }
  }, [urlState])

  // A previous session's auto-save may have overflowed localStorage's quota
  // (real Ansible repo zips routinely run multiple MB — see useFileDrop.js)
  // and silently fallen back to IndexedDB instead — see persistState in
  // shareUrl.js. Check for it once on mount and, if present, let it win over
  // whatever the synchronous localStorage/sample fallback rendered first.
  // A shared link (`urlState.fromHash`) is explicit user intent and always
  // takes priority over a leftover local session.
  useEffect(() => {
    if (urlState?.fromHash) return
    let cancelled = false
    loadFallbackFromIndexedDb().then((fallback) => {
      if (cancelled || !fallback) return
      const hydratedMode = getModeFromLocation(fallback)
      setMode(hydratedMode)
      const contentMode = hydratedMode === 'landing' ? getContentModeFromState(fallback) : hydratedMode
      setTexts((prev) => ({ ...prev, [contentMode]: fallback.yaml ?? '' }))
      if (fallback.facts) setFacts(fallback.facts)
      setExtraFiles(normaliseExtraFiles(fallback.extraFiles))
      setMainPath(fallback.mainPath ?? 'playbook.yml')
      setActiveFileId('main')
    })
    return () => { cancelled = true }
  }, [urlState])

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
  const debouncedFactsForUrl = useMemo(
    () => (stableStringify(debouncedFacts) === stableStringify(DEFAULT_FACTS) ? null : debouncedFacts),
    [debouncedFacts]
  )
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

  // Detect a dropped Ansible project (group_vars/, host_vars/, roles/, inventory…)
  const projectDetected = useMemo(() => isProject(debouncedExtraFiles), [debouncedExtraFiles])

  // First time a project appears, jump to the Resolve view (unless the user has
  // manually chosen a view). When the project goes away, fall back to Flow.
  useEffect(() => {
    if (projectDetected && !userPickedView.current) setViewMode('resolve')
    if (!projectDetected) { setViewMode('flow'); userPickedView.current = false }
  }, [projectDetected])

  useEffect(() => {
    if (mode === 'landing' && globalThis.location.pathname !== '/' && !globalThis.location.hash) {
      updateBrowserPath('landing')
      return
    }
    if (mode !== 'landing') updateBrowserPath(mode)
  }, [mode])

  // Auto-persist state to localStorage so a refresh restores everything,
  // without cluttering the address bar with a giant hash. (Sharing encodes
  // into the URL on demand — see handleShare.)
  useEffect(() => {
    if (mode !== 'playbook') return
    persistState(debouncedPlaybook, debouncedFactsForUrl, debouncedExtraFiles, { mainPath })
  }, [mode, debouncedPlaybook, debouncedFactsForUrl, debouncedExtraFiles, mainPath])

  useEffect(() => {
    const onPopState = () => {
      const nextState = loadFromUrl()
      const nextMode = getModeFromLocation(nextState)
      setMode(nextMode)
      // Only hydrate buffers from a restored state that belongs to the target
      // mode: a shared-link hash, or the playbook session in localStorage.
      // (snippet/jinja keep their in-memory buffers on back/forward.)
      const applies = Boolean(nextState && (nextState.fromHash || nextMode === 'playbook'))
      if (applies) {
        setTexts((prev) => ({
          ...prev,
          [nextMode === 'landing' ? getContentModeFromState(nextState) : nextMode]: nextState.yaml ?? '',
        }))
      }
      if (applies && nextState.facts) setFacts(nextState.facts)
      if (applies && nextState.extraFiles?.length) {
        setExtraFiles(normaliseExtraFiles(nextState.extraFiles))
      } else {
        setExtraFiles([])
      }
      setLimitsShareState(nextState?.limits ?? null)
      setMainPath(applies ? (nextState.mainPath ?? 'playbook.yml') : 'playbook.yml')
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

  // Playbook-mode view switch (Flow ↔ Resolve)
  const handleSelectView = useCallback((v) => { userPickedView.current = true; setViewMode(v) }, [])

  // Handoff from the resolver: load a host's resolved vars into Flow / Jinja2
  const handleUseInFlow = useCallback((ctx) => {
    setUserVars(ctx || {})
    userPickedView.current = true
    setViewMode('flow')
  }, [])

  const handleOpenInJinja2 = useCallback((ctx) => {
    setUserVars(ctx || {})
    updateBrowserPath('jinja2', 'pushState')
    setMode('jinja2')
    setSelectedNode(null)
    setHighlightLines(null)
  }, [])

  // Limits Lab → Playbook: drop the lab's in-memory inventory into the project
  // as a real file (under inventory/ so it's recognized regardless of name)
  // so Resolve can use it for real group_vars/host_vars precedence. Re-syncing
  // overwrites the same file rather than piling up duplicates.
  const LIMITS_INVENTORY_PATH = 'inventory/limits-lab.json'
  const handleSyncInventoryToPlaybook = useCallback(({ inventory, hostvars } = {}) => {
    const content = buildInventoryJson(inventory ?? {}, hostvars ?? {})
    setExtraFiles((prev) => [
      ...prev.filter((f) => f.name !== LIMITS_INVENTORY_PATH),
      { id: 'limits-inventory', name: LIMITS_INVENTORY_PATH, content },
    ])
    userPickedView.current = true
    setViewMode('resolve')
    updateBrowserPath('playbook', 'pushState')
    setMode('playbook')
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
      const { nodes, edges } = parsePlaybook(arr, debouncedPlaybook, mergedFacts, fileRegistry, mainPath)
      return { plays: arr, nodes, edges }
    } catch (e) {
      setParseError({ message: e.message, line: e.mark?.line ?? 0, column: e.mark?.column ?? 0 })
      return { plays: [], nodes: [], edges: [] }
    }
  }, [mode, debouncedPlaybook, debouncedFacts, fileRegistry, mainPath])

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

  // Smart router for dropped/opened files: figure out what was dropped and take
  // the user to the most appropriate place.
  //   • a project (folder/zip with inventory/group_vars/roles/…) → Playbook ▸ Resolve
  //   • a single playbook / snippet / jinja2 expression → its dedicated tab
  //   • a single inventory file → Limits Lab
  //   • anything else multi-file → Playbook ▸ Flow with the files loaded
  const loadDroppedFiles = useCallback((files) => {
    if (!Array.isArray(files) || files.length === 0) return
    const project = isProject(files)

    if (!project && files.length === 1) {
      const { content } = files[0]
      if (detectContentType(content) === 'unknown') {
        // Maybe a standalone inventory file → open the Limits Lab with it loaded.
        const inv = parseInventoryText(content)
        const hasHosts = inv.groups && Object.values(inv.groups).some((h) => Array.isArray(h) && h.length > 0)
        if (hasHosts) {
          const limits = { inventory: inv.groups, hostvars: inv.hostvars ?? {}, limit: '' }
          setLimitsShareState(limits)
          try {
            globalThis.localStorage.setItem('ansible101:inventory', JSON.stringify(inv.groups))
            globalThis.localStorage.setItem('ansible101:hostvars', JSON.stringify(inv.hostvars ?? {}))
          } catch { /* ignore */ }
          updateBrowserPath('limits', 'pushState')
          setMode('limits')
          setSelectedNode(null)
          setHighlightLines(null)
          return
        }
      }
      handlePasteContent(content)
      return
    }

    // Project or multi-file → Playbook mode. Surface the primary playbook in the
    // editable buffer and keep the rest of the tree as project files.
    const pm = buildProjectModel(files.map((f, i) => ({ id: String(i), name: f.name, content: f.content })))
    const primary = pm.playbookCandidates[0]?.path
    const mainContent = primary ? pm.files[primary] : ''
    const rest = primary ? files.filter((f) => f.name !== primary) : files

    setTexts((prev) => ({ ...prev, playbook: mainContent }))
    setExtraFiles(rest.map((f, i) => ({ id: `drop-${Date.now()}-${i}`, name: f.name, content: f.content })))
    setMainPath(primary ?? 'playbook.yml')
    setActiveFileId('main')
    userPickedView.current = false
    setViewMode(project ? 'resolve' : 'flow')
    updateBrowserPath('playbook', 'pushState')
    setMode('playbook')
    setSelectedNode(null)
    setHighlightLines(null)
  }, [handlePasteContent])

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

  // Share — encode current mode state into a link and copy it to the clipboard.
  // Does not mutate the address bar; the encoded hash only lives in the copied URL.
  const handleShare = useCallback(() => {
    updateBrowserPath(mode)
    let result
    if (mode === 'limits') {
      const inventory = limitsShareState?.inventory ?? {}
      const hasInventoryHosts = Object.values(inventory).some((hosts) => Array.isArray(hosts) && hosts.length > 0)
      const hasHostvars = Object.keys(limitsShareState?.hostvars ?? {}).length > 0
      const hasLimit = Boolean((limitsShareState?.limit ?? '').trim())
      if (!hasInventoryHosts && !hasHostvars && !hasLimit) return

      result = buildShareUrl('', null, [], {
        mode: 'limits',
        limits: {
          inventory,
          hostvars: limitsShareState?.hostvars ?? {},
          limit: limitsShareState?.limit ?? '',
        },
      })
    } else {
      const factsForUrl = stableStringify(facts) === stableStringify(DEFAULT_FACTS) ? null : facts
      result = buildShareUrl(yamlText, factsForUrl, extraFiles, mode === 'playbook' ? { mainPath } : {})
    }
    // Some projects are too big to encode into a practical link. The work is
    // still auto-saved to this browser; it just can't travel in a URL.
    if (result.tooLong) {
      setShareTooLarge(true)
      setTimeout(() => setShareTooLarge(false), 3500)
      return
    }
    globalThis.navigator.clipboard?.writeText(result.url).then(() => {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2500)
    })
  }, [mode, yamlText, facts, extraFiles, limitsShareState, mainPath])

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
    setTexts({ playbook: SAMPLE_YAML, snippet: SAMPLE_SNIPPET, jinja2: SAMPLE_JINJA2 })
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

  const handleLoadSnippetSample = useCallback(() => {
    setTexts((prev) => ({ ...prev, snippet: SAMPLE_SNIPPET }))
    updateBrowserPath('snippet', 'pushState')
    setMode('snippet')
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
    globalThis.setTimeout(() => startTour('playbook', {
      switchToResolve: () => handleSelectView('resolve'),
      selectFirstVar: () => document.querySelector('[data-tour="resolver-table"] tbody tr')?.click(),
    }), 120)
  }, [handleSelectView])

  // Extra file management handlers
  const handleAddFile = useCallback((folderPath = '') => {
    const id = `file-${Date.now()}`
    const count = extraFiles.length + 1
    const name = folderPath ? `${folderPath}/new-${count}.yml` : `tasks/new-${count}.yml`
    const newFile = {
      id,
      name,
      content: `# Tasks file — rename tab to match your include_tasks reference\n- name: Example task\n  debug:\n    msg: "Replace with your tasks"\n`,
    }
    setExtraFiles((prev) => [...prev, newFile])
    setActiveFileId(id)
  }, [extraFiles.length])

  const handleRemoveFile = useCallback((id) => {
    setExtraFiles((prev) => prev.filter((f) => f.id !== id))
    setActiveFileId((prev) => (prev === id ? 'main' : prev))
  }, [])

  // Renames the file's full relative path — typing a different folder
  // segment moves it. Rejects unsafe paths and name collisions rather than
  // silently overwriting another file.
  const handleRenameFile = useCallback((id, name) => {
    if (!isValidRelativePath(name) || pathCollides(name, extraFiles, mainPath, id)) return
    setExtraFiles((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)))
  }, [extraFiles, mainPath])

  // Renaming the active/main playbook is just relabeling mainPath — the
  // content stays put (mirrors the unified-playbook-switcher's swap model).
  const handleRenameMain = useCallback((name) => {
    if (!isValidRelativePath(name) || pathCollides(name, extraFiles, null, null)) return
    setMainPath(name)
  }, [extraFiles])

  // New folders are session-only placeholders (extraFolders) until a file
  // lands under them — buildTree renders both the same way, so no merge step
  // is needed once that happens.
  const handleAddFolder = useCallback((parentPath = '') => {
    setExtraFolders((prev) => {
      const count = prev.length + extraFiles.length + 1
      const name = parentPath ? `${parentPath}/new-folder-${count}` : `new-folder-${count}`
      return prev.includes(name) ? prev : [...prev, name]
    })
  }, [extraFiles.length])

  // Folders are just shared path prefixes — renaming one rewrites that
  // prefix across every file (and empty sub-folder) under it in one batch.
  const handleRenameFolder = useCallback((oldPrefix, newPrefix) => {
    if (!isValidRelativePath(newPrefix)) return
    if (pathCollides(newPrefix, extraFiles, mainPath, null)) return
    const rewrite = (p) => (p === oldPrefix ? newPrefix : newPrefix + p.slice(oldPrefix.length))
    setExtraFiles((prev) => prev.map((f) => (
      f.name === oldPrefix || f.name.startsWith(`${oldPrefix}/`) ? { ...f, name: rewrite(f.name) } : f
    )))
    setExtraFolders((prev) => prev.map((p) => (
      p === oldPrefix || p.startsWith(`${oldPrefix}/`) ? rewrite(p) : p
    )))
  }, [extraFiles, mainPath])

  const handleRemoveFolder = useCallback((dirPath) => {
    const removedIds = new Set(
      extraFiles.filter((f) => f.name === dirPath || f.name.startsWith(`${dirPath}/`)).map((f) => f.id),
    )
    setExtraFiles((prev) => prev.filter((f) => !removedIds.has(f.id)))
    setExtraFolders((prev) => prev.filter((p) => p !== dirPath && !p.startsWith(`${dirPath}/`)))
    setActiveFileId((prev) => (removedIds.has(prev) ? 'main' : prev))
  }, [extraFiles])

  useEffect(() => {
    try { globalThis.localStorage.setItem('ansible101:ignoredMissing', JSON.stringify(ignoredMissingRefs)) } catch { /* storage blocked */ }
  }, [ignoredMissingRefs])

  const handleIgnoreMissing = useCallback((filename) => {
    setIgnoredMissingRefs((prev) => (prev.includes(filename) ? prev : [...prev, filename]))
  }, [])

  const handleIgnoreAllMissing = useCallback((filenames) => {
    setIgnoredMissingRefs((prev) => [...new Set([...prev, ...filenames])])
  }, [])

  const handleUnignoreAllMissing = useCallback(() => setIgnoredMissingRefs([]), [])

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
    // A whole project? Route it (sets the primary playbook + opens Resolve).
    if (isProject(dropped)) { loadDroppedFiles(dropped); return }
    // Otherwise merge into the current file set.
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
  }, [loadDroppedFiles])

  // Combined view of everything in the project — used to find all playbook
  // candidates so the switcher (and ResolveView) agree on what's available.
  const playbookProjectModel = useMemo(() => buildProjectModel(
    [{ id: '__main__', name: mainPath, content: texts.playbook }, ...extraFiles],
  ), [mainPath, texts.playbook, extraFiles])
  const playbookCandidates = playbookProjectModel.playbookCandidates

  // Which playbook is active for resolution purposes — the same one driving
  // Flow's graph (see handleSwitchPlaybook below).
  const activePlaybook = useMemo(
    () => playbookCandidates.find((p) => p.path === mainPath) ?? null,
    [playbookCandidates, mainPath],
  )

  // Host/inventory selection + -e extra vars / runtime mocks — shared between
  // the Variable Resolver tab and the Human Logic sidebar so both always
  // show the same host's variables, the same way.
  const loadResolverHost = () => {
    try { return JSON.parse(globalThis.localStorage.getItem('ansible101:resolverHost')) ?? {} } catch { return {} }
  }
  const [invPath, setInvPath] = useState(() => loadResolverHost().invPath ?? '')
  const [host, setHost] = useState(() => loadResolverHost().host ?? '')
  const [picked, setPicked] = useState(() => loadResolverHost().picked ?? [])
  const [pairs, setPairs] = useState(() => loadResolverHost().pairs ?? [])
  const [mocks, setMocks] = useState(() => loadResolverHost().mocks ?? {})

  useEffect(() => {
    try { globalThis.localStorage.setItem('ansible101:resolverHost', JSON.stringify({ invPath, host, picked, pairs, mocks })) } catch { /* storage blocked */ }
  }, [invPath, host, picked, pairs, mocks])

  const extraVarsLayers = useMemo(() => {
    const layers = picked.map((p) => ({
      label: `@${p}`,
      path: p,
      vars: /\.json$/i.test(p)
        ? (() => { try { return JSON.parse(playbookProjectModel.files[p] ?? '') || {} } catch { return {} } })()
        : parseYamlSafe(playbookProjectModel.files[p] ?? ''),
    }))
    const kv = {}
    for (const { key, value } of pairs) {
      if (!key) continue
      kv[key] = /^-?\d+$/.test(value) ? Number(value)
        : /^-?\d*\.\d+$/.test(value) ? Number(value)
        : /^(true|false)$/i.test(value) ? value.toLowerCase() === 'true'
        : value
    }
    if (Object.keys(kv).length) layers.push({ label: '-e key=value', path: '(cli)', vars: kv })
    return layers
  }, [picked, pairs, playbookProjectModel])

  const invCandidates = playbookProjectModel.inventoryCandidates
  // Auto-pick defaults only when the persisted/current choice isn't a valid
  // candidate (keeps a restored selection if it still exists in the project).
  useEffect(() => { setInvPath((p) => (invCandidates.some((c) => c.path === p) ? p : (invCandidates[0]?.path ?? ''))) }, [invCandidates])

  const inventoryData = useMemo(() => {
    const content = invPath ? playbookProjectModel.files[invPath] : ''
    if (content) {
      const r = parseInventoryText(content)
      if (r.groups) return r
    }
    // No inventory in the project — synthesize a host from the playbook so
    // play/role/-e vars still resolve and the table isn't empty.
    return syntheticInventory(activePlaybook?.plays)
  }, [invPath, playbookProjectModel, activePlaybook])

  const hosts = useMemo(() => [...new Set(Object.values(inventoryData.groups).flat())].sort(), [inventoryData])
  useEffect(() => { setHost((h) => (hosts.includes(h) ? h : (hosts[0] ?? ''))) }, [hosts])

  // Promote a different playbook to "main" — swaps content with whatever's
  // currently in extraFiles under that name, preserving edits on both sides.
  // 'main' stays a fixed UI sentinel (Monaco/FileExplorer/language-detection
  // all branch on activeFileId === 'main'); only the content + mainPath label
  // move.
  const handleSwitchPlaybook = useCallback((targetName) => {
    if (!targetName || targetName === mainPath) return
    const targetFile = extraFiles.find((f) => f.name === targetName)
    if (!targetFile) return
    setExtraFiles((prev) => {
      const withoutTarget = prev.filter((f) => f.id !== targetFile.id)
      let oldMainName = mainPath
      if (withoutTarget.some((f) => f.name === oldMainName)) {
        const dot = oldMainName.lastIndexOf('.')
        oldMainName = dot === -1 ? `${oldMainName} (1)` : `${oldMainName.slice(0, dot)} (1)${oldMainName.slice(dot)}`
      }
      return [...withoutTarget, { id: `swap-${Date.now()}`, name: oldMainName, content: texts.playbook }]
    })
    setTexts((prev) => ({ ...prev, playbook: targetFile.content }))
    setMainPath(targetName)
    setActiveFileId((prev) => (prev === targetFile.id ? 'main' : prev))
  }, [extraFiles, texts.playbook, mainPath])

  const { isDragging, isProcessing: isProcessingResolveDrop, error: resolveDropError, dropProps } = useFileDrop(handleDropFiles)

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
        onDropFiles={loadDroppedFiles}
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
      {/* Top Bar — fully responsive, single row at every width (no horizontal
          scroll). Mode-tab labels collapse to icons below md; secondary action
          buttons collapse into a "⋯" menu below lg. */}
      <header className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 z-10 md:px-4">
        <button
          onClick={() => handleSetMode('landing')}
          className="flex items-center gap-2 shrink-0 justify-self-start text-cyan-400 hover:text-cyan-300 transition-colors"
        >
          <BookOpen size={16} className="shrink-0" />
          <span className="hidden sm:inline font-mono font-bold tracking-wider text-sm">
            Ansible<sup className="text-[8px] align-super">®</sup><span className="text-white">101</span>
          </span>
        </button>

        {/* Mode selector — centered column; icon-only below md */}
        <div className="flex items-center min-w-0 justify-self-center">
          <div data-tour="mode-tabs" className="flex flex-nowrap items-center gap-1 rounded-lg border border-slate-800 p-0.5">
            {Object.entries(MODE_META).map(([key, meta]) => (
              <button
                key={key}
                onClick={() => handleSetMode(key)}
                title={meta.label}
                className={`flex items-center justify-center gap-1.5 px-2.5 py-1 min-h-[38px] md:min-h-0 rounded text-xs font-mono whitespace-nowrap transition-all duration-200 border
                  ${mode === key
                    ? `${meta.color} bg-slate-800 border-slate-700 shadow-sm`
                    : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-slate-800/50'
                  }`}
              >
                <meta.Icon size={13} className="shrink-0" />
                <span className="hidden md:inline">{meta.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-nowrap items-center gap-2 shrink-0 justify-self-end">
          {/* Parse error — desktop only (also surfaced in the editor/flow) */}
          {parseError && mode === 'playbook' && (
            <div className="hidden lg:flex items-center gap-1.5 rounded bg-red-950 border border-red-800 px-2 py-1 max-w-[220px] animate-fade-in">
              <AlertCircle size={12} className="text-red-400 shrink-0" />
              <span className="text-red-300 text-[10px] font-mono truncate">{parseError?.message}</span>
            </div>
          )}

          {/* Secondary actions — inline at lg, "⋯" dropdown below lg */}
          <div className="relative" ref={actionsMenuRef}>
            <button
              onClick={() => setActionsMenuOpen((o) => !o)}
              aria-label="More actions"
              aria-expanded={actionsMenuOpen}
              className={`lg:hidden flex items-center justify-center min-h-[40px] min-w-[40px] rounded border text-xs font-mono transition-all
                ${actionsMenuOpen ? 'border-slate-500 text-white bg-slate-800' : 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'}`}
            >
              <MoreVertical size={16} />
            </button>

            <div
              onClick={() => setActionsMenuOpen(false)}
              className={`${actionsMenuOpen ? 'flex' : 'hidden'} lg:flex
                flex-col lg:flex-row items-stretch lg:items-center gap-1 lg:gap-2
                absolute right-0 top-full mt-1 lg:static lg:mt-0 z-50
                min-w-[180px] lg:min-w-0 rounded-lg lg:rounded-none border lg:border-0 border-slate-700 bg-slate-900 lg:bg-transparent p-1 lg:p-0 shadow-xl lg:shadow-none
                [&>button]:w-full lg:[&>button]:w-auto`}
            >
              <button
                data-tour="btn-vars"
                onClick={() => setShowVarsPanel((v) => !v)}
                title="Toggle Playbook Vars panel"
                className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border text-xs font-mono transition-all lg:min-h-0 lg:py-1.5
                  ${!(mode === 'playbook' && viewMode === 'flow') ? 'hidden' : ''}
                  ${showVarsPanel && mode === 'playbook'
                    ? 'border-violet-600 text-violet-300 bg-violet-950'
                    : 'border-slate-700 text-slate-500 hover:text-violet-400 hover:border-violet-700'
                  }`}
              >
                <Variable size={12} />
                Vars
              </button>

              <button
                data-tour="btn-facts"
                onClick={() => setShowMockPanel((v) => !v)}
                title="Toggle Mock Facts panel"
                className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border text-xs font-mono transition-all lg:min-h-0 lg:py-1.5
                  ${mode === 'playbook' && viewMode === 'resolve' ? 'hidden' : ''}
                  ${showMockPanel
                    ? 'border-amber-600 text-amber-300 bg-amber-950'
                    : 'border-slate-700 text-slate-500 hover:text-amber-400 hover:border-amber-700'
                  }`}
              >
                <FlaskConical size={12} />
                Facts
              </button>

              <button
                onClick={() => handleSetMode('about')}
                className="flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border border-slate-700 text-slate-400 hover:border-slate-500 hover:text-white text-xs font-mono transition-all lg:min-h-0 lg:py-1.5"
              >
                <Info size={12} />
                About
              </button>

              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border border-slate-700 hover:border-slate-500 text-slate-400 hover:text-white text-xs font-mono transition-all lg:min-h-0 lg:py-1.5"
              >
                <RotateCcw size={12} />
                Reset
              </button>

              <button
                onClick={() => startTour(mode, {
                  switchToResolve: () => handleSelectView('resolve'),
                  selectFirstVar: () => document.querySelector('[data-tour="resolver-table"] tbody tr')?.click(),
                })}
                title="Start walkthrough for this page"
                className="flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border border-slate-700 text-slate-400 hover:border-cyan-700 hover:text-cyan-400 text-xs font-mono transition-all lg:min-h-0 lg:py-1.5"
              >
                <HelpCircle size={12} />
                Tour
              </button>
            </div>
          </div>

          {/* Share — always inline (text collapses to icon below sm) */}
          {canShare && (
            <div className="flex items-center gap-1.5">
              <button
                data-tour="btn-share"
                onClick={handleShare}
                title="Build a shareable link"
                className={`flex items-center gap-1.5 px-2.5 py-2 min-h-[40px] rounded border text-xs font-mono transition-all md:min-h-0 md:py-1.5
                  ${copySuccess
                    ? 'border-green-500 text-green-400 bg-green-950'
                    : shareTooLarge
                      ? 'border-amber-600 text-amber-300 bg-amber-950'
                      : 'border-cyan-800 hover:border-cyan-500 text-cyan-400 hover:text-cyan-300'
                  }`}
              >
                <Share2 size={12} />
                <span className="hidden sm:inline">{copySuccess ? 'Copied!' : shareTooLarge ? 'Too large to share' : 'Share'}</span>
              </button>
              <span
                className="hidden sm:inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded text-slate-600 hover:text-slate-400 transition-colors"
                title="Your work auto-saves in this browser. Share builds a link with the data encoded in the URL hash — no server upload. Very large projects can't fit in a link."
                aria-label="Sharing privacy note"
              >
                <Info size={12} />
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Body */}
      <div ref={bodyRowRef} className="flex flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
        {mode === 'limits' && (
          <InventoryLab
            initialShareState={limitsShareState}
            onShareStateChange={setLimitsShareState}
            onSyncToPlaybook={handleSyncInventoryToPlaybook}
          />
        )}

        {/* Left pane: editor — hidden only in limits mode (stays visible in both Flow & Resolve) */}
        {mode !== 'limits' && (
        <div
          data-tour="editor-pane"
          {...(mode === 'playbook' ? dropProps : {})}
          style={mode === 'playbook' && !isMobile ? { width: `${editorWidthPct}%` } : undefined}
          className={`relative shrink-0 flex flex-col border-b border-slate-800 md:border-b-0 md:border-r overflow-visible md:overflow-hidden transition-colors
            ${mode === 'playbook' && isDragging ? 'bg-cyan-950/30 border-cyan-700' : ''}
            ${mode === 'jinja2'
              ? 'w-full h-[45vh] md:h-auto md:w-[48%]'
              : mode === 'playbook'
                ? 'w-full h-auto md:h-auto md:min-w-[260px]'
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
            label={mode === 'jinja2' ? 'Jinja2 Expression' : mode === 'snippet' ? 'Task Snippet' : 'Playbook YAML'}
            color={mode === 'jinja2' ? 'text-violet-400' : mode === 'snippet' ? 'text-blue-400' : 'text-cyan-400'}
          />
          <div className="flex flex-col overflow-visible md:flex-1 md:flex-row md:overflow-hidden">
            {mode === 'playbook' && (
              <div data-tour="file-explorer" className="contents">
                <FileExplorer
                  files={[{ id: 'main', name: mainPath }, ...extraFiles]}
                  folders={extraFolders}
                  activeId={activeFileId}
                  onSwitch={setActiveFileId}
                  onAdd={handleAddFile}
                  onAddNamed={handleAddFileNamed}
                  onRemove={handleRemoveFile}
                  onRename={handleRenameFile}
                  onRenameMain={handleRenameMain}
                  onReorder={handleReorderFile}
                  onAddFolder={handleAddFolder}
                  onRenameFolder={handleRenameFolder}
                  onRemoveFolder={handleRemoveFolder}
                  ignoredMissing={ignoredMissingRefs}
                  onIgnoreMissing={handleIgnoreMissing}
                  onIgnoreAllMissing={handleIgnoreAllMissing}
                  onUnignoreAllMissing={handleUnignoreAllMissing}
                  nodes={nodes}
                  fileErrors={fileErrors}
                  isMobile={isMobile}
                />
              </div>
            )}
            <div className="flex flex-col flex-1 overflow-visible md:overflow-hidden">
              <div className="h-[42vh] min-h-[280px] shrink-0 overflow-hidden md:flex-1 md:h-auto md:min-h-0">
                <Suspense fallback={<EditorSkeleton />}>
                  <YamlEditor
                    value={editorValue}
                    onChange={handleEditorChange}
                    highlightLines={activeFileId === 'main' ? highlightLines : null}
                    language={editorLanguage}
                    parseError={activeFileError}
                  />
                </Suspense>
              </div>
              {showVarsPanel && mode === 'playbook' && viewMode === 'flow' && (
                <PlayVarsPanel
                  yamlText={debouncedPlaybook}
                  plays={plays}
                  userVars={userVars}
                  onUserVarsChange={setUserVars}
                />
              )}
              {showMockPanel && !(mode === 'playbook' && viewMode === 'resolve') && (
                <MockContextPanel facts={facts} onFactsChange={setFacts} />
              )}
            </div>
          </div>
        </div>
        )} {/* end mode !== 'limits' left pane */}

        {mode === 'playbook' && (
          <ResizeHandle
            containerRef={bodyRowRef}
            value={editorWidthPct}
            min={EDITOR_WIDTH_MIN}
            max={EDITOR_WIDTH_MAX}
            onChange={setEditorWidthPct}
            label="Resize editor and flow panels"
          />
        )}

        {/* Right region — a Flow/Resolve tab bar swaps just this region's content */}
        {mode === 'playbook' && (
          <div className="flex w-full flex-col overflow-hidden md:flex-1 md:min-h-0">
            {/* Tab bar (attached to the panel it controls) */}
            <div data-tour="view-tabs" className="flex shrink-0 items-center gap-0.5 border-b border-slate-800 bg-slate-950 px-2">
              {[
                { key: 'flow', label: 'Execution Flow', Icon: GitBranch },
                { key: 'resolve', label: 'Variable Resolver', Icon: Network },
              ].map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => handleSelectView(key)}
                  className={`relative flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors
                    ${viewMode === key ? 'text-cyan-300' : 'text-slate-500 hover:text-slate-300'}`}
                >
                  <Icon size={12} />
                  {label}
                  {key === 'resolve' && projectDetected && <span className="w-1 h-1 rounded-full bg-emerald-400" title="Project detected" />}
                  {viewMode === key && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full bg-cyan-400" />}
                </button>
              ))}
              <div className="flex-1" />
              {playbookCandidates.length > 1 && (
                <Select
                  icon={Layers}
                  value={mainPath}
                  onChange={handleSwitchPlaybook}
                  options={playbookCandidates}
                  getValue={(o) => o.path}
                  getLabel={(o) => o.path}
                />
              )}
            </div>

            {/* Content */}
            {viewMode === 'flow' ? (
              <div ref={flowRowRef} className="flex w-full flex-col overflow-hidden md:flex-1 md:flex-row md:min-h-0">
                <div className="flex shrink-0 flex-col w-full h-[55vh] overflow-hidden border-b border-slate-800 animate-fade-up md:h-auto md:min-h-0 md:flex-1 md:border-b-0" data-tour="flow-pane">
                  <div className="flex-1 overflow-hidden">
                    {nodes.length > 0 ? (
                      <Suspense fallback={<FlowSkeleton />}>
                        <FlowCanvas
                          key={mainPath}
                          nodes={nodes}
                          edges={edges}
                          onNodeClick={handleNodeClick}
                          onExportMermaid={handleExportMermaid}
                          onExportUml={handleExportUml}
                        />
                      </Suspense>
                    ) : (
                      <EmptyFlow parseError={parseError} />
                    )}
                  </div>
                </div>
                <ResizeHandle
                  containerRef={flowRowRef}
                  value={sidebarWidthPct}
                  min={SIDEBAR_WIDTH_MIN}
                  max={SIDEBAR_WIDTH_MAX}
                  onChange={setSidebarWidthPct}
                  label="Resize flow and sidebar panels"
                  reverse
                />
                <div
                  className="flex shrink-0 flex-col w-full h-[38vh] overflow-hidden border-l-0 border-slate-800 animate-fade-up md:h-auto md:min-h-0 md:border-l"
                  style={{ animationDelay: '40ms', ...(!isMobile ? { width: `${sidebarWidthPct}%`, minWidth: '180px' } : {}) }}
                  data-tour="human-sidebar"
                >
                  <HumanSidebar
                    plays={plays}
                    nodes={nodes}
                    selectedNode={selectedNode}
                    projectModel={playbookProjectModel}
                    activePlaybook={activePlaybook}
                    host={host}
                    inventoryData={inventoryData}
                    invPath={invPath}
                    facts={facts}
                    extraVarsLayers={extraVarsLayers}
                    mocks={mocks}
                  />
                </div>
              </div>
            ) : (
              <div className="flex w-full flex-col overflow-hidden h-[80vh] animate-fade-up md:h-auto md:flex-1 md:min-h-0">
                <ResolveView
                  mainPlaybook={debouncedPlaybook}
                  mainPath={mainPath}
                  extraFiles={extraFiles}
                  facts={facts}
                  onFactsChange={setFacts}
                  onUseInFlow={handleUseInFlow}
                  onOpenInJinja2={handleOpenInJinja2}
                  onAddFiles={handleDropFiles}
                  dropProps={dropProps}
                  isDragging={isDragging}
                  isProcessing={isProcessingResolveDrop}
                  dropError={resolveDropError}
                  invPath={invPath}
                  onInvPathChange={setInvPath}
                  host={host}
                  onHostChange={setHost}
                  inventoryData={inventoryData}
                  hosts={hosts}
                  picked={picked}
                  setPicked={setPicked}
                  pairs={pairs}
                  setPairs={setPairs}
                  mocks={mocks}
                  setMocks={setMocks}
                  extraVarsLayers={extraVarsLayers}
                />
              </div>
            )}
          </div>
        )}

        {mode === 'snippet' && (
          <div className="flex-1 shrink-0 h-[42vh] overflow-hidden animate-fade-up md:h-auto md:min-h-0" data-tour="snippet-pane">
            {snippetTask
              ? <QuickCard task={snippetTask} facts={facts} />
              : <EmptyQuickCard onLoadExample={handleLoadSnippetSample} />
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

function EmptyQuickCard({ onLoadExample }) {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 px-8 text-center">
      <FileCode size={34} className="text-slate-600" />
      <div className="max-w-sm space-y-1.5">
        <p className="text-slate-300 text-sm font-mono">Task Snippet decoder</p>
        <p className="text-[11px] font-mono leading-relaxed text-slate-500">
          Paste a single Ansible task — a <code className="text-slate-400">- name:</code> block with a module —
          to see its module, arguments, a plain-English explanation, and live rendering of any
          <code className="text-slate-400"> {'{{ }}'}</code> values.
        </p>
      </div>
      {onLoadExample && (
        <button
          onClick={onLoadExample}
          className="flex items-center gap-2 px-4 py-2 rounded-lg border border-blue-700 bg-blue-950/40 hover:bg-blue-950/70 hover:border-blue-500 text-blue-300 hover:text-blue-200 text-sm font-mono transition-all"
        >
          <FileCode size={14} />
          Load example task
        </button>
      )}
    </div>
  )
}

function EditorSkeleton() {
  return (
    <div className="h-full w-full bg-slate-950 p-4">
      <div className="h-full rounded border border-slate-800 bg-slate-900/70 p-3 animate-pulse">
        <div className="h-3 w-24 rounded bg-slate-700 mb-3" />
        <div className="space-y-2">
          <div className="h-2.5 w-full rounded bg-slate-800" />
          <div className="h-2.5 w-[92%] rounded bg-slate-800" />
          <div className="h-2.5 w-[88%] rounded bg-slate-800" />
          <div className="h-2.5 w-[95%] rounded bg-slate-800" />
          <div className="h-2.5 w-[76%] rounded bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

function FlowSkeleton() {
  return (
    <div className="h-full w-full bg-slate-950 p-4">
      <div className="h-full rounded border border-slate-800 bg-slate-900/70 p-3 animate-pulse">
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="h-14 rounded bg-slate-800" />
          <div className="h-14 rounded bg-slate-800" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="h-12 rounded bg-slate-800" />
          <div className="h-12 rounded bg-slate-800" />
          <div className="h-12 rounded bg-slate-800" />
        </div>
      </div>
    </div>
  )
}

function LandingScreen({
  onPaste,
  onDropFiles,
  onLoadSample,
  onLoadInventorySample,
  onOpenLimits,
  onStartPlaybookTour,
  onOpenAbout,
}) {
  const [dragOver, setDragOver] = useState(false)
  const [isProcessingDrop, setIsProcessingDrop] = useState(false)
  const [dropError, setDropError] = useState(null)
  const dropRef = useRef(null)

  const handleDrop = useCallback(async (e) => {
    e.preventDefault()
    setDragOver(false)
    setDropError(null)
    // Extract dropped folder/zip/files (paths preserved) and let the router
    // decide where to go. Fall back to plain-text drag.
    setIsProcessingDrop(true)
    try {
      const files = await readDataTransferFiles(e.dataTransfer)
      if (files.length > 0) { onDropFiles(files); return }
      const text = e.dataTransfer?.getData('text/plain')
      if (text) { onPaste(text); return }
      setDropError('No readable files found — check the archive isn\'t corrupt or empty.')
    } catch (err) {
      setDropError(`Couldn't read that drop: ${err.message || err}`)
    } finally {
      setIsProcessingDrop(false)
    }
  }, [onDropFiles, onPaste])

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
        {isProcessingDrop ? (
          <Loader2 size={36} className="text-cyan-400 animate-spin" />
        ) : (
          <ClipboardPaste size={36} className="text-slate-600" />
        )}
        <div className="text-center">
          {isProcessingDrop ? (
            <p className="text-cyan-300 font-mono text-sm">Reading project files…</p>
          ) : (
            <>
              <p className="text-white font-mono text-lg font-semibold flex items-center justify-center gap-1.5">
                <span>Press</span>
                <kbd className="inline-block px-2 py-0.5 rounded bg-slate-800 border border-slate-600 text-cyan-400 text-sm font-mono mx-1">Ctrl+V</kbd>
                <span>to paste</span>
              </p>
              <p className="text-slate-500 text-xs font-mono mt-1">
                or drag & drop your YAML, task snippet, project folder, or .zip
              </p>
            </>
          )}
          {dropError && (
            <p className="text-red-400 font-mono text-xs mt-2 flex items-center justify-center gap-1.5 max-w-md">
              <AlertCircle size={12} className="shrink-0" />
              {dropError}
            </p>
          )}
        </div>

        <ImportControls
          onFiles={onDropFiles}
          onError={setDropError}
          onBusyChange={setIsProcessingDrop}
        />

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
