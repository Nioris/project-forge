# Contributing to Project Forge

Thanks for improving Project Forge.

## Before opening a change

1. Keep the change focused.
2. Do not commit real API keys, tokens, `.env` files, `forge-data/`, backups or local project state.
3. Treat `.claude/skills/` and `.claude/agents/` as canonical sources where applicable; generated Codex mirrors/adapters must stay synchronized.
4. Preserve the canonical 9-phase lifecycle and existing STOP-point semantics unless the change explicitly targets the phase model.

## Useful checks

After changing canonical skills, agents or dashboard metadata, run the relevant sync/check scripts, for example:

```bash
node scripts/generate-agents-md.mjs
node scripts/sync-codex-adapter.mjs
node scripts/sync-dashboard-meta.mjs
node scripts/check-codex-compat.mjs
node scripts/check-dashboard-meta.mjs
```

Run any additional verifier required by the area you changed.

## Pull requests

A good PR should explain:

- what changed;
- why it changed;
- which Forge host/platform is affected;
- how it was tested;
- whether generated adapters or managed files changed.

Avoid mixing unrelated refactors into one PR.

## Security

Never include credentials in an issue, pull request, screenshot, test fixture or log. If a credential is exposed, revoke/rotate it before cleaning Git history.

See [SECURITY.md](SECURITY.md).