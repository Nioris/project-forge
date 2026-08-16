#!/bin/bash
# @file forge.sh
# @description Project Forge CLI — manage multiple isolated projects
#
# Usage:
#   ./scripts/forge.sh new <name> [description]  — create new project
#   ./scripts/forge.sh list                       — list all projects
#   ./scripts/forge.sh open <name>                — open project in Claude
#   ./scripts/forge.sh open <name> --tmux         — open in tmux pane
#   ./scripts/forge.sh remove <name>              — remove project worktree
#   ./scripts/forge.sh status                     — show all projects status

set -e

FORGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
COMMAND="${1:-help}"
PROJECT_NAME="$2"

case "$COMMAND" in

  new)
    if [ -z "$PROJECT_NAME" ]; then
      echo "Usage: forge.sh new <project-name> [description]"
      echo "Preferred: ./new-project.sh <project-name> --type game|app --title \"Title\""
      exit 1
    fi
    echo "[!] forge.sh new is a compatibility wrapper. Canonical creator: new-project.sh"
    ARGS=("$PROJECT_NAME" --type game)
    if [ -n "${3:-}" ]; then ARGS+=(--title "$3"); fi
    exec node "$FORGE_ROOT/scripts/new-project.mjs" "${ARGS[@]}"
    ;;

  list)
    echo ""
    echo "  ═══ ACTIVE PROJECTS ═══"
    echo ""

    cd "$FORGE_ROOT"
    git worktree list --porcelain | while read -r line; do
      case "$line" in
        worktree\ *)
          WT_PATH="${line#worktree }"
          ;;
        branch\ *)
          BRANCH="${line#branch refs/heads/}"
          # Only show project/* branches
          if [[ "$BRANCH" == project/* ]]; then
            NAME="${BRANCH#project/}"
            # Check for wiki/_map.md (primary) or CONTEXT.md (legacy)
            if [ -f "${WT_PATH}/wiki/_map.md" ]; then
              STATUS="✅ has wiki"
            elif [ -f "${WT_PATH}/CONTEXT.md" ]; then
              STATUS="⚠️  has CONTEXT.md (legacy, migrate to wiki)"
            else
              STATUS="🔲 not started"
            fi
            echo "  📁 ${NAME}"
            echo "     Path: ${WT_PATH}"
            echo "     Status: ${STATUS}"
            echo ""
          fi
          ;;
      esac
    done

    # Count
    TOTAL=$(cd "$FORGE_ROOT" && git worktree list | grep -c "project/" 2>/dev/null || echo "0")
    echo "  Total: ${TOTAL} project(s)"
    echo ""
    ;;

  open)
    if [ -z "$PROJECT_NAME" ]; then
      echo "Usage: forge.sh open <project-name> [--tmux]"
      exit 1
    fi

    WORKTREE_PATH="${FORGE_ROOT}/../${PROJECT_NAME}"

    if [ ! -d "$WORKTREE_PATH" ]; then
      echo "❌ Project '${PROJECT_NAME}' not found. Run: forge.sh new ${PROJECT_NAME}"
      exit 1
    fi

    if [ "$3" = "--tmux" ]; then
      echo "🚀 Opening ${PROJECT_NAME} in tmux pane..."
      cd "$WORKTREE_PATH"
      claude --worktree "${PROJECT_NAME}" --tmux
    else
      echo "🚀 Opening ${PROJECT_NAME}..."
      cd "$WORKTREE_PATH"
      claude
    fi
    ;;

  remove)
    if [ -z "$PROJECT_NAME" ]; then
      echo "Usage: forge.sh remove <project-name>"
      exit 1
    fi

    WORKTREE_PATH="${FORGE_ROOT}/../${PROJECT_NAME}"
    BRANCH="project/${PROJECT_NAME}"

    if [ ! -d "$WORKTREE_PATH" ]; then
      echo "❌ Project '${PROJECT_NAME}' not found."
      exit 1
    fi

    read -p "⚠️  Remove project '${PROJECT_NAME}'? This deletes the worktree. (y/N) " -n 1 -r
    echo ""

    if [[ $REPLY =~ ^[Yy]$ ]]; then
      cd "$FORGE_ROOT"
      git worktree remove "$WORKTREE_PATH" --force
      git branch -D "$BRANCH" 2>/dev/null || true
      echo "✅ Project '${PROJECT_NAME}' removed."
    else
      echo "Cancelled."
    fi
    ;;

  status)
    echo ""
    echo "  ═══ ALL PROJECTS STATUS ═══"
    echo ""

    cd "$FORGE_ROOT"
    for wt in $(git worktree list --porcelain | grep "^worktree " | sed 's/worktree //'); do
      NAME=$(basename "$wt")
      if [ -f "${wt}/wiki/_map.md" ]; then
        DONE=$(grep -c "^\- \[x\]" "${wt}/wiki/_map.md" 2>/dev/null || echo "0")
        TODO=$(grep -c "^\- \[ \]" "${wt}/wiki/_map.md" 2>/dev/null || echo "0")
        TOTAL=$((DONE + TODO))
        echo "  📁 ${NAME}: ${DONE}/${TOTAL} features"
        echo ""
      elif [ -f "${wt}/CONTEXT.md" ]; then
        DONE=$(grep -c "^\- \[x\]" "${wt}/CONTEXT.md" 2>/dev/null || echo "0")
        TODO=$(grep -c "^\- \[ \]" "${wt}/CONTEXT.md" 2>/dev/null || echo "0")
        TOTAL=$((DONE + TODO))
        echo "  📁 ${NAME}: ${DONE}/${TOTAL} features (legacy CONTEXT.md)"
        echo ""
      fi
    done
    ;;

  help|*)
    echo ""
    echo "  Project Forge CLI"
    echo ""
    echo "  Usage:"
    echo "    forge.sh new <name> [desc]    Create new isolated project"
    echo "    forge.sh list                 List all active projects"
    echo "    forge.sh open <name>          Open project in Claude"
    echo "    forge.sh open <name> --tmux   Open in tmux pane"
    echo "    forge.sh remove <name>        Remove project worktree"
    echo "    forge.sh status               Show all projects status"
    echo ""
    ;;
esac
