---
name: port
kind: architectural
description: "Адаптировать игру к явно выбранному storefront target через platform registry: target-specific SDK/обёртка/доставка без ложных обещаний общей упаковки. Триггеры: порт…"
---

# $port <target> — target-specific адаптация

Порт — не «пересобрать тот же ZIP». Target выбирается явно и должен быть зарегистрирован в
`adapters/platform-profiles.json`; проект обязан перечислять его в `forge.targets.json`.
Перед работой прочитай [storefront contract](../../../docs/PLATFORM-RELEASE-CONTRACTS.md) и проверь:

```bash
node scripts/platform-profile.mjs check <project-root>
```

Аргумента нет — спроси target. Не угадывай default/Yandex-first маршрут. Если target ещё не
выбран в manifest, это изменение release scope: запроси/зафиксируй решение пользователя, затем
валидируй manifest. Unknown или duplicate ID — blocker.

## Контракт порта

1. Profile — единственный источник требований: `compatibleEngines`, `artifactFamily`,
   `artifactFormat`, `delivery`, required integrations, external prerequisites, official docs и
   `adapterStatus`. Перед портом сверяй актуальные platform facts с linked primary docs.
2. Engine и storefront независимы. Godot/HTML/следующий adapter может быть совместим с target,
   но должен произвести его формат и engine-owned evidence; Windows export сам не делает Steam
   или VK Play submit-ready, а Web ZIP сам не делает Android/native release.
3. Меняй только target adapter, delivery setup, listing и нужный SDK boundary. Игровая логика,
   баланс и контент не меняются. Если требование магазина требует gameplay change, остановись:
   это пользовательское product decision, не «обычный порт».
4. Создай candidate в `Release/{Project}/{releasePathSegment}/` и валидный
   `forge.platform-release-receipt`, связанный с тем же release version, engine и source snapshot,
   что у остальных targets. Не копируй Yandex production/debug/marketing trio в другие targets:
   это специфичный Yandex route.

## Проверка и внешняя граница

После сборки запусти полный matrix check, а не проверку одной папки:

```bash
node scripts/check-platform-release.mjs <project-root> --level local --json
```

`local` подтверждает candidate/receipt/source/profile consistency. Внешние элементы — developer
account, app/bot/project ID, signing enrollment/key, HTTPS deployment, uploader credentials/receipt
и console state — не фабрикуются. Пока их нет, receipt остаётся `external-blocked` с точными
blockers и владельцем действия в `wiki/ports/<target>.md`.

Только после реальной delivery, passed required integrations и снятых blockers разрешён:

```bash
node scripts/check-platform-release.mjs <project-root> --level submit --json
```

Submit PASS возможен только через установленный target-specific external verifier/uploader adapter.
До его появления canonical verifier возвращает `PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE`;
это Phase 8 STOP, даже если локальный candidate идеален. Generic HMAC, локальная квитанция,
ручная правка receipt, свободная строка evidence или URL не имеют authority. Реальный verifier
проверяет target-appropriate proof: HTTPS deployment для hosted Web, production signing + console/
upload и совпадающий фактический SHA-256 сертификата для Android, uploader/store receipt для Windows.
Submit PASS — готовность к передаче в выбранный storefront, не доказательство публикации или
одобрения модерацией. `adapterStatus: partial`/`planned` означает, что автоматизация может не
существовать: не имитируй builder, а оформи ограничение как infrastructure/external blocker.

## Запись результата

В `wiki/ports/<target>.md` укажи: profile/version, engine, изменённые adapter boundaries,
деградации, candidate и receipt paths, local verifier output, внешние blockers/owners и submit
result. Переход к следующему target не меняет уже выбранные артефакты и не отменяет их проверки.
