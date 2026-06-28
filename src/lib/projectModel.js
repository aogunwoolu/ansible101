/**
 * projectModel.js
 * Turns the flat extraFiles VFS ([{id,name,content}] where name is a full
 * relative path) into a structural index of an Ansible project:
 *   - ansible.cfg (inventory / roles_path / collections_path / hash_behaviour)
 *   - inventory candidates
 *   - playbook candidates (parsed plays)
 *   - group_vars / host_vars directories (parsed, with their parent dir so
 *     precedence.js can decide inventory- vs playbook-adjacency)
 *   - roles (defaults/vars/tasks) and vendored collection roles (FQCN-keyed)
 *
 * This module only INDEXES structure. Variable collection + precedence ordering
 * live in precedence.js.
 */
import yaml from 'js-yaml'

const YAML_RE = /\.(ya?ml)$/i
const JSON_RE = /\.json$/i

function basename(path) { return path.slice(path.lastIndexOf('/') + 1) }
function stripExt(name) { return name.replace(/\.(ya?ml|json)$/i, '') }
function isYamlPath(path) { return YAML_RE.test(path) }
function isVarsFilePath(path) {
  const base = basename(path)
  if (base.startsWith('.')) return false               // .gitkeep, .DS_Store…
  return YAML_RE.test(path) || JSON_RE.test(path) || !base.includes('.')
}

