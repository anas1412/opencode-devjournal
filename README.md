# DevJournal

An OpenCode plugin that surfaces everything happening across your sessions in a single dashboard. Timeline, persistent memory, and .env management — served as a web UI alongside your editor.

---

## Why

OpenCode sessions are ephemeral by design. DevJournal adds a persistent layer:

- **See your work** — a timeline of every session across all your projects, grouped by day, with what you were working on and what's left to do.
- **Keep context between sessions** — environment specs and coding preferences stored as markdown files that OpenCode reads automatically. Edit them from the dashboard.
- **Manage .env files** — find, view, and edit .env files across your projects without leaving the browser.

Install once. OpenCode handles the rest.

---

## Features

**Journal** — every session in `~/.tmp/sessions/` appears on the timeline. Each card shows the title, project, current request, components, and exit criteria progress. Sessions are grouped by day.

**Memory** — two markdown files in `~/.config/opencode/memory/`:
- `environment.md` — your system setup, runtime versions, shell, editor
- `preferences.md` — coding style rules, formatting conventions

Both are loaded by OpenCode every session. Edit them from the dashboard.

**.Env Editor** — scans your projects for `.env` files, lists them with variable counts, and lets you view or edit them inline.

**Activity overview** — left sidebar shows weekly stats (sessions, projects, files touched). Right sidebar has a 28-day activity heatmap and sessions-per-day chart.

---

## Install

Requires [OpenCode](https://opencode.ai) and Node.js 18+.

```bash
opencode plugin opencode-devjournal
```

Or add to `~/.config/opencode/opencode.json`:

```json
{
  "plugin": ["opencode-devjournal"]
}
```

When OpenCode starts, it downloads the plugin and launches the dashboard server automatically. Open `http://localhost:4173` in your browser.

The server runs while OpenCode is open and shuts down when OpenCode closes. Only one instance runs at a time.

---

## Usage

| Action | How |
|--------|-----|
| Open dashboard | `http://localhost:4173` (auto-started with OpenCode) |
| Switch tabs | Topbar or sidebar — Journal, Memory, .Env |
| Edit a memory file | Click **Edit** on any file, make changes, **Save** |
| View .env contents | Click a project, then **Load content** |
| Edit .env | Click **Edit**, make changes, **Save** |
| Log a note (from OpenCode) | Use the `devjournal` tool → `action: log` |

---

## How it works

DevJournal has two parts:

1. **Plugin** (`dist/index.js`) — loaded by OpenCode. Starts/ stops the dashboard server, hooks into `session.created` events for auto-logging, and registers a `devjournal` tool (stop, status, log).
2. **Server** (`server.cjs`) — an Express app that scans session files, reads/ writes memory markdown, and browses .env files. Serves the dashboard at port 4173. Manages a PID file at `~/.config/opencode/devjournal.pid` to enforce a single instance.

Memory files live at `~/.config/opencode/memory/`. Sessions are scanned from `~/*/.tmp/sessions/*/context.md`.

---

## Links

- [GitHub](https://github.com/anas1412/opencode-devjournal)
- [npm](https://www.npmjs.com/package/opencode-devjournal)
- [OpenCode](https://opencode.ai)
