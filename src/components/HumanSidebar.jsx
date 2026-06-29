/**
 * HumanSidebar.jsx
 * Right panel — shows human-readable explanations for the
 * selected node (or all tasks if nothing is selected).
 */
import React, { useState } from 'react'
import {
  Package, Terminal, FileCog, Activity, RefreshCw,
  Bell, HelpCircle, AlertTriangle, Info, Zap,
  FileText, Globe, DownloadCloud, Download, Bug,
  Clock, GitMerge, User, Copy, Folder, FolderOpen, FileQuestion,
  ExternalLink, ChevronDown, ChevronRight, Code2,
} from 'lucide-react'
import jsyaml from 'js-yaml'
import { generateExplanation, generatePlaySummary } from '../lib/humanSpeak'
import { resolveHostVars, LEVEL_LABEL } from '../lib/precedence'
import { renderJinja2 } from '../lib/jinja2Engine'

// Same {{ var }} / when-expression pattern precedence.js's collectReferencedVars
// uses, scoped to just the selected task instead of the whole project.
const VAR_REF_RE = /\{\{[\s-]*([a-zA-Z_]\w*)|(?:if|elif|when|for\s+\w+\s+in)\s+([a-zA-Z_]\w*)/g
function referencedVarsInTask(task) {
  const found = new Set()
  let blob
  try { blob = JSON.stringify(task) } catch { return found }
  let m
  VAR_REF_RE.lastIndex = 0
  while ((m = VAR_REF_RE.exec(blob)) !== null) {
    const n = m[1] || m[2]
    if (n) found.add(n)
  }
  return found
}

function formatVarValue(value) {
  if (value === undefined) return '⟨undefined⟩'
  if (typeof value === 'string') return value
  try { return JSON.stringify(value) } catch { return String(value) }
}

function contextFromResolution(resolution) {
  const ctx = {}
  if (resolution) for (const [k, info] of Object.entries(resolution.vars)) ctx[k] = info.winner.value
  return ctx
}

/** Render `{{ expr }}` against a resolution's winning values. Returns the
 *  rendered string, or null if it didn't fully resolve (still has template
 *  syntax left, or errored). */
function tryRenderExpr(expr, resolution) {
  if (!resolution) return null
  const { result, error } = renderJinja2(expr, contextFromResolution(resolution))
  if (error || result === undefined || result === null) return null
  if (/\{\{|\{%/.test(result)) return null
  return result
}

const TEMPLATE_EXPR_RE = /\{\{[\s\S]*?\}\}/g

/** Splits explanation text on `{{ ... }}` and annotates each with its
 *  resolved value at this step — "{{ app_port }} → 8080" — instead of
 *  leaving the raw expression to be explained separately below. */
function annotateTemplates(text, resolution, fullResolution) {
  if (!text || !resolution) return text
  const nodes = []
  let last = 0
  let m
  TEMPLATE_EXPR_RE.lastIndex = 0
  while ((m = TEMPLATE_EXPR_RE.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const expr = m[0]
    const atStage = tryRenderExpr(expr, resolution)
    const atFull = atStage === null ? tryRenderExpr(expr, fullResolution) : null
    nodes.push(
      <span key={m.index} className="whitespace-nowrap">
        <span className="text-slate-400">{expr}</span>
        {atStage !== null ? (
          <span className="text-emerald-300"> → {atStage}</span>
        ) : atFull !== null ? (
          <span className="text-orange-400/80 italic"> → not set yet</span>
        ) : (
          <span className="text-red-400/70 italic"> → never resolves</span>
        )}
      </span>,
    )
    last = TEMPLATE_EXPR_RE.lastIndex
  }
  nodes.push(text.slice(last))
  return nodes
}

const ICON_MAP = {
  package: Package,
  terminal: Terminal,
  'file-code': FileCog,
  activity: Activity,
  refresh: RefreshCw,
  bell: Bell,
  'file-text': FileText,
  globe: Globe,
  'download-cloud': DownloadCloud,
  download: Download,
  bug: Bug,
  clock: Clock,
  'git-merge': GitMerge,
  user: User,
  copy: Copy,
  folder: Folder,
  zap: Zap,
  'help-circle': HelpCircle,
  variable: Zap,
}

function LucideIcon({ name, size = 16, className = '' }) {
  const Icon = ICON_MAP[name] || HelpCircle
  return <Icon size={size} className={className} />
}

function TaskSnippet({ task }) {
  const yaml = React.useMemo(() => {
    try {
      return jsyaml.dump([task], { indent: 2, lineWidth: -1, noRefs: true }).trim()
    } catch {
      return null
    }
  }, [task])
  if (!yaml) return null
  return (
    <pre className="mt-2 rounded bg-slate-950 border border-slate-700 p-2 text-[10px] font-mono text-slate-400 leading-relaxed overflow-x-auto whitespace-pre">{yaml}</pre>
  )
}

function ExplanationCard({
  task, isSelected, stage, host, projectModel, activePlaybook, inventoryData, invPath, facts, extraVarsLayers, mocks,
}) {
  if (!task) return null
  const [showSnippet, setShowSnippet] = useState(false)
  const { text, warning, icon, docUrl } = generateExplanation(task)

  const referencedNames = React.useMemo(() => referencedVarsInTask(task), [task])
  const hasHostCtx = Boolean(host && projectModel && activePlaybook) && referencedNames.size > 0

  // Stage-limited (what this task would actually see) vs. full resolution
  // (would it EVER resolve for this host) — lets us tell "not set yet" apart
  // from "this variable never resolves for the selected host" (e.g. the
  // owning play's `hosts:` pattern doesn't match the current host at all).
  const resolution = React.useMemo(() => {
    if (!hasHostCtx) return null
    return resolveHostVars(host, {
      projectModel, inventoryData, inventoryPath: invPath || '(synthetic)', activePlaybook,
      facts, stopAtStage: stage, extraVarsLayers, runtimeMocks: mocks,
    })
  }, [hasHostCtx, host, projectModel, activePlaybook, inventoryData, invPath, facts, stage, extraVarsLayers, mocks])

  const fullResolution = React.useMemo(() => {
    if (!hasHostCtx) return null
    return resolveHostVars(host, {
      projectModel, inventoryData, inventoryPath: invPath || '(synthetic)', activePlaybook,
      facts, extraVarsLayers, runtimeMocks: mocks,
    })
  }, [hasHostCtx, host, projectModel, activePlaybook, inventoryData, invPath, facts, extraVarsLayers, mocks])

  // Names already annotated inline in the explanation text (e.g. "{{ app_port }}
  // → 8080" right there in the sentence) — don't repeat them below too.
  const inlineNames = React.useMemo(() => {
    const found = new Set()
    const re = /\{\{[\s-]*([a-zA-Z_]\w*)/g
    let m
    while ((m = re.exec(text)) !== null) found.add(m[1])
    return found
  }, [text])
  const footerNames = [...referencedNames].filter((n) => !inlineNames.has(n))

  return (
    <div
      className={`rounded border p-3 mb-3 transition-all
        ${isSelected
          ? 'border-cyan-500 bg-slate-800 shadow-[0_0_8px_#22d3ee44]'
          : 'border-slate-700 bg-slate-900'
        }`}
    >
      {/* Task name */}
      {task.name && (
        <div className="text-cyan-400 text-xs font-mono font-semibold mb-1 break-words">
          {task.name}
        </div>
      )}
      {/* Explanation — {{ expr }} references are annotated inline with their
          resolved value at this step, rather than only listed separately below. */}
      <div className="flex items-start gap-2">
        <LucideIcon name={icon} size={14} className="text-slate-400 mt-0.5 shrink-0" />
        <p className="text-slate-200 text-xs leading-relaxed">
          {resolution ? annotateTemplates(text, resolution, fullResolution) : text}
        </p>
      </div>
      {/* Conditionals */}
      {task.when && (
        <div className="mt-2 flex items-center gap-1 text-amber-400 text-xs font-mono">
          <Info size={11} />
          <span className="min-w-0 break-all">Condition: <span className="text-amber-300">{Array.isArray(task.when) ? task.when.join(' AND ') : task.when}</span></span>
        </div>
      )}
      {/* Loops */}
      {(task.loop || task.with_items) && (
        <div className="mt-1 flex items-center gap-1 text-violet-400 text-xs font-mono">
          <RefreshCw size={11} />
          <span>Loops over {(task.loop || task.with_items).length ?? '?'} item(s).</span>
        </div>
      )}
      {/* Notify */}
      {task.notify && (
        <div className="mt-1 flex items-center gap-1 text-amber-300 text-xs font-mono">
          <Bell size={11} />
          <span className="min-w-0 break-all">Notifies: {Array.isArray(task.notify) ? task.notify.join(', ') : task.notify}</span>
        </div>
      )}
      {/* Warning */}
      {warning && (
        <div className="mt-2 flex items-start gap-2 rounded bg-amber-950 border border-amber-700 p-2">
          <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-amber-300 text-xs leading-relaxed">{warning}</p>
        </div>
      )}
      {/* Variables referenced by this task but NOT already shown inline above
          (e.g. used in a loop/when expression rather than the explanation text) */}
      {resolution && footerNames.length > 0 && (
        <div className="mt-2 pt-2 border-t border-slate-700/60">
          <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1.5">
            Also referenced
          </div>
          <div className="flex flex-col gap-1">
            {footerNames.sort().map((name) => {
              const info = resolution.vars[name]
              const fullInfo = fullResolution?.vars[name]
              return (
                <div key={name} className="flex items-start gap-2 text-xs font-mono">
                  <span className="text-cyan-300 shrink-0">{name}</span>
                  {info ? (
                    <>
                      <span className="text-slate-300 break-all min-w-0">{formatVarValue(info.winner.value)}</span>
                      <span
                        title={LEVEL_LABEL[info.winner.level]}
                        className="ml-auto shrink-0 text-[9px] px-1 py-px rounded bg-slate-800 border border-slate-700 text-slate-500"
                      >
                        L{info.winner.level}
                      </span>
                    </>
                  ) : fullInfo ? (
                    <span className="text-orange-400/80 italic">not set yet at this point</span>
                  ) : (
                    <span className="text-red-400/70 italic" title="No source (role defaults, group/host vars, play vars, set_fact, etc.) defines this for the selected host">
                      never resolves for this host
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
      {/* Bottom row: snippet toggle + docs link */}
      <div className="mt-2 flex items-center gap-3">
        <button
          onClick={() => setShowSnippet(v => !v)}
          className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-slate-300 transition-colors"
        >
          {showSnippet ? <ChevronDown size={9} /> : <ChevronRight size={9} />}
          <Code2 size={9} />
          yaml
        </button>
        {docUrl && (
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <ExternalLink size={9} />
            ansible docs
          </a>
        )}
      </div>
      {showSnippet && <TaskSnippet task={task} />}
    </div>
  )
}

export default function HumanSidebar({
  plays, nodes, selectedNode, projectModel, activePlaybook, host, inventoryData, invPath, facts, extraVarsLayers, mocks,
}) {
  const selectedNodeData = selectedNode?.data
  const selectedNodeType = selectedNode?.type
  // Built from the Flow graph's own nodes (not re-derived from `plays`) so
  // every real task — including ones inside roles/includes — carries the
  // same `stage` Flow assigned it, for incremental variable resolution.
  const taskNodes = nodes?.filter((n) => n.data?.task) ?? []
  const resolveCtx = { host, projectModel, activePlaybook, inventoryData, invPath, facts, extraVarsLayers, mocks }

  // If no play's `hosts:` pattern matches the selected host at all, every
  // variable card below will read as unresolved — say so once, up front,
  // instead of leaving it to look like a stage-tracking bug.
  const hostTargetsNoPlay = React.useMemo(() => {
    if (!host || !projectModel || !activePlaybook) return false
    const full = resolveHostVars(host, { projectModel, inventoryData, inventoryPath: invPath || '(synthetic)', activePlaybook, facts })
    return full.plays.length === 0
  }, [host, projectModel, activePlaybook, inventoryData, invPath, facts])

  return (
    <aside className="h-full flex flex-col bg-slate-900 border-l border-slate-700">
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2 shrink-0">
        <FileText size={15} className="text-cyan-400" />
        <span className="text-cyan-400 text-xs font-mono font-semibold uppercase tracking-widest">
          Human Logic
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {hostTargetsNoPlay && <HostMismatchBanner host={host} />}

        {/* Play summaries */}
        {plays && plays.length > 0 && (
          <div className="mb-4">
            {plays.map((play, i) => {
              const { stats, summary } = generatePlaySummary(play)
              return (
                <div key={i} className="mb-3 rounded border border-blue-800 bg-blue-950 p-3">
                  <div className="text-blue-300 text-xs font-mono font-semibold mb-1">
                    Play: {play.name || play.hosts || `Play ${i + 1}`}
                  </div>
                  {summary && (
                    <p className="text-slate-200 text-xs leading-relaxed mb-1">{summary}</p>
                  )}
                  <p className="text-slate-400 text-[10px] leading-relaxed">{stats}</p>
                </div>
              )
            })}
          </div>
        )}

        {/* Selected node explanation */}
        {selectedNodeType === 'missingFileNode' && (
          <MissingFileCard data={selectedNodeData} />
        )}
        {selectedNodeType === 'includeNode' && (
          <IncludeCard filename={selectedNodeData?.label} />
        )}
        {selectedNodeType !== 'missingFileNode' && selectedNodeType !== 'includeNode' && selectedNodeData?.task ? (
          <>
            <div className="text-slate-500 text-xs font-mono mb-2 uppercase tracking-wider">
              Selected Task
            </div>
            <ExplanationCard task={selectedNodeData.task} stage={selectedNodeData.stage} isSelected {...resolveCtx} />
          </>
        ) : selectedNodeType !== 'missingFileNode' && selectedNodeType !== 'includeNode' && !selectedNodeData?.task ? (
          <>
            <div className="text-slate-500 text-xs font-mono mb-2 uppercase tracking-wider">
              All Tasks
            </div>
            {taskNodes.length === 0 && (
              <p className="text-slate-600 text-xs italic">
                Write or paste an Ansible playbook in the editor to see explanations here.
              </p>
            )}
            {taskNodes.map((n) => (
              <ExplanationCard key={n.id} task={n.data.task} stage={n.data.stage} isSelected={false} {...resolveCtx} />
            ))}
          </>
        ) : null}
      </div>
    </aside>
  )
}

function HostMismatchBanner({ host }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mb-4 rounded border border-orange-700 bg-orange-950/40">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-orange-300 text-[11px] font-mono font-semibold text-left"
      >
        {expanded ? <ChevronDown size={10} className="shrink-0" /> : <ChevronRight size={10} className="shrink-0" />}
        <AlertTriangle size={12} className="shrink-0" />
        <span className="truncate">Host &quot;{host}&quot; isn&apos;t targeted by any play</span>
      </button>
      {expanded && (
        <p className="text-orange-200/80 text-xs leading-relaxed px-2.5 pb-2.5">
          None of this playbook&apos;s plays match the selected host&apos;s groups — in real Ansible
          this play would never run against it. Variable values below are shown as a
          best-effort fallback (play/role vars, not host-specific group_vars/host_vars); switch
          the host or inventory in the Variable Resolver tab to verify for real.
        </p>
      )}
    </div>
  )
}

function MissingFileCard({ data }) {
  const filename = data?.label
  const sourceFile = data?.sourceFile

  if (data?.dynamic) {
    return (
      <div className="rounded border-2 border-dashed border-orange-700 bg-orange-950 p-3 mb-3">
        <div className="flex items-center gap-2 mb-2">
          <FileQuestion size={14} className="text-orange-400" />
          <span className="text-orange-300 text-xs font-mono font-semibold uppercase tracking-wide">Dynamic Include</span>
        </div>
        <p className="text-slate-300 text-xs leading-relaxed mb-1">
          This target is computed from a Jinja2 expression{sourceFile ? <> in <span className="text-cyan-300 font-mono break-all">{sourceFile}</span></> : null}, so it depends on runtime facts/variables and can&apos;t be resolved statically:
        </p>
        <div className="mt-2 rounded bg-slate-900 border border-orange-800 px-2 py-1.5 font-mono text-orange-300 text-xs break-all select-all">
          {filename}
        </div>
        <p className="text-slate-500 text-[10px] mt-2">
          Add the actual file(s) it could resolve to (e.g. one per OS family) so each can be expanded individually.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded border-2 border-dashed border-orange-700 bg-orange-950 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <FileQuestion size={14} className="text-orange-400" />
        <span className="text-orange-300 text-xs font-mono font-semibold uppercase tracking-wide">Unresolved Include</span>
      </div>
      <p className="text-slate-300 text-xs leading-relaxed mb-3">
        This task includes an external file that hasn't been added to the workspace yet
        {sourceFile ? <> (referenced from <span className="text-cyan-300 font-mono break-all">{sourceFile}</span>)</> : null}.
      </p>
      <div className="rounded bg-slate-900 border border-slate-700 px-3 py-2">
        <div className="text-slate-500 text-[10px] font-mono uppercase tracking-wider mb-1">To expand this node:</div>
        <ol className="text-slate-300 text-xs space-y-1 list-decimal list-inside">
          <li>Click <span className="text-cyan-400 font-mono">+ add file</span> above the editor</li>
          <li>Double-click the new tab and rename it to exactly:</li>
        </ol>
        <div className="mt-2 rounded bg-slate-800 border border-orange-800 px-2 py-1.5 font-mono text-orange-300 text-xs break-all select-all">
          {filename}
        </div>
        <p className="text-slate-500 text-[10px] mt-2">Then paste your task list into that file's editor.</p>
      </div>
    </div>
  )
}

function IncludeCard({ filename }) {
  return (
    <div className="rounded border border-teal-700 bg-teal-950 p-3 mb-3">
      <div className="flex items-center gap-2 mb-1">
        <FolderOpen size={14} className="text-teal-400" />
        <span className="text-teal-300 text-xs font-mono font-semibold uppercase tracking-wide">Included File</span>
      </div>
      <p className="text-slate-300 text-xs leading-relaxed">
        Tasks are being loaded from <span className="text-teal-300 font-mono break-all">{filename}</span>. The nodes below this card show the expanded contents.
      </p>
    </div>
  )
}
