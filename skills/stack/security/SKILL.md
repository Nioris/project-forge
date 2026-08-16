---
name: security
description: "API keys server-side, XSS prevention, CSP headers, CORS, auth security. Triggers on: security, XSS, CORS, CSP, API key, auth."
---
# Security

## Non-Negotiable Acceptance Criteria
- [ ] API keys in $lib/server/ only (never client)
- [ ] CSP headers configured
- [ ] All user input sanitized
- [ ] Auth tokens httpOnly where possible
- [ ] No secrets in git (use .env)
