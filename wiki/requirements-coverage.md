# Yandex Games — requirements coverage map

**Source of truth.** Every Yandex requirement (doc last-changed **2026-07-01**) mapped to how Forge
verifies it. Status legend:
- **AUTO** — a Forge check fails the release if violated (debugcheck / validator / runtime probe).
- **MANUAL** — cannot be proven statically; surfaced in `/release-ready` as a manual-check item.
- **N/A-policy** — not applicable under our fixed policy (ads-only, no IAP, no auth, RU/web).

Keep this current: when a check is added/removed, update the row. `/audit-requirements` checks whether
the Yandex page changed since the baseline; THIS file checks whether Forge covers what's on it.

## 1. Технические

| # | Требование | Status | How |
|---|---|---|---|
| 1.1 | SDK встроен | AUTO | debugcheck SDK tag + YaGames.init |
| 1.2 | Без сторонней авторизации; Яндекс ID опционально | AUTO/N/A | no third-party auth; we don't add auth |
| 1.2.1/1.2.2 | Авторизация по клику; гостевой вход | N/A-policy | no auth flow added |
| 1.3 | Звук стоп при сворачивании | AUTO | debugcheck visibilitychange + AudioContext suspend |
| 1.4 | Платежи только через SDK | N/A-policy | no IAP |
| 1.5 | (Упразднён 07.2026, слит в 4.1) | N/A | see 4.1 |
| 1.6.1.1 | Мобайл: полноэкранный режим | **AUTO (new v4.21)** | debugcheck: requestFullscreen OR fullscreen meta/CSS |
| 1.6.1.2 | Клавиатура на тап по input | AUTO | debugcheck keyboard check (v2.11) |
| 1.6.1.3 | Не деформируется при повороте/ресайзе | AUTO | debugcheck v2.12 + runtime Probe F/resize |
| 1.6.1.5 | Полное управление жестами | MANUAL | gameplay-level; manual on touch device |
| 1.6.1.6 | Нет системного плеера (мобайл) | AUTO | debugcheck v2.13 music-via-WebAudio |
| 1.6.1.7 | Нет WebGL-уведомления | AUTO | debugcheck WebGL-notice |
| 1.6.1.8 | Лонгтап не выделяет/контекст-меню | AUTO | debugcheck contextmenu + selection disabled |
| 1.6.2.1 | Десктоп: поле растягивается до края | AUTO | debugcheck 1.6.2.1 |
| 1.6.2.2 | Десктоп: длинная сторона ≤ 2× короткой | **AUTO (new v4.21)** | runtime Probe F: canvas aspect ≤ 2:1 |
| 1.6.2.3 | Десктоп: не деформируется при ресайзе | AUTO | shares debugcheck v2.12 canvas-resize |
| 1.6.2.4 | Десктоп: мышь/клавиатура по умолчанию | MANUAL | input-method; manual |
| 1.6.2.5 | Нет системного плеера (десктоп) | AUTO | debugcheck v2.13 music-via-WebAudio |
| 1.6.2.6 | Нет ОС-горячих клавиш | **AUTO (new v4.21)** | debugcheck: warn on Ctrl/Alt/Meta+key handlers |
| 1.6.2.7 | Взаимодействие с полем не выделяет | AUTO | debugcheck contextmenu/selection |
| 1.6.3.x | ТВ (фуллскрин, стрелки, Back/OK, нет IAP/ссылок) | MANUAL | TV env; manual unless TV declared |
| 1.7 | Нет абсолютных S3-URL | AUTO | debugcheck no-S3 + check-external-cdn |
| 1.8 | Размеры элементов/кнопок для тапа | AUTO | debugcheck touch-target ≥44px |
| 1.9 | Сохранение прогресса (+ при повороте) | AUTO | debugcheck save-before-ad + player.setData |
| 1.10.1 | Не выходит за экран при ресайзе | AUTO | runtime Probe F (6 разрешений) |
| 1.10.2 | Нет браузерного скролла / swipe-refresh | AUTO | scroll-prevention validator + debugcheck |
| 1.10.3 | Элементы не накладываются | AUTO | runtime Probe G (UI-over-canvas) |
| 1.10.4 | Управление одной рукой, без лишних скроллов | MANUAL | gameplay-level; manual |
| 1.11 | Облачные сохранения отмечены в черновике | MANUAL | console draft flag; checklist |
| 1.12 | Подключена РСЯ | AUTO | ad-rules |
| 1.13.x | IAP: консумирование, валюта из SDK, цена | AUTO/N/A | iap-flow validator; N/A if no IAP |
| 1.13.6 | Покупки в игре = вкладка Инап-покупки в Консоли (пустая вкладка → покупок в игре НЕТ) | MANUAL | console-side parity; the parkour case, formalized 07.2026 |
| 1.14 | Нет ошибок/вылетов/зависаний | MANUAL+AUTO | runtime smoke (no console errors); deep = manual |
| 1.15 | Завершённый вид, не "в разработке" | **AUTO (new v4.21)** | debugcheck: warn on "TODO/WIP/в разработке/coming soon" UI text |
| 1.16 | Нет имитации рекламных блоков | **AUTO (new v4.21)** | debugcheck: warn on fake "interstitial/RV" custom UI |
| 1.18 | Нет URL-гейтинга | AUTO | debugcheck URL-gating |
| 1.19.1 | Инициализация SDK строго по доке | AUTO | debugcheck SDK init pattern |
| 1.19.2 | ready() когда играбельно | AUTO | runtime Probe E (un-gameable) + v2.14 ordering |
| 1.19.3 | GameplayAPI start/stop корректно | AUTO | debugcheck v2.9 + Probe D |
| 1.19.4 | game_api_pause/resume логика | AUTO | Probe D pause→stop wiring |
| 1.20.x | Запускается в браузерах/ОС/Android TV | MANUAL | cross-browser; manual |
| 1.21 | ≤100 МБ распакованным | AUTO | verify.sh size check |
| 1.22 | index.html в корне; нет пробелов/кириллицы в именах | AUTO | verify.sh |
| 1.23 | Нет интерактивного ИИ (предген ок) | MANUAL | design-level; manual |
| 1.24 | Обновление сохраняет концепцию | MANUAL | console/manual |

