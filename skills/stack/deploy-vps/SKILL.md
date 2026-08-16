---
name: deploy-vps
description: "Deploy to Timeweb VPS: Docker, nginx, SSL, CI/CD, PocketBase hosting. Triggers on: deploy, VPS, docker, nginx, SSL, CI/CD."
---
# Deploy to VPS

## Non-Negotiable Acceptance Criteria
- [ ] Docker Compose for all services
- [ ] nginx reverse proxy with SSL (Let's Encrypt)
- [ ] PocketBase behind nginx
- [ ] Auto-deploy on git push
- [ ] Backup strategy for PocketBase data
