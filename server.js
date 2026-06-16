const express = require("express")
const fs = require("fs/promises")
const fsSync = require("fs")
const path = require("path")
const os = require("os")

const app = express()
const PORT = 4173
const HOME = os.homedir()
const CONFIG_DIR = path.join(HOME, ".config", "opencode")
const PID_FILE = path.join(CONFIG_DIR, "devjournal.pid")
const MEMORY_DIR = path.join(CONFIG_DIR, "memory")

// ─── PID FILE / SINGLETON ─────────────────────────────────
// Check if another instance is already running
try {
  if (fsSync.existsSync(PID_FILE)) {
    const oldPid = parseInt(fsSync.readFileSync(PID_FILE, "utf-8").trim(), 10)
    if (Number.isFinite(oldPid)) {
      try { process.kill(oldPid, 0); process.exit(0) } catch {}
    }
  }
} catch {}

// Write PID so the plugin can track us
fs.mkdir(CONFIG_DIR, { recursive: true }).then(() => {
  fs.writeFile(PID_FILE, String(process.pid)).catch(() => {})
}).catch(() => {})

function cleanupPid() {
  try { fsSync.unlinkSync(PID_FILE) } catch {}
}

process.on("exit", cleanupPid)
process.on("SIGINT", () => { cleanupPid(); process.exit(0) })
process.on("SIGTERM", () => { cleanupPid(); process.exit(0) })

app.use(express.json())
app.use(express.static(path.join(__dirname)))

// ─── SESSION PARSER ───────────────────────────────────────

function parseSessionContext(content, filePath, project) {
  const title =
    content.match(/# Task Context:\s*(.+)/)?.[1]?.trim() ||
    path.basename(path.dirname(filePath))
  const sessionId = content.match(/Session ID:\s*(.+)/)?.[1]?.trim() || ""
  const createdLine = content.match(/Created:\s*(.+)/)?.[1]?.trim() || ""
  const status = content.match(/Status:\s*(.+)/)?.[1]?.trim() || "unknown"

  const reqMatch = content.match(
    /## Current Request\s*\n([\s\S]*?)(?=\n##\s|$)/
  )
  const currentRequest = reqMatch ? reqMatch[1].trim() : ""

  const compMatch = content.match(
    /## Components\s*\n([\s\S]*?)(?=\n##\s|$)/
  )
  let components = []
  if (compMatch) {
    components = compMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-") || l.trim().match(/^\d+\./))
      .map((l) => l.replace(/^[\s]*[-•]\s*/, "").replace(/^\d+\.\s*/, "").trim())
      .filter(Boolean)
  }

  const exitMatch = content.match(
    /## Exit Criteria\s*\n([\s\S]*?)(?=\n##\s|$)/
  )
  let exitCriteria = []
  if (exitMatch) {
    exitCriteria = exitMatch[1]
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => l.trim())
  }

  const implMatch = content.match(
    /## Implementation Complete\s*\n([\s\S]*?)(?=\n##\s|$)/
  )
  const implementationNotes = implMatch ? implMatch[1].trim() : ""

  const filesMatch = content.match(/### Files Modified:\s*\n([\s\S]*?)(?=\n##\s|$|###)/)
  let filesTouched = []
  if (filesMatch) {
    filesTouched = filesMatch[1]
      .split("\n")
      .filter((l) => l.trim().startsWith("-"))
      .map((l) => l.replace(/^-\s*/, "").trim())
      .filter(Boolean)
  }

  // Determine date: use Created field first, then extract from session ID
  let created = createdLine
  if (!created || !created.match(/^\d{4}/)) {
    const idMatch = sessionId.match(/^(\d{4}-\d{2}-\d{2})/)
    created = idMatch ? idMatch[1] : ""
  }
  // Normalize ISO dates
  if (created && created.includes("T")) {
    created = created.split("T")[0]
  }

  // Count exit criteria completion
  const doneCount = exitCriteria.filter((c) => c.startsWith("- [x]")).length
  const totalCount = exitCriteria.filter(
    (c) => c.startsWith("- [") || c.startsWith("- [x]")
  ).length

  return {
    id: sessionId || path.basename(path.dirname(filePath)),
    title,
    created,
    status,
    project,
    currentRequest,
    components,
    exitCriteria,
    exitProgress: totalCount > 0 ? { done: doneCount, total: totalCount } : null,
    filesTouched,
    implementationNotes,
    filePath,
  }
}

// ─── SESSION SCANNER ───────────────────────────────────────

async function scanSessions() {
  const home = HOME
  const entries = await fs.readdir(home, { withFileTypes: true })
  const sessions = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith(".")) continue

    const tmpSessionsDir = path.join(home, entry.name, ".tmp", "sessions")
    try {
      await fs.access(tmpSessionsDir)
    } catch {
      continue
    }

    const sessionDirs = await fs.readdir(tmpSessionsDir, {
      withFileTypes: true,
    })
    for (const sd of sessionDirs) {
      if (!sd.isDirectory()) continue
      const ctxPath = path.join(tmpSessionsDir, sd.name, "context.md")
      try {
        const content = await fs.readFile(ctxPath, "utf-8")
        const parsed = parseSessionContext(content, ctxPath, entry.name)
        if (parsed) sessions.push(parsed)
      } catch {
        // skip unreadable or invalid files
      }
    }
  }

  sessions.sort((a, b) => {
    if (!a.created) return 1
    if (!b.created) return -1
    return new Date(b.created) - new Date(a.created)
  })
  return sessions
}

