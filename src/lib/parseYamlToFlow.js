/**
 * parseYamlToFlow.js
 * Converts a js-yaml parsed Ansible playbook object into
 * ReactFlow nodes and edges using the Cyber-Blueprint theme.
 *
 * Supports multi-file resolution: pass a fileRegistry object
 * ({ [filename]: Task[] }) to expand include_tasks, import_tasks,
 * and roles inline in the flow.
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
 * Normalise a task object so Fully-Qualified Collection Name (FQCN) keys
 * like `ansible.builtin.include_tasks` are aliased to their short form.
 * Returns a shallow copy — the original is never mutated.
 */
function normaliseFqcn(task) {
  // An FQCN looks like namespace.collection.module_name (at least 2 dots).
  // Strip everything up to and including the last dot to get the short name.
  // e.g. ansible.builtin.include_tasks → include_tasks
  //      community.general.apt_rpm     → apt_rpm
  //      amazon.aws.ec2_instance       → ec2_instance
  const aliases = {}
  for (const key of Object.keys(task)) {
    const dots = key.split('.').length - 1
    if (dots >= 2) {
      const shortKey = key.slice(key.lastIndexOf('.') + 1)
      if (shortKey && !(shortKey in task) && !(shortKey in aliases)) {
        aliases[shortKey] = task[key]
      }
    }
  }
  return Object.keys(aliases).length > 0 ? { ...task, ...aliases } : task
}

/**
 * Derive a display label from a task object.
 * Uses task.name, otherwise the first recognised module key.
 */
export function getTaskLabel(task) {
  const t = normaliseFqcn(task)
  if (t.name) return t.name
  const moduleKeys = [
    'apt', 'yum', 'dnf', 'pip', 'copy', 'template', 'file',
    'service', 'systemd', 'shell', 'command', 'debug',
    'lineinfile', 'replace', 'fetch', 'get_url', 'uri',
    'user', 'group', 'cron', 'include_tasks', 'import_tasks',
    'block', 'set_fact', 'fail', 'assert', 'wait_for',
  ]
  for (const k of moduleKeys) {
    if (t[k] !== undefined) return `[${k}]`
  }
  return 'Task'
}

/**
 * Detect the primary module used by a task.
 */
export function getModuleName(task) {
  const t = normaliseFqcn(task)
  const moduleKeys = [
    'apt', 'yum', 'dnf', 'pip', 'copy', 'template', 'file',
    'service', 'systemd', 'shell', 'command', 'debug',
    'lineinfile', 'replace', 'fetch', 'get_url', 'uri',
    'user', 'group', 'cron', 'include_tasks', 'import_tasks',
    'block', 'set_fact', 'fail', 'assert', 'wait_for',
  ]
  for (const k of moduleKeys) {
    if (t[k] !== undefined) return k
  }
  return null
}

const GROUP_PAD = 14  // padding around grouped child tasks

/**
 * Process a list of tasks, appending nodes/edges.
 * Returns { prevId, globalY } for chaining.
 *
 * ctx: { facts, fileRegistry } — evaluation context.
 * depth: prevents infinite recursion when includes reference each other.
 * xOffset: horizontal shift from X_BASE (used for nested indentation).
 */
