/**
 * precedence.js
 * Ansible variable precedence engine.
 *
 * Implements the documented 22-level precedence order and resolves, for a single
 * host, every applicable variable into a winning value + the ordered stack of
 * shadowed candidates (each tagged with its source + level).
 *
 * Pure data in / data out — value rendering (Jinja2) is done by the caller so the
 * engine stays testable.
 */
import yaml from 'js-yaml'
import { matchHostPattern } from './ansibleLimit'
import { parseYamlSafe } from './projectModel'

// Low → high. Level 1 (command line connection values) carries no vars.
export const PRECEDENCE = [
  { level: 1,  id: 'cli',            label: 'command line values' },
  { level: 2,  id: 'role_defaults',  label: 'role defaults' },
  { level: 3,  id: 'inv_file_group', label: 'inventory file group vars' },
  { level: 4,  id: 'inv_gv_all',     label: 'inventory group_vars/all' },
  { level: 5,  id: 'pb_gv_all',      label: 'playbook group_vars/all' },
  { level: 6,  id: 'inv_gv',         label: 'inventory group_vars/*' },
  { level: 7,  id: 'pb_gv',          label: 'playbook group_vars/*' },
  { level: 8,  id: 'inv_file_host',  label: 'inventory file host vars' },
  { level: 9,  id: 'inv_hv',         label: 'inventory host_vars/*' },
  { level: 10, id: 'pb_hv',          label: 'playbook host_vars/*' },
  { level: 11, id: 'facts',          label: 'host facts / cached set_fact' },
  { level: 12, id: 'play_vars',      label: 'play vars' },
  { level: 13, id: 'vars_prompt',    label: 'play vars_prompt' },
  { level: 14, id: 'vars_files',     label: 'play vars_files' },
  { level: 15, id: 'role_vars',      label: 'role vars' },
  { level: 16, id: 'block_vars',     label: 'block vars' },
  { level: 17, id: 'task_vars',      label: 'task vars' },
  { level: 18, id: 'include_vars',   label: 'include_vars' },
  { level: 19, id: 'set_fact',       label: 'set_fact / registered vars' },
  { level: 20, id: 'role_params',    label: 'role (include_role) params' },
  { level: 21, id: 'include_params', label: 'include params' },
  { level: 22, id: 'extra_vars',     label: 'extra vars (-e)' },
]

export const LEVEL_LABEL = Object.fromEntries(PRECEDENCE.map((p) => [p.level, p.label]))

// ── small helpers ─────────────────────────────────────────────────────────────

function dirname(path) { const i = path.lastIndexOf('/'); return i === -1 ? '' : path.slice(0, i) }
function roleName(entry) { return typeof entry === 'string' ? entry : (entry?.role ?? entry?.name) }

const RESERVED_ROLE_KEYS = new Set([
  'role', 'name', 'when', 'tags', 'vars', 'become', 'become_user',
  'become_method', 'delegate_to', 'delegate_facts',
])

function roleParams(entry) {
  if (!entry || typeof entry !== 'object') return {}
  if (entry.vars && typeof entry.vars === 'object') return { ...entry.vars }
  const params = {}
  for (const [k, v] of Object.entries(entry)) if (!RESERVED_ROLE_KEYS.has(k)) params[k] = v
  return params
}

function lookupRole(name, pm) {
  if (!name) return null
  if (pm.collectionRoles[name]) return pm.collectionRoles[name]
  if (pm.roles[name]) return pm.roles[name]
  return null
}

function playTargetsHost(play, host, groups) {
  const pattern = play?.hosts
  if (pattern === undefined || pattern === null) return false
  const pat = Array.isArray(pattern) ? pattern.join(':') : String(pattern)
  try { return matchHostPattern(pat.replace(/,/g, ':'), groups).has(host) } catch { return false }
}

/** Resolve a vars_files reference against the VFS (literal paths only). */
function resolveVarsFile(files, baseDir, ref) {
  if (typeof ref !== 'string' || ref.includes('{{')) return null
  const tries = [ref, baseDir ? `${baseDir}/${ref}` : null].filter(Boolean)
  for (const c of tries) if (files[c] !== undefined) return { path: c, vars: parseYamlSafe(files[c]) }
  const base = ref.split('/').pop()
  const hit = Object.keys(files).find((p) => p === base || p.endsWith(`/${base}`))
  return hit ? { path: hit, vars: parseYamlSafe(files[hit]) } : null
}

/**
 * Walk a task list, emitting var declarations for block/task vars, include_vars,
 * set_fact, register, dynamically-included role defaults/vars, and include/role
 * params. `emit` receives:
 *   { name, level, label, path, value?, hasValue, kind?, note? }
 * `pm` (projectModel) is used to resolve include_role/import_role defaults+vars.
 */
