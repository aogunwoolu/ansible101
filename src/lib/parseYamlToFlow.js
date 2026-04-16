/**
 * parseYamlToFlow.js
 * Converts a js-yaml parsed Ansible playbook object into
 * ReactFlow nodes and edges using the Cyber-Blueprint theme.
 */
import { evaluateWhen } from './jinja2Engine'

let nodeId = 0
const nextId = () => `n${++nodeId}`

const X_BASE = 300
const TASK_WIDTH = 260
const TASK_HEIGHT = 60
const DIAMOND_SIZE = 80
const COL_GAP = 180   // horizontal spacing for True/False branches
const ROW_GAP = 40    // vertical gap between nodes

/**
 * Derive a display label from a task object.
 * Uses task.name, otherwise the first recognised module key.
 */
export function getTaskLabel(task) {
  if (task.name) return task.name
  const moduleKeys = [
    'apt', 'yum', 'dnf', 'pip', 'copy', 'template', 'file',
    'service', 'systemd', 'shell', 'command', 'debug',
    'lineinfile', 'replace', 'fetch', 'get_url', 'uri',
    'user', 'group', 'cron', 'include_tasks', 'import_tasks',
    'block', 'set_fact', 'fail', 'assert', 'wait_for',
  ]
  for (const k of moduleKeys) {
    if (task[k] !== undefined) return `[${k}]`
  }
  return 'Task'
}

/**
 * Detect the primary module used by a task.
 */
export function getModuleName(task) {
  const moduleKeys = [
    'apt', 'yum', 'dnf', 'pip', 'copy', 'template', 'file',
    'service', 'systemd', 'shell', 'command', 'debug',
    'lineinfile', 'replace', 'fetch', 'get_url', 'uri',
    'user', 'group', 'cron', 'include_tasks', 'import_tasks',
    'block', 'set_fact', 'fail', 'assert', 'wait_for',
  ]
  for (const k of moduleKeys) {
    if (task[k] !== undefined) return k
  }
  return null
}

/**
 * Core function: parse a full Ansible playbook (array of plays)
 * into { nodes, edges, lineMap }.
 *
 * lineMap: Map<nodeId, lineNumber> used for sync-highlight.
 */
