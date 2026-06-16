import { Plugin, tool } from "@opencode-ai/plugin"
import { spawn } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const HOME = homedir()
const CONFIG_DIR = join(HOME, ".config", "opencode")
const MEMORY_DIR = join(CONFIG_DIR, "memory")
const PID_FILE = join(CONFIG_DIR, "devjournal.pid")
const JOURNAL_PATH = join(MEMORY_DIR, "journal.json")
const PORT = 4173
const DASHBOARD_URL = `http://localhost:${PORT}`

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_DIR = resolve(__dirname, "..")

// ─── PID FILE / SINGLETON ────────────────────────────────

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null
  try {
    const pid = parseInt(readFileSync(PID_FILE, "utf-8").trim(), 10)
    return Number.isFinite(pid) ? pid : null
  } catch {
    return null
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function isServerRunning(): boolean {
  const pid = readPid()
  if (pid === null) return false
  if (!isProcessAlive(pid)) {
    // Stale PID — clean up
    try { unlinkSync(PID_FILE) } catch {}
    return false
  }
  return true
}

function startServer(): void {
  if (isServerRunning()) return

  const serverPath = join(PROJECT_DIR, "server.cjs")
  if (!existsSync(serverPath)) {
    console.error("[DevJournal] server.js not found at", serverPath)
    return
  }

  const proc = spawn("node", [serverPath], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env },
  })
  proc.unref()

  // Wait briefly then check it came up
  setTimeout(() => {
    if (!isServerRunning()) {
      console.error("[DevJournal] server failed to start")
    }
  }, 1000)
}

async function stopServer(): Promise<void> {
  const pid = readPid()
  if (pid === null) return

  try {
    process.kill(pid, "SIGTERM")
    // Wait for process to exit
    for (let i = 0; i < 10; i++) {
      if (!isProcessAlive(pid)) break
      await new Promise((r) => setTimeout(r, 100))
    }
    // Force kill if still alive
    if (isProcessAlive(pid)) {
      process.kill(pid, "SIGKILL")
    }
  } catch {
    // Already dead
  }
  try { unlinkSync(PID_FILE) } catch {}
}

// ─── JOURNAL ──────────────────────────────────────────────

interface JournalEntry {
  id: string
  timestamp: string
  type: string
  message?: string
  tags?: string[]
  sessionId?: string
  project?: string
  [key: string]: unknown
}

function ensureJournal() {
  mkdirSync(MEMORY_DIR, { recursive: true })
  if (!existsSync(JOURNAL_PATH)) {
    writeFileSync(JOURNAL_PATH, "[]", "utf-8")
  }
}

function readJournal(): JournalEntry[] {
  ensureJournal()
  try {
    return JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"))
  } catch {
    return []
  }
}

function appendToJournal(entry: Record<string, unknown>) {
  const journal = readJournal()
  const newEntry: JournalEntry = {
    id: `entry-${Date.now()}`,
    timestamp: new Date().toISOString(),
    type: "log",
    ...entry,
  } as JournalEntry
  journal.push(newEntry)
  writeFileSync(JOURNAL_PATH, JSON.stringify(journal, null, 2), "utf-8")
}

// ─── PLUGIN ───────────────────────────────────────────────

export const DevJournalPlugin: Plugin = async (ctx) => {
  // Auto-start the dashboard server when OpenCode loads
  if (!isServerRunning()) {
    startServer()
  }

  return {
    dispose: async () => {
      await stopServer()
    },

    // ─── TOOLS ────────────────────────────────────────
    tool: {
      devjournal: tool({
        description:
          "Open the DevJournal dashboard — view sessions, edit memory files, manage .env files.",
        args: {
          action: tool.schema
            .enum(["start", "stop", "status", "log"])
            .default("status")
            .describe(
              "Action: check status, stop server, or log an entry",
            ),
          message: tool.schema
            .string()
            .optional()
            .describe("Message to log (required when action=log)"),
          tags: tool.schema
            .string()
            .optional()
            .describe("Comma-separated tags for the log entry"),
        },
        async execute({ action, message, tags }) {
          switch (action) {
            case "start": {
              if (isServerRunning()) {
                return `DevJournal is already running at ${DASHBOARD_URL}`
              }
              startServer()
              return `DevJournal started at ${DASHBOARD_URL}`
            }

            case "stop": {
              await stopServer()
              return "DevJournal stopped"
            }

            case "status": {
              const running = isServerRunning()
              const pid = readPid()
              const journal = readJournal()
              return JSON.stringify(
                {
                  running,
                  url: DASHBOARD_URL,
                  pid: running ? pid : null,
                  entries: journal.length,
                  memoryDir: MEMORY_DIR,
                  lastEntry:
                    journal.length > 0 ? journal[journal.length - 1] : null,
                },
                null,
                2,
              )
            }

            case "log": {
              if (!message) {
                return "Usage: devjournal log --message 'what happened' --tags 'fix,debug'"
              }
              const tagList = tags
                ? tags.split(",").map((t: string) => t.trim())
                : []
              appendToJournal({
                type: "log",
                message,
                tags: tagList,
                project: ctx.project?.id || "global",
              })
              return `Logged: ${message}`
            }

            default:
              return "Usage: devjournal [stop|status|log]"
          }
        },
      }),
    },

    // ─── EVENT HOOKS ──────────────────────────────────
    event: async ({ event }) => {
      if (event.type === "session.created") {
        const ev = event as Record<string, unknown>
        const session = ev.session as Record<string, unknown> | undefined
        appendToJournal({
          type: "session_start",
          sessionId: session?.id || "unknown",
          project: ctx.project?.id || "global",
        })
      }
    },
  }
}