function scanTasks(tasks, emit, path, files, pm) {
  if (!Array.isArray(tasks)) return
  for (const t of tasks) {
    if (!t || typeof t !== 'object') continue
    const get = (k) => t[k] ?? t[`ansible.builtin.${k}`]

    if (Array.isArray(t.block)) {
      if (t.vars && typeof t.vars === 'object') {
        for (const [k, v] of Object.entries(t.vars)) {
          emit({ name: k, level: 16, label: `block vars${t.name ? `: ${t.name}` : ''}`, path, value: v, hasValue: true })
        }
      }
      scanTasks(t.block, emit, path, files, pm)
      scanTasks(t.rescue, emit, path, files, pm)
      scanTasks(t.always, emit, path, files, pm)
      continue
    }

    const incRole = get('include_role') || get('import_role')
    const incTasks = get('include_tasks') || get('import_tasks')

    if (incRole) {
      const rname = typeof incRole === 'string' ? incRole : (incRole?.name)
      const role = rname && pm ? lookupRole(rname, pm) : null
      if (role) {
        for (const [k, v] of Object.entries(role.defaults || {})) emit({ name: k, level: 2, label: `role defaults: ${rname}`, path: `${role.base}/defaults/main.yml`, value: v, hasValue: true })
        for (const [k, v] of Object.entries(role.vars || {})) emit({ name: k, level: 15, label: `role vars: ${rname}`, path: `${role.base}/vars/main.yml`, value: v, hasValue: true })
      }
      if (t.vars && typeof t.vars === 'object') {
        for (const [k, v] of Object.entries(t.vars)) emit({ name: k, level: 20, label: `include_role params${rname ? `: ${rname}` : ''}`, path, value: v, hasValue: true })
      }
    } else if (incTasks) {
      if (t.vars && typeof t.vars === 'object') {
        for (const [k, v] of Object.entries(t.vars)) emit({ name: k, level: 21, label: 'include params', path, value: v, hasValue: true })
      }
    } else if (t.vars && typeof t.vars === 'object') {
      for (const [k, v] of Object.entries(t.vars)) emit({ name: k, level: 17, label: `task vars${t.name ? `: ${t.name}` : ''}`, path, value: v, hasValue: true })
    }

    const sf = get('set_fact')
    if (sf && typeof sf === 'object') {
      for (const k of Object.keys(sf)) {
        if (k === 'cacheable') continue
        emit({ name: k, level: 19, label: `set_fact${t.name ? `: ${t.name}` : ''}`, path, kind: 'set_fact', hasValue: false })
      }
    }

    if (typeof t.register === 'string') {
      emit({ name: t.register, level: 19, label: `register${t.name ? `: ${t.name}` : ''}`, path, kind: 'register', hasValue: false })
    }

    const iv = get('include_vars')
    if (iv) {
      const file = typeof iv === 'string' ? iv : (iv?.file ?? iv?.name)
      const resolved = file ? resolveVarsFile(files, '', file) : null
      if (resolved) {
        for (const [k, v] of Object.entries(resolved.vars)) {
          emit({ name: k, level: 18, label: `include_vars: ${file}`, path: resolved.path, value: v, hasValue: true })
        }
      }
    }
  }
}

/**
 * Flatten a play role entry into [deps…, role] order, resolving meta dependencies
 * recursively (depth/cycle-guarded). Each item: { name, role, params }.
 */
function flattenRole(entry, pm, seen, out, depth = 0) {
  const name = roleName(entry)
  if (!name || seen.has(name) || depth > 10) return
  seen.add(name)
  const role = lookupRole(name, pm)
  if (role) {
    for (const dep of (role.dependencies || [])) flattenRole(dep, pm, seen, out, depth + 1)
  }
  out.push({ name, role, params: roleParams(entry) })
}

function playFlatRoles(play, pm) {
  const out = []
  const seen = new Set()
  for (const r of (Array.isArray(play.roles) ? play.roles : [])) flattenRole(r, pm, seen, out)
  return out
}

/** Read a role's tasks/main.{yml,yaml} as a task list (or []). */
function roleTaskList(role, files) {
  if (!role?.base) return { tasks: [], path: null }
  const path = files[`${role.base}/tasks/main.yml`] !== undefined ? `${role.base}/tasks/main.yml`
    : files[`${role.base}/tasks/main.yaml`] !== undefined ? `${role.base}/tasks/main.yaml` : null
  if (!path) return { tasks: [], path: null }
  try { const parsed = yaml.load(files[path]); return { tasks: Array.isArray(parsed) ? parsed : [], path } } catch { return { tasks: [], path } }
}

// ── runtime var declarations (for the mock panel) ────────────────────────────

