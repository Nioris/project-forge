# Security

Project Forge is designed so provider credentials stay outside project repositories.

## Never commit

Do not commit real values from any of these locations or categories:

```text
forge-data/
forge-data/secrets/
forge-data/security/
secrets/
*.key
*.jks
*.keystore
*.p12
*.pfx
pepk_out.zip
SIGNING_CREDENTIALS.md
StoreData/signing/
security/
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
    security/
      publisher-profile.json
      <project>--<vault-id>/
  projects/
```

Use:

```bash
node scripts/forge-secrets.mjs status
```

to inspect provider configuration without printing secret values.

Android release identity is provisioned with `forge-security.mjs`. Only the public
`forge.identity.json` belongs in the project; signing keys and encrypted passwords stay in the
external security vault. On Windows the credential envelope uses CurrentUser DPAPI. A project move,
OS-account change or reinstall can make the local envelope unavailable, so create an approved
encrypted backup before the first store upload and never copy an unencrypted keystore into Git/CI.

## If a credential is exposed

1. Revoke or rotate the credential at the provider immediately.
2. Remove the credential from the repository and Git history.
3. Check logs, screenshots, CI artifacts, backups and forks for copies.
4. Do not rely on deleting only the latest commit.

## Public repository rule

Public Forge source must not include workspace secrets, personal projects, `forge-data` state or real provider credentials.
