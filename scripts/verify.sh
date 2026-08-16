#!/bin/bash
# verify.sh — Автоматическая верификация игры перед модерацией Yandex Games
# Использование: bash scripts/verify.sh [путь_к_игре]
# Claude Code запускает этот скрипт и читает вывод.
# Каждый ❌ FAIL — причина отказа модерации. Исправить ВСЕ перед сборкой.

DIR="${1:-WorkProgress}"
FAIL=0
WARN=0
PASS=0

# Найти все JS-файлы (исключая debugcheck, cheats, node_modules)
JS_FILES=$(find "$DIR" -name "*.js" ! -name "debugcheck*" ! -name "cheats*" ! -path "*/node_modules/*" 2>/dev/null)
INDEX="$DIR/index.html"

echo "══════════════════════════════════════════"
echo "  VERIFICATION: $(basename "$DIR")"
echo "══════════════════════════════════════════"
echo ""

# ─────────────── SYNTAX CHECK (FIRST!) ───────────────
echo "── JavaScript Syntax ──"

SYNTAX_ERRORS=0

# Check standalone .js files
if [ -n "$JS_FILES" ]; then
    for jsf in $JS_FILES; do
        ERR=$(node -c "$jsf" 2>&1)
        if [ $? -ne 0 ]; then
            echo "❌ FAIL: Syntax error in $jsf"
            echo "   $ERR"
            SYNTAX_ERRORS=$((SYNTAX_ERRORS+1))
        fi
    done
fi