## 2. Пользовательский опыт

| # | Требование | Status | How |
|---|---|---|---|
| 2.2 | Описание управления | AUTO | store-listings how_to_play present |
| 2.3 | Соответствует жанру | MANUAL | manual |
| 2.4 | Наличие игровых механик | MANUAL | manual |
| 2.6 | Сохранение прогресса/рекорда | AUTO | save check |
| 2.8 | Нарастающая сложность, сюжет/сеттинг | MANUAL | manual |
| 2.9 | Контент > 10 мин (викторины ≥100 вопросов) | MANUAL | manual (content volume) |
| 2.10 | Локализация ≥1 язык | AUTO | i18n-completeness |
| 2.13 | Рейтинг > 30 | MANUAL | post-publish; out of scope |
| 2.14 | Автоопределение языка через SDK | AUTO | debugcheck v2.14 ordering + detectLang present |

## 3. Содержание

| # | Требование | Status | How |
|---|---|---|---|
| 3.4.x | Нет эзотерики/насилия над детьми/политики/религии/предсказаний | **AUTO-WARN (new v4.21)** + MANUAL | debugcheck text-scan WARN; final = manual |
| 3.5 | Авторские права; документы текстом внутри игры | MANUAL | manual |
| 3.6 | Не копия/дубликат | AUTO+MANUAL | dup-game heuristics; final manual |
| 3.7.x | Нет реальных денег/магазина/лотереи | N/A-policy | manual |
| 3.9 | Видео без перехода вовне (не YouTube-плеер) | **AUTO (new v4.21)** | debugcheck: warn on youtube iframe/embed |

## 4. Реклама

