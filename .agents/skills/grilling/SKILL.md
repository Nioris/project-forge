---
name: grilling
kind: architectural
description: "Безжалостно допросить пользователя по плану, решению или идее, пока не останется ни одной неразрешённой ветки дерева решений. Раундами, с рекомендованным ответом на каждый…"
---

# $grilling — интервью до общего понимания

> Основано на `grilling` из [mattpocock/skills](https://github.com/mattpocock/skills) (MIT).
> Дисциплина интервью сохранена дословно; добавлена привязка к нашим фазам.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled — the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Each question should be formatted like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree — settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it — don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report — ask the rest of the frontier now. The _decisions_ are the user's — put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

---

## Где это применяется у нас

**Перед фазой 2** — обязательно, если игра начинается с концепта, а не с готового прототипа.
Полевой опыт: рассинхрон «я думал, он понял» — главная причина переделок; дешевле выяснить
до GDD, чем после трёх итераций визуала.

**Перед дорогими работами** — массовая генерация ассетов, развёртывание бэкенда, перекомпоновка
интерфейса. Всё, что стоит денег или часов, начинается с раунда вопросов.

**Формат вопроса** (соблюдать дословно):
```
❓ **Q1** - **<заголовок вопроса>**: <тело вопроса, варианты>

➡️ <твой рекомендованный ответ>
```

**Правило фактов:** искать факты — твоя работа, не пользователя. Нужен факт из среды (файлы,
код, каталог платформы) — иди и посмотри сам, а не спрашивай. Решения — пользователя, факты —
твои.

**Конец сессии:** фронтир пуст, все ветки дерева пройдены, ничего не осталось молча
предположенным. **Не действовать, пока пользователь не подтвердил общее понимание.**
