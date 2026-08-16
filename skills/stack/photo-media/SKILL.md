---
name: photo-media
description: "Camera capture, compress to <200KB, IndexedDB storage, S3 upload. Triggers on: photo, camera, image, compress, upload."
---
# Photo & Media

## Non-Negotiable Acceptance Criteria
- [ ] Camera access via Capacitor or input[capture]
- [ ] Compressed to <200KB before storage
- [ ] Stored in IndexedDB offline, synced to S3 when online
- [ ] EXIF stripped for privacy
