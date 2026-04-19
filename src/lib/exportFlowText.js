/**
 * exportFlowText.js
 * Convert current ReactFlow nodes/edges into text exports:
 *  - Mermaid flowchart
 *  - PlantUML component-style UML (server-compatible)
 */

function safeId(id) {
  const raw = String(id ?? 'node')
  return `n_${raw.replace(/[^a-zA-Z0-9_]/g, '_')}`
}

function cleanLabel(value) {
  return String(value ?? '')
    .replace(/\n/g, ' ')
    .replace(/"/g, "'")
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .trim()
}

function nodeLabel(node) {
  const label = cleanLabel(node?.data?.label || node?.id)
  switch (node?.type) {
    case 'playNode':
      return `Play: ${label}`
    case 'taskNode':
    case 'loopNode':
      return label
    case 'conditionalNode':
      return label || 'Condition'
    case 'handlerNode':
      return `Handler: ${label}`
    case 'sectionNode':
      return label
    case 'includeNode':
      return `Include: ${label}`
    case 'missingFileNode':
      return `Missing file: ${label}`
    case 'skipNode':
      return 'Skip'
    case 'mergeNode':
      return 'Merge'
    default:
      return label
  }
}

function mermaidNodeLine(node) {
  const id = safeId(node.id)
  const label = nodeLabel(node)
  switch (node?.type) {
    case 'conditionalNode':
      return `${id}{\"${label}\"}`
    case 'skipNode':
      return `${id}([\"${label}\"])`
    case 'mergeNode':
      return `${id}((\"${label}\"))`
    case 'handlerNode':
      return `${id}[[\"${label}\"]]`
    case 'sectionNode':
      return `${id}[\"${label}\"]`
    case 'includeNode':
      return `${id}[\"${label}\"]`
    case 'missingFileNode':
      return `${id}[\"${label}\"]`
    default:
      return `${id}[\"${label}\"]`
  }
}

function mermaidEdgeLine(edge) {
  const src = safeId(edge?.source)
  const dst = safeId(edge?.target)
  const label = cleanLabel(edge?.label)
  if (label) return `${src} -->|\"${label}\"| ${dst}`
  return `${src} --> ${dst}`
}

export function toMermaidFlow(nodes = [], edges = []) {
  const lines = ['flowchart TD']

  nodes.forEach((n) => {
    if (n?.type === 'groupBgNode') return
    lines.push(`  ${mermaidNodeLine(n)}`)
  })

  edges.forEach((e) => {
    lines.push(`  ${mermaidEdgeLine(e)}`)
  })

  return lines.join('\n')
}

function pumlNodeLine(node) {
  const id = safeId(node.id)
  const label = nodeLabel(node)
  switch (node?.type) {
    case 'conditionalNode':
      return `rectangle \"${label}\\n<<condition>>\" as ${id}`
    case 'handlerNode':
      return `component \"${label}\" as ${id}`
    case 'sectionNode':
      return `rectangle \"${label}\" as ${id} #1e293b`
    case 'includeNode':
      return `rectangle \"${label}\\n<<include>>\" as ${id}`
    case 'missingFileNode':
      return `rectangle \"${label}\" as ${id} #3f1d1d`
    case 'skipNode':
      return `rectangle \"${label}\\n<<skip>>\" as ${id}`
    case 'mergeNode':
      return `rectangle \"Merge\" as ${id}`
    default:
      return `rectangle \"${label}\" as ${id}`
  }
}

function pumlEdgeLine(edge) {
  const src = safeId(edge?.source)
  const dst = safeId(edge?.target)
  const label = cleanLabel(edge?.label)
  if (label) return `${src} --> ${dst} : ${label}`
  return `${src} --> ${dst}`
}

export function toPlantUmlFlow(nodes = [], edges = []) {
  const lines = [
    '@startuml',
    'skinparam shadowing false',
    'skinparam BackgroundColor transparent',
    'skinparam ArrowColor #7dd3fc',
    'skinparam defaultFontName JetBrains Mono',
  ]

  nodes.forEach((n) => {
    if (n?.type === 'groupBgNode') return
    lines.push(pumlNodeLine(n))
  })

  edges.forEach((e) => {
    lines.push(pumlEdgeLine(e))
  })

  lines.push('@enduml')
  return lines.join('\n')
}
