import { Plugin, tool } from "@opencode-ai/plugin"
import { spawn, type ChildProcess } from "node:child_process"
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const HOME = homedir()
const MEMORY_DIR = join(HOME, ".config", "opencode", "memory")
const JOURNAL_PATH = join(MEMORY_DIR, "journal.json")
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_DIR = resolve(__dirname, "..")

let serverProcess: ChildProcess | null = null

// resolve is not imported yet — use a manual approach
function resolve(...parts: string[]): string {
  let result = parts[0] || ""
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].startsWith("/")) {
      result = parts[i]
    } else if (result.endsWith("/")) {
      result += parts[i]
    } else {
      result += "/" + parts[i]
    }
  }
  return result
}

/**
 * Ensure the memory directory and journal file exist.
 */
function ensureJournal() {
  mkdirSync(MEMORY_DIR, { recursive: true })
  if (!existsSync(JOURNAL_PATH)) {
    writeFileSync(JOURNAL_PATH, "[]", "utf-8")
  }
}

/**
 * Read the journal.
 */
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

function readJournal(): JournalEntry[] {
  ensureJournal()
  try {
    return JSON.parse(readFileSync(JOURNAL_PATH, "utf-8"))
  } catch {
    return []
  }
}

/**
 * Append an entry to the journal.
 */
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

export const DevJournalPlugin: Plugin = async (ctx) => {
  return {
    // ─── TOOLS ────────────────────────────────────────
    tool: {
      devjournal: tool({
        description:
          "Open the DevJournal dashboard — view sessions, edit memory files, manage .env files.",
        args: {
          action: tool.schema
            .enum(["start", "stop", "status", "log"])
            .default("start")
            .describe(
              "Action: start dashboard, stop, check status, or log an entry",
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
              if (serverProcess) {
                return "DevJournal is already running at http://localhost:4173"
              }
              const serverPath = join(PROJECT_DIR, "server.js")
              if (!existsSync(serverPath)) {
                return `DevJournal server not found at ${serverPath}. Run install.sh first.`
              }
              serverProcess = spawn("node", [serverPath], {
                detached: true,
                stdio: "ignore",
                env: { ...process.env, PATH: process.env.PATH },
              })
              serverProcess.unref()
              return "DevJournal started at http://localhost:4173"
            }

            case "stop": {
              if (serverProcess) {
                serverProcess.kill("SIGTERM")
                serverProcess = null
                return "DevJournal stopped"
              }
              return "DevJournal is not running"
            }

            case "status": {
              const journal = readJournal()
              return JSON.stringify(
                {
                  running: serverProcess !== null,
                  url: "http://localhost:4173",
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
              return "Usage: devjournal [start|stop|status|log]"
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
