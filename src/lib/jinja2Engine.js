/**
 * jinja2Engine.js
 * Wraps Nunjucks to simulate Ansible's Jinja2 environment.
 * Returns either a rendered string or a structured error.
 *
 * NOTE: Nunjucks does not support all Ansible filters. We polyfill
 * the most common ones and provide English explanations for the rest.
 */
import nunjucks from 'nunjucks'

let nunjucksEnv = null

function getNunjucksEnv() {
  if (nunjucksEnv) return nunjucksEnv

  const env = new nunjucks.Environment(null, {
    autoescape: false,
    throwOnUndefined: false,
  })

  // ── Ansible filter polyfills ─────────────────────────────
  env.addFilter('default', (val, def = '') => (val == null || val === '' ? def : val))
  env.addFilter('mandatory', (val, msg) => {
    if (val == null) throw new Error(msg || 'Variable is mandatory but undefined')
    return val
  })
  env.addFilter('bool', (val) => {
    if (typeof val === 'boolean') return val
    if (typeof val === 'string') return ['yes', 'true', '1', 'on'].includes(val.toLowerCase())
    return Boolean(val)
  })
  env.addFilter('int', (val, def = 0) => {
    const n = parseInt(val)
    return isNaN(n) ? def : n
  })
  env.addFilter('float', (val, def = 0.0) => {
    const n = parseFloat(val)
    return isNaN(n) ? def : n
  })
  env.addFilter('string', (val) => String(val ?? ''))
  env.addFilter('lower', (val) => String(val).toLowerCase())
  env.addFilter('upper', (val) => String(val).toUpperCase())
  env.addFilter('trim', (val) => String(val).trim())
  env.addFilter('replace', (val, from, to) => String(val).split(from).join(to))
  env.addFilter('regex_replace', (val, pattern, replacement) => {
    try { return String(val).replace(new RegExp(pattern, 'g'), replacement) } catch { return val }
  })
  env.addFilter('regex_search', (val, pattern) => {
    try { const m = String(val).match(new RegExp(pattern)); return m ? m[0] : '' } catch { return '' }
  })
  env.addFilter('split', (val, sep = ' ') => String(val).split(sep))
  env.addFilter('join', (arr, sep = '') => (Array.isArray(arr) ? arr.join(sep) : String(arr)))
  env.addFilter('list', (val) => (Array.isArray(val) ? val : Object.values(val || {})))
  env.addFilter('unique', (arr) => [...new Set(arr)])
  env.addFilter('flatten', (arr, levels = Infinity) => arr.flat(levels))
  env.addFilter('sort', (arr, reverse = false) => {
    const sorted = [...(arr || [])].sort()
    return reverse ? sorted.reverse() : sorted
  })
  env.addFilter('reverse', (arr) => (Array.isArray(arr) ? [...arr].reverse() : arr))
  env.addFilter('first', (arr) => (Array.isArray(arr) ? arr[0] : arr))
  env.addFilter('last', (arr) => (Array.isArray(arr) ? arr[arr.length - 1] : arr))
  env.addFilter('length', (val) => (val == null ? 0 : val.length ?? Object.keys(val).length))
  env.addFilter('count', (val) => (val == null ? 0 : val.length ?? Object.keys(val).length))
  env.addFilter('min', (arr) => Math.min(...(arr || [])))
  env.addFilter('max', (arr) => Math.max(...(arr || [])))
  env.addFilter('sum', (arr, attr) => {
    if (!Array.isArray(arr)) return 0
    return arr.reduce((s, item) => s + (attr ? (item?.[attr] ?? 0) : (item ?? 0)), 0)
  })
  env.addFilter('abs', (val) => Math.abs(val))
  env.addFilter('round', (val, precision = 0) => parseFloat(val).toFixed(precision))
  env.addFilter('map', (arr, attr) => {
    if (!Array.isArray(arr)) return []
    return arr.map((item) => (attr ? item?.[attr] : item))
  })
  env.addFilter('select', (arr, test, val) => (arr || []).filter((item) => (val !== undefined ? item === val : item)))
  env.addFilter('reject', (arr, test, val) => (arr || []).filter((item) => !(val !== undefined ? item === val : item)))
  env.addFilter('selectattr', (arr, attr, test, val) => {
    if (!Array.isArray(arr)) return []
    if (!test || test === 'defined') return arr.filter((item) => item?.[attr] !== undefined)
    if (test === 'equalto' || test === 'eq') return arr.filter((item) => item?.[attr] === val)
    if (test === 'ne') return arr.filter((item) => item?.[attr] !== val)
    if (test === 'in') return arr.filter((item) => Array.isArray(val) ? val.includes(item?.[attr]) : false)
    if (test === 'match') return arr.filter((item) => new RegExp(val).test(item?.[attr]))
    return arr
  })
  env.addFilter('rejectattr', (arr, attr, test, val) => {
    if (!Array.isArray(arr)) return []
    if (!test || test === 'defined') return arr.filter((item) => item?.[attr] === undefined)
    if (test === 'equalto' || test === 'eq') return arr.filter((item) => item?.[attr] !== val)
    return arr
  })
  env.addFilter('combine', (...args) => Object.assign({}, ...args))
  env.addFilter('dict2items', (obj) => Object.entries(obj || {}).map(([key, value]) => ({ key, value })))
  env.addFilter('items2dict', (arr) => Object.fromEntries((arr || []).map((i) => [i.key, i.value])))
  env.addFilter('zip', (a, b) => (a || []).map((item, i) => [item, (b || [])[i]]))
  env.addFilter('product', (a, b) => (a || []).flatMap((x) => (b || []).map((y) => [x, y])))
  env.addFilter('to_json', (val) => JSON.stringify(val))
  env.addFilter('from_json', (val) => { try { return JSON.parse(val) } catch { return val } })
  env.addFilter('to_yaml', (val) => JSON.stringify(val))   // approximate
  env.addFilter('b64encode', (val) => btoa(unescape(encodeURIComponent(String(val)))))
  env.addFilter('b64decode', (val) => { try { return decodeURIComponent(escape(atob(String(val)))) } catch { return val } })
  env.addFilter('hash', (val) => String(val))  // approximate – no real hash in browser
  env.addFilter('password_hash', (val) => `<hashed:${val}>`)
  env.addFilter('dirname', (val) => String(val).split('/').slice(0, -1).join('/') || '.')
  env.addFilter('basename', (val) => String(val).split('/').pop())
  env.addFilter('expanduser', (val) => String(val).replace(/^~/, '/root'))
  env.addFilter('realpath', (val) => val)
  env.addFilter('relpath', (val) => val)
  env.addFilter('quote', (val) => `'${String(val).replace(/'/g, "'\\''")}'`)
  env.addFilter('ternary', (val, truthy, falsy) => val ? truthy : falsy)
  env.addFilter('type_debug', (val) => typeof val)

  nunjucksEnv = env
  return env
}

/**
 * Render a Jinja2 template string with the given context (mock facts).
 * Returns { result: string, error: string|null }
 */
export function renderJinja2(template, context = {}) {
  try {
    const env = getNunjucksEnv()
    // Ansible wraps bare expressions in {{ }}; ensure template is wrapped if bare
    const tpl = template.trim().startsWith('{') ? template : `{{ ${template} }}`
    const result = env.renderString(tpl, context)
    return { result, error: null }
  } catch (e) {
    return { result: null, error: e.message }
  }
}

/**
 * Evaluate a when condition against mock facts.
 * Returns { value: boolean, error: string|null }
 */
export function evaluateWhen(condition, context = {}) {
  if (!condition) return { value: true, error: null }
  try {
    const env = getNunjucksEnv()
    // Wrap in an if block to get truthiness
    const tpl = `{% if ${condition} %}true{% else %}false{% endif %}`
    const raw = env.renderString(tpl, context)
    return { value: raw.trim() === 'true', error: null }
  } catch (e) {
    return { value: true, error: e.message }   // assume true on error (safer)
  }
}
