---
name: rustore-publish
kind: tactical
description: "Prepare for RuStore: listing, keystore, AAB, API key, server receipt validation, IAP, moderation — full pipeline. Also ships anonymous auth + E2E cloud sync pattern…"
---

# RuStore Publication

Полный пайплайн публикации Android-приложения в RuStore от чистой папки до релиза, **плюс** универсальные паттерны для анонимной авторизации + E2E-шифрованной cloud sync (применимы к любому приложению, не только RuStore).

**Использовать:** как чек-лист при публикации любого приложения в RuStore. Для каждого нового проекта создавать проектный `wiki/rustore-publishing-playbook.md`, который содержит только несекретные значения (Application ID, SKU, certificate fingerprint). Keystore и пароли создаёт Forge во внешнем security vault.

---

## Документы в этом skill'е

- **[PLAYBOOK.md](PLAYBOOK.md)** — 13 пронумерованных шагов публикации (основной flow)
- **[PAYMENTS.md](PAYMENTS.md)** — интеграция Pay SDK 10.2 / BOM 2026.04.01, JWE-флоу валидации, retry для pending purchases, cloud-sync starter bonus (retention hook)
- **[AUTH-SYNC.md](AUTH-SYNC.md)** — **универсальный паттерн** анонимной auth + E2E cloud sync с 5-словной фразой для restore между устройствами. 152-ФЗ compliant (нет PII). Применим к любому приложению с пользовательскими данными — не только RuStore. Если проект не для RuStore, но нужен anon auth — смотри skill [`anon-auth-sync`](../anon-auth-sync/SKILL.md).

---

## Полная инструкция → [PLAYBOOK.md](PLAYBOOK.md)

13 пронумерованных шагов:

0. Предпосылки (юрлицо, РКН, роли)
1. Подготовка репозитория (.gitignore, privacy.html)
2. Карточка приложения (ASO, теги, FAQ, категории данных)
3. Визуальные артефакты (иконка, скриншоты, promo graphic)
4. Release keystore + PEPK (если нужна Google Play)
5. Первая сборка AAB (без Pay SDK — для получения Application ID)
6. Создание черновика в Консоли
7. IAP-продукты
8. API-ключ для валидации receipts (Компания → API RuStore)
9. Серверная интеграция (JWE-флоу, env, smoke-тест)
10. Финальная сборка с Pay SDK
11. Тестирование через тестировщиков
12. Отправка на модерацию
13. После релиза (мониторинг, патчи)

---

## Минимальный набор артефактов (быстрая проверка)

Создать в проекте:
```
StoreData/
  icon-512.png               — 512×512, без прозрачности, без текста
  screenshots/               — 4–8 шт, 1080×1920 минимум
  feature-graphic.png        — 1024×500 (опционально)
  RUSTORE_LISTING.md         — карточка по PLAYBOOK.md § 2
  IAP_PRODUCTS.md            — SKU-и (если есть покупки)
  signing-public.md          — только package ID, alias и certificate fingerprints

public/privacy.html          — 152-ФЗ-совместимая политика
```

---

## Non-Negotiable

- [ ] AAB подписан **release keystore** (не debug)
- [ ] Иконка 512×512 **без прозрачности и текста**
- [ ] Короткое описание **≤ 80 симв.**, без «лучший/самый/номер 1»
- [ ] Privacy URL **доступен без VPN** (проверить через check-host.net)
- [ ] Теги — **только ID** из [официального справочника](https://www.rustore.ru/help/work-with-rustore-api/api-upload-publication-app/app-tag-list)
- [ ] Категория приложения — **только** из 20 официальных (нет «Здоровье и фитнес», «Lifestyle», «Productivity»)
- [ ] Чувствительные разрешения — пояснение для **каждого** sensitive permission
- [ ] Запрашиваемые данные — Да/Нет для **каждого** пункта [официального справочника](https://www.rustore.ru/help/developers/publishing-and-verifying-apps/app-publication/new-version-app/declare-app-permissions/data-categories)
- [ ] Для health/finance/legal — явный дисклеймер «не медицинское / не финансовая консультация»
- [ ] Forge security vault экспортирован в пользовательскую зашифрованную резервную копию **до** первой загрузки
- [ ] В проекте отсутствуют keystore, private key, пароли и `SIGNING_CREDENTIALS.md`

---

## Связанные скиллы

- `fill-rustore` — генерация RUSTORE_LISTING.md с ASO
- `credentials-check` — проверка всех credentials перед сборкой
- `build-apk` — сборка APK/AAB
- `store-listing` — SEO-описания для stores
- `promo-screens` — генерация промо-скриншотов
- `art-prompts` — иконка и feature graphic

---

## Официальные источники RuStore (быстрая ссылка)

Все ссылки из PLAYBOOK.md § «Официальные источники» — там полный список с группировкой по разделам (публикация, управление, API, SDK).
