# Known Issues & Solutions

## 1. Language switching doesn't update UI (ui() cache)

**Симптом:** `setLang('es')` вызывается, `t('key')` возвращает правильный перевод, но на экране русский текст.

**Причина:** `ui()` кеширует хеш состояния (`lastUIHash`) и пропускает рендер если данные не изменились. Смена языка не меняет игровые данные → хеш тот же → `ui()` делает `return` без перерисовки.

**Решение:** В `setLang()` сбросить кеш перед вызовом `ui()`:
```js
if(typeof lastUIHash !== 'undefined') lastUIHash = '';
```

**Где встретилось:** Metro v1.9 (ui.js строка 38)

---

## 2. Chrome extension не может менять переменные на file://

**Симптом:** `chrome.scripting.executeScript` с `world: 'MAIN'` не имеет доступа к `var _lang` на `file://` протоколе. CSP блокирует inline `<script>` инжекцию.

**Причина:** Chrome security — `file://` URLs имеют уникальный origin, CSP по умолчанию запрещает `unsafe-inline`.

**Решения (по надёжности):**
1. ✅ **Встроенный скриншотер в cheats.js** — полный доступ, без CSP проблем
2. ✅ **?lang=xx URL параметр** — работает с перезагрузкой (теряет состояние)
3. ✅ **CDP Runtime.evaluate** — как консоль, но требует debugger permission
4. ❌ **executeScript world:MAIN** — не работает на file://
5. ❌ **Inline script injection** — блокируется CSP

**Где встретилось:** YG Screenshot extension v2.1-2.5, все игры на file://

---

## 3. `let _lang` vs `var _lang`

**Симптом:** Расширение ставит `window._lang = 'es'`, но `t()` читает другую `_lang`.

**Причина:** `let` на top-level scope НЕ создаёт свойство на `window`. `var` — создаёт.

**Решение:** Использовать `var _lang` в i18n.js, не `let`.

**Где встретилось:** Metro i18n.js, VirusClicker i18n.js

---

## 4. Store listing CJK character limits

**Симптом:** SEO description для JA/ZH слишком короткая (40-60 символов вместо 100+).

**Причина:** CJK символы несут больше смысла на символ, переводчики пишут короче.

**Решение:** Явно указывать агенту-переводчику минимум 100 символов, при необходимости добавлять описательные фразы.

**Где встретилось:** VirusClicker store-listing-ja.json, store-listing-zh.json

---

## 5. Мемные названия стран — замена в I18N

**Симптом:** RU/EN блоки имеют формат `c_cn: 'Китай'` (с пробелом после двоеточия), а новые языки `c_cn:'Arrozlandia'` (без пробела). Regex замены не находят оригинал.

**Причина:** Разный формат строк в разных языковых блоках.

**Решение:** Использовать гибкий regex: `key + r'\s*:\s*' + "'" + r"[^']*" + "'"`

**Где встретилось:** VirusClicker v6.8-v6.9 country name replacement
