# Решение: runtime authority даёт машинный контракт, а не Markdown модели

**Дата:** 23.08.2026 · **Версия:** v4.68.44

## Ситуация

Skills уже описывали phases, writes, STOP-points и verifiers внутри длинного Markdown, а агенты
возвращали несовместимые свободные отчёты. Оркестратор вынужден был снова просить модель понять
текст. Массовое добавление полей во все 143 навыка сразу создало бы формальную миграцию без
исполняемой проверки и высокий риск дрейфа.

## Решение

1. `contract_version: 1` включает строгий плоский SkillContract во frontmatter canonical SKILL.md.
2. Отсутствующий контракт означает `legacy/manual`: навык можно явно вызвать, но нельзя
   auto-select, использовать для выдачи scope или выбора executable verifiers.
3. Первый набор — `status`, девять canonical phase skills и `gacha-meta`; их contract fields
   проверяет один parser/runtime, а не набор regex в adapters.
4. Task сохраняет `{kind,id,version,hash}`. Несовместимые mode/phase/scope/verifiers и изменение
   hash во время исполнения отклоняются.
5. Phase output не дублируется: `completion_contract` ссылается на существующий phase-N JSON,
   из которого runtime получает evidence paths и project checks.
6. AgentContracts живут в `adapters/agent-contracts.json`; Builder/Reviewer/Researcher возвращают
   строгие AgentResult, но их requested checks являются только рекомендацией.
7. Verifier plan возникает по цепочке `declared contract → structured successful host operation →
   trusted registry id`. Свободная строка команды/ответ модели не является authority.
8. Контрактный write scope пока остаётся декларацией. Нельзя называть его sandbox до отдельного
   host write-boundary enforcement.

## Последствия

- Следующую фазу и совместимый tactical skill можно выбирать без LLM среди declared contracts.
- GigaChat gacha больше не зависит от единственного regex-исключения по тексту команды.
- Contracted Codex roles получают компактную ссылку на общий manifest вместо prompt duplication.
- Остальные 132 skills продолжают работать явно и мигрируются партиями только когда для них есть
  реальная runtime-интеграция.
