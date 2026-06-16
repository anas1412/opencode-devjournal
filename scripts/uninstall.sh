#!/usr/bin/env bash
# DevJournal · Complete Uninstall
# Removes all plugin artifacts while preserving user memory files.
set -e

OPENCODE_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
OPENCODE_DIR="${OPENCODE_DIR:-$HOME/.opencode}"
CACHE_DIR="$HOME/.cache/opencode/packages/opencode-devjournal@latest"
CONFIG_FILE="$OPENCODE_HOME/opencode.json"
PID_FILE="$OPENCODE_HOME/devjournal.pid"
COMMAND_FILE="$OPENCODE_DIR/command/devjournal.md"
SKILL_LINK="$OPENCODE_DIR/skills/devjournal"
LOCAL_DIR="$HOME/.local/share/opencode-devjournal"

echo ""
echo "  ╭─────────────────────────────────╮"
echo "  │  DevJournal · Uninstall         │"
echo "  ╰─────────────────────────────────╯"
echo ""

# ── 1. Kill the running server ─────────────────────────
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$PID" ]; then
    kill "$PID" 2>/dev/null && echo "  ✓ Stopped server (PID $PID)" || echo "  - Server not running"
  fi
  rm -f "$PID_FILE"
fi
# Also kill anything on port 4173
PORT_PID=$(lsof -ti:4173 2>/dev/null || true)
if [ -n "$PORT_PID" ]; then
  kill "$PORT_PID" 2>/dev/null || true
  echo "  ✓ Freed port 4173"
fi

# ── 2. Remove plugin entry from opencode.json ──────────
if [ -f "$CONFIG_FILE" ]; then
  REMOVED=$(node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    const before = (cfg.plugin || []).length;
    cfg.plugin = (cfg.plugin || []).filter(p => !String(p).includes('opencode-devjournal'));
    const after = cfg.plugin.length;
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2) + '\n');
    console.log(before - after);
  " 2>/dev/null || echo "0")
  if [ "$REMOVED" -gt 0 ]; then
    echo "  ✓ Removed plugin from opencode.json"
  else
    echo "  - No plugin entry found in opencode.json"
  fi
fi

# ── 3. Remove npm package cache ────────────────────────
if [ -d "$CACHE_DIR" ]; then
  rm -rf "$CACHE_DIR"
  echo "  ✓ Removed package cache"
else
  echo "  - No package cache found"
fi

# ── 4. Remove skill symlink ────────────────────────────
if [ -L "$SKILL_LINK" ] || [ -d "$SKILL_LINK" ]; then
  rm -rf "$SKILL_LINK"
  echo "  ✓ Removed skill symlink"
else
  echo "  - No skill symlink found"
fi

# ── 5. Remove command file ─────────────────────────────
if [ -f "$COMMAND_FILE" ]; then
  rm "$COMMAND_FILE"
  echo "  ✓ Removed command file"
else
  echo "  - No command file found"
fi

# ── 6. Remove local project download ───────────────────
if [ -d "$LOCAL_DIR" ]; then
  rm -rf "$LOCAL_DIR"
  echo "  ✓ Removed downloaded project files"
else
  echo "  - No local project files found"
fi

echo ""
echo "  ─────────────────────────────────────"
echo "  ✓ DevJournal uninstalled"
echo ""
echo "  Memory files kept:"
echo "    $OPENCODE_HOME/memory/"
echo "  (Delete manually if you want them gone)"
echo ""
