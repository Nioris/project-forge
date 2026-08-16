# Yandex S3 — Full Reference

## Dependencies

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## S3 Client

```ts
// src/lib/server/s3.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { YC_ACCESS_KEY_ID, YC_SECRET_ACCESS_KEY, YC_BUCKET } from '$env/static/private';

export const s3 = new S3Client({
  region: 'ru-central1',
  endpoint: 'https://storage.yandexcloud.net',
  credentials: {
    accessKeyId: YC_ACCESS_KEY_ID,
    secretAccessKey: YC_SECRET_ACCESS_KEY,
  },
});

export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600) {
  const command = new PutObjectCommand({ Bucket: YC_BUCKET, Key: key, ContentType: contentType });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getPresignedDownloadUrl(key: string, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: YC_BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteObject(key: string) {
  await s3.send(new DeleteObjectCommand({ Bucket: YC_BUCKET, Key: key }));
}

export function getPublicUrl(key: string) {
  return `https://${YC_BUCKET}.storage.yandexcloud.net/${key}`;
}
```

## Upload API Route

```ts
// src/routes/api/upload/presign/+server.ts
import { json, error } from '@sveltejs/kit';
import { getPresignedUploadUrl } from '$lib/server/s3';

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export const POST = async ({ request, locals }) => {
  if (!locals.user) throw error(401);
  const { filename, contentType, size } = await request.json();

  if (size > MAX_SIZE) throw error(400, 'File too large');
  if (!ALLOWED_TYPES.includes(contentType)) throw error(400, 'File type not allowed');

  const now = new Date();
  const key = `uploads/${locals.user.id}/${now.getFullYear()}/${now.getMonth() + 1}/${crypto.randomUUID()}-${filename}`;

  const url = await getPresignedUploadUrl(key, contentType);
  return json({ uploadUrl: url, key });
};
```

## Upload Component

```svelte
<script lang="ts">
  let uploading = $state(false);
  let progress = $state(0);

  async function handleUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    uploading = true;

    const { uploadUrl, key } = await fetch('/api/upload/presign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, contentType: file.type, size: file.size }),
    }).then(r => r.json());

    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress = (e.loaded / e.total) * 100; };
      xhr.onload = () => xhr.status === 200 ? resolve() : reject(new Error('Upload failed'));
      xhr.onerror = () => reject(new Error('Network error'));
      xhr.open('PUT', uploadUrl);
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.send(file);
    });

    uploading = false;
  }
</script>

<label class="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-8 text-center hover:border-blue-500 block">
  <input type="file" class="hidden" onchange={handleUpload} accept="image/*,.pdf" />
  {#if uploading}
    <div class="text-sm">Загрузка: {progress.toFixed(0)}%</div>
    <div class="mt-2 h-2 rounded-full bg-gray-200">
      <div class="h-2 rounded-full bg-blue-600 transition-all" style="width: {progress}%"></div>
    </div>
  {:else}
    <p class="text-gray-500">Нажмите для загрузки файла</p>
  {/if}
</label>
```
