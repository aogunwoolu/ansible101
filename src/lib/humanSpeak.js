/**
 * humanSpeak.js
 * Translates a parsed Ansible task object into plain English.
 */

const COLLECTION_DOCS = 'https://docs.ansible.com/ansible/latest/collections'

/** Build a docs URL for any collection module. */
function collectionDoc(namespace, collection, slug) {
  return `${COLLECTION_DOCS}/${namespace}/${collection}/${slug}_module.html`
}
/** Shorthand for ansible.builtin */
function moduleDoc(slug) { return collectionDoc('ansible', 'builtin', slug) }
/** ansible.posix */
function posixDoc(slug)   { return collectionDoc('ansible', 'posix', slug) }
/** community.general */
function cgDoc(slug)      { return collectionDoc('community', 'general', slug) }
/** community.mysql */
function mysqlDoc(slug)   { return collectionDoc('community', 'mysql', slug) }
/** community.postgresql */
function pgDoc(slug)      { return collectionDoc('community', 'postgresql', slug) }
/** community.docker */
function dockerDoc(slug)  { return collectionDoc('community', 'docker', slug) }
/** kubernetes.core */
function k8sDoc(slug)     { return collectionDoc('kubernetes', 'core', slug) }
/** community.crypto */
function cryptoDoc(slug)  { return collectionDoc('community', 'crypto', slug) }
/** ansible.windows */
function winDoc(slug)     { return collectionDoc('ansible', 'windows', slug) }
/** community.windows */
function cwDoc(slug)      { return collectionDoc('community', 'windows', slug) }
/** community.mongodb */
function mongoDoc(slug)   { return collectionDoc('community', 'mongodb', slug) }
/** amazon.aws */
function awsDoc(slug)     { return `${COLLECTION_DOCS}/amazon/aws/${slug}_module.html` }

/**
 * Resolve module args from a task object.
 * Checks short name first, then any number of FQCNs.
 * Returns undefined when the module is not present.
 */
function getModule(task, shortName, ...fqcns) {
  if (task[shortName] !== undefined) return { args: task[shortName], key: shortName }
  for (const fqcn of fqcns) {
    if (task[fqcn] !== undefined) return { args: task[fqcn], key: fqcn }
  }
  return undefined
}

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
 * Parse a raw shell/command string and return a richer plain-English description.
 * Handles: sudo, env vars, common tools (curl, wget, tar, systemctl, pip, npm,
 * chmod/chown, find/xargs, grep, sed, awk, kill, useradd, etc.), pipes, and redirects.
 */