# Check inline scripts in index.html
if [ -f "$INDEX" ]; then
    INLINE_ERRS=$(node -e "
    const fs = require('fs');
    const html = fs.readFileSync('$INDEX', 'utf-8');
    const re = /<script(?![^>]*\\bsrc\\b)[^>]*>([\s\S]*?)<\\/script>/gi;
    let m, errors = 0;
    while ((m = re.exec(html)) !== null) {
      const code = m[1].trim();
      if (!code || code.length < 10) continue;
      try { new Function(code); } catch (e) {
        const before = html.substring(0, m.index);
        const htmlLine = (before.match(/\\n/g) || []).length + 1;
        console.log('~line ' + htmlLine + ': ' + e.message);
        errors++;
      }
    }
    process.exit(errors > 0 ? 1 : 0);
    " 2>/dev/null)
    if [ $? -ne 0 ]; then
        echo "❌ FAIL: Syntax errors in $INDEX inline scripts:"
        echo "$INLINE_ERRS" | while read line; do echo "   $line"; done
        SYNTAX_ERRORS=$((SYNTAX_ERRORS+1))
    fi
fi

if [ "$SYNTAX_ERRORS" -gt 0 ]; then
    echo ""
    echo "🛑 GAME WILL NOT LAUNCH! Fix syntax errors before anything else."
    FAIL=$((FAIL+SYNTAX_ERRORS))
else
    echo "✅ No syntax errors"
    PASS=$((PASS+1))
fi

echo ""

# ─────────────── SDK ───────────────
echo "── SDK Integration ──"

if [ ! -f "$INDEX" ]; then
    echo "❌ FAIL: index.html not found in $DIR"
    FAIL=$((FAIL+1))
else
    if grep -q 'src="/sdk.js"' "$INDEX" 2>/dev/null; then
        echo "✅ SDK script present"
        PASS=$((PASS+1))
    else
        echo "❌ FAIL: Missing <script src=\"/sdk.js\"></script> in index.html"
        FAIL=$((FAIL+1))
    fi
fi

# LoadingAPI.ready
if echo "$JS_FILES" | xargs grep -l "LoadingAPI\|loadingAPI\|\.ready\(\)" 2>/dev/null | head -1 | grep -q .; then
    echo "✅ LoadingAPI.ready() found"
    PASS=$((PASS+1))
else
    # Also check index.html for inline scripts
    if grep -q "LoadingAPI\|\.ready()" "$INDEX" 2>/dev/null; then
        echo "✅ LoadingAPI.ready() found (inline)"
        PASS=$((PASS+1))
    else
        echo "❌ FAIL: LoadingAPI.ready() NOT found — moderation will reject"
        FAIL=$((FAIL+1))
    fi
fi

# GameplayAPI
if echo "$JS_FILES" | xargs grep -l "GameplayAPI\|startGameplay\|stopGameplay" 2>/dev/null | head -1 | grep -q . || grep -q "GameplayAPI\|startGameplay\|stopGameplay" "$INDEX" 2>/dev/null; then
    echo "✅ GameplayAPI start/stop found"
    PASS=$((PASS+1))
else
    echo "⚠️ WARN: GameplayAPI start/stop not found (recommended)"
    WARN=$((WARN+1))
fi

echo ""

# ─────────────── localStorage ───────────────
echo "── Cloud Saves ──"

LS_COUNT=0
if [ -n "$JS_FILES" ]; then
    LS_COUNT=$(echo "$JS_FILES" | xargs grep -n "localStorage" 2>/dev/null | wc -l)
fi
# Also check index.html
LS_INDEX=$(grep -n "localStorage" "$INDEX" 2>/dev/null | grep -v "debugcheck\|cheats\|fallback\|dev.mode\|dev mode\|Local dev" | wc -l)
LS_TOTAL=$((LS_COUNT + LS_INDEX))

if [ "$LS_TOTAL" -gt 0 ]; then
    echo "❌ FAIL: $LS_TOTAL localStorage references remaining:"
    if [ -n "$JS_FILES" ]; then
        echo "$JS_FILES" | xargs grep -n "localStorage" 2>/dev/null | head -10
    fi
    grep -n "localStorage" "$INDEX" 2>/dev/null | grep -v "debugcheck\|cheats\|fallback\|dev.mode\|dev mode\|Local dev" | head -5
    echo "   (dev-mode fallback refs are OK, but SDK-mode must use player.setData/getData)"
    FAIL=$((FAIL+1))
else
    echo "✅ No localStorage (cloud saves used)"
    PASS=$((PASS+1))
fi

echo ""

# ─────────────── Sound Muting ───────────────
echo "── Sound Muting ──"

SOUND_CHECKS=0
ALL_CODE="$JS_FILES $INDEX"

if echo "$JS_FILES" | xargs grep -q "visibilitychange\|document\.hidden" 2>/dev/null || grep -q "visibilitychange\|document\.hidden" "$INDEX" 2>/dev/null; then
    echo "✅ Tab visibility handling found"
    PASS=$((PASS+1))
    SOUND_CHECKS=$((SOUND_CHECKS+1))
else
    echo "❌ FAIL: No visibilitychange handler — sound plays when tab hidden"
    FAIL=$((FAIL+1))
fi

if echo "$JS_FILES" | xargs grep -q "game_api_pause\|onOpen.*mute\|onOpen.*pause\|suspend()" 2>/dev/null || grep -q "game_api_pause\|onOpen.*mute\|onOpen.*pause\|\.suspend()" "$INDEX" 2>/dev/null; then
    echo "✅ Ad muting logic found"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: No sound muting during ads"
    FAIL=$((FAIL+1))
fi

echo ""

# ─────────────── Ads ───────────────
echo "── Advertising ──"

if echo "$JS_FILES" | xargs grep -q "showFullscreenAdv\|showInterstitial\|interstitial" 2>/dev/null || grep -q "showFullscreenAdv\|showInterstitial\|interstitial" "$INDEX" 2>/dev/null; then
    echo "✅ Interstitial ads found"
    PASS=$((PASS+1))
else
    echo "⚠️ WARN: No interstitial ads (optional but expected)"
    WARN=$((WARN+1))
fi

if echo "$JS_FILES" | xargs grep -q "showRewardedVideo\|showRewarded\|rewarded" 2>/dev/null || grep -q "showRewardedVideo\|showRewarded\|rewarded" "$INDEX" 2>/dev/null; then
    echo "✅ Rewarded video found"
    PASS=$((PASS+1))
else
    echo "⚠️ WARN: No rewarded video (optional but expected)"
    WARN=$((WARN+1))
fi

echo ""

# ─────────────── Localization ───────────────
echo "── Localization ──"

LANGS=("ru" "en" "es" "tr" "pt" "ar" "id" "fr" "ja" "it" "de" "hi" "zh")
LANG_FOUND=0

for lang in "${LANGS[@]}"; do
    if echo "$JS_FILES" | xargs grep -qi "'$lang'" 2>/dev/null || grep -qi "'$lang'" "$INDEX" 2>/dev/null || echo "$JS_FILES" | xargs grep -qi "\"$lang\"" 2>/dev/null || grep -qi "\"$lang\"" "$INDEX" 2>/dev/null; then
        LANG_FOUND=$((LANG_FOUND+1))
    fi
done

if [ "$LANG_FOUND" -ge 13 ]; then
    echo "✅ All 13 languages found ($LANG_FOUND/13)"
    PASS=$((PASS+1))
elif [ "$LANG_FOUND" -ge 10 ]; then
    echo "⚠️ WARN: Only $LANG_FOUND/13 languages found — check missing ones"
    WARN=$((WARN+1))
else
    echo "❌ FAIL: Only $LANG_FOUND/13 languages found — moderation requires all 13"
    FAIL=$((FAIL+1))
fi

# i18n detection
if echo "$JS_FILES" | xargs grep -q "i18n.lang\|getLang\|detectLang\|environment.*lang" 2>/dev/null || grep -q "i18n.lang\|getLang\|detectLang\|environment.*lang" "$INDEX" 2>/dev/null; then
    echo "✅ SDK language detection found"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: No SDK language detection (ysdk.environment.i18n.lang)"
    FAIL=$((FAIL+1))
fi

echo ""

# ─────────────── Dangerous Patterns ───────────────
echo "── Dangerous Patterns ──"

for PATTERN in "alert(" "confirm(" "prompt(" "document.write("; do
    if [ -n "$JS_FILES" ]; then
        COUNT=$(echo "$JS_FILES" | xargs grep -n "$PATTERN" 2>/dev/null | wc -l)
    else
        COUNT=0
    fi
    INDEX_COUNT=$(grep -n "$PATTERN" "$INDEX" 2>/dev/null | grep -v "debugcheck\|cheats" | wc -l)
    TOTAL=$((COUNT + INDEX_COUNT))
    if [ "$TOTAL" -gt 0 ]; then
        echo "❌ FAIL: Found '$PATTERN' ($TOTAL occurrences) — blocks page!"
        FAIL=$((FAIL+1))
    fi
done

# debugger statements
if [ -n "$JS_FILES" ]; then
    DBG=$(echo "$JS_FILES" | xargs grep -n "^\s*debugger" 2>/dev/null | wc -l)
else
    DBG=0
fi
if [ "$DBG" -gt 0 ]; then
    echo "❌ FAIL: Found 'debugger' statements ($DBG)"
    FAIL=$((FAIL+1))
fi

# TODO/FIXME
if [ -n "$JS_FILES" ]; then
    TODO=$(echo "$JS_FILES" | xargs grep -n "TODO\|FIXME\|HACK\|XXX" 2>/dev/null | wc -l)
else
    TODO=0
fi
if [ "$TODO" -gt 0 ]; then
    echo "⚠️ WARN: Found $TODO TODO/FIXME/HACK markers"
    WARN=$((WARN+1))
fi

if [ "$FAIL" -eq 0 ] && [ "$WARN" -eq 0 ]; then
    echo "✅ No dangerous patterns"
    PASS=$((PASS+1))
fi

echo ""

# ─────────────── File System ───────────────
echo "── File System ──"

# index.html in root
if [ -f "$DIR/index.html" ]; then
    echo "✅ index.html in root"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: index.html NOT in root of $DIR"
    FAIL=$((FAIL+1))
fi

# Spaces in filenames
SPACES=$(find "$DIR" -name "* *" 2>/dev/null | wc -l)
if [ "$SPACES" -gt 0 ]; then
    echo "❌ FAIL: $SPACES files with spaces in names:"
    find "$DIR" -name "* *" 2>/dev/null | head -5
    FAIL=$((FAIL+1))
else
    echo "✅ No spaces in filenames"
    PASS=$((PASS+1))
fi

# Cyrillic in filenames
CYRILLIC=$(find "$DIR" 2>/dev/null | grep -P '[а-яА-ЯёЁ]' | grep -v "PIPELINE\|REPROCESS\|store-listing\|SETUP_GUIDE\|README" | wc -l)
if [ "$CYRILLIC" -gt 0 ]; then
    echo "❌ FAIL: $CYRILLIC files with Cyrillic names:"
    find "$DIR" 2>/dev/null | grep -P '[а-яА-ЯёЁ]' | grep -v "PIPELINE\|REPROCESS\|store-listing" | head -5
    FAIL=$((FAIL+1))
else
    echo "✅ No Cyrillic in filenames"
    PASS=$((PASS+1))
fi

# Size
SIZE_KB=$(du -sk "$DIR" 2>/dev/null | cut -f1)
SIZE_MB=$((SIZE_KB / 1024))
if [ "$SIZE_MB" -gt 100 ]; then
    echo "❌ FAIL: Size ${SIZE_MB}MB exceeds 100MB limit"
    FAIL=$((FAIL+1))
else
    echo "✅ Size: ${SIZE_MB}MB (limit: 100MB)"
    PASS=$((PASS+1))
fi

echo ""

# ─────────────── Mobile ───────────────
echo "── Mobile Compatibility ──"

# Viewport meta
if grep -q 'name="viewport"' "$INDEX" 2>/dev/null; then
    echo "✅ Viewport meta tag present"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: Missing viewport meta tag"
    FAIL=$((FAIL+1))
fi

# Context menu prevention
if echo "$JS_FILES" | xargs grep -q "contextmenu" 2>/dev/null || grep -q "contextmenu" "$INDEX" 2>/dev/null; then
    echo "✅ Context menu prevention found"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: No context menu prevention (right-click / long-press)"
    FAIL=$((FAIL+1))
fi

# Touch events
if echo "$JS_FILES" | xargs grep -q "touchstart\|touchmove\|touchend\|pointerdown" 2>/dev/null || grep -q "touchstart\|touchmove\|touchend\|pointerdown" "$INDEX" 2>/dev/null; then
    echo "✅ Touch event handlers found"
    PASS=$((PASS+1))
else
    echo "⚠️ WARN: No touch event handlers found"
    WARN=$((WARN+1))
fi

# Scroll prevention
if echo "$JS_FILES" | xargs grep -q "overscroll-behavior\|touch-action.*none\|preventDefault" 2>/dev/null || grep -q "overscroll-behavior\|touch-action.*none" "$INDEX" 2>/dev/null; then
    echo "✅ Scroll/overscroll prevention found"
    PASS=$((PASS+1))
else
    echo "⚠️ WARN: No overscroll-behavior or touch-action:none"
    WARN=$((WARN+1))
fi

echo ""

# ─────────────── Dev Mode ───────────────
echo "── Dev Mode ──"

if echo "$JS_FILES" | xargs grep -q "YaGames.*undefined\|typeof YaGames\|dev.mode\|dev mode\|Local dev" 2>/dev/null || grep -q "YaGames.*undefined\|typeof YaGames\|dev.mode\|dev mode\|Local dev" "$INDEX" 2>/dev/null; then
    echo "✅ Dev-mode fallback found"
    PASS=$((PASS+1))
else
    echo "❌ FAIL: No dev-mode — game won't work without SDK (file://)"
    FAIL=$((FAIL+1))
fi

echo ""

# ─────────────── Purchases ───────────────
echo "── Purchases ──"

HAS_PURCHASES=false
if echo "$JS_FILES" | xargs grep -q "purchase\|consumePurchase\|getPurchases" 2>/dev/null || grep -q "purchase\|consumePurchase\|getPurchases" "$INDEX" 2>/dev/null; then
    HAS_PURCHASES=true
fi

if $HAS_PURCHASES; then
    if echo "$JS_FILES" | xargs grep -q "consumePurchase" 2>/dev/null || grep -q "consumePurchase" "$INDEX" 2>/dev/null; then
        echo "✅ consumePurchase() found"
        PASS=$((PASS+1))
    else
        echo "❌ FAIL: Purchases exist but no consumePurchase() — will be rejected"
        FAIL=$((FAIL+1))
    fi

    if echo "$JS_FILES" | xargs grep -q "getPurchases" 2>/dev/null || grep -q "getPurchases" "$INDEX" 2>/dev/null; then
        echo "✅ getPurchases() (uncompleted check) found"
        PASS=$((PASS+1))
    else
        echo "❌ FAIL: No getPurchases() — uncompleted purchases won't be restored"
        FAIL=$((FAIL+1))
    fi
else
    echo "ℹ️ No purchases detected (OK if game doesn't use IAP)"
fi

echo ""

# ═══════════════ RESULT ═══════════════
echo "══════════════════════════════════════════"
echo "  RESULT: $PASS passed, $FAIL failed, $WARN warnings"
echo "══════════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
    echo "  ❌ NOT READY — fix $FAIL critical issues first"
    echo ""
    echo "  Run again after fixes: bash scripts/verify.sh $DIR"
    exit 1
elif [ "$WARN" -gt 2 ]; then
    echo "  ⚠️ REVIEW WARNINGS — $WARN warnings may cause rejection"
    exit 0
else
    echo "  ✅ READY for moderation"
    exit 0
fi
