import { driver } from 'driver.js'

/**
 * Build a driver.js tour for the given mode.
 * Steps use `[data-tour="key"]` selectors so no IDs need to be set
 * on deeply nested elements.
 *
 * Some steps need to flip app state (e.g. switch tabs) the moment they're
 * reached, so the user doesn't have to click anything first. Pass a `hooks`
 * map of { [hookKey]: fn } and reference it from a step via `hookKey` - the
 * hook fires as soon as that step starts highlighting.
 */
export function startTour(mode, hooks = {}) {
  const steps = STEPS[mode]
  if (!steps || steps.length === 0) return

  const d = driver({
    showProgress: true,
    smoothScroll: true,
    nextBtnText: 'Next →',
    prevBtnText: '← Back',
    doneBtnText: 'Done',
    steps: steps.map(({ selector, title, description, side, align, hookKey }) => {
      const hook = hookKey && hooks[hookKey]
      return {
        element: selector,
        onHighlightStarted: hook ? () => hook() : undefined,
        popover: { title, description, side: side ?? 'bottom', align: align ?? 'start' },
      }
    }),
  })

  d.drive()
}

const STEPS = {
  playbook: [
    {
      selector: '[data-tour="mode-tabs"]',
      title: 'Mode Switcher',
      description: 'Switch between <b>Playbook</b>, <b>Snippet</b>, <b>Jinja2</b>, and <b>Limits</b> views. Each mode is independent - your content is preserved when you switch.',
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
      description: 'Explains the selected task or play in plain English - what module is used, what it does, and any conditions or loops applied.',
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
      description: 'Simulate <code>ansible_facts</code> - the host variables Ansible collects at runtime. The flow and Jinja2 renderer use these to evaluate <code>when</code> conditions and variable expressions.',
      side: 'bottom',
    },
    {
      selector: '[data-tour="view-tabs"]',
      title: 'Variable Resolver',
      description: 'This tab answers a classic Ansible question: "I set this variable in 3 places - which one actually wins?" Switching you there now.',
      side: 'bottom',
      align: 'center',
      hookKey: 'switchToResolve',
    },
    {
      selector: '[data-tour="resolver-pickers"]',
      title: 'Pick What You\'re Resolving',
      description: 'Two dropdowns: which <b>inventory</b> and which <b>host</b>. Variables can resolve differently for every host - change either and the table updates instantly. (To resolve a different playbook, switch the active playbook in the toolbar above.)',
      side: 'bottom',
      align: 'start',
    },
    {
      selector: '[data-tour="resolver-actions"]',
      title: 'Send Vars Elsewhere',
      description: 'Found a value worth testing somewhere else? <b>Use in Flow</b> loads this host\'s resolved variables into the Execution Flow tab. <b>Jinja2</b> loads them into the Jinja2 sandbox.',
      side: 'bottom',
      align: 'end',
    },
    {
      selector: '[data-tour="resolver-groups"]',
      title: 'Group Membership',
      description: 'Every inventory <b>group</b> this host belongs to, and every <b>play</b> that targets it. This matters because <code>group_vars</code> only apply to hosts actually <i>in</i> that group.',
      side: 'bottom',
      align: 'start',
    },
    {
      selector: '[data-tour="resolver-filters"]',
      title: 'Narrow the List',
      description: '<b>Filter</b> searches by name. <b>Referenced only</b> hides variables your playbook never actually uses. <b>Show facts</b> reveals Ansible\'s built-in <code>ansible_*</code> facts (hidden by default - there are a lot of them).',
      side: 'bottom',
      align: 'start',
    },
    {
      selector: '[data-tour="resolver-extravars"]',
      title: 'Extra Vars (-e)',
      description: 'Simulates running <code>ansible-playbook -e ...</code>. Pick a vars file, or type <code>key=value</code> pairs.'
        + '<br><br>These <b>always win</b> over every other source - that\'s precedence level <code>L22</code>, the highest there is.',
      side: 'bottom',
      align: 'start',
    },
    {
      selector: '[data-tour="resolver-mocks"]',
      title: 'Mock Runtime Values',
      description: 'Some variables only exist while a playbook is actually running - facts, <code>register</code> results, role params. Give them a test value here so the table (and Jinja2 expressions) resolve instead of showing "undefined".',
      side: 'top',
      align: 'start',
    },
    {
      selector: '[data-tour="resolver-table"]',
      title: 'The "L" Badges = Priority Ranking',
      description:
        'Every variable gets a badge like <code>L11</code> or <code>L12</code>. Think of it as a <b>priority ranking from 1 to 22</b> - '
        + '<code>L1</code> is the weakest source, <code>L22</code> is the strongest.'
        + '<br><br><b>Bigger number always wins</b> - no matter where it appears in your files. That\'s why <code>L12</code> '
        + '(play <code>vars:</code>) beats <code>L11</code> (host facts) here, even though facts are usually "more specific."'
        + '<br><br>Hover any badge to see its full name. Click a row to see <i>every</i> place that variable was set, ranked.',
      side: 'top',
      align: 'center',
    },
    {
      selector: '[data-tour="resolver-stack"]',
      title: 'See Every Place It Was Set',
      description: 'Clicking a row opens this panel - it lists <b>every</b> place that variable was defined, not just the winner, ranked by precedence. (Selected one for you below.)'
        + '<br><br>The <span style="color:#34d399">green</span> entry on top won. Greyed-out entries below were <i>shadowed</i> - they were set, but a higher level overrode them. The small <span>↗</span> icon links to Ansible\'s official precedence docs.',
      side: 'left',
      align: 'start',
      hookKey: 'selectFirstVar',
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
      description: 'Paste a <b>single Ansible task</b> here to get an instant visual breakdown - no full playbook needed.',
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
      description: 'A visual breakdown of the task: the module used, each parameter, any <code>when</code> conditions, loops, and tags - all explained in plain English.',
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
      description: 'Enter any Jinja2 template - variable lookups, filters, conditionals, loops. Example: <code>{{ inventory_hostname | upper }}</code>',
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
      description: 'Define the variables the Jinja2 expression can reference. Add your own hostnames, IPs, custom variables - anything the template expects.',
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
      description: 'Define your inventory visually - add groups, add hosts to groups, or import a real inventory file (JSON from <code>ansible-inventory --list</code>, INI, or YAML).',
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
