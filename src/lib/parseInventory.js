/**
 * parseInventory.js
 * Parses Ansible inventory files in INI, YAML, or JSON format.
 *
 * Returns (additively): {
 *   groups:    { groupName: string[] },   // group → host membership
 *   groupvars: { groupName: {} },          // vars from [group:vars] / YAML/JSON group vars
 *   hostvars:  { host: {} },               // vars from inline INI / YAML host maps / _meta
 *   format, error
 * }
 *
 * JSON format (ansible-inventory --list output):
 *   ansible-inventory -i <source> --list > inventory.json
 *
 * INI format:
 *   [group]
 *   host1
 *   host2 ansible_host=1.2.3.4 http_port=80   ← inline host vars (now captured)
 *
 *   [group:children]
 *   other_group
 *
 *   [group:vars]                              ← group vars (now captured)
 *   ansible_user=deploy
 *
 * YAML format (ansible.builtin.yaml inventory plugin):
 *   all:
 *     vars: { ntp: pool.ntp.org }            ← group vars (now captured)
 *     hosts:
 *       web-01: { ansible_host: 10.0.0.1 }   ← host vars (now captured)
 *     children:
 *       web:
 *         hosts: { web-01: , web-02: }
 */
import yaml from 'js-yaml'

// ── shared helpers ───────────────────────────────────────────────────────────

/**
 * Tokenise an INI line, keeping quoted segments (key="a b") as one token.
 */
function splitTokens(line) {
  const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g
  return line.match(re) || []
}

/**
 * INI inventory values are strings; coerce obvious ints/floats and strip quotes
 * for nicer display. Anything else is kept verbatim as a string.
 */
function coerceIniValue(raw) {
  const m = raw.match(/^(['"])([\s\S]*)\1$/)
  if (m) return m[2]
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (/^-?\d*\.\d+$/.test(raw)) return Number(raw)
  return raw
}

/** Parse `key=value key2=value2` tokens (after the leading host/section name). */
function parseKvTokens(tokens) {
  const vars = {}
  for (const tok of tokens) {
    const eq = tok.indexOf('=')
    if (eq <= 0) continue
    const key = tok.slice(0, eq).trim()
    const val = tok.slice(eq + 1)
    if (key) vars[key] = coerceIniValue(val)
  }
  return vars
}

// ── JSON parser (ansible-inventory --list) ──────────────────────────────────

function parseJsonInventory(text) {
  const parsed = JSON.parse(text) // throws on bad JSON
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const hostvars = { ...(parsed._meta?.hostvars ?? {}) }
  const groupvars = {}
  const out = {}   // groupName → Set<string>

  // Collect all group keys first (skip _meta)
  for (const [key, val] of Object.entries(parsed)) {
    if (key === '_meta') continue
    if (!out[key]) out[key] = new Set()

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Modern format: { hosts: [...], children: [...], vars: {...} }
      const hosts    = val.hosts    ?? []
      const children = val.children ?? []
      if (val.vars && typeof val.vars === 'object') groupvars[key] = { ...val.vars }
      hosts.forEach((h) => out[key].add(h))
      // children are group names — resolve after all groups collected
      out[key].__children = children
    } else if (Array.isArray(val)) {
      // Legacy format: group → ["host1", "host2"]
      val.forEach((h) => typeof h === 'string' && out[key].add(h))
    }
  }

  // Resolve children references
  for (let pass = 0; pass < 5; pass++) {
    for (const [, set] of Object.entries(out)) {
      const childNames = set.__children ?? []
      for (const child of childNames) {
        if (out[child]) out[child].forEach((h) => typeof h !== 'object' && set.add(h))
      }
    }
  }

  // Strip __children markers
  for (const set of Object.values(out)) delete set.__children

  if (Object.values(out).every((s) => s.size === 0)) return null

  // Ensure 'all' exists
  const allHosts = new Set(Object.values(out).flatMap((s) => [...s]))
  if (!out.all) out.all = new Set()
  allHosts.forEach((h) => out.all.add(h))

  return {
    groups: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()])),
    groupvars,
    hostvars,
  }
}

// ── INI parser ───────────────────────────────────────────────────────────────

