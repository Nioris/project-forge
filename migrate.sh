#!/bin/bash
# @file migrate.sh
# @description Migrates existing Project Forge projects to v2.1 (unified hooks + wiki)
#
# Usage:
#   ./migrate.sh                    — migrate all projects found via git worktree list
#   ./migrate.sh /path/to/project   — migrate one specific project
#
# What it does:
#   1. Replaces old hooks (.ps1/.sh) with new .mjs hooks
#   2. Updates .claude/settings.json
#   3. Removes stale .claude/worktrees/
#   4. Creates wiki/ structure if missing
#   5. Migrates CONTEXT.md → wiki/_map.md if wiki doesn't exist yet
#   6. Updates agents to reference wiki instead of CONTEXT.md

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FORGE_ROOT="$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

migrate_project() {
  local PROJECT_PATH="$1"
  local PROJECT_NAME="$(basename "$PROJECT_PATH")"

  if [ ! -d "$PROJECT_PATH/.claude" ]; then
    echo -e "  ${YELLOW}[skip]${NC} $PROJECT_NAME — no .claude/ directory"
    return
  fi

  echo -e "  ${CYAN}[...]${NC} Migrating: $PROJECT_NAME"

  # ═══ 1. HOOKS ═══
  # Remove old hooks
  rm -rf "$PROJECT_PATH/.claude/hooks/ps/" 2>/dev/null
  rm -f "$PROJECT_PATH/.claude/hooks/block-dangerous.sh" 2>/dev/null
  rm -f "$PROJECT_PATH/.claude/hooks/post-write-lint.sh" 2>/dev/null
  rm -f "$PROJECT_PATH/.claude/hooks/pre-compact-backup.sh" 2>/dev/null

  # Copy new hooks from forge
  mkdir -p "$PROJECT_PATH/.claude/hooks"
  for f in "$FORGE_ROOT/.claude/hooks/"*.mjs; do
    [ -f "$f" ] && cp "$f" "$PROJECT_PATH/.claude/hooks/"
  done

  # Update settings.json
  if [ -f "$FORGE_ROOT/.claude/settings.json" ]; then
    cp "$FORGE_ROOT/.claude/settings.json" "$PROJECT_PATH/.claude/settings.json"
  fi

  echo -e "    ${GREEN}✓${NC} hooks updated (5 × .mjs)"

  # ═══ 2. STALE WORKTREES ═══
  if [ -d "$PROJECT_PATH/.claude/worktrees" ]; then
    rm -rf "$PROJECT_PATH/.claude/worktrees"
    echo -e "    ${GREEN}✓${NC} stale worktree configs removed"
  fi

  # ═══ 3. AGENTS ═══
  if [ -d "$FORGE_ROOT/.claude/agents" ]; then
    cp "$FORGE_ROOT/.claude/agents/"*.md "$PROJECT_PATH/.claude/agents/" 2>/dev/null
    echo -e "    ${GREEN}✓${NC} agents updated (wiki references)"
  fi

  # ═══ 4. CONTEXT ESSENTIALS ═══
  if [ -f "$FORGE_ROOT/.claude/context-essentials.md" ]; then
    cp "$FORGE_ROOT/.claude/context-essentials.md" "$PROJECT_PATH/.claude/"
  fi

  # ═══ 5. WIKI STRUCTURE ═══
  local WIKI_CREATED=0
  for d in wiki wiki/sessions wiki/decisions wiki/features wiki/bugs wiki/architecture; do
    if [ ! -d "$PROJECT_PATH/$d" ]; then
      mkdir -p "$PROJECT_PATH/$d"
      WIKI_CREATED=1
    fi
  done

  # Copy wiki templates if files don't exist
  for tmpl in \
    "wiki/pitfalls.md" \
    "wiki/changelog.md" \
    "wiki/deploy-log.md" \
    "wiki/tech-debt.md" \
    "wiki/testing.md" \
    "wiki/i18n-status.md" \
    "wiki/performance.md" \
    "wiki/api.md" \
    "wiki/requests.md" \
    "wiki/architecture/stack.md" \
    "wiki/architecture/data-flow.md" \
    "wiki/decisions/_template.md" \
    "wiki/features/_template.md" \
    "wiki/bugs/_template.md"
  do
    src="$FORGE_ROOT/$tmpl"
    dst="$PROJECT_PATH/$tmpl"
    if [ -f "$src" ] && [ ! -f "$dst" ]; then
      cp "$src" "$dst"
    fi
  done

  # ═══ 6. MIGRATE CONTEXT.MD → WIKI/_MAP.MD ═══
  if [ ! -f "$PROJECT_PATH/wiki/_map.md" ]; then
    if [ -f "$PROJECT_PATH/CONTEXT.md" ]; then
      # Auto-migrate: wrap CONTEXT.md content into wiki/_map.md
      {
        echo "---"
        echo "tags: [project-map]"
        echo "---"
        echo ""
        echo "# Project Map"
        echo ""
        echo "> Migrated from CONTEXT.md on $(date +%Y-%m-%d)"
        echo ""
        cat "$PROJECT_PATH/CONTEXT.md"
      } > "$PROJECT_PATH/wiki/_map.md"

      # Keep CONTEXT.md as backup, don't delete
      mv "$PROJECT_PATH/CONTEXT.md" "$PROJECT_PATH/CONTEXT.md.bak"
      echo -e "    ${GREEN}✓${NC} CONTEXT.md → wiki/_map.md (backup: CONTEXT.md.bak)"
    else
      # No CONTEXT.md either — create empty _map.md
      cp "$FORGE_ROOT/wiki/_map.md" "$PROJECT_PATH/wiki/_map.md"
      echo -e "    ${YELLOW}!${NC} wiki/_map.md created (empty template)"
    fi
  else
    echo -e "    ${GREEN}✓${NC} wiki/_map.md already exists"
  fi

  if [ "$WIKI_CREATED" = "1" ]; then
    echo -e "    ${GREEN}✓${NC} wiki/ structure created"
  fi

  echo -e "  ${GREEN}[OK]${NC} $PROJECT_NAME migrated"
  echo ""
}

