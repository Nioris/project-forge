# Measurement contract v1

| KPI | Formula | Unknown rule |
|---|---|---|
| Time-to-release | Phase 8 `completedAt` minus Phase 1 `startedAt` | null until Phase 8 completes |
| Tracked active | recorded phase spans minus paired user/infrastructure waits | never call it developer work hours |
| AI cost | exact release receipt/invoice; otherwise full token-price estimate | partial/unpriced stays unknown |
| Repair cycles | retry/blocked + environment/provider outcomes + independent visual REJECT | user approval STOP is not repair |
| Pre-release defects | unique structured verifier/reviewer/event fingerprints before release | never scrape prose |
| Moderation first-pass | every recorded platform passed its first attempt | unresolved platform outcome stays unknown |
| Moderation eventual | every recorded platform eventually passed | keep separate from first-pass |
| Automation | automatic Task transitions / (automatic + user answers + recorded manual steps) | label as tracked workflow, not AI-written-code share |

Portfolio comparisons use medians. A KPI is claim-ready only when both baseline/current samples reach
`minimumCohort` (default 30 per cohort), both medians exist and baseline is nonzero. Always publish
split date, `n` and coverage. This is an evidence guard, not causal proof without a matched design.
Exact/estimated/partial/unknown cost basis must remain visible.

Telemetry is local-only. Never write prompts, model messages, source text, secrets, personal data or an
absolute project path to `.forge/metrics`.
