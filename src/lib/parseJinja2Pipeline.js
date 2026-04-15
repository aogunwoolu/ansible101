/**
 * parseJinja2Pipeline.js
 * Parses a Jinja2 expression string like:
 *   {{ groups['all'] | map(attribute='hostname') | sort | join(', ') }}
 * into an ordered list of pipeline steps for the Transformation Trace view.
 */
import { describeFilter } from './filterTranslations'
import { renderJinja2 } from './jinja2Engine'

/**
 * Strip {{ }} wrappers and trim.
 */
function unwrap(expr) {
  return expr.trim().replace(/^\{\{[-\s]*/, '').replace(/[-\s]*\}\}$/, '').trim()
}

/**
 * Tokenise a pipe chain, respecting parentheses nesting.
 * Returns an array of raw segment strings:
 *   ['groups["all"]', 'map(attribute="hostname")', 'sort', 'join(", ")']
 */
function tokenisePipe(expr) {
  const segments = []
  let current = ''
  let depth = 0

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === '(' || ch === '[') { depth++; current += ch }
    else if (ch === ')' || ch === ']') { depth--; current += ch }
    else if (ch === '|' && depth === 0) {
      segments.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) segments.push(current.trim())
  return segments
}

/**
 * Parse a filter call like 'selectattr("state","equalto","active")'
 * into { name: 'selectattr', args: ['"state"', '"equalto"', '"active"'] }
 */
function parseFilterToken(token) {
  const parenIdx = token.indexOf('(')
  if (parenIdx === -1) {
    return { name: token.trim(), args: [] }
  }
  const name = token.slice(0, parenIdx).trim()
  const argsRaw = token.slice(parenIdx + 1, token.lastIndexOf(')')).trim()
  // Split args by comma (ignoring nested parens)
  const args = []
  let buf = '', d = 0
  for (const ch of argsRaw) {
    if (ch === '(' || ch === '[') { d++; buf += ch }
    else if (ch === ')' || ch === ']') { d--; buf += ch }
    else if (ch === ',' && d === 0) { args.push(buf.trim()); buf = '' }
    else buf += ch
  }
  if (buf.trim()) args.push(buf.trim())
  return { name, args }
}

/**
 * Main function: parse a Jinja2 expression string into pipeline steps.
 * Each step:
 *   {
 *     type: 'input' | 'filter',
 *     token: string,          // raw token
 *     filterName: string,
 *     args: string[],
 *     label: string,          // human label
 *     desc: string,           // human description
 *     intermediateExpr: string, // evaluable expression up to this step
 *     result: any,            // evaluated (filled in by evaluatePipeline)
 *     error: string|null,
 *   }
 */
export function parseJinja2Pipeline(rawExpr) {
  const expr = unwrap(rawExpr)
  const segments = tokenisePipe(expr)

  if (segments.length === 0) return []

  const steps = []

  // Step 0: input variable
  steps.push({
    type: 'input',
    token: segments[0],
    filterName: null,
    args: [],
    label: 'Input',
    desc: `Starting value: ${segments[0]}`,
    intermediateExpr: `{{ ${segments[0]} }}`,
    result: undefined,
    error: null,
  })

  // Steps 1..N: filters
  for (let i = 1; i < segments.length; i++) {
    const { name, args } = parseFilterToken(segments[i])
    const { label, desc } = describeFilter(name, args)
    // Build evaluable expression for each step
    const partialPipe = segments.slice(0, i + 1).join(' | ')
    steps.push({
      type: 'filter',
      token: segments[i],
      filterName: name,
      args,
      label,
      desc,
      intermediateExpr: `{{ ${partialPipe} }}`,
      result: undefined,
      error: null,
    })
  }

  return steps
}

/**
 * For each step in the pipeline, evaluate the intermediateExpr with
 * the given context and attach the result.
 */
export function evaluatePipeline(steps, context) {
  return steps.map((step) => {
    const { result, error } = renderJinja2(step.intermediateExpr, context)
    return { ...step, result, error }
  })
}
