# wiki/research/

Сюда `/research-references` кладёт результаты изучения конкурентов и аналогов для каждого проекта.

## Формат

Один файл на проект: `{Project}-references.md`. Генерируется автоматически при вызове `/new-project`, `/analyze-project` или `/analyze-game` — в Phase 0 они зовут `research-references` до того как планировать.

## Содержимое файла

- **Competitor landscape** — 3-5 реальных конкурентов с ссылками (из web_search, не из памяти)
- **Extracted patterns** — core loop, table-stakes, differentiation opportunities, anti-features
- **UI / UX references** — ссылки из image_search (если проект визуальный)
- **Russian-market specifics** — Яндекс/VK/Telegram/OK/MAX специфика где применимо
- **Open questions** — то что Claude не смог определить, требует решения пользователя

## Использование

После создания research-документа Claude:
1. Показывает пользователю one-screen summary в чате
2. Ждёт подтверждения направления
3. Передаёт research-данные в `/plan` для построения `wiki/plan/{Project}.md`
4. Передаёт UI direction в `frontend-design` skill (если он установлен) для визуальной работы

## Не храни тут

- Скачанные скриншоты / видео — place в `wiki/research/assets/{Project}/` если действительно нужно
- Финальный дизайн — это в `wiki/architecture/` или в самих файлах проекта
- Планы разработки — это в `wiki/plan/`
