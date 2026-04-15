/**
 * humanSpeak.js
 * Translates a parsed Ansible task object into plain English.
 */

/**
 * Extract a string value from a module arg that may be a plain string,
 * an object with "name"/"pkg"/"dest"/"src" keys, or a list.
 */
function extractArg(val, keys = ['name', 'pkg', 'dest', 'src']) {
  if (!val) return null
  if (typeof val === 'string') return val
  if (typeof val === 'object' && !Array.isArray(val)) {
    for (const k of keys) {
      if (val[k]) return val[k]
    }
    // Return first value
    const first = Object.values(val)[0]
    return typeof first === 'string' ? first : JSON.stringify(first)
  }
  if (Array.isArray(val)) return val.join(', ')
  return String(val)
}

/**
 * Generate a human-readable explanation for a single task.
 * Returns { text: string, warning: string|null, icon: string }
 */
export function generateExplanation(task) {
  if (!task) return { text: 'No task data.', warning: null, icon: 'help-circle' }

  // ── Package managers ─────────────────────────────────────────
  if (task.apt !== undefined) {
    const args = task.apt
    const pkg = extractArg(args, ['name', 'pkg'])
    const state = (typeof args === 'object' && args.state) ? args.state : 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return {
      text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using apt.`,
      warning: null,
      icon: 'package',
    }
  }

  if (task.yum !== undefined || task.dnf !== undefined) {
    const mod = task.yum !== undefined ? 'yum' : 'dnf'
    const args = task[mod]
    const pkg = extractArg(args, ['name', 'pkg'])
    const state = (typeof args === 'object' && args.state) ? args.state : 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return {
      text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using ${mod}.`,
      warning: null,
      icon: 'package',
    }
  }

  if (task.pip !== undefined) {
    const args = task.pip
    const pkg = extractArg(args, ['name'])
    return {
      text: `Installs Python package ${pkg ? `"${pkg}"` : '(see args)'} via pip.`,
      warning: null,
      icon: 'package',
    }
  }

  // ── File operations ───────────────────────────────────────────
  if (task.copy !== undefined) {
    const args = task.copy
    const dest = extractArg(args, ['dest'])
    const src = extractArg(args, ['src', 'content'])
    return {
      text: `Deploys ${src ? `"${src}"` : 'file'} to ${dest ? `"${dest}"` : '(destination not specified)'}.`,
      warning: null,
      icon: 'copy',
    }
  }

  if (task.template !== undefined) {
    const args = task.template
    const dest = extractArg(args, ['dest'])
    const src = extractArg(args, ['src'])
    return {
      text: `Renders Jinja2 template ${src ? `"${src}"` : ''} and deploys configuration file to ${dest ? `"${dest}"` : '(destination not specified)'}.`,
      warning: null,
      icon: 'file-code',
    }
  }

  if (task.file !== undefined) {
    const args = task.file
    const path = extractArg(args, ['path', 'dest', 'name'])
    const state = (typeof args === 'object' && args.state) || 'file'
    const stateMap = {
      directory: 'Creates directory',
      absent: 'Removes file/directory',
      link: 'Creates symlink',
      touch: 'Touches (creates/updates) file',
      file: 'Manages file attributes for',
    }
    const verb = stateMap[state] || 'Manages file'
    return {
      text: `${verb} ${path ? `"${path}"` : '(path not specified)'}.`,
      warning: null,
      icon: 'folder',
    }
  }

  if (task.lineinfile !== undefined) {
    const args = task.lineinfile
    const path = extractArg(args, ['path', 'dest'])
    return {
      text: `Ensures a specific line exists in file ${path ? `"${path}"` : '(path not specified)'}.`,
      warning: null,
      icon: 'file-text',
    }
  }

  if (task.fetch !== undefined) {
    const args = task.fetch
    const src = extractArg(args, ['src'])
    return {
      text: `Fetches file ${src ? `"${src}"` : ''} from the remote host to the controller.`,
      warning: null,
      icon: 'download',
    }
  }

  // ── Services ──────────────────────────────────────────────────
  if (task.service !== undefined || task.systemd !== undefined) {
    const mod = task.service !== undefined ? 'service' : 'systemd'
    const args = task[mod]
    const name = extractArg(args, ['name'])
    const state = (typeof args === 'object' && args.state) || 'started'
    const enabled = (typeof args === 'object' && args.enabled !== undefined) ? args.enabled : null
    let parts = [`Manages background service ${name ? `"${name}"` : '(name not specified)'}`]
    const stateMap = { started: 'starts', stopped: 'stops', restarted: 'restarts', reloaded: 'reloads' }
    if (stateMap[state]) parts.push(`— ${stateMap[state]} it`)
    if (enabled === true) parts.push('and enables it on boot')
    if (enabled === false) parts.push('and disables it on boot')
    return {
      text: parts.join(' ') + '.',
      warning: null,
      icon: 'activity',
    }
  }

  // ── Network ───────────────────────────────────────────────────
  if (task.get_url !== undefined) {
    const args = task.get_url
    const url = extractArg(args, ['url'])
    const dest = extractArg(args, ['dest'])
    return {
      text: `Downloads file from ${url ? `"${url}"` : '(url not specified)'} to ${dest ? `"${dest}"` : '(destination not specified)'}.`,
      warning: null,
      icon: 'download-cloud',
    }
  }

  if (task.uri !== undefined) {
    const args = task.uri
    const url = extractArg(args, ['url'])
    const method = (typeof args === 'object' && args.method) || 'GET'
    return {
      text: `Sends an HTTP ${method} request to ${url ? `"${url}"` : '(url not specified)'}.`,
      warning: null,
      icon: 'globe',
    }
  }

  // ── Shell / Command (non-idempotent) ──────────────────────────
  if (task.shell !== undefined) {
    const cmd = typeof task.shell === 'string' ? task.shell : extractArg(task.shell, ['cmd', '_raw_params'])
    return {
      text: `Runs shell command: ${cmd ? `"${cmd}"` : '(see args)'}.`,
      warning: 'Non-idempotent command detected. Consider an idempotent Ansible module instead.',
      icon: 'terminal',
    }
  }

  if (task.command !== undefined) {
    const cmd = typeof task.command === 'string' ? task.command : extractArg(task.command, ['cmd', '_raw_params'])
    return {
      text: `Executes command: ${cmd ? `"${cmd}"` : '(see args)'}.`,
      warning: 'Non-idempotent command detected. Consider an idempotent Ansible module instead.',
      icon: 'terminal',
    }
  }

  // ── Debug / Variables ────────────────────────────────────────
  if (task.debug !== undefined) {
    const args = task.debug
    const msg = (typeof args === 'object' && args.msg) ? `"${args.msg}"` : ''
    return {
      text: `Prints debug output${msg ? `: ${msg}` : ''}.`,
      warning: null,
      icon: 'bug',
    }
  }

  if (task.set_fact !== undefined) {
    const keys = typeof task.set_fact === 'object' ? Object.keys(task.set_fact).join(', ') : ''
    return {
      text: `Sets host variable(s)${keys ? `: ${keys}` : ''}.`,
      warning: null,
      icon: 'variable',
    }
  }

  // ── User management ────────────────────────────────────────
  if (task.user !== undefined) {
    const args = task.user
    const name = extractArg(args, ['name'])
    const state = (typeof args === 'object' && args.state) || 'present'
    return {
      text: `${state === 'absent' ? 'Removes' : 'Creates/manages'} system user ${name ? `"${name}"` : ''}.`,
      warning: null,
      icon: 'user',
    }
  }

  // ── Includes / Imports ─────────────────────────────────────
  if (task.include_tasks !== undefined || task.import_tasks !== undefined) {
    const mod = task.include_tasks !== undefined ? 'include_tasks' : 'import_tasks'
    const file = typeof task[mod] === 'string' ? task[mod] : extractArg(task[mod], ['file'])
    return {
      text: `${mod === 'import_tasks' ? 'Statically imports' : 'Dynamically includes'} tasks from ${file ? `"${file}"` : '(file not specified)'}.`,
      warning: null,
      icon: 'git-merge',
    }
  }

  // ── Wait ────────────────────────────────────────────────────
  if (task.wait_for !== undefined) {
    const args = task.wait_for
    const port = typeof args === 'object' && args.port
    const host = typeof args === 'object' && args.host
    return {
      text: `Waits${host ? ` for host "${host}"` : ''}${port ? ` on port ${port}` : ''} to become available.`,
      warning: null,
      icon: 'clock',
    }
  }

  // ── Fallback ─────────────────────────────────────────────────
  return {
    text: task.name ? `Runs task: "${task.name}".` : 'Executes an Ansible task.',
    warning: null,
    icon: 'zap',
  }
}

/**
 * Generate a human-readable summary for an entire play.
 */
export function generatePlaySummary(play) {
  if (!play) return ''
  const tasks = play.tasks || []
  const hosts = play.hosts || 'all'
  const lines = [`Targets hosts: "${hosts}". Runs ${tasks.length} task(s).`]
  if (play.become) lines.push('Privilege escalation (become: yes) is enabled.')
  if (play.vars && Object.keys(play.vars).length > 0) {
    lines.push(`Defines ${Object.keys(play.vars).length} variable(s).`)
  }
  return lines.join(' ')
}
