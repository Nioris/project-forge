---
name: yandex-s3
description: >
  Yandex Object Storage (S3-compatible) for SvelteKit. Presigned URLs, PocketBase S3 integration, Sharp
  image pipeline, CDN, lifecycle rules, and cost optimization. Use this skill for Yandex S3, cloud storage
  Russia, file uploads, CDN, image optimization, or object storage.
---

# Yandex S3 Skill

Yandex Object Storage — file storage, CDN, image pipeline.

## PocketBase S3 Integration

Configure in Dashboard → Settings → Files storage:
- Endpoint: `https://storage.yandexcloud.net`
- PocketBase stores as `{collectionId}/{recordId}/{filename}`
- Files uploaded before S3 config stay local — migrate manually.

## Image Compression Pipeline

- **Browser-side**: Canvas API resize + `toBlob('image/webp', 0.8)` before upload
- **Server-side**: Sharp for multi-size: thumb 200px, medium 600px, large 1200px (all WebP)
- Set `CacheControl: "public, max-age=31536000, immutable"` on upload

## Cost Optimization

Free tier monthly: **1 GB** storage, **10K** PUT, **100K** GET, **100 GB** egress.
Convert to WebP/AVIF (25–50% smaller). Lifecycle rules → Ice storage (~$0.005/GB/mo). Always use CDN in production.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Service account keys in env vars.** Never in code. IAM role preferred in production.
2. **E — Every upload via presigned URL.** Client → S3 direct. Server never proxies large files.
3. **R — Read-through CDN configured.** Yandex CDN or custom domain for public assets.
4. **U — Upload size enforced server-side.** Max 50 MB. ContentType must match presigned command.
5. **D — Delete cascading.** PocketBase record delete → S3 object removed (PB handles this with S3 config).
6. **D — Directory structure organized.** `{collectionId}/{recordId}/{filename}` (PB default) or custom path.
7. **A — All images multi-sized via Sharp.** Thumb, medium, large generated on upload. WebP format.

## References

- `references/yandex-s3-setup.md` — S3 client, presigned URLs, Sharp pipeline, PB config, CDN.