function explainShellCmd(raw) {
  if (!raw || typeof raw !== 'string') return null
  const cmd = raw.trim()
  if (!cmd) return null

  // Collect structural observations about the whole command
  const notes = []
  const hasPipe     = /\|/.test(cmd)
  const hasAppend   = />>/.test(cmd)
  const hasOverwrite = !hasAppend && />/.test(cmd)
  const hasAnd      = /&&/.test(cmd)
  const hasOr       = /\|\|/.test(cmd)
  const hasSemicolon = /;/.test(cmd) && !hasAnd && !hasOr
  const hasSubshell = /\$\(/.test(cmd) || /`/.test(cmd)

  if (hasPipe)      notes.push('output piped through subsequent command(s)')
  if (hasAppend)    notes.push('output appended to a file')
  if (hasOverwrite) notes.push('output redirected to a file')
  if (hasAnd)       notes.push('next command runs only on success')
  if (hasOr)        notes.push('next command runs only on failure')
  if (hasSemicolon) notes.push('multiple commands run in sequence')
  if (hasSubshell)  notes.push('uses command substitution')

  // Strip leading env var assignments (e.g.  FOO=bar BAZ=qux cmd ...)
  let rest = cmd.replace(/^([A-Z_][A-Z0-9_]*=[^\s]* +)+/, '')
  const hadEnvVars = rest !== cmd
  if (hadEnvVars) notes.push('with custom environment variables')

  // Strip leading sudo
  const hasSudo = /^sudo\s/.test(rest)
  if (hasSudo) { rest = rest.replace(/^sudo\s+/, '') }

  // Grab first word (the binary/tool)
  const firstWord = rest.split(/\s+/)[0]

  // ── Known tool descriptions ──────────────────────────────────
  const curlPatterns = [
    [/-o\s+(\S+)/, (m) => `downloads to "${m[1]}"`],
    [/-O/, () => 'saves with the remote filename'],
    [/-L/, () => 'follows redirects'],
    [/-s/, () => 'silent mode'],
    [/-X\s+(\w+)/, (m) => `using HTTP ${m[1]}`],
    [/-d\s+(\S+)/, (m) => `with body "${m[1]}"`],
    [/-H\s+"([^"]+)"/, (m) => `header "${m[1]}"`],
  ]

  const urlMatch = rest.match(/https?:\/\/\S+/)
  const url = urlMatch ? urlMatch[0] : null

  if (firstWord === 'curl' || firstWord === '/usr/bin/curl') {
    const flags = []
    for (const [re, fn] of curlPatterns) {
      const hit = rest.match(re)
      if (hit) flags.push(fn(hit))
    }
    const base = `Sends HTTP request${url ? ` to "${url}"` : ''}${flags.length ? ` — ${flags.join(', ')}` : ''}`
    return buildSentence(base, hasSudo, notes)
  }

  if (firstWord === 'wget') {
    const outMatch = rest.match(/-O\s+(\S+)/)
    const dest = outMatch ? outMatch[1] : null
    return buildSentence(`Downloads${url ? ` "${url}"` : ''}${dest ? ` to "${dest}"` : ' (saves to current directory)'}`, hasSudo, notes)
  }

  if (firstWord === 'tar') {
    const isExtract = /-x/.test(rest)
    const isCreate  = /-c/.test(rest)
    const fileMatch = rest.match(/(?:--file|-f)\s+(\S+)/) || rest.match(/\s([^ -]\S*\.tar(?:\.\w+)?)\s?/)
    const dirMatch  = rest.match(/-C\s+(\S+)/)
    const archive   = fileMatch ? fileMatch[1] : null
    const dir       = dirMatch ? dirMatch[1] : null
    if (isExtract) return buildSentence(`Extracts archive${archive ? ` "${archive}"` : ''}${dir ? ` into "${dir}"` : ''}`, hasSudo, notes)
    if (isCreate)  return buildSentence(`Creates archive${archive ? ` "${archive}"` : ''}`, hasSudo, notes)
    return buildSentence(`Runs tar${archive ? ` on "${archive}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'unzip') {
    const args = rest.split(/\s+/)
    const file = args[1] || ''
    const destMatch = rest.match(/-d\s+(\S+)/)
    const dest = destMatch ? destMatch[1] : ''
    return buildSentence(`Extracts ZIP archive${file ? ` "${file}"` : ''}${dest ? ` into "${dest}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'chmod') {
    const args = rest.split(/\s+/).filter(Boolean)
    const mode    = args[1] || ''
    const target  = args[args.length - 1] || ''
    const recur   = /-R/.test(rest)
    return buildSentence(`Sets permissions${mode ? ` "${mode}"` : ''} on${recur ? ' all files under' : ''} "${target || '(path)'}"`, hasSudo, notes)
  }

  if (firstWord === 'chown') {
    const args   = rest.split(/\s+/).filter(Boolean)
    const owner  = args[1] || ''
    const target = args[args.length - 1] || ''
    const recur  = /-R/.test(rest)
    return buildSentence(`Changes ownership to "${owner}" on${recur ? ' all files under' : ''} "${target || '(path)'}"`, hasSudo, notes)
  }

  if (firstWord === 'mkdir') {
    const args  = rest.split(/\s+/).filter(Boolean)
    const paths = args.filter(a => !a.startsWith('-')).slice(1).join(', ')
    const hasP  = /-p/.test(rest)
    return buildSentence(`Creates director${paths.includes(',') ? 'ies' : 'y'}${paths ? ` "${paths}"` : ''}${hasP ? ' (including any missing parents)' : ''}`, hasSudo, notes)
  }

  if (firstWord === 'rm') {
    const args   = rest.split(/\s+/).filter(Boolean)
    const paths  = args.filter(a => !a.startsWith('-')).slice(1).join(', ')
    const recur  = /-r|-rf|-fr/.test(rest)
    const force  = /-f/.test(rest)
    return buildSentence(`Deletes ${recur ? 'directory (recursively)' : 'file(s)'}${paths ? ` "${paths}"` : ''}${force ? ' — suppresses errors on missing targets' : ''}`, hasSudo, notes)
  }

  if (firstWord === 'cp') {
    const args  = rest.split(/\s+/).filter(Boolean).filter(a => !a.startsWith('-'))
    const src   = args[1] || ''
    const dest  = args[2] || ''
    const recur = /-r|-R/.test(rest)
    return buildSentence(`Copies${recur ? ' (recursively)' : ''} "${src || '(source)'}" → "${dest || '(destination)'}"`, hasSudo, notes)
  }

  if (firstWord === 'mv') {
    const args = rest.split(/\s+/).filter(Boolean).filter(a => !a.startsWith('-'))
    const src  = args[1] || ''
    const dest = args[2] || ''
    return buildSentence(`Moves/renames "${src || '(source)'}" → "${dest || '(destination)'}"`, hasSudo, notes)
  }

  if (firstWord === 'ln') {
    const args   = rest.split(/\s+/).filter(Boolean).filter(a => !a.startsWith('-'))
    const src    = args[1] || ''
    const dest   = args[2] || ''
    const symlink = /-s/.test(rest)
    return buildSentence(`Creates ${symlink ? 'symlink' : 'hard link'} "${dest || '(link)'}"${src ? ` → "${src}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'systemctl') {
    const parts = rest.split(/\s+/).filter(Boolean)
    const action  = parts[1] || ''
    const service = parts[2] || ''
    const actionMap = {
      start: 'Starts', stop: 'Stops', restart: 'Restarts', reload: 'Reloads',
      enable: 'Enables (auto-start on boot)', disable: 'Disables (auto-start on boot)',
      status: 'Checks status of', 'daemon-reload': 'Reloads the systemd daemon for',
      mask: 'Masks (prevents start of)', unmask: 'Unmasks',
    }
    return buildSentence(`${actionMap[action] || `Runs systemctl ${action} on`} ${service ? `"${service}"` : '(unit not specified)'}`, hasSudo, notes)
  }

  if (firstWord === 'service') {
    const parts  = rest.split(/\s+/).filter(Boolean)
    const name   = parts[1] || ''
    const action = parts[2] || ''
    return buildSentence(`${action ? action.charAt(0).toUpperCase() + action.slice(1) + 's' : 'Manages'} service ${name ? `"${name}"` : '(name not specified)'}`, hasSudo, notes)
  }

  if (['pip', 'pip3', 'pip2'].includes(firstWord)) {
    const parts    = rest.split(/\s+/).filter(Boolean)
    const sub      = parts[1] || ''
    const pkg      = parts.filter(p => !p.startsWith('-') && p !== sub)[0] || ''
    const subMap   = { install: 'Installs', uninstall: 'Removes', upgrade: 'Upgrades', freeze: 'Lists' }
    const reqMatch = rest.match(/-r\s+(\S+)/)
    if (reqMatch) return buildSentence(`Installs Python packages from requirements file "${reqMatch[1]}"`, hasSudo, notes)
    return buildSentence(`${subMap[sub] || 'Runs pip ' + sub} Python package${pkg ? ` "${pkg}"` : ''}`, hasSudo, notes)
  }

  if (['npm', 'npx', 'yarn', 'pnpm'].includes(firstWord)) {
    const parts  = rest.split(/\s+/).filter(Boolean)
    const sub    = parts[1] || ''
    const pkg    = parts.filter(p => !p.startsWith('-') && p !== sub)[0] || ''
    const subMap = { install: 'Installs', i: 'Installs', uninstall: 'Removes', remove: 'Removes', run: 'Runs script', build: 'Builds', start: 'Starts', test: 'Runs tests' }
    const global = /--global|-g/.test(rest)
    return buildSentence(`${subMap[sub] || `Runs ${firstWord} ${sub}`}${pkg ? ` "${pkg}"` : ' (all dependencies)'}${global ? ' globally' : ''}`, hasSudo, notes)
  }

  if (firstWord === 'grep') {
    const fileArgs = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'grep').slice(1)
    const pattern  = fileArgs[0] || ''
    const targets  = fileArgs.slice(1).join(', ')
    const recur    = /-r|-R/.test(rest)
    const invert   = /-v/.test(rest)
    const count    = /-c/.test(rest)
    return buildSentence(
      `${invert ? 'Filters out' : 'Searches for'} pattern "${pattern || '(see args)'}"${targets ? ` in "${targets}"` : ''}${recur ? ' (recursively)' : ''}${count ? ' — prints count of matching lines' : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'sed') {
    const scriptMatch = rest.match(/(?:^|\s)-e?\s+["']?([^"'\s]+)["']?/) || rest.match(/sed\s+["']?([^"'\s]+)["']?/)
    const script = scriptMatch ? scriptMatch[1] : ''
    const inPlace = /-i/.test(rest)
    const subMatch = script.match(/^s[,/|!](.+?)[,/|!](.+?)[,/|!]/)
    if (subMatch) {
      return buildSentence(`Replaces "${subMatch[1]}" with "${subMatch[2]}"${inPlace ? ' in-place in file' : ' on stdin'}`, hasSudo, notes)
    }
    return buildSentence(`Runs sed stream editor${script ? ` with expression "${script}"` : ''}${inPlace ? ' (in-place)' : ''}`, hasSudo, notes)
  }

  if (firstWord === 'awk') {
    const fileArgs = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'awk')
    const program  = fileArgs[0] || ''
    const target   = fileArgs[1] || ''
    return buildSentence(`Processes text with awk${program ? ` program "${program}"` : ''}${target ? ` on "${target}"` : ''}`, hasSudo, notes)
  }

  if (['find'].includes(firstWord)) {
    const pathArg  = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'find')[0] || ''
    const nameMatch = rest.match(/-name\s+["']?([^\s'"]+)["']?/)
    const typeMatch = rest.match(/-type\s+([fdlps])/)
    const typeMap   = { f: 'files', d: 'directories', l: 'symlinks', p: 'pipes', s: 'sockets' }
    const execMatch = rest.match(/-exec\s+(\S+)/)
    return buildSentence(
      `Finds ${typeMatch ? typeMap[typeMatch[1]] || typeMatch[1] : 'paths'}${pathArg ? ` under "${pathArg}"` : ''}${nameMatch ? ` named "${nameMatch[1]}"` : ''}${execMatch ? ` then runs "${execMatch[1]}" on each result` : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'kill' || firstWord === 'killall' || firstWord === 'pkill') {
    const sigMatch = rest.match(/-(\d+|-SIGTERM|-SIGKILL|-HUP|-USR1|-USR2|-KILL|-TERM)/)
    const sigName  = sigMatch ? sigMatch[1] : ''
    const target   = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== firstWord)[0] || ''
    const sigMap   = { '9': 'force-kills', SIGKILL: 'force-kills', '15': 'gracefully terminates', SIGTERM: 'gracefully terminates', '1': 'sends HUP to', HUP: 'sends HUP to' }
    const verb     = sigMap[sigName] || 'sends signal to'
    return buildSentence(`${verb.charAt(0).toUpperCase() + verb.slice(1)} process${target ? ` "${target}"` : ' (see args)'}`, hasSudo, notes)
  }

  if (['useradd', 'adduser'].includes(firstWord)) {
    const args    = rest.split(/\s+/).filter(Boolean)
    const user    = args[args.length - 1] || ''
    const system  = /-r|--system/.test(rest)
    const homeDir = rest.match(/-d\s+(\S+)/)
    const shell   = rest.match(/-s\s+(\S+)/)
    return buildSentence(
      `Creates ${system ? 'system ' : ''}user "${user || '(name not specified)'}"${homeDir ? ` with home "${homeDir[1]}"` : ''}${shell ? ` and shell "${shell[1]}"` : ''}`,
      hasSudo, notes)
  }

  if (['usermod'].includes(firstWord)) {
    const args = rest.split(/\s+/).filter(Boolean)
    const user = args[args.length - 1] || ''
    const groups = rest.match(/-G\s+(\S+)/)
    const lock   = /-L/.test(rest)
    const unlock = /-U/.test(rest)
    if (lock)   return buildSentence(`Locks account for user "${user}"`, hasSudo, notes)
    if (unlock) return buildSentence(`Unlocks account for user "${user}"`, hasSudo, notes)
    return buildSentence(`Modifies user "${user}"${groups ? ` — sets groups to "${groups[1]}"` : ''}`, hasSudo, notes)
  }

  if (['passwd'].includes(firstWord)) {
    const args = rest.split(/\s+/).filter(Boolean)
    const user = args.find(a => !a.startsWith('-') && a !== 'passwd') || ''
    const lock   = /-l/.test(rest)
    const unlock = /-u/.test(rest)
    if (lock)   return buildSentence(`Locks password for user "${user || '(current user)'}"`, hasSudo, notes)
    if (unlock) return buildSentence(`Unlocks password for user "${user || '(current user)'}"`, hasSudo, notes)
    return buildSentence(`Sets password for user "${user || '(current user)'}"`, hasSudo, notes)
  }

  if (firstWord === 'echo') {
    const echoRest = cmd.replace(/^(sudo\s+)?echo\s+/, '').replace(/\s*>+\s*\S+$/, '').trim()
    const dest     = cmd.match(/>+\s*(\S+)/)
    return buildSentence(`Prints "${echoRest || '(see args)'}"${dest ? ` ${hasAppend ? 'appending to' : 'writing to'} "${dest[1]}"` : ' to stdout'}`, hasSudo, notes)
  }

  if (firstWord === 'cat') {
    const fileArgs = rest.split(/\s+/).filter(p => p !== 'cat' && !p.startsWith('-'))
    const dest     = cmd.match(/>+\s*(\S+)/)
    if (dest && fileArgs.length > 1) {
      return buildSentence(`Concatenates ${fileArgs.map(f => `"${f}"`).join(', ')} → "${dest[1]}"`, hasSudo, notes)
    }
    return buildSentence(`Reads ${fileArgs.length ? fileArgs.map(f => `"${f}"`).join(', ') : '(stdin)'} to stdout`, hasSudo, notes)
  }

  if (['apt-get', 'apt'].includes(firstWord)) {
    const parts  = rest.split(/\s+/).filter(Boolean)
    const sub    = parts[1] || ''
    const pkgs   = parts.filter(p => !p.startsWith('-') && !['apt-get', 'apt', sub].includes(p)).join(', ')
    const subMap = { install: 'Installs', remove: 'Removes', purge: 'Purges (incl. config)', update: 'Updates the apt package index', upgrade: 'Upgrades all installed packages', autoremove: 'Removes unused packages' }
    return buildSentence(`${subMap[sub] || `Runs apt-get ${sub}`}${pkgs ? ` "${pkgs}"` : ''}`, hasSudo, notes)
  }

  if (['yum', 'dnf'].includes(firstWord)) {
    const parts = rest.split(/\s+/).filter(Boolean)
    const sub   = parts[1] || ''
    const pkgs  = parts.filter(p => !p.startsWith('-') && ![firstWord, sub].includes(p)).join(', ')
    const subMap = { install: 'Installs', remove: 'Removes', update: 'Updates', upgrade: 'Upgrades', autoremove: 'Removes unused packages' }
    return buildSentence(`${subMap[sub] || `Runs ${firstWord} ${sub}`}${pkgs ? ` "${pkgs}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'export') {
    const varMatch = rest.match(/export\s+([A-Z_][A-Z0-9_]*)=(.+)/)
    if (varMatch) return buildSentence(`Sets and exports environment variable ${varMatch[1]}="${varMatch[2]}"`, hasSudo, notes)
    return buildSentence('Exports variable to environment', hasSudo, notes)
  }

  if (firstWord === 'source' || firstWord === '.') {
    const file = rest.split(/\s+/).filter(p => p !== 'source' && p !== '.')[0] || ''
    return buildSentence(`Sources (executes in current shell) "${file || '(file not specified)'}"`, hasSudo, notes)
  }

  if (firstWord === 'tee') {
    const file = rest.split(/\s+/).filter(p => p !== 'tee' && !p.startsWith('-'))[0] || ''
    const append = /-a/.test(rest)
    return buildSentence(`Reads stdin and writes to stdout and "${file || '(file not specified)'}" simultaneously${append ? ' (appending)' : ''}`, hasSudo, notes)
  }

  if (firstWord === 'xargs') {
    const subcmd = rest.replace(/xargs\s+/, '').split(/\s+/)[0] || ''
    return buildSentence(`Reads stdin arguments and passes them to "${subcmd || '(command)'}"`, hasSudo, notes)
  }

  if (['java', 'python', 'python3', 'ruby', 'node', 'php', 'perl'].includes(firstWord)) {
    const parts  = rest.split(/\s+/).filter(Boolean)
    const script = parts.find(p => !p.startsWith('-') && p !== firstWord) || ''
    return buildSentence(`Runs ${firstWord} script${script ? ` "${script}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'openssl') {
    const sub = rest.split(/\s+/)[1] || ''
    return buildSentence(`Runs OpenSSL "${sub}" operation`, hasSudo, notes)
  }

  if (firstWord === 'ssh') {
    const hostMatch = rest.match(/(?:ssh\s+\S*\s+)?(\w[\w.-]*@)?(\S+)/)
    const host = hostMatch ? hostMatch[0].split(/\s+/).filter(p => !p.startsWith('-') && p !== 'ssh')[0] : ''
    return buildSentence(`Opens SSH session${host ? ` to "${host}"` : ''}`, hasSudo, notes)
  }

  if (firstWord === 'scp') {
    const args = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'scp')
    return buildSentence(`Copies file via SCP from "${args[0] || '(source)'}" to "${args[1] || '(destination)'}"`, hasSudo, notes)
  }

  if (firstWord === 'rsync') {
    const args = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'rsync')
    const del  = /--delete/.test(rest)
    return buildSentence(`Rsyncs "${args[0] || '(source)'}" → "${args[1] || '(destination)'}"${del ? ' (removes files not in source)' : ''}`, hasSudo, notes)
  }

  if (['docker'].includes(firstWord)) {
    const parts = rest.split(/\s+/).filter(Boolean)
    const sub   = parts[1] || ''
    const name  = parts.filter(p => !p.startsWith('-') && !['docker', sub].includes(p))[0] || ''
    const subMap = { run: 'Runs Docker container', build: 'Builds Docker image', pull: 'Pulls Docker image', push: 'Pushes Docker image', stop: 'Stops Docker container', rm: 'Removes Docker container', exec: 'Executes command in Docker container', ps: 'Lists Docker containers' }
    return buildSentence(`${subMap[sub] || `Runs docker ${sub}`}${name ? ` "${name}"` : ''}`, hasSudo, notes)
  }

  if (['kubectl', 'helm'].includes(firstWord)) {
    const parts = rest.split(/\s+/).filter(Boolean)
    const sub   = parts[1] || ''
    const resource = parts[2] || ''
    return buildSentence(`Runs ${firstWord} ${sub}${resource ? ` on "${resource}"` : ''}`, hasSudo, notes)
  }

  if (['mysql', 'mysqldump', 'psql', 'pg_dump'].includes(firstWord)) {
    const db       = rest.match(/-D\s+(\S+)/) || rest.match(/--database[=\s]+(\S+)/)
    const sqlMatch = rest.match(/-e\s+"([^"]+)"/) || rest.match(/-c\s+"([^"]+)"/)
    return buildSentence(
      `Runs ${firstWord}${db ? ` on database "${db[1]}"` : ''}${sqlMatch ? ` — query: "${sqlMatch[1]}"` : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'ufw') {
    const tokens  = rest.split(/\s+/).filter(Boolean)
    const sub     = tokens[1] || ''
    // handle: ufw delete allow/deny ...
    const isDelete = sub === 'delete'
    const action   = isDelete ? (tokens[2] || '') : sub
    const rest2    = tokens.slice(isDelete ? 3 : 2).join(' ')

    if (action === 'enable')  return buildSentence('Enables the UFW firewall', hasSudo, notes)
    if (action === 'disable') return buildSentence('Disables the UFW firewall', hasSudo, notes)
    if (action === 'reset')   return buildSentence('Resets UFW to defaults and disables it', hasSudo, notes)
    if (action === 'reload')  return buildSentence('Reloads UFW rules', hasSudo, notes)
    if (action === 'status')  return buildSentence('Checks UFW firewall status', hasSudo, notes)
    if (action === 'logging') return buildSentence(`Sets UFW logging to "${rest2 || 'on'}"`, hasSudo, notes)

    if (action === 'allow' || action === 'deny' || action === 'reject' || action === 'limit') {
      const verb = isDelete ? `Removes UFW ${action} rule for` : { allow: 'Allows', deny: 'Blocks', reject: 'Rejects', limit: 'Rate-limits' }[action]

      // Parse Jinja2 expressions first — {{ var }}/proto or {{ var }} alone
      const jinjaProto = rest2.match(/(\{\{[^}]+\}\})\s*\/\s*(\w+)/)
      const jinjaPort  = !jinjaProto && rest2.match(/\{\{[^}]+\}\}/)

      if (jinjaProto) {
        const port  = jinjaProto[1].trim()
        const proto = jinjaProto[2].toUpperCase()
        return buildSentence(`${verb} ${proto} traffic on port ${port} through the UFW firewall`, hasSudo, notes)
      }
      if (jinjaPort) {
        const protoMatch = rest2.match(/proto\s+(\S+)/) || rest2.match(/\/(\w+)/)
        const proto = protoMatch ? protoMatch[1].toUpperCase() : ''
        return buildSentence(`${verb} ${proto ? proto + ' ' : ''}traffic on port ${jinjaPort[0].trim()} through the UFW firewall`, hasSudo, notes)
      }

      // Plain (non-Jinja2) port/service parsing
      const fromMatch = rest2.match(/from\s+(\S+)/)
      const portSpec  = rest2.match(/^(\S+)\/(\w+)$/) || rest2.match(/(\d+)\/(\w+)/)
      const portMatch = rest2.match(/port\s+(\S+)/) || rest2.match(/^(\d+)$/) || rest2.match(/^(\d+)\s/)
      const protoOnly = rest2.match(/proto\s+(\S+)/)

      if (fromMatch) {
        const toPort = rest2.match(/port\s+(\S+)/)
        return buildSentence(`${verb} traffic from ${fromMatch[1]}${toPort ? ` to port ${toPort[1]}` : ''} through the UFW firewall`, hasSudo, notes)
      }
      if (portSpec) {
        return buildSentence(`${verb} ${portSpec[2].toUpperCase()} traffic on port ${portSpec[1]} through the UFW firewall`, hasSudo, notes)
      }
      if (portMatch) {
        const proto = protoOnly ? protoOnly[1].toUpperCase() : ''
        return buildSentence(`${verb} ${proto ? proto + ' ' : ''}traffic on port ${portMatch[1]} through the UFW firewall`, hasSudo, notes)
      }
      const service = rest2.trim()
      return buildSentence(`${verb} "${service || '(see args)'}" through the UFW firewall`, hasSudo, notes)
    }
    return buildSentence(`Runs UFW command "${sub}"`, hasSudo, notes)
  }

  if (firstWord === 'firewall-cmd') {
    const zone       = rest.match(/--zone=(\S+)/)
    const addService = rest.match(/--add-service=(\S+)/)
    const remService = rest.match(/--remove-service=(\S+)/)
    const addPort    = rest.match(/--add-port=(\S+)/)
    const remPort    = rest.match(/--remove-port=(\S+)/)
    const permanent  = /--permanent/.test(rest)
    const reload     = /--reload/.test(rest)
    const zoneStr    = zone ? ` in zone "${zone[1]}"` : ''
    const permStr    = permanent ? ' (permanent)' : ' (runtime only, lost on reload)'

    if (reload)     return buildSentence('Reloads firewalld rules from permanent config', hasSudo, notes)
    if (addService) return buildSentence(`Allows service "${addService[1]}"${zoneStr} through the firewall${permStr}`, hasSudo, notes)
    if (remService) return buildSentence(`Removes service "${remService[1]}"${zoneStr} from the firewall${permStr}`, hasSudo, notes)
    if (addPort)    return buildSentence(`Opens port "${addPort[1]}"${zoneStr} through the firewall${permStr}`, hasSudo, notes)
    if (remPort)    return buildSentence(`Closes port "${remPort[1]}"${zoneStr} through the firewall${permStr}`, hasSudo, notes)
    return buildSentence(`Runs firewall-cmd${zoneStr}`, hasSudo, notes)
  }

  if (firstWord === 'iptables' || firstWord === 'ip6tables') {
    const chain    = rest.match(/-(?:A|I|D|F)\s+(\S+)/)
    const proto    = rest.match(/-p\s+(\S+)/)
    const dport    = rest.match(/--dport\s+(\S+)/)
    const sport    = rest.match(/--sport\s+(\S+)/)
    const jump     = rest.match(/-j\s+(\S+)/)
    const isAppend = /-A\s/.test(rest)
    const isDelete = /-D\s/.test(rest)
    const isFlush  = /-F/.test(rest)
    if (isFlush) return buildSentence(`Flushes all ${firstWord} rules${chain ? ` in chain "${chain[1]}"` : ''}`, hasSudo, notes)
    const verb = isDelete ? 'Removes' : 'Adds'
    return buildSentence(
      `${verb} ${firstWord} rule${chain ? ` to chain "${chain[1]}"` : ''}${proto ? ` for ${proto[1].toUpperCase()}` : ''}${dport ? ` destination port ${dport[1]}` : ''}${sport ? ` source port ${sport[1]}` : ''}${jump ? ` — action: ${jump[1]}` : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'setenforce') {
    const val = rest.split(/\s+/)[1] || ''
    const mode = val === '1' || val === 'Enforcing' ? 'Enforcing' : val === '0' || val === 'Permissive' ? 'Permissive' : val
    return buildSentence(`Sets SELinux mode to "${mode || '(see args)'}"`, hasSudo, notes)
  }

  if (firstWord === 'setsebool') {
    const parts  = rest.split(/\s+/).filter(Boolean)
    const bool   = parts[1] || ''
    const val    = parts[2] || ''
    const persist = /-P/.test(rest)
    return buildSentence(`Sets SELinux boolean "${bool || '(see args)'}" to ${val}${persist ? ' (persistent across reboots)' : ' (runtime only)'}`, hasSudo, notes)
  }

  if (firstWord === 'certbot') {
    const sub     = rest.split(/\s+/)[1] || ''
    const domain  = rest.match(/-d\s+(\S+)/)
    const webroot = rest.match(/--webroot-path\s+(\S+)/)
    const subMap  = { certonly: 'Obtains certificate', renew: 'Renews certificate(s)', revoke: 'Revokes certificate', delete: 'Deletes certificate', run: 'Obtains and installs certificate' }
    return buildSentence(
      `${subMap[sub] || `Runs certbot ${sub}`}${domain ? ` for "${domain[1]}"` : ''}${webroot ? ` using webroot "${webroot[1]}"` : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'nginx') {
    const test   = /-t/.test(rest)
    const reload = /-s\s+reload/.test(rest)
    const stop   = /-s\s+stop/.test(rest)
    const quit   = /-s\s+quit/.test(rest)
    if (test)   return buildSentence('Tests nginx configuration for syntax errors', hasSudo, notes)
    if (reload) return buildSentence('Reloads nginx configuration', hasSudo, notes)
    if (stop)   return buildSentence('Immediately stops nginx', hasSudo, notes)
    if (quit)   return buildSentence('Gracefully stops nginx', hasSudo, notes)
    return buildSentence('Starts nginx', hasSudo, notes)
  }

  if (['apache2ctl', 'apachectl', 'httpd'].includes(firstWord)) {
    const sub = rest.split(/\s+/)[1] || ''
    const subMap = { start: 'Starts', stop: 'Stops', restart: 'Restarts', reload: 'Reloads', graceful: 'Gracefully reloads', configtest: 'Tests config syntax of' }
    return buildSentence(`${subMap[sub] || `Runs ${firstWord} ${sub}`} the Apache web server`, hasSudo, notes)
  }

  if (firstWord === 'mount') {
    const dev  = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'mount')[0] || ''
    const dest = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== 'mount')[1] || ''
    const type = rest.match(/-t\s+(\S+)/)
    return buildSentence(`Mounts${type ? ` ${type[1]}` : ''} "${dev || '(device)'}" at "${dest || '(mountpoint)'}"`, hasSudo, notes)
  }

  if (firstWord === 'umount' || firstWord === 'umount') {
    const target = rest.split(/\s+/).filter(p => !p.startsWith('-') && p !== firstWord)[0] || ''
    return buildSentence(`Unmounts "${target || '(target)'}"`, hasSudo, notes)
  }

  if (firstWord === 'dd') {
    const ifMatch  = rest.match(/if=(\S+)/)
    const ofMatch  = rest.match(/of=(\S+)/)
    const bsMatch  = rest.match(/bs=(\S+)/)
    return buildSentence(
      `Copies raw data${ifMatch ? ` from "${ifMatch[1]}"` : ''}${ofMatch ? ` to "${ofMatch[1]}"` : ''}${bsMatch ? ` at block size ${bsMatch[1]}` : ''}`,
      hasSudo, notes)
  }

  if (firstWord === 'crontab') {
    const list   = /-l/.test(rest)
    const remove = /-r/.test(rest)
    const edit   = /-e/.test(rest)
    const user   = rest.match(/-u\s+(\S+)/)
    const who    = user ? ` for user "${user[1]}"` : ''
    if (list)   return buildSentence(`Lists crontab entries${who}`, hasSudo, notes)
    if (remove) return buildSentence(`Removes crontab${who}`, hasSudo, notes)
    if (edit)   return buildSentence(`Edits crontab${who}`, hasSudo, notes)
    return buildSentence(`Manages crontab${who}`, hasSudo, notes)
  }

  if (firstWord === 'timedatectl') {
    const sub  = rest.split(/\s+/)[1] || ''
    const tz   = rest.match(/set-timezone\s+(\S+)/)
    if (tz) return buildSentence(`Sets system timezone to "${tz[1]}"`, hasSudo, notes)
    return buildSentence(`Runs timedatectl ${sub}`, hasSudo, notes)
  }

  if (firstWord === 'hostnamectl') {
    const name = rest.split(/\s+/).filter(p => !p.startsWith('-') && !['hostnamectl', 'set-hostname'].includes(p))[0] || ''
    return buildSentence(`Sets system hostname to "${name || '(see args)'}"`, hasSudo, notes)
  }

  if (firstWord === 'update-alternatives' || firstWord === 'alternatives') {
    const config  = rest.match(/--config\s+(\S+)/)
    const install = rest.match(/--install\s+(\S+)/)
    const set     = rest.match(/--set\s+(\S+)\s+(\S+)/)
    if (set)     return buildSentence(`Sets alternative "${set[1]}" to "${set[2]}"`, hasSudo, notes)
    if (config)  return buildSentence(`Configures alternative "${config[1]}"`, hasSudo, notes)
    if (install) return buildSentence(`Registers alternative "${install[1]}"`, hasSudo, notes)
    return buildSentence('Manages system alternatives', hasSudo, notes)
  }

  if (firstWord === 'sysctl') {
    const write = rest.match(/(\S+=\S+)/)
    const pMatch = rest.match(/-p\s+(\S+)/)
    if (pMatch)  return buildSentence(`Loads sysctl settings from "${pMatch[1]}"`, hasSudo, notes)
    if (write)   return buildSentence(`Sets kernel parameter "${write[1]}"`, hasSudo, notes)
    return buildSentence('Configures kernel parameters via sysctl', hasSudo, notes)
  }

  if (['git'].includes(firstWord)) {
    const parts = rest.split(/\s+/).filter(Boolean)
    const sub   = parts[1] || ''
    const target = parts.filter(p => !p.startsWith('-') && !['git', sub].includes(p))[0] || ''
    const subMap = { clone: 'Clones repository', pull: 'Pulls latest changes', push: 'Pushes commits', checkout: 'Checks out', commit: 'Commits changes', init: 'Initialises repository', fetch: 'Fetches remote refs', merge: 'Merges' }
    return buildSentence(`${subMap[sub] || `Runs git ${sub}`}${target ? ` "${target}"` : ''}`, hasSudo, notes)
  }

  // Generic fallback — preserve Jinja2 variables, truncate if long
  const hasJinja  = /\{\{/.test(cmd)
  const displayed = cmd.length > 80 ? cmd.slice(0, 77) + '…' : cmd
  const structureParts = []
  if (hasSudo)  structureParts.push('elevated')
  if (notes.length) structureParts.push(notes.join('; '))
  const structured = structureParts.length ? ` (${structureParts.join(' — ')})` : ''
  const jinjaNote  = hasJinja ? ' — uses templated values' : ''
  return `Runs: "${displayed}"${jinjaNote}${structured}.`
}

function buildSentence(base, hasSudo, notes) {
  const prefix = hasSudo ? '[sudo] ' : ''
  const suffix = notes.length ? ` — ${notes.join('; ')}` : ''
  return `${prefix}${base}${suffix}.`
}

/**
 * Generate a human-readable explanation for a single task.
 * Returns { text: string, warning: string|null, icon: string, docUrl: string|null }
 */
export function generateExplanation(task) {
  if (!task) return { text: 'No task data.', warning: null, icon: 'help-circle', docUrl: null }

  let m

  // ── Package managers ─────────────────────────────────────────
  m = getModule(task, 'apt', 'ansible.builtin.apt')
  if (m) {
    const pkg = extractArg(m.args, ['name', 'pkg'])
    const state = (typeof m.args === 'object' && m.args.state) ? m.args.state : 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using apt.`, warning: null, icon: 'package', docUrl: moduleDoc('apt') }
  }

  m = getModule(task, 'yum', 'ansible.builtin.yum')
  if (m) {
    const pkg = extractArg(m.args, ['name', 'pkg'])
    const state = (typeof m.args === 'object' && m.args.state) ? m.args.state : 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using yum.`, warning: null, icon: 'package', docUrl: moduleDoc('yum') }
  }

  m = getModule(task, 'dnf', 'ansible.builtin.dnf', 'ansible.builtin.dnf5')
  if (m) {
    const pkg = extractArg(m.args, ['name', 'pkg'])
    const state = (typeof m.args === 'object' && m.args.state) ? m.args.state : 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using dnf.`, warning: null, icon: 'package', docUrl: moduleDoc('dnf') }
  }

  m = getModule(task, 'pip', 'ansible.builtin.pip')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Installs Python package ${pkg ? `"${pkg}"` : '(see args)'} via pip.`, warning: null, icon: 'package', docUrl: moduleDoc('pip') }
  }

  m = getModule(task, 'package', 'ansible.builtin.package')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : state === 'latest' ? 'Upgrades' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} using the system package manager.`, warning: null, icon: 'package', docUrl: moduleDoc('package') }
  }

  m = getModule(task, 'apt_key', 'ansible.builtin.apt_key')
  if (m) {
    const url = extractArg(m.args, ['url', 'id'])
    return { text: `Manages apt signing key${url ? ` from "${url}"` : ''}.`, warning: null, icon: 'package', docUrl: moduleDoc('apt_key') }
  }

  m = getModule(task, 'apt_repository', 'ansible.builtin.apt_repository')
  if (m) {
    const repo = extractArg(m.args, ['repo'])
    return { text: `Manages apt repository${repo ? `: "${repo}"` : ''}.`, warning: null, icon: 'package', docUrl: moduleDoc('apt_repository') }
  }

  m = getModule(task, 'rpm_key', 'ansible.builtin.rpm_key')
  if (m) {
    const key = extractArg(m.args, ['key'])
    return { text: `Manages RPM signing key${key ? ` "${key}"` : ''}.`, warning: null, icon: 'package', docUrl: moduleDoc('rpm_key') }
  }

  m = getModule(task, 'gem', 'community.general.gem')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Manages Ruby gem ${pkg ? `"${pkg}"` : '(see args)'}.`, warning: null, icon: 'package', docUrl: cgDoc('gem') }
  }

  m = getModule(task, 'npm', 'community.general.npm')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Manages Node.js package ${pkg ? `"${pkg}"` : '(see args)'} via npm.`, warning: null, icon: 'package', docUrl: cgDoc('npm') }
  }

  m = getModule(task, 'snap', 'community.general.snap')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Manages snap package ${pkg ? `"${pkg}"` : '(see args)'}.`, warning: null, icon: 'package', docUrl: cgDoc('snap') }
  }

  // ── File operations ───────────────────────────────────────────
  m = getModule(task, 'copy', 'ansible.builtin.copy')
  if (m) {
    const dest    = extractArg(m.args, ['dest'])
    const src     = (typeof m.args === 'object' && m.args.src) || ''
    const content = (typeof m.args === 'object' && m.args.content) || ''
    const mode    = (typeof m.args === 'object' && m.args.mode) || ''
    let text
    if (content) {
      text = `Writes inline content to ${dest ? `"${dest}"` : '(destination not specified)'}${mode ? ` (mode: ${mode})` : ''}.`
    } else {
      text = `Copies ${src ? `"${src}"` : '(source not specified)'} → ${dest ? `"${dest}"` : '(destination not specified)'}${mode ? ` (mode: ${mode})` : ''}.`
    }
    return { text, warning: null, icon: 'copy', docUrl: moduleDoc('copy') }
  }

  m = getModule(task, 'template', 'ansible.builtin.template')
  if (m) {
    const dest     = extractArg(m.args, ['dest'])
    const src      = extractArg(m.args, ['src'])
    const validate = (typeof m.args === 'object' && m.args.validate) || ''
    return { text: `Renders Jinja2 template ${src ? `"${src}"` : '(source not specified)'}, injects current variables, and writes to ${dest ? `"${dest}"` : '(destination not specified)'}${validate ? ` — then validates with: "${validate}"` : ''}.`, warning: null, icon: 'file-code', docUrl: moduleDoc('template') }
  }

  m = getModule(task, 'file', 'ansible.builtin.file')
  if (m) {
    const path    = extractArg(m.args, ['path', 'dest', 'name'])
    const state   = (typeof m.args === 'object' && m.args.state) || 'file'
    const mode    = (typeof m.args === 'object' && m.args.mode) || ''
    const owner   = (typeof m.args === 'object' && m.args.owner) || ''
    const group   = (typeof m.args === 'object' && m.args.group) || ''
    const linkSrc = (typeof m.args === 'object' && m.args.src) || ''
    const extras  = []
    if (mode)  extras.push(`mode ${mode}`)
    if (owner) extras.push(`owner ${owner}${group ? ':' + group : ''}`)
    const suffix = extras.length ? ` (${extras.join(', ')})` : ''
    const stateMap = {
      directory: `Ensures directory "${path || '(path not specified)'}" exists${suffix}`,
      absent:    `Removes "${path || '(path not specified)'}" (file or directory, no error if missing)`,
      link:      `Creates symlink "${path || '(path)'}"${linkSrc ? ` → "${linkSrc}"` : ''}`,
      touch:     `Touches "${path || '(path)'}" — creates it if missing, otherwise updates its timestamp`,
      hard:      `Creates hard link "${path || '(path)'}"${linkSrc ? ` → "${linkSrc}"` : ''}`,
      file:      `Ensures "${path || '(path)'}" is a regular file${suffix}`,
    }
    return { text: (stateMap[state] || `Manages path "${path || '(path not specified)'}"`) + '.', warning: null, icon: 'folder', docUrl: moduleDoc('file') }
  }

  m = getModule(task, 'lineinfile', 'ansible.builtin.lineinfile')
  if (m) {
    const path   = extractArg(m.args, ['path', 'dest'])
    const line   = (typeof m.args === 'object' && m.args.line) || ''
    const regexp = (typeof m.args === 'object' && m.args.regexp) || ''
    const state  = (typeof m.args === 'object' && m.args.state) || 'present'
    let text
    if (state === 'absent') {
      text = `Removes line${regexp ? ` matching "${regexp}"` : ''} from ${path ? `"${path}"` : '(file not specified)'}.`
    } else if (line) {
      text = `Ensures line "${line}" exists in ${path ? `"${path}"` : '(file not specified)'}${regexp ? ` — replaces lines matching "${regexp}"` : ', adding it if absent'}.`
    } else {
      text = `Ensures a line matching "${regexp || '(pattern not specified)'}" is present in ${path ? `"${path}"` : '(file not specified)'}.`
    }
    return { text, warning: null, icon: 'file-text', docUrl: moduleDoc('lineinfile') }
  }

  m = getModule(task, 'blockinfile', 'ansible.builtin.blockinfile')
  if (m) {
    const path  = extractArg(m.args, ['path', 'dest'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const marker = (typeof m.args === 'object' && m.args.marker) || ''
    const action = state === 'absent' ? 'Removes managed block from' : 'Inserts/updates a clearly-marked block in'
    return { text: `${action} ${path ? `"${path}"` : '(file not specified)'}${marker ? ` (marker: "${marker}")` : ''} — bounded by comments so other content is never overwritten.`, warning: null, icon: 'file-text', docUrl: moduleDoc('blockinfile') }
  }

  m = getModule(task, 'replace', 'ansible.builtin.replace')
  if (m) {
    const path    = extractArg(m.args, ['path', 'dest'])
    const regexp  = (typeof m.args === 'object' && m.args.regexp) || ''
    const replace = (typeof m.args === 'object' && m.args.replace) || ''
    return { text: `Replaces all occurrences of ${regexp ? `pattern "${regexp}"` : '(pattern not specified)'}${replace ? ` with "${replace}"` : ''} in ${path ? `"${path}"` : '(file not specified)'}.`, warning: null, icon: 'file-text', docUrl: moduleDoc('replace') }
  }

  m = getModule(task, 'fetch', 'ansible.builtin.fetch')
  if (m) {
    const src = extractArg(m.args, ['src'])
    return { text: `Fetches file ${src ? `"${src}"` : ''} from the remote host to the controller.`, warning: null, icon: 'download', docUrl: moduleDoc('fetch') }
  }

  m = getModule(task, 'stat', 'ansible.builtin.stat')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Retrieves metadata/status of path ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: moduleDoc('stat') }
  }

  m = getModule(task, 'find', 'ansible.builtin.find')
  if (m) {
    const paths = extractArg(m.args, ['paths'])
    return { text: `Finds files/directories matching criteria in ${paths ? `"${paths}"` : '(path not specified)'}.`, warning: null, icon: 'folder', docUrl: moduleDoc('find') }
  }

  m = getModule(task, 'unarchive', 'ansible.builtin.unarchive')
  if (m) {
    const src = extractArg(m.args, ['src'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Extracts archive ${src ? `"${src}"` : ''} to ${dest ? `"${dest}"` : '(destination not specified)'}.`, warning: null, icon: 'folder', docUrl: moduleDoc('unarchive') }
  }

  m = getModule(task, 'archive', 'community.general.archive')
  if (m) {
    const path = extractArg(m.args, ['path'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Creates archive of ${path ? `"${path}"` : '(path not specified)'}${dest ? ` as "${dest}"` : ''}.`, warning: null, icon: 'folder', docUrl: cgDoc('archive') }
  }

  m = getModule(task, 'synchronize', 'ansible.posix.synchronize')
  if (m) {
    const src = extractArg(m.args, ['src'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Rsyncs ${src ? `"${src}"` : '(source)'} to ${dest ? `"${dest}"` : '(destination)'}.`, warning: null, icon: 'refresh-cw', docUrl: posixDoc('synchronize') }
  }

  m = getModule(task, 'tempfile', 'ansible.builtin.tempfile')
  if (m) {
    return { text: 'Creates a temporary file or directory on the remote host.', warning: null, icon: 'file-text', docUrl: moduleDoc('tempfile') }
  }

  m = getModule(task, 'slurp', 'ansible.builtin.slurp')
  if (m) {
    const src = extractArg(m.args, ['src'])
    return { text: `Reads (base64-encodes) remote file ${src ? `"${src}"` : ''} back to the controller.`, warning: null, icon: 'download', docUrl: moduleDoc('slurp') }
  }

  m = getModule(task, 'read_csv', 'community.general.read_csv')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Reads CSV file ${path ? `"${path}"` : ''} into a list of dicts.`, warning: null, icon: 'file-text', docUrl: cgDoc('read_csv') }
  }

  m = getModule(task, 'ini_file', 'community.general.ini_file')
  if (m) {
    const path = extractArg(m.args, ['path', 'dest'])
    return { text: `Manages INI-file entries in ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cgDoc('ini_file') }
  }

  m = getModule(task, 'xml', 'community.general.xml')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Manages XML nodes/attributes in ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cgDoc('xml') }
  }

  // ── Services ──────────────────────────────────────────────────
  m = getModule(task, 'service', 'ansible.builtin.service')
  if (m) {
    const name = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'started'
    const enabled = typeof m.args === 'object' ? m.args.enabled : null
    const stateVerb = { started: 'Starts', stopped: 'Stops', restarted: 'Restarts', reloaded: 'Reloads' }[state] || 'Manages'
    const parts = [`${stateVerb} service ${name ? `"${name}"` : '(name not specified)'}`]
    if (enabled === true)  parts.push('and ensures it starts automatically on boot')
    if (enabled === false) parts.push('and prevents it from starting on boot')
    return { text: parts.join(' ') + '.', warning: null, icon: 'activity', docUrl: moduleDoc('service') }
  }

  m = getModule(task, 'systemd', 'ansible.builtin.systemd', 'ansible.builtin.systemd_service')
  if (m) {
    const name = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'started'
    const enabled = typeof m.args === 'object' ? m.args.enabled : null
    const stateVerb = { started: 'Starts', stopped: 'Stops', restarted: 'Restarts', reloaded: 'Reloads' }[state] || 'Manages'
    const daemonReload = typeof m.args === 'object' && (m.args.daemon_reload === true || m.args.daemon_reload === 'yes')
    const parts = []
    if (daemonReload) parts.push('Reloads the systemd daemon, then')
    parts.push(`${daemonReload ? (stateVerb.toLowerCase()) : stateVerb} unit ${name ? `"${name}"` : '(name not specified)'}`)
    if (enabled === true)  parts.push('and ensures it starts automatically on boot')
    if (enabled === false) parts.push('and prevents it from starting on boot')
    return { text: parts.join(' ') + '.', warning: null, icon: 'activity', docUrl: moduleDoc('systemd') }
  }

  m = getModule(task, 'supervisorctl', 'community.general.supervisorctl')
  if (m) {
    const name = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'started'
    return { text: `Sets supervisord process ${name ? `"${name}"` : ''} to state "${state}".`, warning: null, icon: 'activity', docUrl: cgDoc('supervisorctl') }
  }

  // ── Network ───────────────────────────────────────────────────
  m = getModule(task, 'get_url', 'ansible.builtin.get_url')
  if (m) {
    const url = extractArg(m.args, ['url'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Downloads file from ${url ? `"${url}"` : '(url not specified)'} to ${dest ? `"${dest}"` : '(destination not specified)'}.`, warning: null, icon: 'download-cloud', docUrl: moduleDoc('get_url') }
  }

  m = getModule(task, 'uri', 'ansible.builtin.uri')
  if (m) {
    const url         = extractArg(m.args, ['url'])
    const method      = (typeof m.args === 'object' && m.args.method) || 'GET'
    const statusCode  = (typeof m.args === 'object' && m.args.status_code) || ''
    const bodyFormat  = (typeof m.args === 'object' && m.args.body_format) || ''
    return { text: `Sends HTTP ${method} to ${url ? `"${url}"` : '(url not specified)'}${statusCode ? ` — expects status ${statusCode}` : ''}${bodyFormat ? `, body as ${bodyFormat}` : ''}.`, warning: null, icon: 'globe', docUrl: moduleDoc('uri') }
  }

  m = getModule(task, 'firewalld', 'ansible.posix.firewalld')
  if (m) {
    const service = (typeof m.args === 'object' && m.args.service) || ''
    const port    = (typeof m.args === 'object' && m.args.port)    || ''
    const state   = (typeof m.args === 'object' && m.args.state)   || 'enabled'
    return { text: `Manages firewalld rule${service ? ` for service "${service}"` : port ? ` for port "${port}"` : ''} — state: ${state}.`, warning: null, icon: 'shield', docUrl: posixDoc('firewalld') }
  }

  m = getModule(task, 'ufw', 'community.general.ufw')
  if (m) {
    const rule  = extractArg(m.args, ['rule', 'state'])
    const port  = (typeof m.args === 'object' && m.args.port) || ''
    return { text: `Manages UFW firewall rule${rule ? ` "${rule}"` : ''}${port ? ` on port ${port}` : ''}.`, warning: null, icon: 'shield', docUrl: cgDoc('ufw') }
  }

  m = getModule(task, 'iptables', 'ansible.builtin.iptables')
  if (m) {
    const chain = (typeof m.args === 'object' && m.args.chain) || ''
    return { text: `Manages iptables rule${chain ? ` in chain "${chain}"` : ''}.`, warning: null, icon: 'shield', docUrl: moduleDoc('iptables') }
  }

  m = getModule(task, 'nmcli', 'community.general.nmcli')
  if (m) {
    const conn  = extractArg(m.args, ['conn_name'])
    return { text: `Manages NetworkManager connection ${conn ? `"${conn}"` : ''}.`, warning: null, icon: 'globe', docUrl: cgDoc('nmcli') }
  }

  // ── Shell / Command ───────────────────────────────────────────
  m = getModule(task, 'shell', 'ansible.builtin.shell')
  if (m) {
    const cmd     = typeof m.args === 'string' ? m.args : extractArg(m.args, ['cmd', '_raw_params'])
    const creates = typeof m.args === 'object' && m.args.creates
    const removes = typeof m.args === 'object' && m.args.removes
    const guard   = creates ? ` Skipped if "${creates}" already exists.` : removes ? ` Skipped if "${removes}" does not exist.` : ''
    const warn    = guard ? null : 'Non-idempotent — runs on every execution. Consider an idempotent Ansible module or add a creates/removes guard.'
    const explained = cmd ? explainShellCmd(cmd) : null
    const text = explained ? `${explained}${guard}` : `Runs shell command: ${cmd ? `"${cmd}"` : '(see args)'}.${guard}`
    return { text, warning: warn, icon: 'terminal', docUrl: moduleDoc('shell') }
  }

  m = getModule(task, 'command', 'ansible.builtin.command')
  if (m) {
    const cmd     = typeof m.args === 'string' ? m.args : extractArg(m.args, ['cmd', '_raw_params'])
    const creates = typeof m.args === 'object' && m.args.creates
    const removes = typeof m.args === 'object' && m.args.removes
    const guard   = creates ? ` Skipped if "${creates}" already exists.` : removes ? ` Skipped if "${removes}" does not exist.` : ''
    const warn    = guard ? null : 'Non-idempotent — runs on every execution. Consider an idempotent Ansible module or add a creates/removes guard.'
    const explained = cmd ? explainShellCmd(cmd) : null
    const text = explained ? `${explained}${guard}` : `Executes command: ${cmd ? `"${cmd}"` : '(see args)'}.${guard}`
    return { text, warning: warn, icon: 'terminal', docUrl: moduleDoc('command') }
  }

  m = getModule(task, 'raw', 'ansible.builtin.raw')
  if (m) {
    const cmd = typeof m.args === 'string' ? m.args : ''
    return { text: `Executes raw SSH command (no Python required)${cmd ? `: "${cmd}"` : ''}.`, warning: 'raw bypasses all Ansible module features. Use only when no Python is available on the target.', icon: 'terminal', docUrl: moduleDoc('raw') }
  }

  m = getModule(task, 'script', 'ansible.builtin.script')
  if (m) {
    const scr = typeof m.args === 'string' ? m.args : extractArg(m.args, ['cmd', '_raw_params'])
    return { text: `Transfers and executes local script ${scr ? `"${scr}"` : ''} on the remote host.`, warning: 'Non-idempotent — the script runs on every execution unless guarded with creates/removes.', icon: 'terminal', docUrl: moduleDoc('script') }
  }

  m = getModule(task, 'expect', 'ansible.builtin.expect')
  if (m) {
    const cmd = extractArg(m.args, ['command'])
    return { text: `Runs command ${cmd ? `"${cmd}"` : ''} and responds to interactive prompts automatically.`, warning: null, icon: 'terminal', docUrl: moduleDoc('expect') }
  }

  // ── Debug / Variables ─────────────────────────────────────────
  m = getModule(task, 'debug', 'ansible.builtin.debug')
  if (m) {
    const varName  = typeof m.args === 'object' && m.args.var
    const msg      = typeof m.args === 'object' && m.args.msg
    const verbosity = typeof m.args === 'object' && m.args.verbosity
    if (varName) {
      return { text: `Prints the value of "{{ ${varName} }}" to the console${verbosity ? ` (only at verbosity level ${verbosity}+)` : ''}.`, warning: null, icon: 'bug', docUrl: moduleDoc('debug') }
    }
    return { text: `Prints to console${msg ? `: "${msg}"` : ''}${verbosity ? ` (verbosity ${verbosity}+)` : ''}.`, warning: null, icon: 'bug', docUrl: moduleDoc('debug') }
  }

  m = getModule(task, 'set_fact', 'ansible.builtin.set_fact')
  if (m) {
    const keys = typeof m.args === 'object' ? Object.keys(m.args).filter(k => k !== 'cacheable') : []
    const examples = keys.slice(0, 2).map(k => {
      const v = m.args[k]
      return `${k}=${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`
    }).join(', ')
    const overflow = keys.length > 2 ? ` (+${keys.length - 2} more)` : ''
    const cacheable = typeof m.args === 'object' && m.args.cacheable === true
    return { text: `Sets ${keys.length > 1 ? 'variables' : 'variable'} for this host${examples ? `: ${examples}${overflow}` : ''}${cacheable ? ' — persisted to the fact cache' : ''}.`, warning: null, icon: 'variable', docUrl: moduleDoc('set_fact') }
  }

  m = getModule(task, 'include_vars', 'ansible.builtin.include_vars')
  if (m) {
    const file = typeof m.args === 'string' ? m.args : extractArg(m.args, ['file', 'dir'])
    return { text: `Loads variables from ${file ? `"${file}"` : '(file not specified)'} into the current scope.`, warning: null, icon: 'variable', docUrl: moduleDoc('include_vars') }
  }

  m = getModule(task, 'assert', 'ansible.builtin.assert')
  if (m) {
    const that     = typeof m.args === 'object' && m.args.that
    const fail_msg = typeof m.args === 'object' && m.args.fail_msg
    const conditions = Array.isArray(that)
      ? that.slice(0, 2).join(' AND ')
      : (typeof that === 'string' ? that : '')
    return { text: `Asserts ${conditions ? `"${conditions}"` : 'given conditions'}${conditions && that.length > 2 ? ` (+${that.length - 2} more)` : ''} — fails the playbook if false${fail_msg ? ` with: "${fail_msg}"` : ''}.`, warning: null, icon: 'zap', docUrl: moduleDoc('assert') }
  }

  m = getModule(task, 'fail', 'ansible.builtin.fail')
  if (m) {
    const msg = (typeof m.args === 'object' && m.args.msg) ? `"${m.args.msg}"` : ''
    return { text: `Explicitly fails the task${msg ? ` with message ${msg}` : ''}.`, warning: null, icon: 'zap', docUrl: moduleDoc('fail') }
  }

  m = getModule(task, 'validate_argument_spec', 'ansible.builtin.validate_argument_spec')
  if (m) {
    return { text: 'Validates role/task argument specification against provided values.', warning: null, icon: 'zap', docUrl: moduleDoc('validate_argument_spec') }
  }

  // ── Flow control ──────────────────────────────────────────────
  m = getModule(task, 'pause', 'ansible.builtin.pause')
  if (m) {
    const secs    = typeof m.args === 'object' && m.args.seconds
    const minutes = typeof m.args === 'object' && m.args.minutes
    const prompt  = typeof m.args === 'object' && m.args.prompt
    if (prompt) return { text: `Pauses playbook and prompts the user: "${prompt}".`, warning: null, icon: 'clock', docUrl: moduleDoc('pause') }
    return { text: `Pauses playbook execution${secs ? ` for ${secs} second(s)` : minutes ? ` for ${minutes} minute(s)` : ' until user presses Enter'}.`, warning: null, icon: 'clock', docUrl: moduleDoc('pause') }
  }

  m = getModule(task, 'meta', 'ansible.builtin.meta')
  if (m) {
    const action = typeof m.args === 'string' ? m.args : (typeof m.args === 'object' && m.args.free_form) || ''
    return { text: `Executes meta action: "${action || 'see args'}".`, warning: null, icon: 'zap', docUrl: moduleDoc('meta') }
  }

  m = getModule(task, 'reboot', 'ansible.builtin.reboot')
  if (m) {
    return { text: 'Reboots the remote host and waits for it to come back online.', warning: null, icon: 'refresh-cw', docUrl: moduleDoc('reboot') }
  }

  m = getModule(task, 'wait_for', 'ansible.builtin.wait_for')
  if (m) {
    const port = typeof m.args === 'object' && m.args.port
    const host = typeof m.args === 'object' && m.args.host
    return { text: `Waits${host ? ` for host "${host}"` : ''}${port ? ` on port ${port}` : ''} to become available.`, warning: null, icon: 'clock', docUrl: moduleDoc('wait_for') }
  }

  m = getModule(task, 'wait_for_connection', 'ansible.builtin.wait_for_connection')
  if (m) {
    return { text: 'Waits until the remote host is reachable (useful after reboot).', warning: null, icon: 'clock', docUrl: moduleDoc('wait_for_connection') }
  }

  // ── Includes / Imports ────────────────────────────────────────
  m = getModule(task, 'include_tasks', 'ansible.builtin.include_tasks')
  if (m) {
    const file = typeof m.args === 'string' ? m.args : extractArg(m.args, ['file'])
    return { text: `Dynamically includes tasks from ${file ? `"${file}"` : '(file not specified)'}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('include_tasks') }
  }

  m = getModule(task, 'import_tasks', 'ansible.builtin.import_tasks')
  if (m) {
    const file = typeof m.args === 'string' ? m.args : extractArg(m.args, ['file'])
    return { text: `Statically imports tasks from ${file ? `"${file}"` : '(file not specified)'}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('import_tasks') }
  }

  m = getModule(task, 'include_role', 'ansible.builtin.include_role')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Dynamically includes role ${name ? `"${name}"` : '(name not specified)'}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('include_role') }
  }

  m = getModule(task, 'import_role', 'ansible.builtin.import_role')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Statically imports role ${name ? `"${name}"` : '(name not specified)'}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('import_role') }
  }

  m = getModule(task, 'import_playbook', 'ansible.builtin.import_playbook')
  if (m) {
    const name = typeof m.args === 'string' ? m.args : extractArg(m.args, ['name'])
    return { text: `Imports playbook ${name ? `"${name}"` : '(name not specified)'}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('import_playbook') }
  }

  // ── System ────────────────────────────────────────────────────
  m = getModule(task, 'user', 'ansible.builtin.user')
  if (m) {
    const name   = extractArg(m.args, ['name'])
    const state  = (typeof m.args === 'object' && m.args.state) || 'present'
    const shell  = (typeof m.args === 'object' && m.args.shell) || ''
    const groups = (typeof m.args === 'object' && m.args.groups) || ''
    const home   = (typeof m.args === 'object' && m.args.home) || ''
    const system = typeof m.args === 'object' && m.args.system === true
    if (state === 'absent') {
      return { text: `Removes system user ${name ? `"${name}"` : '(name not specified)'} (and optionally their home directory).`, warning: null, icon: 'user', docUrl: moduleDoc('user') }
    }
    const extras = []
    if (system) extras.push('system account')
    if (shell)  extras.push(`shell: ${shell}`)
    if (groups) extras.push(`groups: ${Array.isArray(groups) ? groups.join(', ') : groups}`)
    if (home)   extras.push(`home: ${home}`)
    return { text: `Ensures system user ${name ? `"${name}"` : '(name not specified)'} exists${extras.length ? ` (${extras.join(', ')})` : ''}.`, warning: null, icon: 'user', docUrl: moduleDoc('user') }
  }

  m = getModule(task, 'group', 'ansible.builtin.group')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages system group ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: moduleDoc('group') }
  }

  m = getModule(task, 'authorized_key', 'ansible.posix.authorized_key')
  if (m) {
    const user  = (typeof m.args === 'object' && m.args.user) || ''
    const key   = (typeof m.args === 'object' && m.args.key) || ''
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    let keyType = ''
    if (key.startsWith('ssh-ed25519'))  keyType = 'Ed25519'
    else if (key.startsWith('ssh-rsa')) keyType = 'RSA'
    else if (key.startsWith('ecdsa-'))  keyType = 'ECDSA'
    else if (key.startsWith('ssh-dss')) keyType = 'DSA'
    else if (key.includes('{{ '))       keyType = 'variable'
    const action = state === 'absent' ? 'Revokes' : 'Authorises'
    return { text: `${action} ${keyType ? `${keyType} ` : ''}SSH key${user ? ` for user "${user}"` : ''} — ${state === 'absent' ? 'removes it from' : 'adds it to'} ~/.ssh/authorized_keys.`, warning: null, icon: 'user', docUrl: posixDoc('authorized_key') }
  }

  m = getModule(task, 'cron', 'ansible.builtin.cron')
  if (m) {
    const name        = extractArg(m.args, ['name'])
    const job         = (typeof m.args === 'object' && m.args.job) || ''
    const state       = (typeof m.args === 'object' && m.args.state) || 'present'
    const specialTime = (typeof m.args === 'object' && m.args.special_time) || ''
    const minute      = (typeof m.args === 'object' && m.args.minute  !== undefined) ? m.args.minute  : null
    const hour        = (typeof m.args === 'object' && m.args.hour    !== undefined) ? m.args.hour    : null
    const weekday     = (typeof m.args === 'object' && m.args.weekday !== undefined) ? m.args.weekday : null
    if (state === 'absent') {
      return { text: `Removes cron job ${name ? `"${name}"` : '(name not specified)'}.`, warning: null, icon: 'clock', docUrl: moduleDoc('cron') }
    }
    let schedule = ''
    if (specialTime)                         schedule = ` — runs ${specialTime}`
    else if (minute !== null || hour !== null) schedule = ` — scheduled at ${hour !== null ? hour : '*'}:${minute !== null ? minute : '*'}${weekday !== null ? ` on weekday ${weekday}` : ''}`
    return { text: `Schedules cron job ${name ? `"${name}"` : '(name not specified)'}${schedule}${job ? `: "${job}"` : ''}.`, warning: null, icon: 'clock', docUrl: moduleDoc('cron') }
  }

  m = getModule(task, 'at', 'community.general.at')
  if (m) {
    return { text: 'Schedules a one-off command using the at utility.', warning: null, icon: 'clock', docUrl: cgDoc('at') }
  }

  m = getModule(task, 'hostname', 'ansible.builtin.hostname')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Sets the system hostname to ${name ? `"${name}"` : '(see args)'}.`, warning: null, icon: 'globe', docUrl: moduleDoc('hostname') }
  }

  m = getModule(task, 'timezone', 'community.general.timezone')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Sets the system timezone to ${name ? `"${name}"` : '(see args)'}.`, warning: null, icon: 'clock', docUrl: cgDoc('timezone') }
  }

  m = getModule(task, 'locale_gen', 'community.general.locale_gen')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Generates locale ${name ? `"${name}"` : '(see args)'}.`, warning: null, icon: 'globe', docUrl: cgDoc('locale_gen') }
  }

  m = getModule(task, 'sysctl', 'ansible.posix.sysctl')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const value = (typeof m.args === 'object' && m.args.value) || ''
    return { text: `Sets kernel parameter ${name ? `"${name}"` : ''}${value ? ` = "${value}"` : ''}.`, warning: null, icon: 'activity', docUrl: posixDoc('sysctl') }
  }

  m = getModule(task, 'mount', 'ansible.posix.mount')
  if (m) {
    const path = extractArg(m.args, ['path', 'name'])
    const src  = extractArg(m.args, ['src'])
    return { text: `Manages filesystem mount ${path ? `"${path}"` : ''}${src ? ` from "${src}"` : ''}.`, warning: null, icon: 'folder', docUrl: posixDoc('mount') }
  }

  m = getModule(task, 'modprobe', 'community.general.modprobe')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `${state === 'absent' ? 'Removes' : 'Loads'} kernel module ${name ? `"${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: cgDoc('modprobe') }
  }

  m = getModule(task, 'kernel_blacklist', 'community.general.kernel_blacklist')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages kernel module blacklist entry${name ? ` for "${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: cgDoc('kernel_blacklist') }
  }

  m = getModule(task, 'alternatives', 'community.general.alternatives')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages update-alternatives entry${name ? ` for "${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: cgDoc('alternatives') }
  }

  // ── Testing / Connectivity ─────────────────────────────────────
  m = getModule(task, 'ping', 'ansible.builtin.ping')
  if (m) {
    return { text: 'Pings the remote host to verify Ansible connectivity and Python availability.', warning: null, icon: 'activity', docUrl: moduleDoc('ping') }
  }

  m = getModule(task, 'setup', 'ansible.builtin.setup')
  if (m) {
    return { text: 'Gathers system facts (OS, hardware, network, etc.) from the remote host.', warning: null, icon: 'activity', docUrl: moduleDoc('setup') }
  }

  m = getModule(task, 'gather_facts', 'ansible.builtin.gather_facts')
  if (m) {
    return { text: 'Gathers facts about the remote host using configured fact modules.', warning: null, icon: 'activity', docUrl: moduleDoc('gather_facts') }
  }

  m = getModule(task, 'getent', 'ansible.builtin.getent')
  if (m) {
    const db  = (typeof m.args === 'object' && m.args.database) || ''
    const key = (typeof m.args === 'object' && m.args.key) || ''
    return { text: `Queries system database "${db || 'passwd'}"${key ? ` for key "${key}"` : ''}.`, warning: null, icon: 'user', docUrl: moduleDoc('getent') }
  }

  // ── Git / Version control ──────────────────────────────────────
  m = getModule(task, 'git', 'ansible.builtin.git')
  if (m) {
    const repo    = extractArg(m.args, ['repo'])
    const dest    = extractArg(m.args, ['dest'])
    const version = (typeof m.args === 'object' && m.args.version) || ''
    const depth   = (typeof m.args === 'object' && m.args.depth) || ''
    const update  = typeof m.args === 'object' && m.args.update === false ? false : true
    return { text: `${update ? 'Clones or updates' : 'Clones (no updates)'} ${repo ? `"${repo}"` : '(repo not specified)'}${version ? ` @ "${version}"` : ''} → ${dest ? `"${dest}"` : '(dest not specified)'}${depth ? ` (shallow, depth: ${depth})` : ''}.`, warning: null, icon: 'git-merge', docUrl: moduleDoc('git') }
  }

  m = getModule(task, 'github_release', 'community.general.github_release')
  if (m) {
    const repo = (typeof m.args === 'object' && m.args.repo) || ''
    return { text: `Interacts with GitHub releases${repo ? ` for repo "${repo}"` : ''}.`, warning: null, icon: 'git-merge', docUrl: cgDoc('github_release') }
  }

  // ── Database ───────────────────────────────────────────────────
  m = getModule(task, 'mysql_db', 'community.mysql.mysql_db')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `${state === 'absent' ? 'Drops' : 'Creates/manages'} MySQL database ${name ? `"${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: mysqlDoc('mysql_db') }
  }

  m = getModule(task, 'mysql_user', 'community.mysql.mysql_user')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages MySQL user ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: mysqlDoc('mysql_user') }
  }

  m = getModule(task, 'mysql_query', 'community.mysql.mysql_query')
  if (m) {
    const query = (typeof m.args === 'object' && m.args.query) || ''
    return { text: `Executes MySQL query${query ? `: "${query}"` : ''}.`, warning: null, icon: 'activity', docUrl: mysqlDoc('mysql_query') }
  }

  m = getModule(task, 'postgresql_db', 'community.postgresql.postgresql_db')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `${state === 'absent' ? 'Drops' : 'Creates/manages'} PostgreSQL database ${name ? `"${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: pgDoc('postgresql_db') }
  }

  m = getModule(task, 'postgresql_user', 'community.postgresql.postgresql_user')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages PostgreSQL user/role ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: pgDoc('postgresql_user') }
  }

  m = getModule(task, 'postgresql_query', 'community.postgresql.postgresql_query')
  if (m) {
    const query = (typeof m.args === 'object' && m.args.query) || ''
    return { text: `Executes PostgreSQL query${query ? `: "${query}"` : ''}.`, warning: null, icon: 'activity', docUrl: pgDoc('postgresql_query') }
  }

  // ── Containers ─────────────────────────────────────────────────
  m = getModule(task, 'docker_container', 'community.docker.docker_container')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const image = (typeof m.args === 'object' && m.args.image) || ''
    const state = (typeof m.args === 'object' && m.args.state) || 'started'
    const ports = (typeof m.args === 'object' && m.args.ports) || []
    const portStr = Array.isArray(ports) && ports.length
      ? ` — ports: ${ports.slice(0, 3).join(', ')}${ports.length > 3 ? ` +${ports.length - 3} more` : ''}`
      : (typeof ports === 'string' ? ` — ports: ${ports}` : '')
    const stateVerb = { absent: 'Removes', stopped: 'Stops', started: 'Starts/ensures', present: 'Creates/ensures', exited: 'Runs once then leaves exited' }[state] || 'Manages'
    return { text: `${stateVerb} Docker container ${name ? `"${name}"` : ''}${image ? ` from image "${image}"` : ''}${portStr}.`, warning: null, icon: 'activity', docUrl: dockerDoc('docker_container') }
  }

  m = getModule(task, 'docker_image', 'community.docker.docker_image')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Docker image ${name ? `"${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: dockerDoc('docker_image') }
  }

  m = getModule(task, 'docker_compose', 'community.docker.docker_compose')
  if (m) {
    const project_src = (typeof m.args === 'object' && m.args.project_src) || ''
    return { text: `Manages Docker Compose project${project_src ? ` in "${project_src}"` : ''}.`, warning: null, icon: 'activity', docUrl: dockerDoc('docker_compose') }
  }

  m = getModule(task, 'docker_network', 'community.docker.docker_network')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Docker network ${name ? `"${name}"` : ''}.`, warning: null, icon: 'globe', docUrl: dockerDoc('docker_network') }
  }

  m = getModule(task, 'docker_volume', 'community.docker.docker_volume')
  if (m) {
    const name = extractArg(m.args, ['volume_name', 'name'])
    return { text: `Manages Docker volume ${name ? `"${name}"` : ''}.`, warning: null, icon: 'folder', docUrl: dockerDoc('docker_volume') }
  }

  // ── Kubernetes ─────────────────────────────────────────────────
  m = getModule(task, 'k8s', 'kubernetes.core.k8s')
  if (m) {
    const kind = (typeof m.args === 'object' && m.args.kind) || ''
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Kubernetes resource${kind ? ` of kind "${kind}"` : ''}${name ? ` named "${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: k8sDoc('k8s') }
  }

  m = getModule(task, 'helm', 'kubernetes.core.helm')
  if (m) {
    const name  = (typeof m.args === 'object' && m.args.release_name) || extractArg(m.args, ['name'])
    const chart = (typeof m.args === 'object' && m.args.chart_ref) || ''
    return { text: `Deploys Helm release ${name ? `"${name}"` : ''}${chart ? ` from chart "${chart}"` : ''}.`, warning: null, icon: 'activity', docUrl: k8sDoc('helm') }
  }

  // ── Crypto / SSL ───────────────────────────────────────────────
  m = getModule(task, 'openssl_privatekey', 'community.crypto.openssl_privatekey')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Generates/manages OpenSSL private key at ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cryptoDoc('openssl_privatekey') }
  }

  m = getModule(task, 'openssl_csr', 'community.crypto.openssl_csr')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Generates/manages certificate signing request (CSR) at ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cryptoDoc('openssl_csr') }
  }

  m = getModule(task, 'x509_certificate', 'community.crypto.x509_certificate')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Generates/manages X.509 certificate at ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cryptoDoc('x509_certificate') }
  }

  m = getModule(task, 'openssl_pkcs12', 'community.crypto.openssl_pkcs12')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Generates/manages PKCS#12 archive at ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: cryptoDoc('openssl_pkcs12') }
  }

  m = getModule(task, 'htpasswd', 'community.general.htpasswd')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Manages htpasswd file at ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'user', docUrl: cgDoc('htpasswd') }
  }

  // ── Cloud / AWS ────────────────────────────────────────────────
  m = getModule(task, 's3_object', 'amazon.aws.s3_object')
  if (m) {
    const bucket = (typeof m.args === 'object' && m.args.bucket) || ''
    return { text: `Manages S3 object${bucket ? ` in bucket "${bucket}"` : ''}.`, warning: null, icon: 'download-cloud', docUrl: `https://docs.ansible.com/ansible/latest/collections/amazon/aws/s3_object_module.html` }
  }

  m = getModule(task, 'ec2_instance', 'amazon.aws.ec2_instance')
  if (m) {
    return { text: 'Manages AWS EC2 instance(s).', warning: null, icon: 'activity', docUrl: `https://docs.ansible.com/ansible/latest/collections/amazon/aws/ec2_instance_module.html` }
  }

  m = getModule(task, 'ec2_security_group', 'amazon.aws.ec2_security_group')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages EC2 security group ${name ? `"${name}"` : ''}.`, warning: null, icon: 'shield', docUrl: `https://docs.ansible.com/ansible/latest/collections/amazon/aws/ec2_security_group_module.html` }
  }

  m = getModule(task, 's3_object', 'amazon.aws.s3_object')
  if (m) {
    const bucket = (typeof m.args === 'object' && m.args.bucket) || ''
    return { text: `Manages S3 object${bucket ? ` in bucket "${bucket}"` : ''}.`, warning: null, icon: 'download-cloud', docUrl: awsDoc('s3_object') }
  }

  m = getModule(task, 'ec2_instance', 'amazon.aws.ec2_instance')
  if (m) {
    return { text: 'Manages AWS EC2 instance(s).', warning: null, icon: 'activity', docUrl: awsDoc('ec2_instance') }
  }

  m = getModule(task, 'ec2_security_group', 'amazon.aws.ec2_security_group')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages EC2 security group ${name ? `"${name}"` : ''}.`, warning: null, icon: 'shield', docUrl: awsDoc('ec2_security_group') }
  }

  m = getModule(task, 's3_bucket', 'amazon.aws.s3_bucket')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages S3 bucket ${name ? `"${name}"` : ''}.`, warning: null, icon: 'folder', docUrl: awsDoc('s3_bucket') }
  }

  m = getModule(task, 'route53', 'amazon.aws.route53')
  if (m) {
    const zone    = (typeof m.args === 'object' && m.args.zone) || ''
    const record  = (typeof m.args === 'object' && m.args.record) || ''
    return { text: `Manages Route53 DNS record${record ? ` "${record}"` : ''}${zone ? ` in zone "${zone}"` : ''}.`, warning: null, icon: 'globe', docUrl: awsDoc('route53') }
  }

  m = getModule(task, 'cloudformation', 'amazon.aws.cloudformation')
  if (m) {
    const stack = (typeof m.args === 'object' && m.args.stack_name) || extractArg(m.args, ['name'])
    return { text: `Manages CloudFormation stack ${stack ? `"${stack}"` : ''}.`, warning: null, icon: 'activity', docUrl: awsDoc('cloudformation') }
  }

  m = getModule(task, 'ec2_vpc_net', 'amazon.aws.ec2_vpc_net')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages EC2 VPC${name ? ` "${name}"` : ''}.`, warning: null, icon: 'globe', docUrl: awsDoc('ec2_vpc_net') }
  }

  m = getModule(task, 'iam_user', 'amazon.aws.iam_user')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages IAM user ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: awsDoc('iam_user') }
  }

  // ── More Kubernetes ────────────────────────────────────────────
  m = getModule(task, 'k8s_info', 'kubernetes.core.k8s_info')
  if (m) {
    const kind = (typeof m.args === 'object' && m.args.kind) || ''
    return { text: `Gathers information about Kubernetes resources${kind ? ` of kind "${kind}"` : ''}.`, warning: null, icon: 'activity', docUrl: k8sDoc('k8s_info') }
  }

  m = getModule(task, 'helm_repository', 'kubernetes.core.helm_repository')
  if (m) {
    const name = extractArg(m.args, ['name'])
    const url  = (typeof m.args === 'object' && m.args.repo_url) || ''
    return { text: `Manages Helm chart repository ${name ? `"${name}"` : ''}${url ? ` at "${url}"` : ''}.`, warning: null, icon: 'git-merge', docUrl: k8sDoc('helm_repository') }
  }

  // ── More PostgreSQL ────────────────────────────────────────────
  m = getModule(task, 'postgresql_privs', 'community.postgresql.postgresql_privs')
  if (m) {
    const db   = (typeof m.args === 'object' && m.args.database) || ''
    const role = (typeof m.args === 'object' && m.args.roles) || ''
    return { text: `Manages PostgreSQL privileges${role ? ` for role "${role}"` : ''}${db ? ` in database "${db}"` : ''}.`, warning: null, icon: 'user', docUrl: pgDoc('postgresql_privs') }
  }

  m = getModule(task, 'postgresql_table', 'community.postgresql.postgresql_table')
  if (m) {
    const table = extractArg(m.args, ['table'])
    return { text: `Manages PostgreSQL table ${table ? `"${table}"` : ''}.`, warning: null, icon: 'activity', docUrl: pgDoc('postgresql_table') }
  }

  // ── More MySQL ─────────────────────────────────────────────────
  m = getModule(task, 'mysql_replication', 'community.mysql.mysql_replication')
  if (m) {
    const mode = (typeof m.args === 'object' && m.args.mode) || ''
    return { text: `Manages MySQL replication${mode ? ` — mode: "${mode}"` : ''}.`, warning: null, icon: 'activity', docUrl: mysqlDoc('mysql_replication') }
  }

  m = getModule(task, 'mysql_variables', 'community.mysql.mysql_variables')
  if (m) {
    const variable = (typeof m.args === 'object' && m.args.variable) || ''
    return { text: `Manages MySQL global variable${variable ? ` "${variable}"` : ''}.`, warning: null, icon: 'variable', docUrl: mysqlDoc('mysql_variables') }
  }

  // ── MongoDB ────────────────────────────────────────────────────
  m = getModule(task, 'mongodb_user', 'community.mongodb.mongodb_user')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages MongoDB user ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: mongoDoc('mongodb_user') }
  }

  // ── Disk / Storage ─────────────────────────────────────────────
  m = getModule(task, 'parted', 'community.general.parted')
  if (m) {
    const device = (typeof m.args === 'object' && m.args.device) || ''
    const number = (typeof m.args === 'object' && m.args.number) || ''
    return { text: `Manages disk partition${number ? ` #${number}` : ''}${device ? ` on "${device}"` : ''}.`, warning: null, icon: 'folder', docUrl: cgDoc('parted') }
  }

  m = getModule(task, 'filesystem', 'community.general.filesystem')
  if (m) {
    const fstype = (typeof m.args === 'object' && m.args.fstype) || ''
    const dev    = (typeof m.args === 'object' && m.args.dev) || ''
    return { text: `Creates ${fstype ? `${fstype} ` : ''}filesystem on ${dev ? `"${dev}"` : '(device not specified)'}.`, warning: null, icon: 'folder', docUrl: cgDoc('filesystem') }
  }

  m = getModule(task, 'lvol', 'community.general.lvol')
  if (m) {
    const lv  = (typeof m.args === 'object' && m.args.lv) || ''
    const vg  = (typeof m.args === 'object' && m.args.vg) || ''
    return { text: `Manages LVM logical volume ${lv ? `"${lv}"` : ''}${vg ? ` in volume group "${vg}"` : ''}.`, warning: null, icon: 'folder', docUrl: cgDoc('lvol') }
  }

  m = getModule(task, 'lvg', 'community.general.lvg')
  if (m) {
    const vg = (typeof m.args === 'object' && m.args.vg) || extractArg(m.args, ['vg'])
    return { text: `Manages LVM volume group ${vg ? `"${vg}"` : ''}.`, warning: null, icon: 'folder', docUrl: cgDoc('lvg') }
  }

  // ── SELinux ────────────────────────────────────────────────────
  m = getModule(task, 'selinux', 'ansible.posix.selinux')
  if (m) {
    const state = (typeof m.args === 'object' && m.args.state) || ''
    return { text: `Sets SELinux policy to "${state || '(see args)'}" mode.`, warning: null, icon: 'shield', docUrl: posixDoc('selinux') }
  }

  m = getModule(task, 'seboolean', 'ansible.posix.seboolean')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || ''
    return { text: `Sets SELinux boolean ${name ? `"${name}"` : ''} to ${state ? `"${state}"` : '(see args)'}.`, warning: null, icon: 'shield', docUrl: posixDoc('seboolean') }
  }

  m = getModule(task, 'seport', 'ansible.posix.seport')
  if (m) {
    const ports = (typeof m.args === 'object' && m.args.ports) || ''
    return { text: `Manages SELinux network port label${ports ? ` for port(s) ${ports}` : ''}.`, warning: null, icon: 'shield', docUrl: posixDoc('seport') }
  }

  m = getModule(task, 'sefcontext', 'community.general.sefcontext')
  if (m) {
    const target = (typeof m.args === 'object' && m.args.target) || ''
    return { text: `Manages SELinux file context${target ? ` for "${target}"` : ''}.`, warning: null, icon: 'shield', docUrl: cgDoc('sefcontext') }
  }

  // ── ACL / Patch ────────────────────────────────────────────────
  m = getModule(task, 'acl', 'ansible.posix.acl')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Manages POSIX ACL on ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: posixDoc('acl') }
  }

  m = getModule(task, 'patch', 'ansible.posix.patch')
  if (m) {
    const src  = extractArg(m.args, ['src'])
    const dest = extractArg(m.args, ['dest', 'basedir'])
    return { text: `Applies patch ${src ? `"${src}"` : ''}${dest ? ` to "${dest}"` : ''}.`, warning: null, icon: 'file-text', docUrl: posixDoc('patch') }
  }

  // ── Facts modules ──────────────────────────────────────────────
  m = getModule(task, 'package_facts', 'ansible.builtin.package_facts')
  if (m) {
    return { text: 'Gathers installed package facts into ansible_facts.packages.', warning: null, icon: 'package', docUrl: moduleDoc('package_facts') }
  }

  m = getModule(task, 'service_facts', 'ansible.builtin.service_facts')
  if (m) {
    return { text: 'Gathers service state facts into ansible_facts.services.', warning: null, icon: 'activity', docUrl: moduleDoc('service_facts') }
  }

  m = getModule(task, 'async_status', 'ansible.builtin.async_status')
  if (m) {
    const jid = (typeof m.args === 'object' && m.args.jid) || ''
    return { text: `Checks the status of an async task${jid ? ` (job ID: ${jid})` : ''}.`, warning: null, icon: 'clock', docUrl: moduleDoc('async_status') }
  }

  // ── Extra package managers ─────────────────────────────────────
  m = getModule(task, 'pacman', 'community.general.pacman')
  if (m) {
    const pkg   = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} via pacman (Arch Linux).`, warning: null, icon: 'package', docUrl: cgDoc('pacman') }
  }

  m = getModule(task, 'zypper', 'community.general.zypper')
  if (m) {
    const pkg   = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} via zypper (SUSE).`, warning: null, icon: 'package', docUrl: cgDoc('zypper') }
  }

  m = getModule(task, 'apk', 'community.general.apk')
  if (m) {
    const pkg   = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} via apk (Alpine Linux).`, warning: null, icon: 'package', docUrl: cgDoc('apk') }
  }

  m = getModule(task, 'homebrew', 'community.general.homebrew')
  if (m) {
    const pkg   = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : 'Installs'
    return { text: `${stateWord} package ${pkg ? `"${pkg}"` : '(see args)'} via Homebrew (macOS).`, warning: null, icon: 'package', docUrl: cgDoc('homebrew') }
  }

  m = getModule(task, 'pkgng', 'community.general.pkgng')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Manages pkg package ${pkg ? `"${pkg}"` : '(see args)'} (FreeBSD).`, warning: null, icon: 'package', docUrl: cgDoc('pkgng') }
  }

  m = getModule(task, 'portage', 'community.general.portage')
  if (m) {
    const pkg = extractArg(m.args, ['package'])
    return { text: `Manages Portage package ${pkg ? `"${pkg}"` : '(see args)'} (Gentoo).`, warning: null, icon: 'package', docUrl: cgDoc('portage') }
  }

  m = getModule(task, 'pipx', 'community.general.pipx')
  if (m) {
    const pkg = extractArg(m.args, ['name'])
    return { text: `Manages pipx application ${pkg ? `"${pkg}"` : '(see args)'}.`, warning: null, icon: 'package', docUrl: cgDoc('pipx') }
  }

  // ── Build / CI tooling ─────────────────────────────────────────
  m = getModule(task, 'make', 'community.general.make')
  if (m) {
    const target = (typeof m.args === 'object' && m.args.target) || ''
    const chdir  = (typeof m.args === 'object' && m.args.chdir) || ''
    return { text: `Runs make${target ? ` target "${target}"` : ''}${chdir ? ` in "${chdir}"` : ''}.`, warning: null, icon: 'terminal', docUrl: cgDoc('make') }
  }

  m = getModule(task, 'composer', 'community.general.composer')
  if (m) {
    const workdir = (typeof m.args === 'object' && m.args.working_dir) || ''
    return { text: `Runs Composer (PHP package manager)${workdir ? ` in "${workdir}"` : ''}.`, warning: null, icon: 'package', docUrl: cgDoc('composer') }
  }

  m = getModule(task, 'terraform', 'community.general.terraform')
  if (m) {
    const project = (typeof m.args === 'object' && m.args.project_path) || ''
    const state   = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `Runs Terraform ${state === 'absent' ? 'destroy' : 'apply'}${project ? ` in "${project}"` : ''}.`, warning: null, icon: 'activity', docUrl: cgDoc('terraform') }
  }

  m = getModule(task, 'jenkins_job', 'community.general.jenkins_job')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Jenkins job ${name ? `"${name}"` : ''}.`, warning: null, icon: 'activity', docUrl: cgDoc('jenkins_job') }
  }

  // ── Notifications ──────────────────────────────────────────────
  m = getModule(task, 'slack', 'community.general.slack')
  if (m) {
    const channel = (typeof m.args === 'object' && m.args.channel) || ''
    const msg     = (typeof m.args === 'object' && m.args.msg) || ''
    return { text: `Sends Slack message${channel ? ` to "${channel}"` : ''}${msg ? `: "${msg}"` : ''}.`, warning: null, icon: 'globe', docUrl: cgDoc('slack') }
  }

  m = getModule(task, 'mail', 'community.general.mail')
  if (m) {
    const to      = (typeof m.args === 'object' && m.args.to) || ''
    const subject = (typeof m.args === 'object' && m.args.subject) || ''
    return { text: `Sends email${to ? ` to "${to}"` : ''}${subject ? ` — subject: "${subject}"` : ''}.`, warning: null, icon: 'globe', docUrl: cgDoc('mail') }
  }

  m = getModule(task, 'telegram', 'community.general.telegram')
  if (m) {
    return { text: 'Sends a Telegram notification message.', warning: null, icon: 'globe', docUrl: cgDoc('telegram') }
  }

  // ── Windows (ansible.windows) ──────────────────────────────────
  m = getModule(task, 'win_command', 'ansible.windows.win_command')
  if (m) {
    const cmd = typeof m.args === 'string' ? m.args : extractArg(m.args, ['_raw_params', 'cmd'])
    return { text: `Executes Windows command: ${cmd ? `"${cmd}"` : '(see args)'}.`, warning: 'Non-idempotent command detected. Consider an idempotent Ansible module instead.', icon: 'terminal', docUrl: winDoc('win_command') }
  }

  m = getModule(task, 'win_shell', 'ansible.windows.win_shell')
  if (m) {
    const cmd = typeof m.args === 'string' ? m.args : extractArg(m.args, ['_raw_params', 'cmd'])
    return { text: `Runs Windows shell command: ${cmd ? `"${cmd}"` : '(see args)'}.`, warning: 'Non-idempotent command detected. Consider an idempotent Ansible module instead.', icon: 'terminal', docUrl: winDoc('win_shell') }
  }

  m = getModule(task, 'win_copy', 'ansible.windows.win_copy')
  if (m) {
    const src  = extractArg(m.args, ['src', 'content'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Copies ${src ? `"${src}"` : 'file'} to ${dest ? `"${dest}"` : '(destination not specified)'} on Windows.`, warning: null, icon: 'copy', docUrl: winDoc('win_copy') }
  }

  m = getModule(task, 'win_file', 'ansible.windows.win_file')
  if (m) {
    const path  = extractArg(m.args, ['path', 'dest'])
    const state = (typeof m.args === 'object' && m.args.state) || 'file'
    const stateMap = { directory: 'Creates directory', absent: 'Removes file/directory', file: 'Manages file attributes for' }
    return { text: `${stateMap[state] || 'Manages file'} ${path ? `"${path}"` : '(path not specified)'} on Windows.`, warning: null, icon: 'folder', docUrl: winDoc('win_file') }
  }

  m = getModule(task, 'win_service', 'ansible.windows.win_service')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || ''
    return { text: `Manages Windows service ${name ? `"${name}"` : ''}${state ? ` — sets to "${state}"` : ''}.`, warning: null, icon: 'activity', docUrl: winDoc('win_service') }
  }

  m = getModule(task, 'win_package', 'ansible.windows.win_package')
  if (m) {
    const path = extractArg(m.args, ['path'])
    const name = extractArg(m.args, ['name'])
    return { text: `Installs/uninstalls Windows software package${name ? ` "${name}"` : path ? ` from "${path}"` : ''}.`, warning: null, icon: 'package', docUrl: winDoc('win_package') }
  }

  m = getModule(task, 'win_user', 'ansible.windows.win_user')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `${state === 'absent' ? 'Removes' : 'Creates/manages'} Windows local user ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: winDoc('win_user') }
  }

  m = getModule(task, 'win_group', 'ansible.windows.win_group')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Windows local group ${name ? `"${name}"` : ''}.`, warning: null, icon: 'user', docUrl: winDoc('win_group') }
  }

  m = getModule(task, 'win_reboot', 'ansible.windows.win_reboot')
  if (m) {
    return { text: 'Reboots a Windows host and waits for it to come back online.', warning: null, icon: 'refresh-cw', docUrl: winDoc('win_reboot') }
  }

  m = getModule(task, 'win_stat', 'ansible.windows.win_stat')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Retrieves metadata/status of Windows path ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: winDoc('win_stat') }
  }

  m = getModule(task, 'win_regedit', 'ansible.windows.win_regedit')
  if (m) {
    const path = extractArg(m.args, ['path'])
    return { text: `Manages Windows registry key/value${path ? ` at "${path}"` : ''}.`, warning: null, icon: 'file-text', docUrl: winDoc('win_regedit') }
  }

  m = getModule(task, 'win_feature', 'ansible.windows.win_feature')
  if (m) {
    const name  = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    return { text: `${state === 'absent' ? 'Removes' : 'Installs'} Windows feature/role ${name ? `"${name}"` : ''}.`, warning: null, icon: 'package', docUrl: winDoc('win_feature') }
  }

  m = getModule(task, 'win_firewall_rule', 'ansible.windows.win_firewall_rule')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages Windows Firewall rule ${name ? `"${name}"` : ''}.`, warning: null, icon: 'shield', docUrl: winDoc('win_firewall_rule') }
  }

  m = getModule(task, 'win_environment', 'ansible.windows.win_environment')
  if (m) {
    const name  = (typeof m.args === 'object' && m.args.name) || extractArg(m.args, ['name'])
    return { text: `Manages Windows environment variable ${name ? `"${name}"` : ''}.`, warning: null, icon: 'variable', docUrl: winDoc('win_environment') }
  }

  m = getModule(task, 'win_lineinfile', 'ansible.windows.win_lineinfile')
  if (m) {
    const path = extractArg(m.args, ['path', 'dest'])
    return { text: `Ensures a specific line exists in Windows file ${path ? `"${path}"` : '(path not specified)'}.`, warning: null, icon: 'file-text', docUrl: winDoc('win_lineinfile') }
  }

  m = getModule(task, 'win_get_url', 'ansible.windows.win_get_url')
  if (m) {
    const url  = extractArg(m.args, ['url'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Downloads file from ${url ? `"${url}"` : '(url not specified)'} to ${dest ? `"${dest}"` : '(destination not specified)'} on Windows.`, warning: null, icon: 'download-cloud', docUrl: winDoc('win_get_url') }
  }

  m = getModule(task, 'win_unzip', 'community.windows.win_unzip')
  if (m) {
    const src  = extractArg(m.args, ['src'])
    const dest = extractArg(m.args, ['dest'])
    return { text: `Extracts ZIP archive ${src ? `"${src}"` : ''} to ${dest ? `"${dest}"` : '(destination not specified)'} on Windows.`, warning: null, icon: 'folder', docUrl: cwDoc('win_unzip') }
  }

  m = getModule(task, 'win_chocolatey', 'community.windows.win_chocolatey')
  if (m) {
    const pkg   = extractArg(m.args, ['name'])
    const state = (typeof m.args === 'object' && m.args.state) || 'present'
    const stateWord = state === 'absent' ? 'Removes' : 'Installs'
    return { text: `${stateWord} Chocolatey package ${pkg ? `"${pkg}"` : '(see args)'} on Windows.`, warning: null, icon: 'package', docUrl: cwDoc('win_chocolatey') }
  }

  m = getModule(task, 'win_iis_website', 'community.windows.win_iis_website')
  if (m) {
    const name = extractArg(m.args, ['name'])
    return { text: `Manages IIS website ${name ? `"${name}"` : ''} on Windows.`, warning: null, icon: 'globe', docUrl: cwDoc('win_iis_website') }
  }

  // ── Fallback ──────────────────────────────────────────────────
  return {
    text: task.name ? `Runs task: "${task.name}".` : 'Executes an Ansible task.',
    warning: null,
    icon: 'zap',
    docUrl: null,
  }
}

/**
 * Generate a human-readable summary for an entire play.
 */
// Keys that are play/task metadata, not module names
const TASK_META_KEYS = new Set([
  'name', 'when', 'tags', 'register', 'notify', 'loop', 'with_items',
  'with_dict', 'with_fileglob', 'with_sequence', 'with_nested',
  'with_subelements', 'with_indexed_items', 'with_first_found',
  'ignore_errors', 'become', 'become_user', 'become_method',
  'environment', 'vars', 'block', 'rescue', 'always', 'delegate_to',
  'delegate_facts', 'run_once', 'any_errors_fatal', 'failed_when',
  'changed_when', 'check_mode', 'diff', 'no_log', 'listen', 'timeout',
  'debugger', 'module_defaults', 'collections', 'args',
])

function getTaskModuleName(task) {
  for (const key of Object.keys(task)) {
    if (!TASK_META_KEYS.has(key)) return key
  }
  return null
}

function summarizePlayTasks(tasks) {
  const modules = tasks.map(getTaskModuleName).filter(Boolean)
  if (modules.length === 0) return null

  // Match by exact name, FQCN prefix, or FQCN suffix
  const has = (...names) => modules.some(m =>
    names.some(n => m === n || m.endsWith('.' + n))
  )
  const hasPrefix = (...prefixes) => modules.some(m =>
    prefixes.some(p => m.startsWith(p))
  )

  const actions = []

  if (has('apt', 'yum', 'dnf', 'package', 'pip', 'pip3', 'npm', 'gem', 'apk', 'pacman', 'zypper', 'homebrew') ||
      hasPrefix('ansible.builtin.apt', 'ansible.builtin.yum', 'ansible.builtin.dnf')) {
    actions.push('installs packages')
  }
  if (has('service', 'systemd') || hasPrefix('ansible.builtin.service', 'ansible.builtin.systemd')) {
    actions.push('manages services')
  }
  if (has('template') || hasPrefix('ansible.builtin.template')) {
    actions.push('deploys templates')
  } else if (has('copy') || hasPrefix('ansible.builtin.copy')) {
    actions.push('copies files')
  }
  if (has('file', 'lineinfile', 'blockinfile', 'replace', 'assemble') ||
      hasPrefix('ansible.builtin.file', 'ansible.builtin.lineinfile')) {
    if (!actions.includes('copies files')) actions.push('manages files')
  }
  if (has('git', 'unarchive', 'get_url') || hasPrefix('ansible.builtin.git')) {
    actions.push('deploys code')
  }
  if (has('user', 'group', 'authorized_key') || hasPrefix('ansible.builtin.user')) {
    actions.push('manages users')
  }
  if (has('ufw', 'firewalld', 'iptables', 'ip6tables') || hasPrefix('community.general.ufw')) {
    actions.push('configures firewall rules')
  }
  if (hasPrefix('community.mysql', 'community.postgresql', 'community.mongodb') ||
      has('mysql_db', 'mysql_user', 'postgresql_db', 'postgresql_user')) {
    actions.push('manages databases')
  }
  if (hasPrefix('community.docker', 'containers.podman', 'kubernetes.core') ||
      has('docker_container', 'docker_image', 'k8s', 'helm')) {
    actions.push('manages containers')
  }
  if (hasPrefix('amazon.aws', 'community.aws', 'azure', 'google.cloud') ||
      has('ec2', 's3_bucket', 'aws_s3')) {
    actions.push('provisions cloud resources')
  }
  if (has('cron') || hasPrefix('ansible.builtin.cron')) {
    actions.push('schedules jobs')
  }
  if (has('uri') || hasPrefix('ansible.builtin.uri')) {
    actions.push('makes HTTP requests')
  }
  if (has('shell', 'command', 'raw', 'script') || hasPrefix('ansible.builtin.shell', 'ansible.builtin.command')) {
    actions.push('runs commands')
  }

  if (actions.length === 0) return null
  if (actions.length === 1) {
    const a = actions[0]
    return `${a[0].toUpperCase()}${a.slice(1)}.`
  }
  const last = actions[actions.length - 1]
  const rest = actions.slice(0, -1)
  const joined = rest.length > 1 ? rest.join(', ') : rest[0]
  return `${joined[0].toUpperCase()}${joined.slice(1)}, and ${last}.`
}

export function generatePlaySummary(play) {
  if (!play) return { stats: '', summary: null }
  const tasks = [
    ...(play.pre_tasks || []),
    ...(play.tasks || []),
    ...(play.post_tasks || []),
  ]
  const hosts = play.hosts || 'all'
  const parts = [`Targets hosts: "${hosts}". Runs ${tasks.length} task(s).`]
  if (play.become) parts.push('Privilege escalation (become: yes) is enabled.')
  if (play.vars && Object.keys(play.vars).length > 0) {
    parts.push(`Defines ${Object.keys(play.vars).length} variable(s).`)
  }
  return { stats: parts.join(' '), summary: summarizePlayTasks(tasks) }
}
