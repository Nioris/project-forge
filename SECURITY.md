# Security

Project Forge does not require API keys to be committed to a project repository.

Keep credentials outside projects under `forge-data/secrets/` or in supported environment variables. Never commit `*.key`, `.env`, provider tokens, backup archives, or local `forge-data` state.

If a credential is ever committed, revoke/rotate it at the provider first, then remove it from Git history.