export function parseYamlSafe(content) {
  try {
    const parsed = yaml.load(content)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** A YAML doc is a playbook if it is a list whose entries look like plays. */
function parsePlays(content) {
  try {
    const parsed = yaml.load(content)
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    const arePlays = parsed.every(
      (p) => p && typeof p === 'object'
        && ('hosts' in p || 'roles' in p || 'tasks' in p || 'import_playbook' in p),
    )
    const hasHosts = parsed.some((p) => p && typeof p === 'object' && ('hosts' in p || 'import_playbook' in p))
    return arePlays && hasHosts ? parsed : null
  } catch {
    return null
  }
}

function dirname(p) { const i = p.lastIndexOf('/'); return i === -1 ? '' : p.slice(0, i) }

/** Resolve a playbook reference (import_playbook) against the VFS. */
function resolvePlaybookRef(files, baseDir, ref) {
  if (typeof ref !== 'string' || ref.includes('{{')) return null
  const tries = [ref, baseDir ? `${baseDir}/${ref}` : null].filter(Boolean)
  for (const c of tries) if (files[c] !== undefined) return { path: c, content: files[c] }
  const b = ref.split('/').pop()
  const hit = Object.keys(files).find((p) => p === b || p.endsWith(`/${b}`))
  return hit ? { path: hit, content: files[hit] } : null
}

/** Inline `- import_playbook: other.yml` entries so master playbooks resolve. */
function expandImportPlaybooks(plays, files, baseDir, depth = 0, seen = new Set()) {
  if (!Array.isArray(plays) || depth > 6) return plays || []
  const out = []
  for (const p of plays) {
    const imp = p?.import_playbook ?? p?.['ansible.builtin.import_playbook']
    if (imp) {
      const resolved = resolvePlaybookRef(files, baseDir, imp)
      if (resolved && !seen.has(resolved.path)) {
        seen.add(resolved.path)
        const child = parsePlays(resolved.content) || []
        out.push(...expandImportPlaybooks(child, files, dirname(resolved.path), depth + 1, seen))
        continue
      }
    }
    out.push(p)
  }
  return out
}

// ── ansible.cfg ───────────────────────────────────────────────────────────────

function parseAnsibleCfg(content) {
  if (!content) return null
  const cfg = {}
  let section = ''
  for (const rawLine of content.split('\n')) {
    const line = rawLine.split(/[#;]/)[0].trim()
    if (!line) continue
    if (line.startsWith('[') && line.endsWith(']')) { section = line.slice(1, -1).trim(); continue }
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    const val = line.slice(eq + 1).trim()
    if (section === 'defaults') {
      if (key === 'inventory') cfg.inventory = val
      if (key === 'roles_path') cfg.rolesPath = val
      if (key === 'collections_path' || key === 'collections_paths') cfg.collectionsPath = val
      if (key === 'hash_behaviour') cfg.hashBehaviour = val
    }
  }
  return Object.keys(cfg).length ? cfg : null
}

// ── group_vars / host_vars directories ───────────────────────────────────────

/**
 * Collect every `<segment>/group_vars` (or host_vars) directory, parsing each
 * member file. Supports both `group_vars/web.yml` and `group_vars/web/<files>`.
 * Returns [{ parent, kind, entries: { name: mergedVars } }].
 */
function collectVarsDirs(files, kind) {
  const byParent = new Map()
  for (const [path, content] of Object.entries(files)) {
    const segs = path.split('/')
    const segIdx = segs.indexOf(kind)
    if (segIdx === -1 || segIdx === segs.length - 1) continue // not a dir, or nothing after
    if (!isVarsFilePath(path)) continue
    const parent = segs.slice(0, segIdx).join('/')
    const name = stripExt(segs[segIdx + 1]) // group/host name (dir or file basename)
    const vars = isYamlPath(path) || !basename(path).includes('.')
      ? parseYamlSafe(content)
      : (() => { try { return JSON.parse(content) || {} } catch { return {} } })()
    if (!byParent.has(parent)) byParent.set(parent, { parent, kind, entries: {} })
    const bucket = byParent.get(parent)
    bucket.entries[name] = { ...(bucket.entries[name] ?? {}), ...vars }
  }
  return [...byParent.values()]
}

// ── roles ─────────────────────────────────────────────────────────────────────

function mainFile(files, dir) {
  return files[`${dir}/main.yml`] ?? files[`${dir}/main.yaml`] ?? null
}

/** Index local roles found under any `roles/<role>/…`. */
function collectRoles(files) {
  const roles = {}
  const names = new Set()
  for (const path of Object.keys(files)) {
    const m = path.match(/(?:^|\/)roles\/([^/]+)\//)
    if (m) names.add(m[1])
  }
  for (const name of names) {
    // find the roles/<name> base (handle nested roots like inventories/x/roles)
    const base = Object.keys(files)
      .map((p) => {
        const i = p.indexOf(`roles/${name}/`)
        return i === -1 ? null : p.slice(0, i) + `roles/${name}`
      })
      .find(Boolean)
    if (!base) continue
    const defaults = mainFile(files, `${base}/defaults`)
    const vars = mainFile(files, `${base}/vars`)
    const tasks = mainFile(files, `${base}/tasks`)
    const meta = mainFile(files, `${base}/meta`)
    const metaParsed = meta ? parseYamlSafe(meta) : {}
    roles[name] = {
      base,
      defaults: defaults ? parseYamlSafe(defaults) : {},
      vars: vars ? parseYamlSafe(vars) : {},
      hasTasks: Boolean(tasks),
      dependencies: Array.isArray(metaParsed.dependencies) ? metaParsed.dependencies : [],
    }
  }
  return roles
}

/** Index vendored collection roles under collections/ansible_collections/<ns>/<coll>/roles/<role>. */
function collectCollectionRoles(files) {
  const out = {}
  const seen = new Set()
  for (const path of Object.keys(files)) {
    const m = path.match(/ansible_collections\/([^/]+)\/([^/]+)\/roles\/([^/]+)\//)
    if (!m) continue
    const [, ns, coll, role] = m
    const fqcn = `${ns}.${coll}.${role}`
    if (seen.has(fqcn)) continue
    seen.add(fqcn)
    const i = path.indexOf(`ansible_collections/${ns}/${coll}/roles/${role}/`)
    const base = path.slice(0, i) + `ansible_collections/${ns}/${coll}/roles/${role}`
    const defaults = mainFile(files, `${base}/defaults`)
    const vars = mainFile(files, `${base}/vars`)
    const meta = mainFile(files, `${base}/meta`)
    const metaParsed = meta ? parseYamlSafe(meta) : {}
    out[fqcn] = {
      base,
      ns,
      coll,
      role,
      defaults: defaults ? parseYamlSafe(defaults) : {},
      vars: vars ? parseYamlSafe(vars) : {},
      dependencies: Array.isArray(metaParsed.dependencies) ? metaParsed.dependencies : [],
    }
  }
  return out
}

// ── inventory + playbook candidates ─────────────────────────────────────────

const INV_NAME_RE = /^(inventory|hosts)(\.(ini|ya?ml|json))?$|^inventory.*\.(ini|ya?ml|json)$|\.ini$/i

function rankInventory(path, cfgInventory) {
  if (cfgInventory && path === cfgInventory) return 0
  const segs = path.split('/')
  const base = basename(path)
  let score = 10
  if (/^(inventory|hosts)$/i.test(base)) score = 1
  else if (/^inventory\./i.test(base)) score = 2
  else if (/(^|\/)(inventory|inventories)\//.test(path)) score = 3
  score += segs.length // prefer shallower
  return score
}

function collectInventories(files, cfg) {
  const candidates = []
  for (const path of Object.keys(files)) {
    if (path.includes('/roles/') || path.includes('ansible_collections/')) continue
    if (path.includes('group_vars/') || path.includes('host_vars/')) continue
    const base = basename(path)
    const inInvDir = /(^|\/)(inventory|inventories)\//.test(path)
    if (INV_NAME_RE.test(base) || (inInvDir && (base === 'hosts' || isYamlPath(path) || /\.(ini|json)$/i.test(path)))) {
      candidates.push({ path, rank: rankInventory(path, cfg?.inventory) })
    }
  }
  return candidates.sort((a, b) => a.rank - b.rank).map(({ path }) => ({ path }))
}

function rankPlaybook(path) {
  const base = basename(path).toLowerCase()
  const depth = path.split('/').length
  if (base === 'site.yml' || base === 'site.yaml') return depth - 5
  if (base.startsWith('playbook')) return depth - 3
  if (/(^|\/)playbooks\//.test(path)) return depth - 1
  return depth
}

function collectPlaybooks(files) {
  const out = []
  for (const [path, content] of Object.entries(files)) {
    if (!isYamlPath(path)) continue
    if (path.includes('/roles/') || path.includes('ansible_collections/')) continue
    if (path.includes('group_vars/') || path.includes('host_vars/')) continue
    if (/(^|\/)(tasks|handlers|meta|vars|defaults)\//.test(path)) continue
    const plays = parsePlays(content)
    if (plays) out.push({ path, plays, rank: rankPlaybook(path) })
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ path, plays }) => ({ path, plays }))
}

// ── public ────────────────────────────────────────────────────────────────────

export function buildProjectModel(extraFiles = []) {
  const files = {}
  for (const f of extraFiles) {
    if (f && typeof f.name === 'string') files[f.name] = typeof f.content === 'string' ? f.content : ''
  }

  const cfgPath = Object.keys(files).find((p) => basename(p) === 'ansible.cfg')
  const ansibleCfg = cfgPath ? parseAnsibleCfg(files[cfgPath]) : null

  const groupVarsDirs = collectVarsDirs(files, 'group_vars')
  const hostVarsDirs = collectVarsDirs(files, 'host_vars')
  const roles = collectRoles(files)
  const collectionRoles = collectCollectionRoles(files)
  const inventoryCandidates = collectInventories(files, ansibleCfg)
  const playbookCandidates = collectPlaybooks(files).map((pb) => ({
    path: pb.path,
    plays: expandImportPlaybooks(pb.plays, files, dirname(pb.path)),
  }))

  const isProject = groupVarsDirs.length > 0
    || hostVarsDirs.length > 0
    || Object.keys(roles).length > 0
    || Object.keys(collectionRoles).length > 0
    || inventoryCandidates.length > 0
    || playbookCandidates.length > 1

  return {
    files,
    ansibleCfg,
    inventoryCandidates,
    playbookCandidates,
    groupVarsDirs,
    hostVarsDirs,
    roles,
    collectionRoles,
    isProject,
  }
}

/** Convenience: does this set of files look like a project (vs a lone playbook)? */
export function isProject(extraFiles = []) {
  return buildProjectModel(extraFiles).isProject
}
