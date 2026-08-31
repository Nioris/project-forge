---
name: phase-8-release
kind: architectural
description: "Фаза 8 — выпуск по явно выбранным storefront targets: проверяет target manifest, локальные кандидаты и external delivery boundary. До установленного target-specific verifier фаза…"
contract_version: 1
phases:
  - 8
modes:
  - phase
  - release
requires:
  - skill:forge-metrics
reads:
  - "**"
writes:
  - Release/**
  - forge.targets.json
  - forge.godot.export.json
  - qa/**
  - StoreData/**
  - SETUP_GUIDE.md
  - wiki/**
  - assets/**
verifiers: []
stop_points: []
risk_shell: write
risk_external: write
references:
  - references/platform-release-contracts.md
completion_contract: status/references/phase-contracts/phase-8.json
---
# $phase-8-release — target release contract

Фаза 8 выпускает **явно выбранные storefront targets**, а не «универсальный билд». Движок
и storefront — ортогональные оси: Web, Godot или будущий engine adapter производит кандидата;
target profile задаёт семейство артефакта, SDK/integrations, доставку и внешние условия.
Полный договор: [Platform release contracts](references/platform-release-contracts.md).

## Phase state marker

На входе зафиксируй состояние:

```bash
node .claude/skills/status/references/phase-state.mjs start 8
```

Marker и legacy Phase-8 ZIP evidence — только дополнительная историческая совместимость. Они не
угадывают target, не доказывают готовность другого магазина и не заменяют target verifier.
Не вызывай `complete`, не имея submit-level доказательств по каждому выбранному target,
проверенных установленным target-specific external verifier. Локальная квитанция, HMAC, URL или
ручное поле `submit-ready` не являются такой проверкой.

## 1. Обязательный выбор targets

В корне проекта **обязателен** `forge.targets.json`:

```json
{
  "schemaVersion": 1,
  "kind": "forge.target-selection",
  "targets": ["yandex", "steam"]
}
```

IDs берутся только из установленного `adapters/platform-profiles.json`; не выводи targets из
папок `Release/`, названия игры или привычного «Yandex-first» маршрута. До любой сборки проверь
manifest через `node scripts/platform-profile.mjs check <project-root>`. Отсутствующий, пустой,
неизвестный или дублированный target — blocker, а не повод выбрать default.

Для каждого profile сначала сверяй `compatibleEngines`, `artifactFamily`, `artifactFormat`,
`delivery`, `requiredIntegrations`, `externalPrerequisites`, `officialDocs` и `adapterStatus`.
`partial`/`planned` не обещают автоматической сборки или подачи: выполни только существующий
target adapter либо оставь конкретный blocker с владельцем/недостающим внешним условием.

## 2. Локальный выпуск (local-verified)

Сначала создай одну неизменяемую базовую версию для всех требуемых профилями семейств артефактов.
Затем local-координатор создаст отсутствующий отдельный candidate и
`forge.platform-release-receipt` для каждого target. Receipt привязывает target, версию, engine,
source snapshot, SHA-256/размер кандидата, integrations, delivery, readiness и blockers. Все
выбранные targets должны иметь одну актуальную версию; retained старые версии не являются
доказательством текущего выпуска.

После базовой сборки запусти:

```bash
node scripts/build-all-platforms.mjs <project-root> --level local --json
```

Если storefront-матрицы текущей версии ещё нет, команда выбирает один latest coherent base set и
вызывает канонический упаковщик. Она не угадывает slug, не смешивает source snapshots и не
перезаписывает существующую версию; stale/incomplete matrix требует новой версии. `local` доказывает
целостность кандидата, актуальность исходников, совпадение engine/family/format с registry и по одному
receipt для каждого target. Он **не** доказывает upload, HTTPS deployment,
аккаунт, app/bot ID, signing enrollment, credentials или модерацию. В этом состоянии допустим
`external-blocked`, но blockers должны быть непустыми, конкретными и отражёнными в receipt/wiki.

Yandex может требовать свой production/debug/marketing ZIP trio и `release-yandex` verifier;
это правило исключительно Yandex route. APK/AAB, hosted URL, SteamPipe depot, VK Play distribution
и Windows archive не подменяются этим trio.

## 3. Подача (submit-ready) и обязательный STOP

Подача отделена от локальной сборки. После реальной target-specific delivery и всех требуемых
external evidence обнови receipt честными фактами и проверь:

```bash
node scripts/build-all-platforms.mjs <project-root> --level submit --json
```

`submit` ничего не упаковывает и не загружает. Пока для target не установлен его
**target-specific external verifier/uploader adapter**, submit-level verifier намеренно возвращает
`PLATFORM_RELEASE_TRUST_ADAPTER_UNAVAILABLE`. Это обязательный STOP Phase 8: локальный
адаптер реализован только для создания и проверки кандидата, не для подтверждения внешней delivery.

Когда такой verifier установлен, он обязан сам подтвердить target-appropriate факты: hosted target —
реальный HTTPS deployment, Android — production signature/certificate hash и console/upload,
Windows — uploader/store receipt. Он также требует `readiness: submit-ready` (или `published`),
verified delivery, пустой список blockers и `passed` для всех registry-required integrations.
Generic HMAC, локальный receipt, URL или строка `delivery.evidence` не обладают authority и не могут
снять STOP. Android Debug certificate — blocker. До реальной внешней подготовки и verifier PASS
receipt остаётся `external-blocked`, а Phase 8 не завершается.

`published` разрешено заявлять только по неизменяемому receipt платформы/консоли. `submit-ready`
не означает approval модерации.

## Engine lanes

`phase-state.mjs start 8` reads the root `forge.engine.json` and records `engineRuntime`; continue
only when its `releaseExport` capability is available. Engine capability определяет только способ получить и доказать кандидат. При Godot GDScript перед
релизом прочитай [Godot native contract](../godot-engine/references/godot-test-release.md): его
playtest/export receipt обязателен для native lane, но Windows export сам по себе не выбирает Steam,
VK Play или любой другой storefront. Unsupported engine capability — infrastructure blocker; browser
evidence нельзя выдавать за native evidence и наоборот.

## Provenance, security and closeout

- Generated assets: prompt/provenance + review либо явно sourced; secrets, debug dumps и private refs
  не входят в кандидат.
- Открытые Critical/Major из visual QA и реальные security findings блокируют **затронутый** submit.
- `$forge-metrics`: неизвестная provider/store стоимость остаётся `unknown`, не `$0` и не FAIL.
- В `wiki/deploy-log.md`/release task запиши exact verifier result, target, version, receipt path,
  readiness и каждый внешний blocker/owner. Не заменяй вывод проверок заявлением агента.

После `submit` PASS для полного manifest и выполнения phase completion contract заверши marker:

```bash
node .claude/skills/status/references/phase-state.mjs complete 8 wiki/deploy-log.md SETUP_GUIDE.md
```

Следующая фаза: `$phase-9-live`.
