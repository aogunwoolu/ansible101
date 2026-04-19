/**
 * ansibleLimit.js
 * Implements Ansible's host pattern / --limit matching logic.
 *
 * Ansible colon-separates groups in patterns and supports:
 *   group1:group2        → union  (run on hosts in either group)
 *   group1:&group2       → intersection (run on hosts in BOTH)
 *   group1:!group2       → difference (in group1 but NOT group2)
 *   web*                 → wildcard (fnmatch-style)
 *   all / *              → all known hosts
 *   hostname             → exact host
 *
 * The --limit is ANDed on top: a host runs only if it matches
 * BOTH the play's hosts pattern AND the limit pattern.
 */

/**
 * Expand a single term (no modifiers) to a Set of hostnames.
 */
function expandTerm(term, inventory, allHosts) {
  const t = term.trim()
  if (!t || t === 'all' || t === '*') return new Set(allHosts)
  // Group match
  if (inventory[t]) return new Set(inventory[t])
  // Wildcard
  if (t.includes('*') || t.includes('?') || t.includes('[')) {
    const re = new RegExp(
      '^' +
      t.replace(/[.+^${}()|\\]/g, '\\$&')
       .replace(/\*/g, '.*')
       .replace(/\?/g, '.') +
      '$'
    )
    return new Set(allHosts.filter((h) => re.test(h)))
  }
  // Exact hostname
  if (allHosts.includes(t)) return new Set([t])
  return new Set()
}

/**
 * Evaluate a full Ansible host pattern string against an inventory.
 * inventory: { groupName: string[] }
 * Returns a Set<string> of matching hostnames.
 */
export function matchHostPattern(pattern, inventory = {}) {
  const allHosts = [...new Set(Object.values(inventory).flat())]

  if (!pattern || pattern.trim() === '' || pattern.trim() === 'all' || pattern.trim() === '*') {
    return new Set(allHosts)
  }

  // Split on : but keep modifier chars (& !) attached to the term
  const parts = pattern.split(':')

  let result = null // null = uninitialised

  for (const rawPart of parts) {
    const part = rawPart.trim()
    if (!part) continue

    if (part.startsWith('&')) {
      // Intersection
      const hosts = expandTerm(part.slice(1), inventory, allHosts)
      result = result === null
        ? hosts
        : new Set([...result].filter((h) => hosts.has(h)))
    } else if (part.startsWith('!')) {
      // Exclusion
      const hosts = expandTerm(part.slice(1), inventory, allHosts)
      if (result === null) result = new Set(allHosts)
      result = new Set([...result].filter((h) => !hosts.has(h)))
    } else {
      // Union
      const hosts = expandTerm(part, inventory, allHosts)
      if (result === null) result = new Set()
      hosts.forEach((h) => result.add(h))
    }
  }

  return result ?? new Set()
}

/**
 * Given a play and a --limit string, return which hosts would run.
 * Returns { playHosts: Set, limitedHosts: Set, skipped: boolean }
 */
export function applyLimit(playHostsPattern, limitPattern, inventory = {}) {
  const playHosts = matchHostPattern(playHostsPattern || 'all', inventory)
  if (!limitPattern || !limitPattern.trim()) {
    return { playHosts, limitedHosts: playHosts, skipped: playHosts.size === 0 }
  }
  const limitHosts = matchHostPattern(limitPattern, inventory)
  const limitedHosts = new Set([...playHosts].filter((h) => limitHosts.has(h)))
  return { playHosts, limitedHosts, skipped: limitedHosts.size === 0 }
}
