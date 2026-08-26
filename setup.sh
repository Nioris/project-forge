#!/bin/bash
# @file setup.sh
# @description Project Forge v4 setup for Linux/macOS — init git, verify Claude Code + Node,
#              seed wiki/_current.md, create GameIntegration/WorkProgress/Release dirs,
#              migrate flat sessions, display platform matrix.

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
GRAY='\033[0;90m'
WHITE='\033[1;37m'
NC='\033[0m'

echo ""
echo -e "${CYAN}  ╔══════════════════════════════════════╗${NC}"
echo -e "${CYAN}  ║         PROJECT FORGE v4.68.54              ║${NC}"
echo -e "${CYAN}  ║   Multi-platform release pipeline     ║${NC}"
echo -e "${CYAN}  ╚══════════════════════════════════════╝${NC}"
echo ""

# AI clients — Forge supports Claude Code and Codex from the same repository.
if command -v claude &>/dev/null; then
    CLAUDE_VER=$(claude --version 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}✅ Claude Code: ${CLAUDE_VER}${NC}"
else
    echo -e "  ${YELLOW}⚠️  Claude Code not found (optional when using Codex).${NC}"
fi
if command -v codex &>/dev/null; then
    CODEX_VER=$(codex --version 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}✅ Codex: ${CODEX_VER}${NC}"
else
    echo -e "  ${YELLOW}⚠️  Codex not found (optional when using Claude Code).${NC}"
fi

# Check Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null || echo "unknown")
    echo -e "  ${GREEN}✅ Node.js: ${NODE_VER}${NC}"
else
    echo -e "  ${RED}❌ Node.js not found — hooks + validators will not work.${NC}"
    exit 1
fi

# Refresh generated Claude/Codex/dashboard surfaces from canonical Forge sources.
if [ -f "scripts/generate-agents-md.mjs" ] && [ -f "scripts/sync-codex-adapter.mjs" ]; then
    node scripts/generate-agents-md.mjs > /dev/null
    node scripts/sync-codex-adapter.mjs > /dev/null
    node scripts/sync-dashboard-meta.mjs > /dev/null
    echo -e "  ${GREEN}✅ Unified agent/dashboard surfaces: synced${NC}"
fi

# Check puppeteer (optional, used by Yandex runtime/smoke tests)
if [ -d "node_modules/puppeteer" ]; then
    echo -e "  ${GREEN}✅ puppeteer: installed${NC}"
else
    echo -e "  ${YELLOW}⚠️  puppeteer not installed (needed for Yandex runtime/smoke tests)${NC}"
    echo -e "  ${GRAY}   Install later: npm install puppeteer${NC}"
fi

# Init git if needed
if [ ! -d ".git" ]; then
    echo -e "  ${YELLOW}📦 Initializing git repository...${NC}"
    git init -q
    git add -A
    git commit -q -m "Initial commit: Project Forge v4"
    echo -e "  ${GREEN}✅ Git initialized${NC}"
fi

# Create pipeline directories if missing
for d in GameIntegration WorkProgress Release; do
    if [ ! -d "$d" ]; then
        mkdir -p "$d"
        echo -e "  ${GREEN}✅ Created $d/${NC}"
    fi
done

# Seed wiki/_current.md
if [ -f "wiki/_current.md.template" ] && [ ! -f "wiki/_current.md" ]; then
    cp wiki/_current.md.template wiki/_current.md
    echo -e "  ${GREEN}✅ Seeded wiki/_current.md${NC}"
fi

# Migrate old flat session logs
FLAT_COUNT=$(find wiki/sessions -maxdepth 1 -name '????-??-??.md' 2>/dev/null | wc -l | tr -d ' ')
if [ "$FLAT_COUNT" -gt 0 ]; then
    echo -e "  ${YELLOW}📦 Migrating ${FLAT_COUNT} flat session log(s)...${NC}"
    node scripts/migrate-sessions.mjs
fi

# v4.10.11: Auto-cleanup orphan command wrappers
# When user upgrades Forge через copy-with-replace, old wrappers from previous versions
# remain. Detect и delete them so /game, /app, /continue stay the only top-level commands.
if [ -f "scripts/cleanup-orphan-wrappers.mjs" ]; then
    if node scripts/cleanup-orphan-wrappers.mjs --dry 2>&1 | grep -q "Found"; then
        echo ""
        echo -e "  ${YELLOW}🧹 Found legacy command wrappers from previous Forge versions.${NC}"
        echo -e "     Auto-cleaning (v4.10.9+ uses /game, /app, /continue + skill auto-invocation)..."
        node scripts/cleanup-orphan-wrappers.mjs --auto > /dev/null
        echo -e "  ${GREEN}✓${NC} Legacy wrappers removed."
    fi
