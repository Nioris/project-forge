#!/bin/bash
# Yandex Games — Скрипт сборки релизного ZIP-архива
# Использование: ./scripts/build-release.sh [game-name] [version]
# Пример: ./scripts/build-release.sh my-game 1.0.0

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
GAME_DIR="$PROJECT_DIR/GameIntegration"
RELEASE_DIR="$PROJECT_DIR/Release"

GAME_NAME="${1:-game}"
VERSION="${2:-0.0.0.1}"

echo "=========================================="
echo " Yandex Games — Сборка релиза"
echo "=========================================="
echo "Игра: $GAME_NAME"
echo "Версия: $VERSION"
echo "Исходная папка: $GAME_DIR"
echo ""

# ==================== ПРОВЕРКИ ====================

ERRORS=0

# 1. Проверить наличие index.html в корне
if [ ! -f "$GAME_DIR/index.html" ]; then
    echo "[ОШИБКА] index.html не найден в корне GameIntegration/"
    ERRORS=$((ERRORS + 1))
fi

# 2. Проверить пробелы в именах файлов
FILES_WITH_SPACES=$(find "$GAME_DIR" -name "* *" 2>/dev/null || true)
if [ -n "$FILES_WITH_SPACES" ]; then
    echo "[ОШИБКА] Файлы с пробелами в именах:"
    echo "$FILES_WITH_SPACES"
    ERRORS=$((ERRORS + 1))
fi

# 3. Проверить кириллицу в именах файлов
FILES_WITH_CYRILLIC=$(find "$GAME_DIR" -regex '.*[а-яА-ЯёЁ].*' 2>/dev/null || true)
if [ -n "$FILES_WITH_CYRILLIC" ]; then
    echo "[ОШИБКА] Файлы с кириллицей в именах:"
    echo "$FILES_WITH_CYRILLIC"
    ERRORS=$((ERRORS + 1))
fi

# 4. Проверить размер (< 100 МБ)
TOTAL_SIZE=$(du -sb "$GAME_DIR" | cut -f1)
MAX_SIZE=$((100 * 1024 * 1024))
if [ "$TOTAL_SIZE" -gt "$MAX_SIZE" ]; then
    SIZE_MB=$((TOTAL_SIZE / 1024 / 1024))
    echo "[ОШИБКА] Размер $SIZE_MB МБ превышает лимит 100 МБ"
    ERRORS=$((ERRORS + 1))
fi

# 5. Проверить наличие SDK подключения
if [ -f "$GAME_DIR/index.html" ]; then
    if ! grep -q "sdk.js" "$GAME_DIR/index.html"; then
        echo "[ПРЕДУПРЕЖДЕНИЕ] sdk.js не найден в index.html"
    fi
fi

# Если есть критические ошибки — остановить
if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "[СБОРКА ОСТАНОВЛЕНА] Найдено ошибок: $ERRORS"
    exit 1
fi

# ==================== СБОРКА ====================

echo "[OK] Все проверки пройдены"
echo ""

# Создать папку Release если не существует
mkdir -p "$RELEASE_DIR"

# Имя архива
ARCHIVE_NAME="${GAME_NAME}-v${VERSION}.zip"
ARCHIVE_PATH="$RELEASE_DIR/$ARCHIVE_NAME"

# Удалить старый архив если существует
if [ -f "$ARCHIVE_PATH" ]; then
    echo "[INFO] Перезаписываю существующий архив: $ARCHIVE_NAME"
    rm "$ARCHIVE_PATH"
fi

# Создать ZIP-архив (из папки GameIntegration, index.html в корне архива)
cd "$GAME_DIR"
zip -r "$ARCHIVE_PATH" . -x "*.DS_Store" -x "__MACOSX/*" -x "*.git*"

# ==================== ОТЧЁТ ====================

ARCHIVE_SIZE=$(du -sh "$ARCHIVE_PATH" | cut -f1)
TOTAL_FILES=$(find "$GAME_DIR" -type f | wc -l)
UNCOMPRESSED_SIZE=$(du -sh "$GAME_DIR" | cut -f1)

echo ""
echo "=========================================="
echo " Сборка завершена!"
echo "=========================================="
echo "Архив: $ARCHIVE_PATH"
echo "Размер архива: $ARCHIVE_SIZE"
echo "Размер без сжатия: $UNCOMPRESSED_SIZE"
echo "Файлов: $TOTAL_FILES"
echo "Версия: $VERSION"
echo ""
echo "Следующие шаги:"
echo "1. Загрузить $ARCHIVE_NAME в Yandex Games Console"
echo "2. Заполнить драфт (название, описание, иконка, скриншоты)"
echo "3. Отправить на модерацию (3-5 рабочих дней)"
echo "=========================================="
