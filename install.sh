#!/usr/bin/env bash
# DevJournal · OpenCode Plugin Installer
set -e

# ── Flags ───────────────────────────────────────────────────
case "${1:-}" in
  --uninstall|-u)
    SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
    if [ -f "$SCRIPT_DIR/scripts/uninstall.sh" ]; then
      exec bash "$SCRIPT_DIR/scripts/uninstall.sh"
    else
      echo "Error: scripts/uninstall.sh not found"
      exit 1
    fi
    ;;
  --update|-U)
    SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
    if [ -f "$SCRIPT_DIR/scripts/update.sh" ]; then
      exec bash "$SCRIPT_DIR/scripts/update.sh"
    else
      echo "Error: scripts/update.sh not found"
      exit 1
    fi
    ;;
esac

# ── Config ──────────────────────────────────────────────────
REPO="anas1412/opencode-devjournal"
BRANCH="main"
OPENCODE_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
OPENCODE_DIR="${OPENCODE_DIR:-$HOME/.opencode}"
MEMORY_DIR="$OPENCODE_HOME/memory"

# ── Detect: running from repo dir or piped via curl? ────────
SCRIPT_DIR="$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")"
if [ -n "$SCRIPT_DIR" ] && [ -f "$SCRIPT_DIR/server.cjs" ] && [ -f "$SCRIPT_DIR/devjournal.html" ]; then
  PROJECT_DIR="$SCRIPT_DIR"
  echo "  Installing from local directory: $PROJECT_DIR"
else
  # Running remotely — download the repo first
  INSTALL_DIR="${HOME}/.local/share/opencode-devjournal"
  mkdir -p "$INSTALL_DIR"
  TARBALL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
  echo "  Downloading DevJournal from $REPO..."
  curl -fsSL "$TARBALL" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
  PROJECT_DIR="$INSTALL_DIR"
  echo "  Downloaded to $PROJECT_DIR"
fi

PLUGIN_PATH="file://$PROJECT_DIR/dist/index.js"

echo "  Installing DevJournal for OpenCode..."

# 1. Create memory directory
mkdir -p "$MEMORY_DIR"

# 2. Create default memory files if they don't exist
if [ ! -f "$MEMORY_DIR/environment.md" ]; then
  OS_NAME=$(uname -srm 2>/dev/null || echo "Linux")
  HOST=$(hostname 2>/dev/null || echo "unknown")
  NODE_V=$(node -v 2>/dev/null || echo "not found")
  BUN_V=$(bun -v 2>/dev/null && echo "Bun: $(bun -v 2>/dev/null)" || echo "Bun: not found")
  PY_V=$(python3 --version 2>/dev/null || echo "not found")
  GO_V=$(go version 2>/dev/null || echo "not found")
  EDITOR_V="${EDITOR:-unknown}"
  TERM_V="${TERM:-unknown}"
  PKG_MGR=$( (which pnpm 2>/dev/null && echo "pnpm") || (which npm 2>/dev/null && echo "npm") || echo "unknown")

  cat > "$MEMORY_DIR/environment.md" << ENVEOF
# Environment

## System
- OS: $OS_NAME
- Hostname: $HOST
- Shell: $SHELL

## Languages & Runtimes
- Node.js: $NODE_V
- $BUN_V
- Python: $PY_V
- Go: $GO_V

## Tools
- Editor: $EDITOR_V
- Terminal: $TERM_V
- Package manager: $PKG_MGR
ENVEOF
  echo "  Created environment.md with live system info"
fi

if [ ! -f "$MEMORY_DIR/preferences.md" ]; then
  cat > "$MEMORY_DIR/preferences.md" << 'PREFEOF'
# Preferences

## Code Style
- TypeScript strict mode
- Named exports (no default exports)
- Functional patterns over classes
- Early return over nested if

## Formatting
- 2-space indent
- Single quotes
- No semicolons
PREFEOF
  echo "  Created preferences.md"
fi

# 3. Install npm dependencies (ignore scripts to avoid loops)
echo "  Installing dependencies..."
cd "$PROJECT_DIR"
if [ -d node_modules/express ] && [ -d node_modules/@opencode-ai/plugin ]; then
  echo "  Dependencies already installed"
else
  npm install --ignore-scripts 2>&1 | tail -3
fi

# 4. Build the TypeScript plugin
echo "  Building plugin..."
if [ -f node_modules/.bin/tsc ]; then
  npx tsc 2>&1 | tail -5 || echo "  (build warnings are ok)"
elif command -v bun &>/dev/null; then
  bun build src/index.ts --outdir dist --target node 2>&1 | tail -3
else
  echo "  No TypeScript compiler found, installing..."
  npm install --ignore-scripts typescript@latest
  npx tsc 2>&1 | tail -5 || echo "  (build warnings ok)"
fi

# 5. Register plugin in opencode.json
OPENCODE_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/opencode/opencode.json"
if [ -f "$OPENCODE_CONFIG" ]; then
  if grep -q "$PLUGIN_PATH" "$OPENCODE_CONFIG" 2>/dev/null; then
    echo "  Plugin already registered in opencode.json"
  else
    cp "$OPENCODE_CONFIG" "$OPENCODE_CONFIG.bak" 2>/dev/null || true
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$OPENCODE_CONFIG', 'utf-8'));
      if (!cfg.plugin) cfg.plugin = [];
      const p = '$PLUGIN_PATH';
      if (!cfg.plugin.includes(p)) cfg.plugin.push(p);
      fs.writeFileSync('$OPENCODE_CONFIG', JSON.stringify(cfg, null, 2) + '\n');
    " && echo "  Registered plugin in opencode.json"
  fi
fi

# 6. Create devjournal command for OpenCode
COMMAND_DIR="$OPENCODE_DIR/command"
mkdir -p "$COMMAND_DIR"
if [ ! -f "$COMMAND_DIR/devjournal.md" ]; then
  cat > "$COMMAND_DIR/devjournal.md" << CMDEOF
---
description: DevJournal dashboard — memory, sessions, and .env management
tags:
  - devjournal
  - memory
  - dashboard
---

# DevJournal

Open the DevJournal dashboard. View sessions across projects, manage memory files
(\`environment.md\`, \`preferences.md\`), and edit .env files.

## Usage

\`\`\`
devjournal
\`\`\`

Starts the dashboard at http://localhost:4173.

## Data locations

- Memory: ~/.config/opencode/memory/
- Sessions: Scanned from ~/*/.tmp/sessions/
CMDEOF
  echo "  Created devjournal command"
fi

# 7. Symlink project into OpenCode skills
SKILL_DIR="$OPENCODE_DIR/skills/devjournal"
if [ ! -L "$SKILL_DIR" ] && [ ! -d "$SKILL_DIR" ]; then
  ln -s "$PROJECT_DIR" "$SKILL_DIR"
  echo "  Linked devjournal skill"
fi

echo ""
echo "  ✓ DevJournal installed!"
echo "  Dashboard:    http://localhost:4173"
echo "  Run:          node $PROJECT_DIR/server.cjs"
echo "  Memory:       $MEMORY_DIR"
echo "  Plugin:       $PLUGIN_PATH"
echo ""