/**
 * List variables whose VALUE is only known at runtime (set_fact, register,
 * vars_prompt w/o default) so the UI can collect mock values.
 * Returns [{ name, level, kind, label, default? }] (deduped by name+level).
 */
export function extractRuntimeVars(activePlaybook, projectModel) {
  const out = []
  const seen = new Set()
  const add = (d) => {
    const key = `${d.name}@${d.level}`
    if (!d.name || seen.has(key)) return
    seen.add(key)
    out.push(d)
  }
  const plays = activePlaybook?.plays ?? []
  const path = activePlaybook?.path ?? null

  for (const play of plays) {
    const vp = play?.vars_prompt
    if (Array.isArray(vp)) {
      for (const item of vp) if (item?.name) add({ name: item.name, level: 13, kind: 'vars_prompt', label: 'vars_prompt', default: item.default })
    }
    const emit = (d) => { if (!d.hasValue && (d.kind === 'set_fact' || d.kind === 'register')) add({ name: d.name, level: d.level, kind: d.kind, label: d.label }) }
    for (const section of ['pre_tasks', 'tasks', 'post_tasks', 'handlers']) scanTasks(play[section], emit, path, projectModel.files, projectModel)
    for (const item of playFlatRoles(play, projectModel)) {
      const { tasks, path: rp } = roleTaskList(item.role, projectModel.files)
      scanTasks(tasks, emit, rp, projectModel.files, projectModel)
    }
  }
  return out
}