function processTaskList(tasks, nodes, edges, prevId, globalY, ctx, depth = 0) {
  const { facts, fileRegistry, xOffset = 0 } = ctx
  const X = X_BASE + xOffset

  tasks.forEach((rawTask) => {
    const task = normaliseFqcn(rawTask)
    // ── include_tasks / import_tasks ──────────────────────────────
    const includeKey = task.include_tasks !== undefined ? 'include_tasks'
      : task.import_tasks !== undefined ? 'import_tasks' : null

    if (includeKey) {
      const rawVal = task[includeKey]
      // Support string shorthand and {file:} / {name:} dict forms
      const filename = typeof rawVal === 'string' ? rawVal
        : (rawVal?.file ?? rawVal?.name ?? String(rawVal))
      const resolvedTasks = filename ? fileRegistry[filename] : null

      if (resolvedTasks && depth < 2) {
        // --- Resolved include: group header + background container ---
        globalY += ROW_GAP  // extra spacing before group
        const groupWidth = TASK_WIDTH + GROUP_PAD * 2
        const incId = nextId()
        const headerY = globalY
        const childStartY = headerY + 56 + ROW_GAP
        // Centre children within the box (left/right padding = GROUP_PAD)
        const childXOffset = xOffset + GROUP_PAD

        // Collect children in temp buffers so we know the height before inserting
        const tempNodes = []
        const tempEdges = []
        const res = processTaskList(
          resolvedTasks, tempNodes, tempEdges, incId, childStartY, { ...ctx, xOffset: childXOffset }, depth + 1
        )
        const childEndY = res.globalY

        // 1. Include header — aligned with regular task nodes
        nodes.push({
          id: incId,
          type: 'includeNode',
          position: { x: X, y: headerY },
          style: { width: groupWidth },
          data: { label: filename, taskCount: resolvedTasks.length },
        })
        edges.push({ id: `e${prevId}-${incId}`, source: prevId, target: incId })

        // 2. Background group container (inserted before children → renders behind)
        const bgId = nextId()
        nodes.push({
          id: bgId,
          type: 'groupBgNode',
          position: { x: X, y: headerY + 52 },
          style: {
            width: groupWidth,
            height: Math.max(childEndY - childStartY + GROUP_PAD * 2, 40),
            zIndex: -1,
            pointerEvents: 'none',
          },
          data: {},
          selectable: false,
          draggable: false,
        })

        // 3. Push children after background
        nodes.push(...tempNodes)
        edges.push(...tempEdges)

        prevId = res.prevId
        globalY = res.globalY + ROW_GAP  // extra spacing after group
      } else {
        // Unresolved — placeholder prompting user to add the file
        const missId = nextId()
        nodes.push({
          id: missId,
          type: 'missingFileNode',
          position: { x: X, y: globalY },
          data: { label: filename || '(unknown)' },
        })
        edges.push({ id: `e${prevId}-${missId}`, source: prevId, target: missId })
        globalY += TASK_HEIGHT + ROW_GAP
        prevId = missId
      }
      return
    }

    // ── Normal task ──────────────────────────────────────────────
    const hasWhen = task.when !== undefined
    const hasLoop = task.loop !== undefined || task.with_items !== undefined
    const hasNotify = task.notify !== undefined

    let taskEntryId
    let taskExitId

    if (hasWhen) {
      // Evaluate when condition against mock facts for dry-run
      const whenConditions = Array.isArray(task.when) ? task.when : [task.when]
      const whenVal = whenConditions.join(' AND ')
      const condResult = whenConditions.every((cond) => evaluateWhen(cond, facts).value)
      const DIM = condResult ? 1 : 0.35

      // Diamond decision node
      const diamondId = nextId()
      nodes.push({
        id: diamondId,
        type: 'conditionalNode',
        position: { x: X, y: globalY },
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
        position: { x: X + COL_GAP, y: globalY },
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
        position: { x: X - COL_GAP, y: globalY },
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
        style: { stroke: condResult ? '#f8717166' : '#f87171' },
        labelStyle: { fill: condResult ? '#f8717166' : '#f87171', fontFamily: 'monospace', fontSize: 11 },
      })

      globalY += TASK_HEIGHT + ROW_GAP

      // Merge node
      const mergeId = nextId()
      nodes.push({
        id: mergeId,
        type: 'mergeNode',
        position: { x: X, y: globalY },
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
        position: { x: X, y: globalY },
        data: { label: getTaskLabel(task), module, task },
      })
      edges.push({ id: `e${prevId}-${tId}`, source: prevId, target: tId })
      globalY += TASK_HEIGHT + ROW_GAP

      taskEntryId = tId
      taskExitId = tId
    }

    // ── Notify / Handler dashed edge ────────────────────────────
    if (hasNotify) {
      const notifyList = Array.isArray(task.notify) ? task.notify : [task.notify]
      notifyList.forEach((handlerName) => {
        const hId = nextId()
        nodes.push({
          id: hId,
          type: 'handlerNode',
          position: { x: X + 420, y: globalY - TASK_HEIGHT - ROW_GAP },
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

  return { prevId, globalY }
}

/**
 * Core function: parse a full Ansible playbook (array of plays)
 * into { nodes, edges, lineMap }.
 *
 * fileRegistry: { [filename]: Task[] } — pre-parsed extra files.
 *   Keys should match what appears in include_tasks / import_tasks values,
 *   or follow the roles/<name>/tasks/main.yml convention.
 *
 * lineMap: Map<nodeId, lineNumber> used for sync-highlight.
 */
export function parsePlaybook(plays, rawYaml, facts = {}, fileRegistry = {}) {
  nodeId = 0
  const nodes = []
  const edges = []
  const lineMap = new Map()
  const ctx = { facts, fileRegistry }

  if (!Array.isArray(plays)) return { nodes, edges, lineMap }

  let globalY = 20

  plays.forEach((play, playIndex) => {
    // ── Play header node ─────────────────────────────────────────
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

    // ── Roles ────────────────────────────────────────────────────
    const roles = Array.isArray(play.roles) ? play.roles : []
    roles.forEach((roleEntry) => {
      const roleName = typeof roleEntry === 'string' ? roleEntry
        : (roleEntry?.role ?? roleEntry?.name ?? String(roleEntry))
      const roleFile = `roles/${roleName}/tasks/main.yml`
      const roleTasks = fileRegistry[roleFile]

      if (roleTasks) {
        globalY += ROW_GAP  // extra spacing before role group
        const groupWidth = TASK_WIDTH + GROUP_PAD * 2
        const roleId = nextId()
        const headerY = globalY
        const childStartY = headerY + 56 + ROW_GAP
        // Centre children within the box (left/right padding = GROUP_PAD)
        const childXOffset = GROUP_PAD

        // Collect children into temp buffers first (so we can size the background)
        const tempNodes = []
        const tempEdges = []
        const res = processTaskList(roleTasks, tempNodes, tempEdges, roleId, childStartY, { ...ctx, xOffset: childXOffset }, 1)
        const childEndY = res.globalY

        nodes.push({
          id: roleId,
          type: 'includeNode',
          position: { x: X_BASE, y: headerY },
          style: { width: groupWidth },
          data: { label: `role: ${roleName}`, taskCount: roleTasks.length },
        })
        edges.push({ id: `e${prevId}-${roleId}`, source: prevId, target: roleId })

        const bgId = nextId()
        nodes.push({
          id: bgId,
          type: 'groupBgNode',
          position: { x: X_BASE, y: headerY + 52 },
          style: {
            width: groupWidth,
            height: Math.max(childEndY - childStartY + GROUP_PAD * 2, 40),
            zIndex: -1,
            pointerEvents: 'none',
          },
          data: {},
          selectable: false,
          draggable: false,
        })

        nodes.push(...tempNodes)
        edges.push(...tempEdges)
        prevId = res.prevId
        globalY = res.globalY + ROW_GAP  // extra spacing after role group
      } else {
        const missId = nextId()
        nodes.push({
          id: missId,
          type: 'missingFileNode',
          position: { x: X_BASE, y: globalY },
          data: { label: `role: ${roleName}` },
        })
        edges.push({ id: `e${prevId}-${missId}`, source: prevId, target: missId })
        globalY += TASK_HEIGHT + ROW_GAP
        prevId = missId
      }
    })

    // ── Pre-tasks ────────────────────────────────────────────────
    const preTasks = play.pre_tasks || []
    if (preTasks.length > 0) {
      const preSectionId = nextId()
      nodes.push({
        id: preSectionId,
        type: 'sectionNode',
        position: { x: X_BASE, y: globalY },
        data: { label: 'Pre-Tasks' },
      })
      edges.push({ id: `e${prevId}-${preSectionId}`, source: prevId, target: preSectionId })
      globalY += 50 + ROW_GAP
      const res = processTaskList(preTasks, nodes, edges, preSectionId, globalY, ctx, 0)
      prevId = res.prevId
      globalY = res.globalY
    }

    // ── Tasks ────────────────────────────────────────────────────
    const tasks = play.tasks || []
    const res = processTaskList(tasks, nodes, edges, prevId, globalY, ctx, 0)
    prevId = res.prevId
    globalY = res.globalY

    // ── Post-tasks ───────────────────────────────────────────────
    const postTasks = play.post_tasks || []
    if (postTasks.length > 0) {
      const postSectionId = nextId()
      nodes.push({
        id: postSectionId,
        type: 'sectionNode',
        position: { x: X_BASE, y: globalY },
        data: { label: 'Post-Tasks' },
      })
      edges.push({ id: `e${prevId}-${postSectionId}`, source: prevId, target: postSectionId })
      globalY += 50 + ROW_GAP
      const res2 = processTaskList(postTasks, nodes, edges, postSectionId, globalY, ctx, 0)
      prevId = res2.prevId
      globalY = res2.globalY
    }

    // ── Handlers section ─────────────────────────────────────────
    const handlers = play.handlers || []
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
