#!/bin/bash
# Yandex Games — Скрипт анализа игры в GameIntegration/
# Использование: ./scripts/analyze-game.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GAME_DIR="$PROJECT_DIR/GameIntegration"

echo "=========================================="
echo " Yandex Games — Анализ игры"
echo "=========================================="
echo ""

# ==================== ТИП ИГРЫ ====================

echo "--- Определение типа игры ---"

IS_UNITY=false
IS_HTML5=false

# Unity WebGL: наличие .wasm, .data, UnityLoader
if find "$GAME_DIR" -name "*.wasm" -o -name "*.data" -o -name "UnityLoader.js" -o -name "*.framework.js" 2>/dev/null | head -1 | grep -q .; then
    IS_UNITY=true
    echo "[UNITY] Обнаружена Unity WebGL сборка"
    echo "  Build файлы:"
    find "$GAME_DIR" -name "*.wasm" -o -name "*.data" -o -name "*.framework.js" -o -name "*.loader.js" 2>/dev/null | while read f; do
        SIZE=$(du -sh "$f" | cut -f1)
        echo "    $(basename "$f") ($SIZE)"
    done
fi

# HTML5: наличие JS/CSS файлов без Unity маркеров
if [ -f "$GAME_DIR/index.html" ] && [ "$IS_UNITY" = false ]; then
    IS_HTML5=true
    echo "[HTML5] Обнаружена HTML5 игра"
fi

if [ "$IS_UNITY" = false ] && [ "$IS_HTML5" = false ]; then
    echo "[???] Тип игры не определён"
    echo "  Убедитесь что файлы игры находятся в GameIntegration/"
fi

echo ""

# ==================== СТРУКТУРА ФАЙЛОВ ====================

echo "--- Структура файлов ---"
echo "Корневой index.html: $([ -f "$GAME_DIR/index.html" ] && echo "ЕСТЬ" || echo "ОТСУТСТВУЕТ")"
echo ""
echo "Файлы по типам:"
echo "  HTML: $(find "$GAME_DIR" -name "*.html" | wc -l)"
echo "  JS:   $(find "$GAME_DIR" -name "*.js" | wc -l)"
echo "  CSS:  $(find "$GAME_DIR" -name "*.css" | wc -l)"
echo "  JSON: $(find "$GAME_DIR" -name "*.json" | wc -l)"
echo "  Изображения: $(find "$GAME_DIR" \( -name "*.png" -o -name "*.jpg" -o -name "*.jpeg" -o -name "*.gif" -o -name "*.svg" -o -name "*.webp" \) | wc -l)"
echo "  Аудио: $(find "$GAME_DIR" \( -name "*.mp3" -o -name "*.ogg" -o -name "*.wav" -o -name "*.m4a" \) | wc -l)"
echo "  Шрифты: $(find "$GAME_DIR" \( -name "*.woff" -o -name "*.woff2" -o -name "*.ttf" -o -name "*.otf" \) | wc -l)"
echo ""

# ==================== РАЗМЕР ====================

echo "--- Размер ---"
TOTAL_SIZE=$(du -sh "$GAME_DIR" | cut -f1)
TOTAL_BYTES=$(du -sb "$GAME_DIR" | cut -f1)
MAX_BYTES=$((100 * 1024 * 1024))
echo "Общий размер: $TOTAL_SIZE"
if [ "$TOTAL_BYTES" -gt "$MAX_BYTES" ]; then
    echo "[ОШИБКА] Превышает лимит 100 МБ!"
else
    echo "[OK] В пределах лимита 100 МБ"
fi
echo ""

# ==================== ПРОВЕРКИ ИМЁН ФАЙЛОВ ====================

echo "--- Проверка имён файлов ---"

SPACES=$(find "$GAME_DIR" -name "* *" 2>/dev/null | wc -l)
if [ "$SPACES" -gt 0 ]; then
    echo "[ОШИБКА] Файлов с пробелами: $SPACES"
    find "$GAME_DIR" -name "* *" 2>/dev/null | head -5
else
    echo "[OK] Нет пробелов в именах"
fi

CYRILLIC=$(find "$GAME_DIR" -regex '.*[а-яА-ЯёЁ].*' 2>/dev/null | wc -l)
if [ "$CYRILLIC" -gt 0 ]; then
    echo "[ОШИБКА] Файлов с кириллицей: $CYRILLIC"
    find "$GAME_DIR" -regex '.*[а-яА-ЯёЁ].*' 2>/dev/null | head -5
else
    echo "[OK] Нет кириллицы в именах"
fi
echo ""

# ==================== SDK ИНТЕГРАЦИЯ ====================

echo "--- SDK интеграция ---"

if [ -f "$GAME_DIR/index.html" ]; then
    if grep -q "sdk.js" "$GAME_DIR/index.html"; then
        echo "[OK] sdk.js подключён в index.html"
    else
        echo "[НУЖНО] Подключить sdk.js в index.html"
    fi

    if grep -q "YaGames.init" "$GAME_DIR/index.html" || find "$GAME_DIR" -name "*.js" -exec grep -l "YaGames.init" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo "[OK] YaGames.init() найден"
    else
        echo "[НУЖНО] Добавить YaGames.init()"
    fi

    if find "$GAME_DIR" -name "*.js" -exec grep -l "LoadingAPI" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo "[OK] LoadingAPI.ready() найден"
    else
        echo "[НУЖНО] Добавить LoadingAPI.ready()"
    fi

    if find "$GAME_DIR" -name "*.js" -exec grep -l "GameplayAPI" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo "[OK] GameplayAPI найден"
    else
        echo "[НУЖНО] Добавить GameplayAPI.start()/stop()"
    fi

    if find "$GAME_DIR" -name "*.js" -exec grep -l "showFullscreenAdv\|showRewardedVideo" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo "[OK] Реклама интегрирована"
    else
        echo "[НУЖНО] Интегрировать рекламу"
    fi

    if find "$GAME_DIR" -name "*.js" -exec grep -l "game_api_pause\|game_api_resume" {} \; 2>/dev/null | head -1 | grep -q .; then
        echo "[OK] События паузы/возобновления обрабатываются"
    else
        echo "[НУЖНО] Добавить обработку game_api_pause/resume"
    fi
fi
echo ""

# ==================== LOCALSTORAGE ====================

echo "--- localStorage (нужна замена на player.setData) ---"
LOCALSTORAGE_COUNT=$(find "$GAME_DIR" -name "*.js" -exec grep -c "localStorage" {} \; 2>/dev/null | awk '{s+=$1} END {print s+0}')
if [ "$LOCALSTORAGE_COUNT" -gt 0 ]; then
    echo "[НУЖНО] Найдено $LOCALSTORAGE_COUNT использований localStorage"
    echo "  Файлы:"
    find "$GAME_DIR" -name "*.js" -exec grep -l "localStorage" {} \; 2>/dev/null | head -5
else
    echo "[OK] localStorage не используется"
fi
echo ""

# ==================== ИТОГ ====================

echo "=========================================="
echo " Анализ завершён"
echo "=========================================="
echo ""
echo "Тип: $([ "$IS_UNITY" = true ] && echo "Unity WebGL" || ([ "$IS_HTML5" = true ] && echo "HTML5" || echo "Не определён"))"
echo "Размер: $TOTAL_SIZE"
echo ""
echo "Следующие шаги: см. docs/INTEGRATION_GUIDE.md"
echo "Чеклист: см. docs/CHECKLIST.md"
