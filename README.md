<div align="center">

```
 █████╗ ███╗   ██╗███████╗██╗██████╗ ██╗     ███████╗   ██╗ ██████╗  ██╗
██╔══██╗████╗  ██║██╔════╝██║██╔══██╗██║     ██╔════╝  ███║██╔═████╗███║
███████║██╔██╗ ██║███████╗██║██████╔╝██║     █████╗    ╚██║██║██╔██║╚██║
██╔══██║██║╚██╗██║╚════██║██║██╔══██╗██║     ██╔══╝     ██║████╔╝██║ ██║
██║  ██║██║ ╚████║███████║██║██████╔╝███████╗███████╗   ██║╚██████╔╝ ██║
╚═╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝╚═════╝ ╚══════╝╚══════╝   ╚═╝ ╚═════╝  ╚═╝
```

**Visual debugger · Logic explainer · Jinja2 sandbox for Ansible playbooks**

[![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-6-646cff?style=flat-square&logo=vite)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3-38bdf8?style=flat-square&logo=tailwindcss)](https://tailwindcss.com)
[![ReactFlow](https://img.shields.io/badge/ReactFlow-11-ff0072?style=flat-square)](https://reactflow.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-22d3ee?style=flat-square)](LICENSE)

</div>

---

## What is Ansible101?

Ansible101 is a **zero-config, browser-only** tool that turns raw Ansible YAML into something you can actually *see* and *understand*.

Paste a playbook, a task snippet, or a Jinja2 expression — the app instantly renders a live execution flowchart, translates every task into plain English, and lets you experiment with mock facts to explore conditional logic without ever touching a real host.

> **Not affiliated with Red Hat, Inc.**
> Ansible® is a registered trademark of Red Hat, Inc.

---

## Features

### Clipboard-First Entry
Hit **Ctrl+V** anywhere on the landing screen (or drag & drop) — the app auto-detects what you pasted and opens the right view instantly. No form, no submit button.

| Content pasted | View opened |
|---|---|
| Full Ansible playbook | 3-pane: Editor · Flowchart · Logic Summary |
| Single task / snippet | Quick-Card: intent, flags, warnings |
| Jinja2 expression | Pipeline Trace: step-by-step filter breakdown |

---

### Three Modes

#### 🗺 Playbook Mode
The full three-pane layout: write or paste YAML on the left, watch the execution graph update in real-time in the centre, read a plain-English summary on the right.

- **Play nodes** — blue header cards showing `hosts` target
- **Task nodes** — colour-coded by module type
- **Diamond decision nodes** — for every `when:` conditional
- **Loop badge nodes** — wraps tasks that use `loop:` / `with_items:`
- **Dashed handler edges** — amber lines from `notify:` to the Handlers section
- **Visual Dry-Run** — when Mock Facts are active, branches whose `when:` condition evaluates to `false` are dimmed to 40% opacity so you can see the execution path at a glance

#### ⚡ Jinja2 Mode
Paste any Ansible Jinja2 expression (`{{ groups['web'] | map(attribute='ip') | sort | join(',') }}`).  
The **Transformation Trace** breaks the pipe chain into discrete steps, showing:

1. **Input** — the starting value resolved from Mock Facts
2. **Each filter** — plain-English label + intermediate value
3. **Final Output** — the evaluated result

Powered by [Nunjucks](https://mozilla.github.io/nunjucks/) with 40+ Ansible filter polyfills (selectattr, combine, dict2items, zip, …).

#### 🃏 Snippet Mode
Paste a single task object. A **Quick-Card** shows the module, intent, flags, loop info, conditional, and any warnings — great for reviewing tasks in code review without spinning up a full playbook.

#### 🧪 Limits Lab Mode
Build and test inventory targeting logic in a dedicated sandbox:

- Import inventory via paste, drag-and-drop, or file upload (JSON / INI / YAML)
- Edit groups and host membership visually
- Test `--limit` expressions with live per-group match breakdown
- Inspect hostvars directly from matched hosts
- Share the current Limits Lab state (inventory + hostvars + limit pattern) via URL

---

### Human-Speak Sidebar
Every task is translated into a one-line plain English sentence:

| Module | Output |
|---|---|
| `apt` / `yum` / `dnf` | "Installs package "nginx" using apt." |
| `copy` / `template` | "Deploys configuration file to /etc/nginx/nginx.conf." |
| `service` / `systemd` | "Manages background service "nginx" — starts it and enables it on boot." |
| `shell` / `command` | "Runs shell command…" + ⚠ Non-idempotent warning |
| `file` | "Creates directory /var/www/app." |
| `get_url` | "Downloads file from "…" to "…"." |

---

### Mock Context (ansible_facts editor)
An inline JSON panel lets you edit `ansible_facts` and arbitrary variables. Every conditional (`when:`) and Jinja2 expression re-evaluates instantly against the new values — a live "what if" simulator.

---

### Shareable URLs
Current app state is encoded into the URL hash using LZ-string compression.

- Playbook/Snippet/Jinja2: shares current text + mock facts (+ extra files where applicable)
- Limits Lab: shares inventory + hostvars + current `--limit` pattern
- Share button visibility: hidden when there is nothing meaningful to share

### Privacy Note (Important)
Sharing is **URL-only** in the browser.

- No share payload is uploaded to any backend server by this app
- Data is stored in the URL fragment (`#...`) and copied to clipboard when you click Share
- Anyone with the link can read its encoded content, so avoid sharing sensitive data

---

## Tech Stack

| Package | Role |
|---|---|
| [React 18](https://react.dev) + [Vite 6](https://vitejs.dev) | UI framework & build tool |
| [Tailwind CSS 3](https://tailwindcss.com) | Utility-first styling (Slate-950 dark theme) |
| [ReactFlow 11](https://reactflow.dev) | Execution flowchart (zoom, pan, minimap) |
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | In-browser YAML / Jinja2 editor with custom Cyber-Blueprint theme |
| [js-yaml](https://github.com/nodeca/js-yaml) | YAML parsing |
| [Nunjucks](https://mozilla.github.io/nunjucks/) | Jinja2 simulation (browser UMD build) |
| [lz-string](https://github.com/pieroxy/lz-string) | URL state compression |
| [Lucide React](https://lucide.dev) | Icons |

---

## Getting Started

### Prerequisites
- Node.js ≥ 18
- npm ≥ 9

### Install & run

```bash
git clone https://github.com/aogunwoolu/ansible101.git
cd ansible101
npm install
npm run dev
```

Open **http://localhost:5173** in your browser.

### Build for production

```bash
npm run build    # outputs to dist/
npm run preview  # preview the production build locally
```

---

## Project Structure

```
src/
├── App.jsx                      Root component — mode routing, state, layout
├── main.jsx                     React entry point
├── index.css                    Global styles + Tailwind directives
│
├── components/
│   ├── YamlEditor.jsx           Monaco editor (Cyber-Blueprint theme, line highlight sync)
│   ├── FlowCanvas.jsx           ReactFlow canvas (zoom/pan, minimap, background grid)
│   ├── FlowNodes.jsx            8 custom node types (play, task, loop, diamond, skip, merge, handler, section)
│   ├── HumanSidebar.jsx         Right panel — plain-English task explanations
│   ├── MockContextPanel.jsx     Inline JSON editor for ansible_facts
│   ├── InventoryLab.jsx          Inventory builder + --limit tester sandbox
│   ├── PipelineView.jsx         Jinja2 Transformation Trace
│   └── QuickCard.jsx            Single-task Quick-Card view
│
└── lib/
    ├── parseYamlToFlow.js        YAML → ReactFlow nodes & edges (with dry-run dimming)
    ├── humanSpeak.js             generateExplanation() — module → English sentence
    ├── jinja2Engine.js           Nunjucks wrapper + 40+ Ansible filter polyfills
    ├── parseJinja2Pipeline.js    Pipe chain tokeniser & step evaluator
    ├── filterTranslations.js     Filter name → conversational English label
    ├── detectContentType.js      Auto-detect playbook / snippet / jinja2
    ├── shareUrl.js               Base64 + LZ-string URL encode/decode
    ├── defaultFacts.js           Default mock ansible_facts
    ├── sampleYaml.js             Built-in sample playbook
    └── sampleJinja2.js           Built-in sample Jinja2 expression
```

---

## Supported Ansible Modules (Human-Speak)

`apt` · `yum` · `dnf` · `pip` · `copy` · `template` · `file` · `lineinfile` · `fetch` · `service` · `systemd` · `get_url` · `uri` · `shell` · `command` · `debug` · `set_fact` · `user` · `include_tasks` · `import_tasks` · `wait_for`

---

## Supported Jinja2 Filters (Nunjucks polyfills)

`default` · `mandatory` · `bool` · `int` · `float` · `string` · `lower` · `upper` · `trim` · `replace` · `regex_replace` · `regex_search` · `split` · `join` · `list` · `unique` · `flatten` · `sort` · `reverse` · `first` · `last` · `length` · `min` · `max` · `sum` · `abs` · `round` · `map` · `select` · `reject` · `selectattr` · `rejectattr` · `combine` · `dict2items` · `items2dict` · `zip` · `b64encode` · `b64decode` · `to_json` · `from_json` · `to_yaml`

---

## License

MIT © [aogunwoolu](https://github.com/aogunwoolu)

---

<div align="center">
  <sub>Ansible101 is an independent community tool — not affiliated with, endorsed by, or sponsored by Red Hat, Inc.</sub>
</div>