/** Approximate set of variable names referenced ({{ }} / when / loop) in the project. */
export function collectReferencedVars(projectModel, activePlaybook) {
  const re = /\{\{[\s-]*([a-zA-Z_]\w*)|(?:if|elif|when|for\s+\w+\s+in)\s+([a-zA-Z_]\w*)/g
  const found = new Set()
  const blobs = []
  if (activePlaybook?.path && projectModel.files[activePlaybook.path]) blobs.push(projectModel.files[activePlaybook.path])
  for (const [p, c] of Object.entries(projectModel.files)) {
    if (p.includes('/roles/') || p.includes('ansible_collections/')) blobs.push(c)
  }
  for (const b of blobs) {
    let m
    re.lastIndex = 0
    while ((m = re.exec(b)) !== null) { const n = m[1] || m[2]; if (n) found.add(n) }
  }
  return found
}

// ── core resolution ───────────────────────────────────────────────────────────

/**
 * Resolve all variables applicable to `host`.
 *
 * opts: {
 *   projectModel, inventoryData:{groups,groupvars,hostvars}, inventoryPath,
 *   activePlaybook:{path,plays}, facts, runtimeMocks:{name:value},
 *   extraVarsLayers:[{label,path,vars}]   // applied in order, all win
 * }
 * Returns { host, hostGroups, plays, vars:{ name:{ winner, stack:[{value,level,source}] } } }
 */
export function resolveHostVars(host, opts = {}) {
  const {
    projectModel, inventoryData = {}, inventoryPath = '(inventory)',
    activePlaybook, facts = {}, runtimeMocks = {}, extraVarsLayers = [],
  } = opts

  const groups = inventoryData.groups ?? {}
  const groupvars = inventoryData.groupvars ?? {}
  const invHostvars = inventoryData.hostvars ?? {}
  const files = projectModel?.files ?? {}

  const hostGroups = Object.entries(groups)
    .filter(([g, hosts]) => g !== 'all' && Array.isArray(hosts) && hosts.includes(host))
    .map(([g]) => g)
    .sort()

  const plays = (activePlaybook?.plays ?? []).filter((p) => playTargetsHost(p, host, groups))
  const pbDir = activePlaybook?.path ? dirname(activePlaybook.path) : ''
  const invDir = inventoryPath ? dirname(inventoryPath) : ''

  // group_vars/host_vars dir adjacency relative to active inventory/playbook.
  const adjacency = (parent) => {
    if (parent === invDir) return 'inventory'
    if (parent === pbDir) return 'playbook'
    return null
  }

  const entries = []
  let order = 0
  const push = (name, value, level, source) => entries.push({ name, value, level, order: order++, source })
  const pushObj = (obj, level, source) => {
    if (!obj || typeof obj !== 'object') return
    for (const [k, v] of Object.entries(obj)) push(k, v, level, source)
  }

  // Flattened roles per play (meta dependencies first, then the role).
  const flatRolesByPlay = plays.map((play) => playFlatRoles(play, projectModel))

  // L2 role defaults (incl. dependency roles)
  flatRolesByPlay.forEach((flat) => {
    for (const { name: nm, role } of flat) {
      if (role) pushObj(role.defaults, 2, { label: `role defaults: ${nm}`, path: `${role.base}/defaults/main.yml` })
    }
  })

  // L3 inventory-file group vars (all → specific)
  for (const g of ['all', ...hostGroups]) pushObj(groupvars[g], 3, { label: `inventory [${g}:vars]`, path: inventoryPath })

  // group_vars/ directories
  for (const dir of (projectModel?.groupVarsDirs ?? [])) {
    const adj = adjacency(dir.parent)
    if (!adj) continue
    const prefix = dir.parent ? `${dir.parent}/` : ''
    if (dir.entries.all) pushObj(dir.entries.all, adj === 'inventory' ? 4 : 5, { label: `${adj} group_vars/all`, path: `${prefix}group_vars/all` })
    for (const g of hostGroups) {
      if (dir.entries[g]) pushObj(dir.entries[g], adj === 'inventory' ? 6 : 7, { label: `${adj} group_vars/${g}`, path: `${prefix}group_vars/${g}` })
    }
  }

  // L8 inventory-file host vars
  pushObj(invHostvars[host], 8, { label: 'inventory file host vars', path: inventoryPath })

  // host_vars/ directories
  for (const dir of (projectModel?.hostVarsDirs ?? [])) {
    const adj = adjacency(dir.parent)
    if (!adj) continue
    const prefix = dir.parent ? `${dir.parent}/` : ''
    if (dir.entries[host]) pushObj(dir.entries[host], adj === 'inventory' ? 9 : 10, { label: `${adj} host_vars/${host}`, path: `${prefix}host_vars/${host}` })
  }

  // L11 host facts / cached set_fact
  pushObj(facts, 11, { label: 'host facts', path: '(facts)' })

  // L12 play vars, L13 vars_prompt, L14 vars_files
  for (const play of plays) {
    pushObj(play.vars, 12, { label: 'play vars', path: activePlaybook.path })
    const vp = play.vars_prompt
    if (Array.isArray(vp)) {
      for (const item of vp) {
        if (!item?.name) continue
        const value = (item.name in runtimeMocks) ? runtimeMocks[item.name] : item.default
        push(item.name, value, 13, { label: 'vars_prompt', path: activePlaybook.path, runtime: item.default === undefined })
      }
    }
    const vf = play.vars_files
    const list = Array.isArray(vf) ? vf : (vf ? [vf] : [])
    for (const f of list) {
      // A list item may itself be a list = "first file that exists" wins.
      const choices = Array.isArray(f) ? f : [f]
      for (const choice of choices) {
        const resolved = resolveVarsFile(files, pbDir, choice)
        if (resolved) { pushObj(resolved.vars, 14, { label: `vars_files: ${choice}`, path: resolved.path }); break }
      }
    }
  }

  // L15 role vars + L20 role params (incl. dependency roles)
  flatRolesByPlay.forEach((flat) => {
    for (const { name: nm, role, params } of flat) {
      if (role) pushObj(role.vars, 15, { label: `role vars: ${nm}`, path: `${role.base}/vars/main.yml` })
      if (params && Object.keys(params).length) pushObj(params, 20, { label: `role params: ${nm}`, path: activePlaybook.path })
    }
  })

  // L16/17/18/19/20/21 — task-derived (playbook tasks + used role tasks)
  const taskEmit = (d) => {
    const value = d.hasValue ? d.value : (d.name in runtimeMocks ? runtimeMocks[d.name] : undefined)
    push(d.name, value, d.level, { label: d.label, path: d.path, runtime: !d.hasValue, note: d.note })
  }
  plays.forEach((play, pi) => {
    for (const section of ['pre_tasks', 'tasks', 'post_tasks', 'handlers']) scanTasks(play[section], taskEmit, activePlaybook.path, files, projectModel)
    for (const { role } of flatRolesByPlay[pi]) {
      const { tasks, path } = roleTaskList(role, files)
      scanTasks(tasks, taskEmit, path, files, projectModel)
    }
  })

  // L22 extra vars (applied in order; later wins; all beat every other level)
  extraVarsLayers.forEach((layer, i) => pushObj(layer?.vars, 22, { label: layer?.label || `-e (${i + 1})`, path: layer?.path }))

  // ── assemble stacks ──
  const byName = new Map()
  for (const e of entries) {
    if (!byName.has(e.name)) byName.set(e.name, [])
    byName.get(e.name).push(e)
  }

  const vars = {}
  for (const [name, list] of byName) {
    list.sort((a, b) => (a.level - b.level) || (a.order - b.order))
    const stack = list.map((e) => ({ value: e.value, level: e.level, source: e.source }))
    vars[name] = { winner: stack[stack.length - 1], stack }
  }

  return {
    host,
    hostGroups,
    plays: plays.map((p) => p.name || (Array.isArray(p.hosts) ? p.hosts.join(',') : p.hosts)),
    vars,
  }
}
