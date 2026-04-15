/**
 * detectContentType.js
 * Classifies pasted or typed text into one of three modes:
 *   'playbook'  – full Ansible play (array with hosts key)
 *   'snippet'   – single task or task fragment
 *   'jinja2'    – a Jinja2 / Nunjucks expression
 */
import yaml from 'js-yaml'

/**
 * Jinja2 expression heuristic: contains {{ ... }} or {% ... %} but
 * is NOT a valid multi-play YAML list.
 */
function looksLikeJinja2(text) {
  return /\{\{.*?\}\}/.test(text) || /\{%-?\s*(if|for|set|filter|block)/.test(text)
}

/**
 * Is this a full playbook? Must parse as an array whose first element
 * has a 'hosts' or 'tasks' key.
 */
function looksLikePlaybook(text) {
  try {
    const parsed = yaml.load(text)
    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0]
      return (
        typeof first === 'object' &&
        first !== null &&
        ('hosts' in first || 'tasks' in first || 'roles' in first)
      )
    }
  } catch {
    // not valid YAML
  }
  return false
}

/**
 * Is this a single-task snippet? Parses as an object (or short array)
 * that has at least one recognised module key.
 */
const MODULE_KEYS = new Set([
  'apt', 'yum', 'dnf', 'pip', 'copy', 'template', 'file',
  'service', 'systemd', 'shell', 'command', 'debug',
  'lineinfile', 'replace', 'fetch', 'get_url', 'uri',
  'user', 'group', 'cron', 'include_tasks', 'import_tasks',
  'block', 'set_fact', 'fail', 'assert', 'wait_for', 'name',
  'register', 'when', 'loop', 'with_items', 'notify', 'become',
])

function looksLikeSnippet(text) {
  try {
    const parsed = yaml.load(text)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const keys = Object.keys(parsed)
      return keys.some((k) => MODULE_KEYS.has(k))
    }
    // Could also be a list of one task
    if (Array.isArray(parsed) && parsed.length === 1) {
      const task = parsed[0]
      if (task && typeof task === 'object') {
        return Object.keys(task).some((k) => MODULE_KEYS.has(k))
      }
    }
  } catch {
    // ignore
  }
  return false
}

/**
 * Main detector – returns 'playbook' | 'snippet' | 'jinja2' | 'unknown'
 */
export function detectContentType(text) {
  if (!text || !text.trim()) return 'unknown'

  const trimmed = text.trim()

  // Pure Jinja2 check first (may also appear in YAML values)
  if (looksLikeJinja2(trimmed) && !looksLikePlaybook(trimmed)) {
    // If it's a single-line or multi-line expression without YAML structure
    const lines = trimmed.split('\n')
    const yamlLike = lines.some((l) => /^\s*-\s+\w+:/.test(l) || /^\s*\w+:\s/.test(l))
    if (!yamlLike) return 'jinja2'
  }

  if (looksLikePlaybook(trimmed)) return 'playbook'
  if (looksLikeSnippet(trimmed)) return 'snippet'

  // Fall back: if it contains Jinja2 but is also YAML, treat as playbook/snippet
  if (looksLikeJinja2(trimmed)) return 'snippet'

  return 'unknown'
}