| # | Требование | Status | How |
|---|---|---|---|
| 4.1 | Нет сторонней рекламы | AUTO | no-external-ad-networks |
| 4.2 | Прогресс сохраняется после рекламы | AUTO | debugcheck progress-before-ad |
| 4.3 | Ориентация рекламы = игре | **AUTO (new v4.21)** | debugcheck: orientation declared consistently |
| 4.4 | Реклама в логических паузах, не мешает | AUTO | runtime Probe A (ad-without-gesture) |
| 4.5.x | RV по желанию; текст явный; бонус, не блокер | AUTO | ad-rules RV-text + Probe B |
| 4.6.x | Доп. блоки только стики; нет кастом-RTB | AUTO | ad-rules |
| 4.7 | Пауза звука+игры при полноэкранной рекламе | AUTO | Probe D + debugcheck |

## 5. Описание и промо

| # | Требование | Status | How |
|---|---|---|---|
| 5.1.3 | Название идентично везде | AUTO | store-listings title parity |
| 5.2 | Все обязательные поля заполнены | AUTO | store-listings + setup-guide |
| 5.3 | Поля по стандартам длины/формата | AUTO | store-listings field lengths |
| 5.6 | Иконка/обложка ≠ скриншот | MANUAL | manual (image content) |
| 5.11 | Нет повторяющихся/дублирующих текстов | AUTO | store-listings 5.11 |
| 5.12 | Название уникально в каталоге | MANUAL | catalog-wide; manual |

## 8. Тексты и медиа

| # | Требование | Status | How |
|---|---|---|---|
| 8.2.1 | Орфография/пунктуация | MANUAL | manual |
| 8.2.3 | Языкозависимые тексты переведены | AUTO | i18n-completeness + Probe C |
| 8.2.4 | Нет мата на любом языке | **AUTO-WARN (new v4.21)** | debugcheck profanity scan (ru/en) WARN |
| 8.3.x | Качество медиа, нет рамок/скруглений/системного UI | MANUAL | manual (image inspection) |
| 8.4.x | Ссылки через SDK, не вовне | AUTO | debugcheck no-external-links |


## 6. Рекомендуемые (НОВЫЙ раздел 07.2026 — модерация не проверяет, влияет на качество/рейтинг)

| # | Требование | Status | How |
|---|---|---|---|
| 6.1 | Email для обратной связи | MANUAL | console field |
| 6.2 | Возможность отключить звук | GAP→candidate | advisory check possible (sound toggle present) |
| 6.3 | Возможность паузы | GAP→candidate | advisory check possible |
| 6.4 | Нет ошибок в DevTools-консоли | AUTO (runtime) | runtime-test smoke уже ловит console errors |
| 6.5 | Название без слов «игра/game» | GAP→candidate | static title check possible |
| 6.7 | Нет бесполезных кнопок (напр. «выход» в вебе) | GAP→candidate | static check possible (exit/quit button) |
| 6.8 | Обучение при сложной механике | MANUAL | design-level |
| 6.9 | Смена языка через универсальные иконки | MANUAL | UI inspection |

Note: 2.13 tightened 07.2026 — rating ≤30 for 3 weeks → game UNPUBLISHED (was: just a threshold).

## Summary
- **AUTO**: ~52 points (was ~45 before v4.21 — closed 1.6.1.1, 1.6.2.2, 1.6.2.6, 1.15, 1.16, 3.9, 4.3, 3.4 WARN, 8.2.4 WARN).
- **MANUAL**: ~18 points — surfaced as a checklist in `/release-ready` (content/gameplay/cross-browser/image quality — inherently human judgment).
- **N/A-policy**: IAP, third-party auth, real-money — excluded by our fixed ads-only/no-auth policy.

The honest boundary: Forge can prove the *technical/structural* requirements. It cannot prove
*content quality, genre fit, cross-browser behavior, or image aesthetics* — those are the MANUAL rows,
and `/release-ready` must show them as "проверь сам", never imply green = fully cleared.