function parseIni(text) {
  const groups = {}    // groupName → Set<string>
  const children = {}  // groupName → string[] (child group names)
  const groupvars = {} // groupName → {}
  const hostvars = {}  // host → {}

  let currentGroup = null
  let currentMode  = 'hosts' // 'hosts' | 'children' | 'vars'

  for (const rawLine of text.split('\n')) {
    const line = rawLine.split('#')[0].trim() // strip comments
    if (!line) continue

    // Section header
    if (line.startsWith('[') && line.endsWith(']')) {
      const section = line.slice(1, -1).trim()
      if (section.endsWith(':children')) {
        currentGroup = section.slice(0, -':children'.length)
        currentMode  = 'children'
      } else if (section.endsWith(':vars')) {
        currentGroup = section.slice(0, -':vars'.length)
        currentMode  = 'vars'
      } else {
        currentGroup = section
        currentMode  = 'hosts'
      }
      if (!groups[currentGroup]) groups[currentGroup] = new Set()
      continue
    }

    if (!currentGroup) continue

    const tokens = splitTokens(line)
    if (tokens.length === 0) continue

    if (currentMode === 'vars') {
      // [group:vars] — every line is a key=value group var
      const vars = parseKvTokens(tokens)
      groupvars[currentGroup] = { ...(groupvars[currentGroup] ?? {}), ...vars }
      continue
    }

    const token = tokens[0]
    if (currentMode === 'hosts') {
      groups[currentGroup].add(token)
      // Inline host vars: host key=val key2=val2
      if (tokens.length > 1) {
        const vars = parseKvTokens(tokens.slice(1))
        if (Object.keys(vars).length) hostvars[token] = { ...(hostvars[token] ?? {}), ...vars }
      }
    } else if (currentMode === 'children') {
      if (!children[currentGroup]) children[currentGroup] = []
      children[currentGroup].push(token)
    }
  }

  // Resolve :children — add child group's hosts to parent (multiple passes for nesting)
  for (let pass = 0; pass < 5; pass++) {
    for (const [parent, childNames] of Object.entries(children)) {
      for (const child of childNames) {
        if (groups[child]) groups[child].forEach((h) => groups[parent]?.add(h))
      }
    }
  }

  // Always ensure 'all' exists and contains every host
  const allHosts = new Set(Object.values(groups).flatMap((s) => [...s]))
  if (!groups.all) groups.all = new Set()
  allHosts.forEach((h) => groups.all.add(h))

  return {
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, [...v].sort()])),
    groupvars,
    hostvars,
  }
}

// ── YAML parser ──────────────────────────────────────────────────────────────

function extractYamlGroup(node, groupName, out, gv, hv) {
  if (!node || typeof node !== 'object') return

  // Group vars
  if (node.vars && typeof node.vars === 'object') {
    gv[groupName] = { ...(gv[groupName] ?? {}), ...node.vars }
  }

  // Direct hosts (+ inline host vars)
  const hosts = node.hosts
  if (hosts && typeof hosts === 'object') {
    if (!out[groupName]) out[groupName] = new Set()
    for (const [host, hvars] of Object.entries(hosts)) {
      out[groupName].add(host)
      if (hvars && typeof hvars === 'object') {
        hv[host] = { ...(hv[host] ?? {}), ...hvars }
      }
    }
  }

  // Recurse into children groups
  const childGroups = node.children
  if (childGroups && typeof childGroups === 'object') {
    for (const [childName, childNode] of Object.entries(childGroups)) {
      extractYamlGroup(childNode, childName, out, gv, hv)
      // Propagate child hosts up to parent
      if (!out[groupName]) out[groupName] = new Set()
      if (out[childName]) out[childName].forEach((h) => out[groupName].add(h))
    }
  }
}

