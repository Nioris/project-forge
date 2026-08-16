---
name: release-all
kind: tactical
description: Release pipeline for ALL platforms. Supports TWO execution modes — Agent Teams (parallel, requires Opus 4.6+ and CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1) OR sequential (fallback). Use when user says "release all", "собери всё", "все платформы", "на все магазины".
---

# /release all

Выпустить проект на все целевые платформы.

## Этап 0 — опросить пользователя

Спроси через `ask_user_input_v0`:

> **На какие платформы собирать?** (multi-select)
> - ☐ Yandex Games
> - ☐ VK Mini Apps
> - ☐ Telegram Mini App
> - ☐ Одноклассники (OK)
> - ☐ MAX мессенджер
> - ☐ RuStore Android APK/AAB
> - ☐ Свой HTTPS-хостинг (VPS/PaaS)

> **Режим выполнения?** (single-select)
> - ☐ Agent Teams (параллельно, требует Opus 4.6+ и `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)
> - ☐ Sequential (по одной платформе, старый v4.2 workflow)

Если пользователь не выбрал режим явно — default **Sequential** (безопаснее).

## Этап 1 — Shared polish (один раз для всех)

Phase 1 из `/release yandex` — общая шлифовка ассетов/кода.
Результат остаётся в `WorkProgress/{Project}/` и копируется в платформо-специфичные копии.

Mandatory stop → отчёт → ждать "продолжи".

## Этап 2 — Split into per-platform copies

Для каждой выбранной платформы:
- Копируй `WorkProgress/{Project}/` → `WorkProgress/{Project}-<platform>/`
- Это обязательно: Telegram и MAX оба используют `window.WebApp`, без разделения — конфликт

## Этап 3A — Execution (Agent Teams режим)

Если пользователь выбрал Agent Teams:

1. **Создай команду** в явной форме. Пример запроса который ты должен проговорить:

   > "Create an agent team to release ProjectX for yandex, vk, telegram, max, ok, rustore, web, steam, vkplay platforms in parallel. Spawn teammates using subagent definitions: `yandex-builder`, `vk-builder`, `telegram-builder`, `max-builder`, `ok-builder`. Each teammate owns its `WorkProgress/ProjectX-{platform}/` directory. Coordinate through the shared task list. When a teammate finishes, they mark their task complete; when blocked, they post to mailbox.

   **Note:** Steam (Electron-based) и VK Play (iframe) добавлены в v4.7. Steam требует **отдельный workflow** (Electron wrap → SteamPipe upload), не parallel-friendly с web-bundle платформами; используй sequential mode для steam OR обработай его в отдельном Agent Team цикле. VK Play может выполняться parallel с другими iframe platforms (vk, ok)."

2. **Каждый teammate** — отдельная Claude Code сессия с собственным контекстом. Они читают `CLAUDE.md` + свой платформенный subagent-файл из `.claude/agents/`.

3. **Ты (lead) координируешь:**
   - Следишь за task list (`Ctrl+T` для просмотра)
   - Переключаешься между teammates через `Shift+Up`/`Shift+Down`
   - Разрешаешь конфликты если teammate'ы пишут в общий файл (чего не должно быть при правильной разбивке)
   - Синтезируешь финальный отчёт когда все задачи `done`

4. **Cleanup (обязательно):**
   - Скажи lead'у: "Ask all teammates to shut down, then clean up the team."
   - Делай это ПЕРЕД закрытием сессии — иначе останутся висящие teammate конфиги в `~/.claude/teams/`

### Известные ограничения Agent Teams (из официальной документации)

- `/resume` и `/rewind` **не восстанавливают** in-process teammate'ов — после resume может потребоваться пересоздать команду
- Task status иногда лагает — если задача «застряла», проверь реальный статус работы и обнови вручную
- Shutdown медленный — teammates завершают текущий tool call перед выходом
- One team per session — нельзя параллельно управлять двумя командами
- No nested teams — teammates не могут спавнить своих teammates
- **Delegate mode ломает права:** teammates наследуют permission-ограничения lead'а и перестают читать файлы. Не включай delegate mode без явной проверки на твоих permission-настройках.

## Этап 3B — Execution (Sequential режим, fallback)

Если Agent Teams не включены или пользователь выбрал Sequential:

Для каждой платформы по очереди:
1. Прочитай `.claude/skills/release-<platform>/SKILL.md`
2. Phase 2+3 для этой копии
3. Gate (pre-submit) → 0 blockers
4. Build → `Release/{Project}/<platform>/`
5. **Отчёт → mandatory stop → ждать "продолжи" → следующая**

## Этап 4 — Release summary

После всех сборок (в любом режиме) — сводная таблица в `Release/{Project}/RELEASE-SUMMARY.md`:

| Platform | Status | Artifacts | Next step |
|---|---|---|---|
| yandex | ✓ | 3 ZIPs + 13 store-listings | Upload to Yandex Games Console |
| vk | ✓ | bundle + manifest | Deploy via @vkontakte/vk-miniapps-deploy |
| telegram | ✓ | HTTPS bundle + bot-manifest | Deploy to Vercel + /setmenubutton |
| max | ✓ | HTTPS bundle | Register on business.max.ru/self |
| ok | skipped by user | | |
| rustore | ✓ | app-release.aab | Upload to RuStore console |
| web | ✓ | Dockerfile + nginx.conf | Deploy to VPS |
| steam | ✓ | Electron .exe + SteamPipe build | Upload via steamcmd, Set Live в Partner panel |
| vkplay | ✓ | HTTPS bundle + auth-server | Deploy to VPS, register URL в Game card |

## Non-Negotiable

- [ ] Phase 1 (polish) выполнен ОДИН раз, не повторяется для каждой платформы
- [ ] Каждая платформа — в своей копии `WorkProgress/{Project}-<platform>/`
- [ ] Gate каждой платформы чист (0 blockers)
- [ ] **Agent Teams:** cleanup выполнен (все teammates shut down, команда удалена)
- [ ] **Sequential:** отчёт + stop после каждой платформы (не вслепую)
- [ ] `RELEASE-SUMMARY.md` составлен
- [ ] Все задачи в `wiki/plan/` закрыты со `status: done`
- [ ] `wiki/changelog.md` + `wiki/deploy-log.md` обновлены

## Когда Agent Teams **не стоит** использовать

- Проект меньше 3 платформ — overhead от координации больше выгоды
- На платформе всего один validator / очень маленький pipeline — sequential быстрее
- У пользователя permissions заблокированы (teammates не смогут читать файлы)
- Нет Opus 4.6 или выше — Agent Teams требуют современный model tier
