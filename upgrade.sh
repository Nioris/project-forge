#!/usr/bin/env bash
# upgrade.sh - Cleans up obsolete files after copy-with-replace upgrade
#
# v4.10.18: now uses MANIFEST.txt for catch-all orphan detection.
#
# USAGE:
#   unzip -o project-forge-vX.Y.Z.zip
#   cd project-forge
#   ./upgrade.sh
#   node scripts/sync.mjs

set -e

FORGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$FORGE_ROOT"

echo ""
echo "=== Forge Upgrade - cleaning up obsolete files ==="
echo ""

LEGACY_ORPHANS=(
    ".claude/commands/analyze-game.md"
    ".claude/commands/analyze-project.md"
    ".claude/commands/info-hierarchy.md"
    ".claude/commands/layout-system.md"
    ".claude/commands/pipeline.md"
    ".claude/commands/start.md"
    ".claude/commands/ui-pipeline.md"
    ".claude/commands/ui-review.md"
)

echo "[1/7] Removing legacy orphan files..."
REMOVED=0; KEPT=0
for orphan in "${LEGACY_ORPHANS[@]}"; do
    if [ -e "$FORGE_ROOT/$orphan" ]; then
        rm -f "$FORGE_ROOT/$orphan" && echo "      [-] $orphan" && REMOVED=$((REMOVED + 1))
    else
        KEPT=$((KEPT + 1))
    fi
done
echo "      Removed $REMOVED, $KEPT already absent."

echo "[2/7] Manifest-based orphan detection..."
if [ ! -f "$FORGE_ROOT/MANIFEST.txt" ]; then
    echo "      MANIFEST.txt not found - skipping."
else
    node "$FORGE_ROOT/scripts/apply-manifest.mjs" 2>&1 || true
fi

LEGACY_ORPHAN_DIRS=(
    ".claude/skills/phase-3-visual"
    ".claude/skills/phase-4-tech"
    ".claude/skills/phase-5-listing"
    ".claude/skills/phase-6-test"
    ".claude/skills/phase-7-release"
    ".claude/skills/phase-8-live"
)

echo "[3/7] Removing obsolete skill directories..."
DIR_REMOVED=0; DIR_ABSENT=0; OBSOLETE_BACKUP_ROOT=""
for orphan_dir in "${LEGACY_ORPHAN_DIRS[@]}"; do
    full="$FORGE_ROOT/$orphan_dir"
    if [ ! -d "$full" ]; then
        DIR_ABSENT=$((DIR_ABSENT + 1))
        continue
    fi
    if find "$full" -mindepth 1 -print -quit | grep -q .; then
        if [ -z "$OBSOLETE_BACKUP_ROOT" ]; then
            OBSOLETE_BACKUP_ROOT="$(dirname "$FORGE_ROOT")/forge-data/backups/obsolete-skill-dirs-$(date +%Y-%m-%d-%H-%M-%S)"
            mkdir -p "$OBSOLETE_BACKUP_ROOT"
        fi
        safe_name="${orphan_dir//\//__}"
        mkdir -p "$OBSOLETE_BACKUP_ROOT/$safe_name"
        cp -a "$full/." "$OBSOLETE_BACKUP_ROOT/$safe_name/"
        echo "      [backup] $orphan_dir -> $OBSOLETE_BACKUP_ROOT"
    fi
    rm -rf "$full"
    echo "      [-] $orphan_dir"
    DIR_REMOVED=$((DIR_REMOVED + 1))
done
echo "      Removed $DIR_REMOVED, $DIR_ABSENT already absent."

echo "[4/7] Checking for nested duplicate directories..."
if [ -f "$FORGE_ROOT/scripts/check-nested-dirs.mjs" ]; then
    NESTED_OUTPUT=$(node "$FORGE_ROOT/scripts/check-nested-dirs.mjs" 2>&1 || true)
    if echo "$NESTED_OUTPUT" | grep -q 'No nested'; then
        echo "      No nested dupes."
    else
        echo "      Found nested dupes - auto-fixing..."
        node "$FORGE_ROOT/scripts/check-nested-dirs.mjs" --fix
    fi
else
    echo "      Skipped."
fi

echo "[5/7] Syncing advisor catalog..."
if [ -f "$FORGE_ROOT/scripts/update-advisor-catalog.mjs" ]; then
    node "$FORGE_ROOT/scripts/update-advisor-catalog.mjs" > /dev/null 2>&1 || true
    echo "      Done."
else
    echo "      Skipped."
fi

echo "[6/7] Rebuilding Claude/Codex generated adapters..."
node "$FORGE_ROOT/scripts/generate-agents-md.mjs"
node "$FORGE_ROOT/scripts/sync-codex-adapter.mjs"
echo "      Done."

echo "[7/7] Refreshing dashboard metadata..."
node "$FORGE_ROOT/scripts/sync-dashboard-meta.mjs"
node "$FORGE_ROOT/scripts/check-dashboard-meta.mjs"
echo "      Done."

echo ""
echo "=== Upgrade complete ==="
echo ""
echo "Next steps:"
echo "  ./setup.sh                   # one-time setup"
echo "  node scripts/sync.mjs   # propagate to siblings"
echo ""
