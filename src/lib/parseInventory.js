/**
 * parseInventory.js
 * Parses Ansible inventory files in INI, YAML, or JSON format into a
 * flat { groupName: string[] } object suitable for InventoryLab.
 *
 * JSON format (ansible-inventory --list output):
 *   ansible-inventory -i <source> --list > inventory.json
 *   ansible-inventory -i aws_ec2.yml --list > inventory.json
 *
 * INI format:
 *   [group]
 *   host1
 *   host2 ansible_host=1.2.3.4
 *
 *   [group:children]
 *   other_group
 *
 *   [group:vars]        ← ignored
 *   ansible_user=deploy
 *
 * YAML format (ansible.builtin.yaml inventory plugin):
 *   all:
 *     hosts:
 *       web-01:
 *     children:
 *       web:
 *         hosts:
 *           web-01:
 *           web-02:
 */
import yaml from 'js-yaml'

// ── JSON parser (ansible-inventory --list) ──────────────────────────────────

function parseJsonInventory(text) {
  const parsed = JSON.parse(text) // throws on bad JSON
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null

  const hostvars = parsed._meta?.hostvars ?? {}
  const out = {}   // groupName → Set<string>

  // Collect all group keys first (skip _meta)
  for (const [key, val] of Object.entries(parsed)) {
    if (key === '_meta') continue
    if (!out[key]) out[key] = new Set()

    if (val && typeof val === 'object' && !Array.isArray(val)) {
      // Modern format: { hosts: [...], children: [...] }
      const hosts    = val.hosts    ?? []
      const children = val.children ?? []
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
    for (const [group, set] of Object.entries(out)) {
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
    hostvars,
  }
}

// ── INI parser ───────────────────────────────────────────────────────────────

function parseIni(text) {
  const groups = {}   // groupName → Set<string>
  const children = {} // groupName → string[] (child group names)

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

    if (!currentGroup || currentMode === 'vars') continue

    // Host / child entry (first token, strip ansible variables)
    const token = line.split(/\s+/)[0]
    if (!token) continue

    if (currentMode === 'hosts') {
      groups[currentGroup].add(token)
    } else if (currentMode === 'children') {
      if (!children[currentGroup]) children[currentGroup] = []
      children[currentGroup].push(token)
    }
  }

  // Resolve :children — add child group's hosts to parent
  // Do multiple passes to handle transitive nesting
  for (let pass = 0; pass < 5; pass++) {
    for (const [parent, childNames] of Object.entries(children)) {
      for (const child of childNames) {
        if (groups[child]) {
          groups[child].forEach((h) => groups[parent]?.add(h))
        }
      }
    }
  }

  // Always ensure 'all' exists and contains every host
  const allHosts = new Set(Object.values(groups).flatMap((s) => [...s]))
  if (!groups.all) groups.all = new Set()
  allHosts.forEach((h) => groups.all.add(h))

  // Convert Sets → arrays
  return Object.fromEntries(
    Object.entries(groups).map(([k, v]) => [k, [...v].sort()])
  )
}

// ── YAML parser ──────────────────────────────────────────────────────────────

function extractYamlGroup(node, groupName, out) {
  if (!node || typeof node !== 'object') return

  // Collect direct hosts
  const hosts = node.hosts
  if (hosts && typeof hosts === 'object') {
    if (!out[groupName]) out[groupName] = new Set()
    for (const host of Object.keys(hosts)) {
      out[groupName].add(host)
    }
  }

  // Recurse into children groups
  const childGroups = node.children
  if (childGroups && typeof childGroups === 'object') {
    for (const [childName, childNode] of Object.entries(childGroups)) {
      extractYamlGroup(childNode, childName, out)
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
  for (const [topGroup, node] of Object.entries(parsed)) {
    extractYamlGroup(node, topGroup, out)
  }

  if (Object.keys(out).length === 0) return null

  // Ensure 'all' exists
  const allHosts = new Set(Object.values(out).flatMap((s) => [...s]))
  if (!out.all) out.all = new Set()
  allHosts.forEach((h) => out.all.add(h))

  return Object.fromEntries(
    Object.entries(out).map(([k, v]) => [k, [...v].sort()])
  )
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse an Ansible inventory string (JSON, INI, or YAML).
 * JSON (ansible-inventory --list) is tried first as it is the most reliable
 * machine-readable format and the primary export from dynamic inventories.
 * Returns { groups: { groupName: string[] }, format: 'json'|'ini'|'yaml', error: string|null }
 */
export function parseInventoryText(text) {
  if (!text || !text.trim()) {
    return { groups: null, format: null, error: 'Empty input.' }
  }

  const trimmed = text.trim()

  // 1. Try JSON first (ansible-inventory --list output, dynamic inventories)
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const result = parseJsonInventory(trimmed)
      if (result) return { groups: result.groups, hostvars: result.hostvars, format: 'json', error: null }
    } catch (e) {
      return { groups: null, hostvars: {}, format: null, error: `JSON parse error: ${e.message}` }
    }
  }

  // 2. Try YAML (static yaml inventory plugin format)
  const looksLikeYaml = /^[a-z_][a-z0-9_]*\s*:/m.test(trimmed)
  const looksLikeIni  = trimmed.startsWith('[')

  if (looksLikeYaml && !looksLikeIni) {
    try {
      const groups = parseYamlInventory(text)
      if (groups) return { groups, hostvars: {}, format: 'yaml', error: null }
    } catch (e) {
      // fall through to INI
    }
  }

  // 3. Try INI
  try {
    const groups = parseIni(text)
    const hasContent = Object.values(groups).some((h) => h.length > 0)
    if (hasContent) return { groups, hostvars: {}, format: 'ini', error: null }
  } catch (e) {
    return { groups: null, hostvars: {}, format: null, error: e.message }
  }

  return { groups: null, hostvars: {}, format: null, error: 'Could not detect a valid inventory format (JSON, INI, or YAML).' }
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
