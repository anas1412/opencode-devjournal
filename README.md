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
curl -fsSL https://raw.githubusercontent.com/anas1412/opencode-devjournal/main/install.sh | bash
```

Downloads the plugin, installs dependencies, builds the TypeScript plugin, registers it in `~/.config/opencode/opencode.json`, and creates memory files.

### Or add to opencode.json directly
If published to npm:
```json
{
  "plugin": ["opencode-devjournal"]
}
```
Then run `opencode plugin opencode-devjournal` from a terminal.

### Manual (if you already have the files)
```bash
cd opencode-devjournal
bash install.sh
```

---

## How it works

Install it once. That's it.

- **Auto-start** — The dashboard server starts when OpenCode opens, stops when it closes.
- **Singleton** — Only one DevJournal instance runs at a time. PID file at `~/.config/opencode/devjournal.pid`.
- **Dashboard** — Open `http://localhost:4173` in your browser while OpenCode is running.

No `devjournal start` commands. No manual server management. Install and forget.

---

## What you get

| Tab | What you see |
|-----|-------------|
| **Journal** | Timeline of all sessions, grouped by day, across every project in `~/`. Each card shows the session title, project, current request, and exit criteria. |
| **Memory** | Editable markdown files (`environment.md`, `preferences.md`) stored in `~/.config/opencode/memory/`. OpenCode loads these every session. |
| **.Env** | All `.env` files found across your projects. View, edit, and save changes. |

### Dashboard
- **Left sidebar** — weekly stats (sessions, projects, tasks, files), project tags
- **Right sidebar** — 28-day activity heatmap + sessions/day chart
- **Topbar / sidebar** — switch between Journal, Memory, .Env

---

## How it's built

```
~/project-a/.tmp/sessions/{id}/context.md   ──┐
~/project-b/.tmp/sessions/{id}/context.md   ──┤  server.js scans & parses
~/project-c/.tmp/sessions/{id}/context.md   ──┘       ↓
                                            REST API ←─→ Dashboard UI
~/.config/opencode/memory/*.md              ──┘
~/*/.env                                    ──┘
```

Two parts:

1. **Dashboard server** (`server.js`) — Express server that scans sessions, reads/writes memory files, and edits .env files. Serves the dashboard HTML. PID-tracked for singleton enforcement.
2. **OpenCode plugin** (`dist/index.js`) — Loaded by OpenCode. Auto-starts the server on load, auto-stops on dispose. Registers a `devjournal` tool (stop/status/log) and hooks into `session.created` events for auto-logging.

### Files

| File | Role |
|------|------|
| `server.js` | Express API + static file server, writes PID file |
| `devjournal.html` | Dashboard UI (single file, embedded CSS+JS) |
| `src/index.ts` | Plugin source — auto-start/stop, tools, event hooks |
| `dist/index.js` | Compiled plugin (auto-built) |
| `install.sh` | Set up everything — memory dir, deps, plugin registration |

---

## Dev

```bash
npm run build    # rebuild plugin after editing src/index.ts
npm start        # start dashboard standalone (without OpenCode)
bash install.sh  # full reinstall
```

---

## Design

Dark background (`#0e0f11`), DM Mono for code accents, DM Serif Display for headings, DM Sans for body. Grain overlay and a lime/cyan/amber/rose palette — hacker's field-notes meets clean magazine layout.

Colors: `--lime: #b8f55a` · `--cyan: #5af0d8` · `--amber: #f0c05a` · `--rose: #f05a7a` · `--violet: #a07af0`