# ═══ MAIN ═══

echo ""
echo -e "${CYAN}  ╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}  ║   PROJECT FORGE — MIGRATION v2.1     ║${NC}"
echo -e "${CYAN}  ║   Unified hooks + wiki system         ║${NC}"
echo -e "${CYAN}  ╚══════════════════════════════════════╝${NC}"
echo ""

if [ -n "$1" ]; then
  # Migrate specific project
  if [ -d "$1" ]; then
    migrate_project "$1"
  else
    echo -e "${RED}Error: directory '$1' not found${NC}"
    exit 1
  fi
else
  # Auto-detect projects via git worktree list
  if [ ! -d "$FORGE_ROOT/.git" ]; then
    echo -e "${RED}Error: not in a git repo. Run from project-forge root.${NC}"
    exit 1
  fi

  echo "  Scanning for projects..."
  echo ""

  MIGRATED=0

  # Get all worktrees
  git worktree list --porcelain 2>/dev/null | while read -r line; do
    case "$line" in
      worktree\ *)
        WT_PATH="${line#worktree }"
        # Skip the forge root itself
        if [ "$WT_PATH" != "$FORGE_ROOT" ]; then
          migrate_project "$WT_PATH"
        fi
        ;;
    esac
  done

  # Also check sibling directories (projects created by forge.sh)
  PARENT="$(dirname "$FORGE_ROOT")"
  for dir in "$PARENT"/*/; do
    dir="${dir%/}"
    [ "$dir" = "$FORGE_ROOT" ] && continue
    [ -d "$dir/.claude" ] && migrate_project "$dir"
  done

  echo -e "${GREEN}  Migration complete.${NC}"
  echo ""
  echo "  Next steps:"
  echo "    1. Open each project: cd <project> && claude"
  echo "    2. Run /continue — hooks will auto-inject wiki context"
  echo "    3. If wiki/_map.md was migrated from CONTEXT.md, review it"
  echo "    4. Delete .bak files when satisfied"
  echo ""
fi