fi

# Syntax-check all hooks + platform scripts
echo ""
echo -e "  ${WHITE}Hooks & platform scripts:${NC}"
ERRORS=0
for f in .claude/hooks/*.mjs .claude/hooks/lib/*.mjs; do
    if [ -f "$f" ]; then
        if node --check "$f" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} $(basename $f)"
        else
            echo -e "  ${RED}✗${NC} $(basename $f)"
            ERRORS=$((ERRORS+1))
        fi
    fi
done

# Platform gate scripts — все 9 платформ (rustore + web без pre-submit, цикл их пропустит)
for plat in yandex vk telegram ok max rustore web steam vkplay; do
    if [ -f "platforms/$plat/scripts/pre-submit.mjs" ]; then
        if node --check "platforms/$plat/scripts/pre-submit.mjs" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} platforms/$plat/scripts/pre-submit.mjs"
        else
            echo -e "  ${RED}✗${NC} platforms/$plat/scripts/pre-submit.mjs"
            ERRORS=$((ERRORS+1))
        fi
    fi
    # Also check runtime-tests where they exist
    if [ -f "platforms/$plat/scripts/runtime-test.mjs" ]; then
        if node --check "platforms/$plat/scripts/runtime-test.mjs" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} platforms/$plat/scripts/runtime-test.mjs"
        else
            echo -e "  ${RED}✗${NC} platforms/$plat/scripts/runtime-test.mjs"
            ERRORS=$((ERRORS+1))
        fi
    fi
done
# Shared utilities
for f in platforms/_shared/*.mjs; do
    if [ -f "$f" ]; then
        if node --check "$f" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} $f"
        else
            echo -e "  ${RED}✗${NC} $f"
            ERRORS=$((ERRORS+1))
        fi
    fi
done

if [ "$ERRORS" -gt 0 ]; then
    echo -e "  ${RED}$ERRORS syntax error(s) — check files above${NC}"
    exit 1
fi

# Cross-reference audit — advisor catalog vs filesystem (v4.8+)
if [ -f "scripts/check-cross-refs.mjs" ]; then
    echo
    echo "Validating advisor catalog (drift detection)..."
    if node scripts/check-cross-refs.mjs > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} advisor catalog matches filesystem (no drift)"
    else
        echo -e "  ${YELLOW}⚠${NC} advisor catalog drift detected:"
        node scripts/check-cross-refs.mjs 2>&1 | grep -E "Missing|Phantom|skill" | head -10 | sed 's/^/    /'
        echo -e "  ${GRAY}(non-fatal — Forge will work, but some skills won't show in /advisor)${NC}"
    fi
fi

# .bat encoding audit — non-ASCII inside () blocks (v4.8+)
if [ -f "scripts/check-bat-encoding.mjs" ]; then
    echo
    echo "Validating .bat files (cmd.exe parser safety)..."
    if node scripts/check-bat-encoding.mjs > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} .bat files clean (no non-ASCII inside parens)"
    else
        echo -e "  ${RED}✗${NC} .bat encoding violations (cmd.exe will crash on Windows):"
        node scripts/check-bat-encoding.mjs 2>&1 | grep -E "^\s+\S+\.bat:" | head -10 | sed 's/^/    /'
        echo -e "  ${GRAY}(this WILL break sync.bat / open-all.bat for Russian Windows users)${NC}"
    fi
fi

# Skill kind audit — every SKILL.md has kind: architectural | tactical (v4.9+)
if [ -f "scripts/check-skill-kind.mjs" ]; then
    echo
    echo "Validating skill categorization (architectural vs tactical)..."
    if node scripts/check-skill-kind.mjs > /dev/null 2>&1; then
        ARCH_COUNT=$(node scripts/check-skill-kind.mjs --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['stats']['architectural'])" 2>/dev/null || echo "?")
        TACT_COUNT=$(node scripts/check-skill-kind.mjs --json 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['stats']['tactical'])" 2>/dev/null || echo "?")
        echo -e "  ${GREEN}✓${NC} all skills have kind: ($ARCH_COUNT architectural, $TACT_COUNT tactical)"
    else
        echo -e "  ${YELLOW}⚠${NC} skills missing kind: in frontmatter:"
        node scripts/check-skill-kind.mjs 2>&1 | grep -E "missing|invalid" | head -10 | sed 's/^/    /'
        echo -e "  ${GRAY}(advisor recommendations less precise without kind:)${NC}"
    fi
fi

# Dashboard structure check — visual regression via structural diff (v4.9+)
if [ -f "scripts/check-dashboard-structure.mjs" ] && [ -f ".dashboard-structure-baseline.json" ]; then
    echo
    echo "Validating dashboard.html structure (visual regression check)..."
    if node scripts/check-dashboard-structure.mjs > /dev/null 2>&1; then
        echo -e "  ${GREEN}✓${NC} dashboard structure matches baseline"
    else
        echo -e "  ${YELLOW}⚠${NC} dashboard.html changed since baseline:"
        node scripts/check-dashboard-structure.mjs 2>&1 | grep -E "Removed|Added|Changed|^    #" | head -10 | sed 's/^/    /'
        echo -e "  ${GRAY}(if intentional: scripts/check-dashboard-structure.mjs --baseline)${NC}"
    fi
fi

# Counts
SKILLS_KB=$(find skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
SKILLS_CMD=$(find .claude/skills -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
AGENTS=$(find .claude/agents -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
HOOKS=$(find .claude/hooks -maxdepth 1 -name "*.mjs" 2>/dev/null | wc -l | tr -d ' ')
PLATFORMS=$(find platforms -maxdepth 1 -mindepth 1 -type d -not -name '_*' 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo -e "  ${CYAN}┌─────────────────────────────────────┐${NC}"
echo -e "  ${CYAN}│  Platforms:  $(printf '%3s' $PLATFORMS)  (release targets)    │${NC}"
echo -e "  ${CYAN}│  Skills KB:  $(printf '%3s' $SKILLS_KB)  (domain knowledge)   │${NC}"
echo -e "  ${CYAN}│  Commands:   $(printf '%3s' $SKILLS_CMD)  (slash commands)     │${NC}"
echo -e "  ${CYAN}│  Agents:     $(printf '%3s' $AGENTS)  (subagents)          │${NC}"
echo -e "  ${CYAN}│  Hooks:      $(printf '%3s' $HOOKS)  (automation)         │${NC}"
echo -e "  ${CYAN}└─────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${WHITE}Platform matrix:${NC}"
echo -e "    ${GRAY}yandex    — production (11 validators, 3-ZIP matrix)${NC}"
echo -e "    ${GRAY}vk        — beta (VK Bridge + 3 validators: bridge-timing, pay, ads)${NC}"
echo -e "    ${GRAY}telegram  — beta (WebApp SDK + 5 validators + runtime-test)${NC}"
echo -e "    ${GRAY}ok        — beta (FAPI + runtime probe: sig, loaded, callbacks)${NC}"
echo -e "    ${GRAY}max       — beta (MaxSDK + 5 validators — MAX messenger)${NC}"
echo -e "    ${GRAY}rustore   — beta (Capacitor wrap)${NC}"
echo -e "    ${GRAY}web       — beta (Docker + nginx)${NC}"
echo -e "    ${GRAY}steam     — v4.7 (Electron + steamworks.js + 5 validators)${NC}"
echo -e "    ${GRAY}vkplay    — v4.7 (vkplay.ru iframe + signed auth + 5 validators)${NC}"
echo ""
echo -e "  ${WHITE}Memory system:${NC}"
echo -e "    ${GRAY}wiki/_current.md — active session (auto-injected)${NC}"
echo -e "    ${GRAY}wiki/plan/*.md   — structured tasks (drift-checked)${NC}"
echo -e "    ${GRAY}wiki/_map.md     — project map${NC}"
echo ""
echo -e "  ${GRAY}═══════════════════════════════════════${NC}"
echo ""
echo -e "  ${WHITE}WORKFLOW:${NC}"
echo -e "  ${YELLOW}  1. mkdir GameIntegration/MyGame && cp -r <sources> GameIntegration/MyGame/${NC}"
echo -e "  ${YELLOW}  2a. Claude Code: claude  → /release yandex${NC}"
echo -e "  ${YELLOW}  2b. Codex:       codex   → \$release-yandex${NC}"
echo ""
echo -e "  ${WHITE}DIAGNOSTICS:${NC}"
echo -e "  ${GRAY}  node scripts/build-all-platforms.mjs --list${NC}"
echo -e "  ${GRAY}  node .claude/hooks/wiki-audit.mjs${NC}"
echo -e "  ${GRAY}  node platforms/<platform>/scripts/pre-submit.mjs WorkProgress/<Project>/${NC}"
echo ""
echo -e "  ${WHITE}EMERGENCY BYPASS (logged):${NC}"
echo -e "  ${GRAY}  FORGE_SKIP_AUDIT=1 claude${NC}"
echo ""
