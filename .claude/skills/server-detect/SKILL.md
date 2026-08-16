---
name: server-detect
kind: tactical
description: "Detect server dependencies. If found — cannot wrap offline."
---
# Server Detection

## Check for:
```bash
grep -E "express|fastify|koa|socket.io|ws\"|http-server|next|nuxt" package.json
find . -name ".env*" -name "server.*" -name "api/" -type d
grep -r "new WebSocket\|socket.io\|ws://" --include="*.js"
grep -r "fetch.*http\|axios.*http" --include="*.js"
```

## If found → DO NOT WRAP. Output report:
```markdown
# ⚠️ Server Required: {project}
## Found: {express/socket.io/etc}
## API endpoints: {list}
## Options:
A. Host server + TWA (recommended)
B. Remove server deps + Capacitor
C. Embedded server (complex, not recommended)
```

## Non-Negotiable
- [ ] NEVER wrap server project in Capacitor blindly
- [ ] ALWAYS list what was found
- [ ] ALWAYS provide options