// ─── API: SESSIONS ──────────────────────────────────────

app.get("/api/sessions", async (req, res) => {
  try {
    const sessions = await scanSessions()
    res.json(sessions)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get("/api/sessions/:id", async (req, res) => {
  try {
    const sessions = await scanSessions()
    const session = sessions.find((s) => s.id === req.params.id)
    if (!session) return res.status(404).json({ error: "Not found" })
    // Return full content
    const content = await fs.readFile(session.filePath, "utf-8")
    session.rawContent = content
    res.json(session)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: STATS ─────────────────────────────────────────

app.get("/api/stats", async (req, res) => {
  try {
    const sessions = await scanSessions()
    const now = new Date()
    const todayStr = now.toDateString()

    // Past 7 days
    const weekAgo = new Date(now)
    weekAgo.setDate(weekAgo.getDate() - 6)
    weekAgo.setHours(0, 0, 0, 0)

    const todaySessions = sessions.filter((s) => {
      if (!s.created) return false
      return new Date(s.created).toDateString() === todayStr
    })

    const weekSessions = sessions.filter((s) => {
      if (!s.created) return false
      return new Date(s.created) >= weekAgo
    })

    // Sessions per day (past 7 days)
    const sessionsPerDay = []
    const dayLabels = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toDateString()
      const count = weekSessions.filter(
        (s) => new Date(s.created).toDateString() === dateStr
      ).length
      sessionsPerDay.push(count)
      dayLabels.push(
        d.toLocaleDateString("en-US", { weekday: "short" })
      )
    }

    // Heatmap: 28 days
    const heatmap = []
    for (let i = 27; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      const dateStr = d.toDateString()
      const count = sessions.filter(
        (s) => s.created && new Date(s.created).toDateString() === dateStr
      ).length
      heatmap.push(count)
    }

    // Count open/closed exit criteria
    let totalTasks = 0
    let doneTasks = 0
    let openTodos = 0
    for (const s of sessions) {
      if (s.exitProgress) {
        totalTasks += s.exitProgress.total
        doneTasks += s.exitProgress.done
      }
      // Count unchecked items as "open todos"
      if (s.exitCriteria) {
        openTodos += s.exitCriteria.filter((c) => c.startsWith("- [ ]")).length
      }
    }

    // Total files touched
    const allFiles = sessions.flatMap((s) => s.filesTouched || [])
    const uniqueFiles = [...new Set(allFiles)]

    // Unique projects
    const projects = [...new Set(sessions.map((s) => s.project).filter(Boolean))]

    res.json({
      home: HOME,
      totalSessions: sessions.length,
      todaySessions: todaySessions.length,
      weekSessions: weekSessions.length,
      filesTouched: uniqueFiles.length,
      tasksTotal: totalTasks,
      tasksDone: doneTasks,
      openTodos,
      projects: projects.length,
      projectList: projects,
      sessionsPerDay,
      dayLabels,
      heatmap,
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: MEMORY FILES ──────────────────────────────────

const DEFAULT_MEMORY = {
  "environment.md": `# Environment

## System
- OS: Linux (Arch)
- Shell: zsh + starship
- Terminal: kitty

## Languages & Runtimes
- Node.js: 20.x
- Python: 3.12
- Bun: latest

## Tools
- Editor: Neovim
- Package manager: pnpm, npm, bun
- Container: Docker / Podman

## Hardware
- Model: [your laptop model]
- CPU: [your CPU]
- RAM: [your RAM]
- GPU: [your GPU]
`,
  "preferences.md": `# Preferences

## Code Style
- TypeScript strict mode
- Named exports (no default exports)
- Single quotes
- No semicolons
- 2-space indent
- async/await over .then()

## Patterns
- Prefer functional over classes
- Composition over inheritance
- Early return over nested if

## Commits
- Conventional commits
- Present tense
- Descriptive but concise
`,
}

app.get("/api/memory", async (req, res) => {
  try {
    await fs.mkdir(MEMORY_DIR, { recursive: true })
    const files = await fs.readdir(MEMORY_DIR)
    const memories = []

    for (const file of files) {
      if (!file.endsWith(".md")) continue
      const filePath = path.join(MEMORY_DIR, file)
      const content = await fs.readFile(filePath, "utf-8")
      const stat = await fs.stat(filePath)
      // Extract first line as description
      const firstLine = content
        .split("\n")
        .find((l) => l.trim() && !l.startsWith("#"))
      memories.push({
        name: file,
        description: firstLine?.trim() || "",
        content,
        updated: stat.mtime,
        size: stat.size,
      })
    }

    // If no files exist yet, return defaults
    if (memories.length === 0) {
      for (const [name, content] of Object.entries(DEFAULT_MEMORY)) {
        memories.push({
          name,
          description:
            content
              .split("\n")
              .find((l) => l.trim() && !l.startsWith("#"))
              ?.trim() || "",
          content,
          updated: new Date(),
          size: content.length,
          _default: true,
        })
      }
    }

    res.json(memories)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get("/api/memory/:name", async (req, res) => {
  try {
    const safeName = path.basename(req.params.name)
    const filePath = path.join(MEMORY_DIR, safeName)

    if (!filePath.startsWith(MEMORY_DIR)) {
      return res.status(403).json({ error: "Invalid path" })
    }

    const content = await fs.readFile(filePath, "utf-8")
    const stat = await fs.stat(filePath)
    res.json({
      name: safeName,
      content,
      updated: stat.mtime,
    })
  } catch (e) {
    if (e.code === "ENOENT" && DEFAULT_MEMORY[req.params.name]) {
      return res.json({
        name: req.params.name,
        content: DEFAULT_MEMORY[req.params.name],
        updated: new Date(),
        _default: true,
      })
    }
    res.status(404).json({ error: "Not found" })
  }
})

app.put("/api/memory/:name", async (req, res) => {
  try {
    const safeName = path.basename(req.params.name)
    const filePath = path.join(MEMORY_DIR, safeName)

    if (!filePath.startsWith(MEMORY_DIR)) {
      return res.status(403).json({ error: "Invalid path" })
    }

    await fs.mkdir(MEMORY_DIR, { recursive: true })
    await fs.writeFile(filePath, req.body.content, "utf-8")
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── API: .ENV FILES ────────────────────────────────────

app.get("/api/env", async (req, res) => {
  try {
    const entries = await fs.readdir(HOME, { withFileTypes: true })
    const envFiles = []

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith(".") && entry.name !== ".config") continue
      if (entry.name === "node_modules") continue

      const envPath = path.join(HOME, entry.name, ".env")
      try {
        await fs.access(envPath)
        const stat = await fs.stat(envPath)
        const content = await fs.readFile(envPath, "utf-8")
        // Count variables (non-comment, non-empty lines with =)
        const vars = content
          .split("\n")
          .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
          .map((l) => l.split("=")[0].trim())
          .filter(Boolean)

        envFiles.push({
          path: envPath,
          project: entry.name,
          variableCount: vars.length,
          variables: vars,
          updated: stat.mtime,
          size: stat.size,
        })
      } catch {
        // no .env in this project
      }
    }

    res.json({ files: envFiles, home: HOME })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get("/api/env/read", async (req, res) => {
  try {
    const filePath = req.query.path
    if (!filePath) return res.status(400).json({ error: "path required" })
    if (!filePath.startsWith(HOME))
      return res.status(403).json({ error: "Access denied" })

    const content = await fs.readFile(filePath, "utf-8")
    const stat = await fs.stat(filePath)
    res.json({ path: filePath, content, updated: stat.mtime })
  } catch (e) {
    res.status(404).json({ error: "Not found" })
  }
})

app.put("/api/env/write", async (req, res) => {
  try {
    const filePath = req.body.path
    const content = req.body.content

    if (!filePath || content === undefined)
      return res.status(400).json({ error: "path and content required" })
    if (!filePath.startsWith(HOME))
      return res.status(403).json({ error: "Access denied" })

    await fs.writeFile(filePath, content, "utf-8")
    res.json({ success: true, path: filePath })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ─── SERVE DASHBOARD ────────────────────────────────────

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "devjournal.html"))
})

// ─── START ──────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n  ╭─────────────────────────────────╮`)
  console.log(`  │  DevJournal · OpenCode Memory    │`)
  console.log(`  │  http://localhost:${PORT}            │`)
  console.log(`  ╰─────────────────────────────────╯\n`)
})
