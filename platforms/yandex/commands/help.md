---
description: "Показать список команд. Используй когда пользователь просит напомнить команды, помощь, help, что умеешь, список команд."
---

# Команды YBuilderIntegrator

## Структура папок
```
GameIntegration/          ← сюда кладёшь сырую игру
WorkProgress/{GameName}/  ← рабочая копия, ВСЯ работа тут
Release/{GameName}/       ← только готовые билды (3 ZIP)
```

## Новая игра — полный цикл
```
/full-pipeline          — все 3 фазы с остановками
/full-pipeline phase1   — только улучшение игры
/full-pipeline phase2   — только SDK + локализация
/full-pipeline phase3   — только тестирование + сборка
/full-pipeline resume   — продолжить с места остановки
```

## Локализация
```
/localize               — пошаговая локализация на 13 языков
```

## Тестирование и проверка
```
/test-game              — полный тест перед модерацией
/analyze-game           — анализ новой игры перед интеграцией
```

## Модерация
```
/fix-moderation         — разобрать замечания Яндекса и исправить
```

## Старые игры
```
/reprocess {GameName}   — перепрогнать через новые стандарты
/reprocess list         — показать все игры в Release/
/reprocess all          — перепрогнать все игры
```

## Скрипты (запускай вручную или через команды)
```
bash scripts/verify.sh WorkProgress/{GameName}/          — проверка синтаксиса + SDK + структуры
node scripts/verify-i18n.mjs WorkProgress/{GameName}/    — проверка локализации
node scripts/smoke-test.mjs WorkProgress/{GameName}/     — запуск игры + ловля runtime ошибок
```

## 3 типа билдов (Phase 3)
- **Production** — чистый, на модерацию
- **Debug** — + debugcheck.js (Ctrl+Shift+2 × 3)
- **Marketing** — + cheats.js (Ctrl+Shift+9, P=пауза, L=язык) для скриншотов через YG скриншотер
