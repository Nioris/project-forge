---
name: twa-wrap
kind: tactical
description: "Wrap hosted HTTPS URL in TWA for Android. For PWAs and hosted projects."
---
# TWA (Trusted Web Activity)

## Requirements: HTTPS URL + manifest.json + service worker

## Steps
### 1. Bubblewrap
```bash
npx bubblewrap init --manifest="https://{url}/manifest.json"
npx bubblewrap build
```

### 2. Digital Asset Links
Host at https://{domain}/.well-known/assetlinks.json:
```json
[{"relation":["delegate_permission/common.handle_all_urls"],
  "target":{"namespace":"android_app","package_name":"dev.rodrik.{appid}",
  "sha256_cert_fingerprints":["{SHA256}"]}}]
```

## Non-Negotiable
- [ ] HTTPS only
- [ ] manifest.json accessible
- [ ] assetlinks.json deployed
