---
name: release-all
kind: tactical
description: "Release pipeline for every explicitly selected storefront target. Uses the installed platform registry and per-project target manifest; local build and submission evidence are separate."
---

# /release-all — выпуск матрицы targets

«Все платформы» не означает предустановленный список и не означает одинаковые ZIP-файлы. Сначала
получи от пользователя список storefront targets, затем зафиксируй его в обязательном
`forge.targets.json`. Допустимые IDs и их требования читает установленный registry:

```bash
node scripts/platform-profile.mjs list
node scripts/platform-profile.mjs check <project-root>
```

Не добавляй target по аналогии и не угадывай его из старых `Release/` каталогов. Изменение targets
после начала выпуска — изменение release scope: обнови manifest, журнал и проверяй всю новую матрицу.

## Порядок работы

1. Прочитай profile каждого выбранного target: engine compatibility, artifact family/format, delivery,
   integrations, prerequisites, documentation и adapter status.
2. Выполни общий polish один раз в исходном `WorkProgress/{Project}/`; не копируй и не меняй
   gameplay для обхода target checks. Нужная platform-specific обёртка/SDK — отдельный адаптер.
3. Создай одну неизменяемую базовую версию для всех требуемых профилями artifact families. Один
   version и source snapshot должны связывать Web/Android/Windows manifests.
4. Создай отсутствующие target candidates/receipts и проверь всю матрицу локально:

   ```bash
   node scripts/build-all-platforms.mjs <project-root> --level local --json
   ```

   Координатор читает только `forge.targets.json`, не угадывает slug и не перезаписывает уже
   существующую storefront-версию. Yandex production/debug/marketing trio создаётся только если
   выбран Yandex; он не является артефактом VK/Telegram/Android/Steam/VK Play.

5. Составь отчёт по каждому target. `local-verified` означает только корректный актуальный кандидат;
   external account, signing, hosting, IDs и uploader receipt могут честно оставаться
   `external-blocked` с конкретными blockers.
6. Для target, который действительно готовят к подаче, выполни его delivery/external prerequisites
   и затем проверь всю выбранную матрицу:

   ```bash
   node scripts/build-all-platforms.mjs <project-root> --level submit --json
   ```

   Команда submit ничего не упаковывает и не загружает. Пока для target не установлен
   target-specific external verifier/uploader adapter, она возвращает
   `PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE`: это честный STOP, а не повод заполнять
   `submit-ready` вручную. Generic HMAC, локальный receipt и URL не доказывают delivery.
   После установки verifier PASS требует verified delivery, passed required integrations, no blockers
   и фактически проверенные target-specific доказательства: HTTPS deployment для hosted Web,
   production signing + console/upload для Android, uploader/store receipt для Windows. Не называй
   external-blocked выпуск «готовым к подаче».

## Роли и движки

Platform builders могут работать параллельно только в непересекающихся workspaces/release paths.
Они не меняют manifest и не утверждают PASS; финальный matrix verifier делает оркестратор.
`web` и `godot` — engine choices, а не storefront targets: используй только profile-compatible engine
и его нативные доказательства. Отсутствующая capability/adapter или внешняя учётная запись — blocker,
не разрешение подменить формат или заявить публикацию.

## Сводка

Создай `Release/{Project}/RELEASE-SUMMARY.md` с одной строкой на выбранный target:

| Target | Engine | Candidate / receipt | Local | External blockers | Submit |
|---|---|---|---|---|---|
| registry target id | actual engine | paths | PASS/FAIL | exact facts or none | PASS/blocked |

Отдельно укажи version и exact output обоих verifier levels. При unavailable external verifier
зафиксируй Phase 8 STOP и владельца внешней delivery. `published` только подтверждается immutable
platform receipt; moderation approval никогда не выводится из локального или submit PASS.
