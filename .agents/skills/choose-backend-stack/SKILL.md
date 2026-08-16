---
name: choose-backend-stack
kind: architectural
description: "Standardized backend stack decision for app/game projects. Walks user through 4 questions (persistence needs, real-time, RPS, hosting preference), outputs one of 5 canonical…"
---

# $choose-backend-stack — Standardized Backend Decision

## Purpose

Every project with server-side needs used to start with Claude improvising a stack from context. Result: one project had Docker+Nginx+PostgreSQL, next had bare Node+SQLite+Timeweb, next used Cloudflare Workers. No consistency, no reusable ops knowledge.

This skill fixes that. Four questions → one of **5 canonical stacks**, each with known deployment path, known cost profile, and reference implementation already living in Forge (see `rustore-publish/reference/` for Stack A).

## Canonical stacks (ONE of these 5, not "whatever feels right")

### Stack A — Node + SQLite + Timeweb VPS (DEFAULT)

**Use when:** B2C consumer apps, <1000 RPS, no real-time, budget <1500₽/mo, Russian users.

**Components:**
- Node 20 + Express (or Fastify)
- SQLite (single file, WAL mode)
- Nginx reverse proxy
- Let's Encrypt SSL (acme.sh)
- Timeweb Cloud VPS (~750₽/mo for 2GB/1CPU)
- PM2 for process management
- Daily SQLite backup to Yandex Object Storage

**Reference:** `.claude/skills/rustore-publish/reference/auth.js`, `sync.js`, `schema.sql`, `security-log.js`, `ip-hash.js` — production-tested.

**Docs:** `.claude/skills/rustore-publish/AUTH-SYNC.md` for integration. For VPS provisioning + nginx + Let's Encrypt, use the existing `$deploy` skill after stack is chosen.

**Pros:** Cheap, simple, single-file DB means trivial backups, all Forge reference code targets this. 152-ФЗ friendly (Russia-hosted).

**Cons:** SQLite concurrent writes bottleneck at ~100 RPS sustained. Single server = single point of failure.

### Stack B — Node + PostgreSQL + Timeweb / self-hosted VPS

**Use when:** Same as Stack A but need >100 concurrent writes/sec, OR data model is relational-heavy (joins, foreign keys matter), OR team expects to eventually scale.

**Components:**
- Node 20 + Fastify (better perf than Express under load)
- PostgreSQL 16 (managed if budget allows, self-hosted if not)
- Nginx + Let's Encrypt
- PM2 (or systemd units)
- pgBackRest for WAL-based backups
- Timeweb Cloud VPS 4GB/2CPU (~1500₽/mo) + managed Postgres (~800₽/mo) OR single VPS with Postgres on-box

**Cons:** More ops complexity. Postgres upgrades need planning. Migrations discipline required.

### Stack C — Cloudflare Workers + D1 / KV + R2

**Use when:** Global/international audience, no Russia-specific compliance needs, low traffic with bursty patterns, want zero-ops serverless, need CDN edge performance.

**Components:**
- Cloudflare Workers (JS/TS edge functions)
- D1 (SQLite-at-edge) for structured data
- KV for cache / session tokens
- R2 for object storage (S3-compatible, zero egress fees)
- Workers Analytics + Logpush

**Pros:** Scales to zero, pay-per-request, global edge, no VPS management.

