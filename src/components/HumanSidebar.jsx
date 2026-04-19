/**
 * HumanSidebar.jsx
 * Right panel — shows human-readable explanations for the
 * selected node (or all tasks if nothing is selected).
 */
import React from 'react'
import {
  Package, Terminal, FileCog, Activity, RefreshCw,
  Bell, HelpCircle, AlertTriangle, Info, Zap,
  FileText, Globe, DownloadCloud, Download, Bug,
  Clock, GitMerge, User, Copy, Folder, FolderOpen, FileQuestion,
} from 'lucide-react'
import { generateExplanation, generatePlaySummary } from '../lib/humanSpeak'

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

function ExplanationCard({ task, isSelected }) {
  if (!task) return null
  const { text, warning, icon } = generateExplanation(task)

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
        <div className="text-cyan-400 text-xs font-mono font-semibold mb-1 truncate">
          {task.name}
        </div>
      )}
      {/* Explanation */}
      <div className="flex items-start gap-2">
        <LucideIcon name={icon} size={14} className="text-slate-400 mt-0.5 shrink-0" />
        <p className="text-slate-200 text-xs leading-relaxed">{text}</p>
      </div>
      {/* Conditionals */}
      {task.when && (
        <div className="mt-2 flex items-center gap-1 text-amber-400 text-xs font-mono">
          <Info size={11} />
          <span>Condition: <span className="text-amber-300">{Array.isArray(task.when) ? task.when.join(' AND ') : task.when}</span></span>
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
          <span>Notifies: {Array.isArray(task.notify) ? task.notify.join(', ') : task.notify}</span>
        </div>
      )}
      {/* Warning */}
      {warning && (
        <div className="mt-2 flex items-start gap-2 rounded bg-amber-950 border border-amber-700 p-2">
          <AlertTriangle size={13} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-amber-300 text-xs leading-relaxed">{warning}</p>
        </div>
      )}
    </div>
  )
}

export default function HumanSidebar({ plays, selectedNode }) {
  const selectedNodeData = selectedNode?.data
  const selectedNodeType = selectedNode?.type
  const allTasks = plays?.flatMap((p) => [
    ...(p.pre_tasks || []),
    ...(p.tasks || []),
    ...(p.post_tasks || []),
  ]) ?? []

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
        {/* Play summaries */}
        {plays && plays.length > 0 && (
          <div className="mb-4">
            {plays.map((play, i) => (
              <div key={i} className="mb-3 rounded border border-blue-800 bg-blue-950 p-3">
                <div className="text-blue-300 text-xs font-mono font-semibold mb-1">
                  Play: {play.name || play.hosts || `Play ${i + 1}`}
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  {generatePlaySummary(play)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Selected node explanation */}
        {selectedNodeType === 'missingFileNode' && (
          <MissingFileCard filename={selectedNodeData?.label} />
        )}
        {selectedNodeType === 'includeNode' && (
          <IncludeCard filename={selectedNodeData?.label} />
        )}
        {selectedNodeType !== 'missingFileNode' && selectedNodeType !== 'includeNode' && selectedNodeData?.task ? (
          <>
            <div className="text-slate-500 text-xs font-mono mb-2 uppercase tracking-wider">
              Selected Task
            </div>
            <ExplanationCard task={selectedNodeData.task} isSelected />
          </>
        ) : selectedNodeType !== 'missingFileNode' && selectedNodeType !== 'includeNode' && !selectedNodeData?.task ? (
          <>
            <div className="text-slate-500 text-xs font-mono mb-2 uppercase tracking-wider">
              All Tasks
            </div>
            {allTasks.length === 0 && (
              <p className="text-slate-600 text-xs italic">
                Write or paste an Ansible playbook in the editor to see explanations here.
              </p>
            )}
            {allTasks.map((task, i) => (
              <ExplanationCard key={i} task={task} isSelected={false} />
            ))}
          </>
        ) : null}
      </div>
    </aside>
  )
}

function MissingFileCard({ filename }) {
  return (
    <div className="rounded border-2 border-dashed border-orange-700 bg-orange-950 p-3 mb-3">
      <div className="flex items-center gap-2 mb-2">
        <FileQuestion size={14} className="text-orange-400" />
        <span className="text-orange-300 text-xs font-mono font-semibold uppercase tracking-wide">Unresolved Include</span>
      </div>
      <p className="text-slate-300 text-xs leading-relaxed mb-3">
        This task includes an external file that hasn't been added to the workspace yet.
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
        Tasks are being loaded from <span className="text-teal-300 font-mono">{filename}</span>. The nodes below this card show the expanded contents.
      </p>
    </div>
  )
}
