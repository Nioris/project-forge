#!/bin/bash
# open-all-tmux.sh - Open all active projects in tmux windows with Claude Code
#
# Usage:
#   ./scripts/open-all-tmux.sh            open all projects with wiki/_map.md
#   ./scripts/open-all-tmux.sh --dry-run  show what would open without doing it

set -e

FORGE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECTS_ROOT="$(dirname "$FORGE_ROOT")"
SESSION="forge"
DRY_RUN=false

for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
  esac
done

PROJECTS=()
# v4.6+: detect template by realpath, not folder name
FORGE_ABS=$(cd "$FORGE_ROOT" && pwd -P)
for dir in "$PROJECTS_ROOT"/*/; do
  name=$(basename "$dir")
  child_abs=$(cd "$dir" && pwd -P)
  [ "$child_abs" = "$FORGE_ABS" ] && continue
  # Legacy fallback for hardcoded names
  [ "$name" = "project-forge" ] && continue
  [ "$name" = "Project-forge" ] && continue
  if [ -f "$dir/wiki/_map.md" ]; then
    PROJECTS+=("$name")
  fi
done

cd "$FORGE_ROOT"
if git rev-parse --git-dir &>/dev/null; then
  while IFS= read -r line; do
    if [[ "$line" == worktree\ * ]]; then
      wt_path="${line#worktree }"
      wt_name=$(basename "$wt_path")
      already=false
      for p in "${PROJECTS[@]}"; do
        [ "$p" = "$wt_name" ] && already=true
      done
      $already || PROJECTS+=("$wt_name")
    fi
  done < <(git worktree list --porcelain 2>/dev/null)
fi

echo ""
echo "  === PROJECT FORGE - Open All ==="
echo ""

if [ ${#PROJECTS[@]} -eq 0 ]; then
  echo "  No active projects found."
  echo "  Create one: ./scripts/forge.sh new my-app"
  exit 0
fi

echo "  Found ${#PROJECTS[@]} project(s):"
for p in "${PROJECTS[@]}"; do
  echo "    > $p"
done
echo ""

if $DRY_RUN; then
  echo "  (dry run - not opening)"
  exit 0
fi

tmux kill-session -t "$SESSION" 2>/dev/null || true

FIRST="${PROJECTS[0]}"
FIRST_PATH="$PROJECTS_ROOT/$FIRST"
[ ! -d "$FIRST_PATH" ] && FIRST_PATH="$FORGE_ROOT/../$FIRST"

tmux new-session -d -s "$SESSION" -n "$FIRST" -c "$FIRST_PATH"
tmux send-keys -t "$SESSION:$FIRST" "cf" Enter

for ((i=1; i<${#PROJECTS[@]}; i++)); do
  name="${PROJECTS[$i]}"
  path="$PROJECTS_ROOT/$name"
  [ ! -d "$path" ] && path="$FORGE_ROOT/../$name"

  tmux new-window -t "$SESSION" -n "$name" -c "$path"
  tmux send-keys -t "$SESSION:$name" "cf" Enter
done

echo "  Opened ${#PROJECTS[@]} project(s) in tmux session '$SESSION'"
echo ""
echo "  Navigation:"
echo "    Ctrl+B, N     next project"
echo "    Ctrl+B, P     previous project"
echo "    Ctrl+B, 0-9   jump to project by number"
echo "    Ctrl+B, W     list all projects"
echo "    Ctrl+B, D     detach (sessions stay alive)"
echo ""
echo "  Reattach later: tmux attach -t $SESSION"
echo ""

tmux attach -t "$SESSION"
