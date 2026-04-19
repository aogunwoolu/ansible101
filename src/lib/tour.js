import { driver } from 'driver.js'

/**
 * Build a driver.js tour for the given mode.
 * Steps use `[data-tour="key"]` selectors so no IDs need to be set
 * on deeply nested elements.
 */
export function startTour(mode) {
  const steps = STEPS[mode]
  if (!steps || steps.length === 0) return

  const d = driver({
    showProgress: true,
    smoothScroll: true,
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Done',
    steps: steps.map(({ selector, title, description, side, align }) => ({
      element: selector,
      popover: { title, description, side: side ?? 'bottom', align: align ?? 'start' },
    })),
  })

  d.drive()
}

const STEPS = {
  playbook: [
    {
      selector: '[data-tour="mode-tabs"]',
      title: 'Mode Switcher',
      description: 'Switch between <b>Playbook</b>, <b>Snippet</b>, <b>Jinja2</b>, and <b>Limits</b> views. Each mode is independent — your content is preserved when you switch.',
      side: 'bottom',
      align: 'center',
    },
    {
      selector: '[data-tour="editor-pane"]',
      title: 'YAML Editor',
      description: 'Paste or type your Ansible playbook here. The editor gives you syntax highlighting, error squiggles, and line-level highlighting when you click a flow node.',
      side: 'right',
    },
    {
      selector: '[data-tour="file-explorer"]',
      title: 'File Explorer',
      description: 'Add extra task files (<code>include_tasks</code>, role files, scripts) as tabs here. Drag tabs to reorder. The flow resolves cross-file task references automatically.',
      side: 'right',
    },
    {
      selector: '[data-tour="flow-pane"]',
      title: 'Execution Flow',
      description: 'A live graph of every play, task and handler in the playbook. <b>Click any node</b> to jump to it in the editor and see a plain-English explanation on the right.',
      side: 'left',
    },
    {
      selector: '[data-tour="human-sidebar"]',
      title: 'Human Explanation',
      description: 'Explains the selected task or play in plain English — what module is used, what it does, and any conditions or loops applied.',
      side: 'left',
    },
    {
      selector: '[data-tour="btn-vars"]',
      title: 'Playbook Vars',
      description: 'Override <code>vars</code> and <code>vars_files</code> values defined in the playbook. Useful for testing different variable combinations without editing the YAML.',
      side: 'bottom',
    },
    {
      selector: '[data-tour="btn-facts"]',
      title: 'Mock Ansible Facts',
      description: 'Simulate <code>ansible_facts</code> — the host variables Ansible collects at runtime. The flow and Jinja2 renderer use these to evaluate <code>when</code> conditions and variable expressions.',
      side: 'bottom',
    },
    {
      selector: '[data-tour="btn-share"]',
      title: 'Share',
      description: 'Copies a URL to your clipboard that encodes the current playbook and extra files. Anyone with the link opens exactly what you see.',
      side: 'bottom',
    },
  ],

  snippet: [
    {
      selector: '[data-tour="mode-tabs"]',
      title: 'Snippet Mode',
      description: 'Paste a <b>single Ansible task</b> here to get an instant visual breakdown — no full playbook needed.',
      side: 'bottom',
      align: 'center',
    },
    {
      selector: '[data-tour="editor-pane"]',
      title: 'Task YAML',
      description: 'Paste one task in YAML format. For example: <pre>- name: Install nginx\n  apt:\n    name: nginx\n    state: present</pre>The card updates as you type.',
      side: 'right',
    },
    {
      selector: '[data-tour="snippet-pane"]',
      title: 'Quick Card',
      description: 'A visual breakdown of the task: the module used, each parameter, any <code>when</code> conditions, loops, and tags — all explained in plain English.',
      side: 'left',
    },
    {
      selector: '[data-tour="btn-facts"]',
      title: 'Mock Facts',
      description: 'Provide mock facts to evaluate <code>when</code> conditions and Jinja2 expressions inside the task.',
      side: 'bottom',
    },
  ],

  jinja2: [
    {
      selector: '[data-tour="mode-tabs"]',
      title: 'Jinja2 Mode',
      description: 'A sandbox for Ansible\'s <b>Jinja2 templating engine</b>. Paste any expression to trace how it evaluates step by step.',
      side: 'bottom',
      align: 'center',
    },
    {
      selector: '[data-tour="editor-pane"]',
      title: 'Jinja2 Expression',
      description: 'Enter any Jinja2 template — variable lookups, filters, conditionals, loops. Example: <code>{{ inventory_hostname | upper }}</code>',
      side: 'right',
    },
    {
      selector: '[data-tour="jinja2-pane"]',
      title: 'Pipeline View',
      description: 'Shows each step in the evaluation pipeline: variable substitution → filters applied → final output. Hover a step to see the intermediate value.',
      side: 'left',
    },
    {
      selector: '[data-tour="btn-facts"]',
      title: 'Mock Facts',
      description: 'Define the variables the Jinja2 expression can reference. Add your own hostnames, IPs, custom variables — anything the template expects.',
      side: 'bottom',
    },
  ],

  limits: [
    {
      selector: '[data-tour="mode-tabs"]',
      title: 'Limits Mode',
      description: 'A sandbox for testing Ansible\'s <code>--limit</code> flag. Build an inventory, write a pattern, and instantly see which hosts match.',
      side: 'bottom',
      align: 'center',
    },
    {
      selector: '[data-tour="inventory-editor"]',
      title: 'Inventory Editor',
      description: 'Define your inventory visually — add groups, add hosts to groups, or import a real inventory file (JSON from <code>ansible-inventory --list</code>, INI, or YAML).',
      side: 'right',
    },
    {
      selector: '[data-tour="inventory-import"]',
      title: 'Import Inventory',
      description: 'Click <b>Import</b> or <b>paste / drag-and-drop</b> an inventory file directly onto this panel. Supports <code>ansible-inventory --list</code> JSON, classic INI, and YAML formats.',
      side: 'right',
    },
    {
      selector: '[data-tour="limit-input"]',
      title: 'Limit Pattern',
      description: 'Type an Ansible <code>--limit</code> pattern. Examples: <code>web:db</code> (union), <code>web:&amp;production</code> (intersection), <code>all:!staging</code> (exclusion), <code>web-0*</code> (wildcard). Autocomplete suggests groups and hosts as you type.',
      side: 'bottom',
    },
    {
      selector: '[data-tour="limit-results"]',
      title: 'Match Results',
      description: 'Every group is shown with its hosts. <b>Matched hosts</b> are highlighted in green, <b>excluded hosts</b> are dimmed. Click any host to open its detail panel.',
      side: 'top',
    },
  ],
}
