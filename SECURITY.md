# Security

Project Forge is designed so provider credentials stay outside project repositories.

## Never commit

Do not commit real values from any of these locations or categories:

```text
forge-data/
forge-data/secrets/
secrets/
*.key
.env
.env.*
.openai_key
.anthropic_key
.gigachat_key
.gigachat_token
backup archives
local provider auth stores
personal project state
```

Documentation may contain obvious placeholders such as `sk-ant-xxxxxxx`; placeholders are not usable credentials.

## Recommended layout

```text
<workspace>/
  project-forge/
  forge-data/
    secrets/
      anthropic.key
      openai.key
      gigachat.key
  projects/
```

Use:

```bash
node scripts/forge-secrets.mjs status
```

to inspect provider configuration without printing secret values.

## If a credential is exposed

1. Revoke or rotate the credential at the provider immediately.
2. Remove the credential from the repository and Git history.
3. Check logs, screenshots, CI artifacts, backups and forks for copies.
4. Do not rely on deleting only the latest commit.

## Public repository rule

Public Forge source must not include workspace secrets, personal projects, `forge-data` state or real provider credentials.