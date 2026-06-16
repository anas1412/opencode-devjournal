# DevJournal · OpenCode Memory Dashboard

A plugin for [OpenCode](https://opencode.ai) that surfaces what's been happening across your sessions. Shows a timeline of recent sessions, persistent memory files (environment, preferences), and lets you edit `.env` files — all in a terminal-meets-editorial dashboard.

![status](https://img.shields.io/badge/status-beta-5af0d8?style=flat)
![plugin](https://img.shields.io/badge/opencode-plugin-b8f55a?style=flat)

---

## Install

### Prerequisites
- Node.js 18+
- [OpenCode](https://opencode.ai) installed

### One-liner (recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/<user>/opencode-devjournal/main/install.sh | bash
```

This downloads the plugin, installs dependencies, builds the TypeScript plugin, registers it in `~/.config/opencode/opencode.json`, and creates memory files.

### Or add to opencode.json directly (requires publishing)
If published to npm:
```json
{
  "plugin": ["npm:@opencode-ai/devjournal"]
}
```
Then run `devjournal setup` from within OpenCode.

### Manual (if you have the files)
```bash
cd opencode-devjournal
bash install.sh
```

---

## Start the dashboard

```bash
node ~/.local/share/opencode-devjournal/server.js
# → http://localhost:4173
```

Or from inside OpenCode:
```
devjournal start
```

---

## What it does

| Tab | What you see |
|-----|-------------|
| **Journal** | Timeline of all sessions, grouped by day, across every project in `~/`. Each card shows the session title, project, current request, and exit criteria. |
| **Memory** | Editable markdown files (`environment.md`, `preferences.md`) stored in `~/.config/opencode/memory/`. OpenCode loads these every session. |
| **.Env** | All `.env` files found across your projects. View, edit, and save changes. |

### Navigation
- **Topbar / sidebar** — switch between Journal, Memory, .Env
- **Right sidebar** — 28-day activity heatmap + sessions/day chart
- **Left sidebar** — weekly stats (sessions, projects, tasks, files)

---

## How it works

```
~/project-a/.tmp/sessions/{id}/context.md   ──┐
~/project-b/.tmp/sessions/{id}/context.md   ──┤  server.js scans & parses
~/project-c/.tmp/sessions/{id}/context.md   ──┘       ↓
                                            REST API ←─→ Dashboard UI
~/.config/opencode/memory/*.md              ──┘
~/*/.env                                    ──┘
```

DevJournal is two parts:

1. **Dashboard server** (`server.js`) — Express server that scans sessions, reads/writes memory files, and edits .env files. Serves the dashboard HTML.
2. **OpenCode plugin** (`dist/index.js`) — Registers a `devjournal` tool (start/stop/status) and hooks into `session.created` events for auto-logging.

### Files

| File | Role |
|------|------|
| `server.js` | Express API + static file server |
| `devjournal.html` | Dashboard UI (single file, embedded CSS+JS) |
| `src/index.ts` | Plugin source — tools + event hooks |
| `dist/index.js` | Compiled plugin (auto-built) |
| `install.sh` | Set up everything — memory dir, deps, plugin registration |

---

## Dev

```bash
npm run build    # rebuild the plugin after editing src/index.ts
npm start        # start dashboard server
bash install.sh  # full reinstall
```

---

## Design

Dark background (`#0e0f11`), DM Mono for code accents, DM Serif Display for headings, DM Sans for body. Grain overlay and a lime/cyan/amber/rose palette — hacker's field-notes meets clean magazine layout.

Colors: `--lime: #b8f55a` · `--cyan: #5af0d8` · `--amber: #f0c05a` · `--rose: #f05a7a` · `--violet: #a07af0`