**Cons:** NOT 152-ФЗ compliant for Russian user PII (CF doesn't have RU data centers). Workers have runtime constraints (no persistent connections, 30s CPU limit per request). Migration away from Workers is painful (vendor lock).

### Stack D — Docker Compose + любой VPS (dev-friendly)

**Use when:** User explicitly asks for Docker, OR project has multiple server-side components (e.g. API + worker queue + Redis cache), OR team is Docker-native.

**Components:**
- `docker-compose.yml` with service graph (api, db, redis, nginx)
- One of the DB choices from A/B
- Watchtower for auto-updates
- Portainer (optional, web UI)
- Any VPS (Timeweb, Hetzner, Beget, DO)

**Pros:** Local dev matches prod. Easy to add services. Team familiarity.

**Cons:** Docker overhead. One more abstraction layer. Compose files drift.

### Stack E — Serverless на Яндекс Cloud Functions

**Use when:** Russia-hosted requirement AND need scale-to-zero AND traffic is bursty (event-driven, not steady).

**Components:**
- Яндекс Cloud Functions (Node 20)
- Яндекс Managed PostgreSQL or MDB for MongoDB
- Яндекс Object Storage (S3-compatible)
- API Gateway for HTTP routing

**Pros:** 152-ФЗ compliant. Scales to zero. Russian payment methods work for the account.

**Cons:** Cold starts matter. YC tooling less polished than AWS/GCP. Lock-in to YC.

## Decision flow — 4 questions

Use `ask_user_input_v0` to ask these sequentially. Don't improvise the answer.

### Q1. Нужна ли persistence (не только кэш)?

Options:
- "Да — пользовательские данные, прогресс, платежи"
- "Только ephemeral state, API прокси, кэш"
- "Пока не знаю"

If "только ephemeral" → skip to Q3 (persistence-less stacks are Workers / serverless).

### Q2. Real-time нужен? (websockets, SSE, presence, co-editing)

Options:
- "Да, real-time критичен"
- "Нет, request/response хватит"
- "Может быть в будущем, но не сейчас"

If "real-time критичен" → eliminate Stack C (Workers limited), narrow to A/B/D.

If "может быть в будущем" → prefer A/B/D over C/E.

### Q3. Ожидаемая нагрузка?

Options:
- "<10 RPS, малая аудитория (<1k DAU)"
- "10-100 RPS (1k-10k DAU)"
- "100-1000 RPS (10k-100k DAU)"
- "1000+ RPS (серьёзный продукт)"
- "Не знаю, старт"

If "не знаю / старт" → default to Stack A (easiest to migrate from).

If "1000+" → eliminate A (SQLite bottleneck), narrow to B or C.

### Q4. Юридические / географические ограничения?

Options:
- "Российские пользователи, 152-ФЗ compliance нужен"
- "Международная аудитория, compliance не критичен"
- "Смешанная, нужно и то и то"

If "152-ФЗ" → eliminate C (Cloudflare has no RU DC), narrow to A/B/D/E.

If "международная" → prefer C for edge performance.

## Mapping answers to stacks

Simple decision table — don't overthink:

| Q1 persistence | Q2 real-time | Q3 RPS | Q4 compliance | → Stack |
|---|---|---|---|---|
| Yes | No | <100 | 152-ФЗ | A |
| Yes | No | 100-1000 | 152-ФЗ | B |
| Yes | No | <100 | International | A or C |
| Yes | Yes | <1000 | 152-ФЗ | A or B (with WebSocket) |
| Yes | Yes | 1000+ | Any | B |
| No (ephemeral) | No | Any | International | C |
| No | No | Any | 152-ФЗ | E |
| Yes | Any | Any | User wants Docker | D |

When two stacks tie — **prefer A (default) over others**. A has the most reference code in Forge, the cheapest cost, and the simplest ops.

## Output format

After Q1-Q4, produce:

```
═══════════════════════════════════════
  Backend Stack Recommendation
═══════════════════════════════════════
  Recommended: Stack A — Node + SQLite + Timeweb

  Reasoning:
  - Q1 persistence needed: user data + sync
  - Q2 real-time: not needed
  - Q3 RPS: <100 expected
  - Q4 compliance: 152-ФЗ applies (RU users)

  What you get:
  - ~750₽/mo Timeweb VPS 2GB/1CPU
  - SQLite with WAL mode, daily S3 backup
  - Nginx + Let's Encrypt via acme.sh
  - PM2 process manager
  - Reference code in .claude/skills/rustore-publish/reference/
    (auth.js, sync.js, schema.sql, security-log.js, ip-hash.js)

  Next steps:
  1. Copy reference files to server/ directory
  2. Read .claude/skills/rustore-publish/AUTH-SYNC.md for integration
  3. Provision Timeweb VPS:
     https://timeweb.cloud/
  4. Run $deploy to get Nginx + SSL setup

  Alternative if requirements change:
  - Need 1000+ RPS later? → Migrate to Stack B (Postgres) — schema.sql is compatible
  - Want serverless? → Not suitable with 152-ФЗ (Stack C ruled out), would need Stack E
═══════════════════════════════════════
```

## Escape hatch — user wants something else entirely

If user says "я хочу Go + NATS + Cassandra" or similar exotic stack — that's fine, but:

1. Don't pretend to map it to one of the 5 canonical stacks
2. Note explicitly: "This is outside Forge's canonical 5 stacks. No reference code exists. You'll be responsible for the ops playbook."
3. Still ask Q1-Q4 and log the answers in `wiki/decisions/` so future sessions have the rationale.

## Non-Negotiable

- [ ] Ask all 4 questions via `ask_user_input_v0` (not inferred from context)
- [ ] Map to exactly ONE of the 5 canonical stacks (or escape-hatch)
- [ ] Output cost estimate (approximate, in RUB/USD)
- [ ] Output specific reference code paths (don't say "there's reference code somewhere")
- [ ] Log decision to `wiki/decisions/backend-stack-{date}.md` so team can revisit
- [ ] Never recommend "it depends" — the 4 questions collapse to one answer

## Related skills

- `$server-detect` — determines IF a project needs a backend (runs before this skill)
- `$deploy` — executes deployment after stack is chosen
- `$choose-backend-stack` (this) — chooses WHICH stack
- `.claude/skills/rustore-publish/AUTH-SYNC.md` — Stack A reference implementation
