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
  Clock, GitMerge, User, Copy, Folder,
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

export default function HumanSidebar({ plays, selectedNodeData }) {
  const allTasks = plays?.flatMap((p) => p.tasks || []) ?? []

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
        {selectedNodeData?.task ? (
          <>
            <div className="text-slate-500 text-xs font-mono mb-2 uppercase tracking-wider">
              Selected Task
            </div>
            <ExplanationCard task={selectedNodeData.task} isSelected />
          </>
        ) : (
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
        )}
      </div>
    </aside>
  )
}
