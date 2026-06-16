#!/usr/bin/env bash
# DevJournal · Update
# Re-downloads the latest package and restarts the server.
set -e

REPO="anas1412/opencode-devjournal"
BRANCH="main"
OPENCODE_HOME="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
OPENCODE_DIR="${OPENCODE_DIR:-$HOME/.opencode}"
CONFIG_FILE="$OPENCODE_HOME/opencode.json"
PID_FILE="$OPENCODE_HOME/devjournal.pid"

echo ""
echo "  ╭─────────────────────────────────╮"
echo "  │  DevJournal · Update            │"
echo "  ╰─────────────────────────────────╯"
echo ""

# ── Detect install method ─────────────────────────────
INSTALL_METHOD="unknown"
PLUGIN_ENTRY=""

if [ -f "$CONFIG_FILE" ]; then
  PLUGIN_ENTRY=$(node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    const entry = (cfg.plugin || []).find(p => String(p).includes('opencode-devjournal'));
    console.log(entry || '');
  " 2>/dev/null || echo "")
fi

if [[ "$PLUGIN_ENTRY" == file://* ]]; then
  INSTALL_METHOD="file"
elif [[ "$PLUGIN_ENTRY" == "opencode-devjournal" ]]; then
  INSTALL_METHOD="npm"
fi

echo "  Install method: $INSTALL_METHOD"

# ── Update by method ──────────────────────────────────

case "$INSTALL_METHOD" in
  npm)
    echo "  Updating via opencode plugin..."
    if command -v opencode &>/dev/null; then
      opencode plugin opencode-devjournal -f
      echo "  ✓ npm package updated"
    else
      echo "  ✗ 'opencode' CLI not found. Update manually:"
      echo "    npm install -g opencode-devjournal"
      exit 1
    fi
    ;;

  file)
    echo "  Downloading latest from GitHub..."
    INSTALL_DIR="${HOME}/.local/share/opencode-devjournal"
    mkdir -p "$INSTALL_DIR"

    TARBALL="https://github.com/${REPO}/archive/refs/heads/${BRANCH}.tar.gz"
    curl -fsSL "$TARBALL" | tar -xz --strip-components=1 -C "$INSTALL_DIR"
    echo "  ✓ Downloaded $REPO"

    cd "$INSTALL_DIR"

    echo "  Installing dependencies..."
    npm install --ignore-scripts 2>&1 | tail -3

    echo "  Building..."
    if [ -f node_modules/.bin/tsc ]; then
      npx tsc 2>&1 | tail -5 || echo "  (build warnings ok)"
    elif command -v bun &>/dev/null; then
      bun build src/index.ts --outdir dist --target node 2>&1 | tail -3
    else
      echo "  Installing TypeScript..."
      npm install --ignore-scripts typescript@latest
      npx tsc 2>&1 | tail -5 || echo "  (build warnings ok)"
    fi

    # Re-symlink skill (in case project path changed)
    SKILL_DIR="$OPENCODE_DIR/skills/devjournal"
    if [ -L "$SKILL_DIR" ] || [ -d "$SKILL_DIR" ]; then
      rm -rf "$SKILL_DIR"
    fi
    ln -s "$INSTALL_DIR" "$SKILL_DIR"
    echo "  ✓ Skill symlink updated"

    # Ensure plugin is still registered (file:// path)
    node -e "
      const fs = require('fs');
      const cfg = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
      if (!cfg.plugin) cfg.plugin = [];
      const p = 'file://$INSTALL_DIR/dist/index.js';
      if (!cfg.plugin.includes(p)) cfg.plugin.push(p);
      fs.writeFileSync('$CONFIG_FILE', JSON.stringify(cfg, null, 2) + '\n');
    " 2>/dev/null || true
    echo "  ✓ Plugin registration confirmed"
    ;;

  *)
    echo "  ✗ Could not detect install method."
    echo ""
    echo "  Try reinstalling manually:"
    echo "    opencode plugin opencode-devjournal"
    echo "  Or from source:"
    echo "    curl -fsSL https://raw.githubusercontent.com/$REPO/main/install.sh | bash"
    exit 1
    ;;
esac

# ── Restart the server ─────────────────────────────────
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE" 2>/dev/null || echo "")
  if [ -n "$OLD_PID" ]; then
    kill "$OLD_PID" 2>/dev/null || true
    echo "  ✓ Stopped old server (PID $OLD_PID)"
  fi
  rm -f "$PID_FILE"
fi

# Start new server
CACHE_DIR="$HOME/.cache/opencode/packages/opencode-devjournal@latest/node_modules/opencode-devjournal"
if [ -f "$CACHE_DIR/server.cjs" ]; then
  nohup node "$CACHE_DIR/server.cjs" > /dev/null 2>&1 &
  echo "  ✓ Server started (port 4173)"
elif [ -f "$INSTALL_DIR/server.cjs" ]; then
  nohup node "$INSTALL_DIR/server.cjs" > /dev/null 2>&1 &
  echo "  ✓ Server started (port 4173)"
else
  echo "  ⚠ Could not auto-start server. Run manually:"
  echo "    node server.cjs"
fi

echo ""
echo "  ─────────────────────────────────────"
echo "  ✓ DevJournal updated to latest!"
echo "  Dashboard: http://localhost:4173"
echo ""