export function parsePlaybook(plays, rawYaml, facts = {}) {
  nodeId = 0
  const nodes = []
  const edges = []
  const lineMap = new Map()   // nodeId -> {start, end} lines in raw YAML

  if (!Array.isArray(plays)) return { nodes, edges, lineMap }

  let globalY = 20

  plays.forEach((play, playIndex) => {
    // ── Play header node ──────────────────────────────────────────
    const playId = nextId()
    const playLabel = play.name || play.hosts || `Play ${playIndex + 1}`
    nodes.push({
      id: playId,
      type: 'playNode',
      position: { x: X_BASE, y: globalY },
      data: { label: playLabel, hosts: play.hosts },
    })
    globalY += 70 + ROW_GAP

    let prevId = playId

    // ── Tasks ─────────────────────────────────────────────────────
    const tasks = play.tasks || play.pre_tasks || []
    const handlers = play.handlers || []

    const handlerNodes = []   // collect handler nodes to place at bottom

    tasks.forEach((task) => {
      const hasWhen = task.when !== undefined
      const hasLoop = task.loop !== undefined || task.with_items !== undefined
      const hasNotify = task.notify !== undefined

      let taskEntryId   // the id that previous node should connect to
      let taskExitId    // the id the next node should connect from

      if (hasWhen) {
        // Evaluate when condition against mock facts for dry-run
        const whenConditions = Array.isArray(task.when) ? task.when : [task.when]
        const whenVal = whenConditions.join(' AND ')
        // All conditions must be true
        const condResult = whenConditions.every((cond) => evaluateWhen(cond, facts).value)
        const DIM = condResult ? 1 : 0.35   // opacity for dry-run

        // Diamond decision node
        const diamondId = nextId()
        nodes.push({
          id: diamondId,
          type: 'conditionalNode',
          position: { x: X_BASE, y: globalY },
          data: { label: `when: ${whenVal}`, condResult },
          style: { opacity: DIM },
        })
        edges.push({ id: `e${prevId}-${diamondId}`, source: prevId, target: diamondId, type: 'default' })
        globalY += DIAMOND_SIZE + ROW_GAP

        // Task node (True branch — offset right)
        const trueId = nextId()
        const module = getModuleName(task)
        nodes.push({
          id: trueId,
          type: hasLoop ? 'loopNode' : 'taskNode',
          position: { x: X_BASE + COL_GAP, y: globalY },
          data: { label: getTaskLabel(task), module, task, dimmed: !condResult },
          style: { opacity: condResult ? 1 : 0.35 },
        })
        edges.push({
          id: `e${diamondId}-true-${trueId}`,
          source: diamondId,
          sourceHandle: 'true',
          target: trueId,
          label: 'True',
          type: 'smoothstep',
          style: { stroke: condResult ? '#4ade80' : '#4ade8066' },
          labelStyle: { fill: condResult ? '#4ade80' : '#4ade8066', fontFamily: 'monospace', fontSize: 11 },
        })

        // Skip node (False branch — offset left)
        const skipId = nextId()
        nodes.push({
          id: skipId,
          type: 'skipNode',
          position: { x: X_BASE - COL_GAP, y: globalY },
          data: { label: 'Skip', active: !condResult },
          style: { opacity: condResult ? 0.35 : 1 },
        })
        edges.push({
          id: `e${diamondId}-false-${skipId}`,
          source: diamondId,
          sourceHandle: 'false',
          target: skipId,
          label: 'False',
          type: 'smoothstep',
          style: { stroke: !condResult ? '#f87171' : '#f8717166' },
          labelStyle: { fill: !condResult ? '#f87171' : '#f8717166', fontFamily: 'monospace', fontSize: 11 },
        })

        globalY += TASK_HEIGHT + ROW_GAP

        // Merge node
        const mergeId = nextId()
        nodes.push({
          id: mergeId,
          type: 'mergeNode',
          position: { x: X_BASE, y: globalY },
          data: {},
        })
        edges.push({ id: `e${trueId}-${mergeId}`, source: trueId, target: mergeId })
        edges.push({ id: `e${skipId}-${mergeId}`, source: skipId, target: mergeId })
        globalY += 30 + ROW_GAP

        taskEntryId = diamondId
        taskExitId = mergeId
      } else {
        // Plain task node
        const tId = nextId()
        const module = getModuleName(task)
        nodes.push({
          id: tId,
          type: hasLoop ? 'loopNode' : 'taskNode',
          position: { x: X_BASE, y: globalY },
          data: { label: getTaskLabel(task), module, task },
        })
        edges.push({ id: `e${prevId}-${tId}`, source: prevId, target: tId })
        globalY += TASK_HEIGHT + ROW_GAP

        taskEntryId = tId
        taskExitId = tId
      }

      // ── Notify / Handler dashed edge ───────────────────────────
      if (hasNotify) {
        const notifyList = Array.isArray(task.notify) ? task.notify : [task.notify]
        notifyList.forEach((handlerName) => {
          // Handler placeholder node (real handler nodes placed below)
          const hId = nextId()
          handlerNodes.push({ id: hId, name: handlerName, x: X_BASE + 420, y: globalY - TASK_HEIGHT - ROW_GAP })
          nodes.push({
            id: hId,
            type: 'handlerNode',
            position: { x: X_BASE + 420, y: globalY - TASK_HEIGHT - ROW_GAP },
            data: { label: handlerName },
          })
          edges.push({
            id: `e${taskExitId}-handler-${hId}`,
            source: taskExitId,
            sourceHandle: null,
            target: hId,
            type: 'smoothstep',
            animated: false,
            style: { strokeDasharray: '6,3', stroke: '#fbbf24', strokeWidth: 1.5 },
            label: 'notify',
            labelStyle: { fill: '#fbbf24', fontFamily: 'monospace', fontSize: 10 },
            zIndex: 10,
          })
        })
      }

      prevId = taskExitId
    })

    // ── Handlers section ──────────────────────────────────────────
    if (handlers.length > 0) {
      const hSectionId = nextId()
      nodes.push({
        id: hSectionId,
        type: 'sectionNode',
        position: { x: X_BASE, y: globalY },
        data: { label: 'Handlers' },
      })
      globalY += 50 + ROW_GAP

      handlers.forEach((handler) => {
        const hId = nextId()
        nodes.push({
          id: hId,
          type: 'handlerNode',
          position: { x: X_BASE, y: globalY },
          data: { label: handler.name || handler.listen || 'Handler', task: handler },
        })
        edges.push({
          id: `e${hSectionId}-${hId}`,
          source: hSectionId,
          target: hId,
          type: 'default',
          style: { strokeDasharray: '6,3', stroke: '#fbbf24', strokeWidth: 1.5 },
        })
        globalY += TASK_HEIGHT + ROW_GAP
      })
    }

    globalY += 60  // gap between plays
  })

  return { nodes, edges, lineMap }
}