function parseYamlInventory(text) {
  const parsed = yaml.load(text)
  if (!parsed || typeof parsed !== 'object') return null

  const out = {}
  const groupvars = {}
  const hostvars = {}
  for (const [topGroup, node] of Object.entries(parsed)) {
    extractYamlGroup(node, topGroup, out, groupvars, hostvars)
  }

  if (Object.keys(out).length === 0) return null

  // Ensure 'all' exists
  const allHosts = new Set(Object.values(out).flatMap((s) => [...s]))
  if (!out.all) out.all = new Set()
  allHosts.forEach((h) => out.all.add(h))

  return {
    groups: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()])),
    groupvars,
    hostvars,
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an Ansible inventory string (JSON, INI, or YAML).
 * JSON (ansible-inventory --list) is tried first as it is the most reliable
 * machine-readable format and the primary export from dynamic inventories.
 * Returns { groups, groupvars, hostvars, format, error }.
 */
export function parseInventoryText(text) {
  if (!text || !text.trim()) {
    return { groups: null, groupvars: {}, hostvars: {}, format: null, error: 'Empty input.' }
  }

  const trimmed = text.trim()
  // An INI file commonly opens with a `[group]` section header — don't mistake
  // that for a JSON array.
  const firstLine = trimmed.split('\n')[0].trim()
  const looksLikeIniHeader = /^\[[^\]]+\]$/.test(firstLine)
  let jsonError = null

  // 1. Try JSON first (ansible-inventory --list output, dynamic inventories)
  if (trimmed.startsWith('{') || (trimmed.startsWith('[') && !looksLikeIniHeader)) {
    try {
      const result = parseJsonInventory(trimmed)
      if (result) return { ...result, format: 'json', error: null }
    } catch (e) {
      jsonError = `JSON parse error: ${e.message}` // fall through — may still be INI/YAML
    }
  }

  // 2. Try YAML (static yaml inventory plugin format)
  const looksLikeYaml = /^[a-z_][a-z0-9_]*\s*:/m.test(trimmed)
  if (looksLikeYaml && !looksLikeIniHeader) {
    try {
      const result = parseYamlInventory(text)
      if (result) return { ...result, format: 'yaml', error: null }
    } catch {
      // fall through to INI
    }
  }

  // 3. Try INI
  try {
    const result = parseIni(text)
    const hasContent = Object.values(result.groups).some((h) => h.length > 0)
    if (hasContent) return { ...result, format: 'ini', error: null }
  } catch {
    // fall through to the generic error below
  }

  return {
    groups: null, groupvars: {}, hostvars: {}, format: null,
    error: jsonError || 'Could not detect a valid inventory format (JSON, INI, or YAML).',
  }
}

/** When a project has no inventory, derive a single representative host from
 *  the active playbook's hosts patterns so play/role/-e vars still resolve. */
export function syntheticInventory(plays) {
  const host = 'example-host'
  const groups = { all: [host] }
  for (const p of (plays || [])) {
    const pat = Array.isArray(p?.hosts) ? p.hosts.join(':') : String(p?.hosts ?? '')
    for (const tok of pat.split(/[:,&!]/)) {
      const t = tok.trim().replace(/[*?[\]]/g, '')
      if (t && t !== 'all' && t !== '*' && /^[\w.-]+$/.test(t)) {
        if (!groups[t]) groups[t] = []
        if (!groups[t].includes(host)) groups[t].push(host)
      }
    }
  }
  return { groups, groupvars: {}, hostvars: {}, synthetic: true }
}

/**
 * Inverse of parseInventoryText's JSON branch — serializes {groups, hostvars}
 * back into `ansible-inventory --list`-shaped JSON text, so Limits Lab's
 * in-memory inventory can be dropped into a project as a real file.
 */
export function buildInventoryJson(groups = {}, hostvars = {}) {
  const out = {}
  for (const [group, hosts] of Object.entries(groups)) {
    out[group] = { hosts: [...hosts].sort() }
  }
  if (Object.keys(hostvars).length) out._meta = { hostvars }
  return JSON.stringify(out, null, 2)
}

/**
 * Merge two inventories. Mode 'replace' overwrites; 'append' unions hosts per group.
 */
export function mergeInventories(existing, incoming, mode) {
  if (mode === 'replace') return incoming
  // Append: union per group
  const result = { ...existing }
  for (const [group, hosts] of Object.entries(incoming)) {
    if (result[group]) {
      const merged = new Set([...result[group], ...hosts])
      result[group] = [...merged].sort()
    } else {
      result[group] = hosts
    }
  }
  return result
}
