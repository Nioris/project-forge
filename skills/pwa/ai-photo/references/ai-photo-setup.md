# AI Photo Processing — Full Reference

## Client-Side Image Compression

```ts
// src/lib/image-compress.ts
export async function compressImage(file: File, maxSize = 2048, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const scale = Math.min(1, maxSize / Math.max(width, height));

  const canvas = new OffscreenCanvas(width * scale, height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  const blob = await canvas.convertToBlob({ type: 'image/webp', quality });
  return blob;
}

export async function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
```

## Server-Side Vision Analysis

```ts
// src/lib/server/ai-photo.ts
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export async function analyzeImage(base64: string, mediaType: string, prompt?: string) {
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: mediaType as any, data: base64 },
        },
        {
          type: 'text',
          text: prompt || 'Проанализируй это изображение. Верни JSON: { "description": "...", "tags": [...], "text_content": "..." (если есть текст), "dominant_colors": [...], "is_appropriate": true/false }',
        },
      ],
    }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
  } catch {
    return { raw: text };
  }
}

export async function ocrImage(base64: string, mediaType: string) {
  return analyzeImage(base64, mediaType,
    'Извлеки ВЕСЬ текст с этого изображения. Верни JSON: { "text": "полный текст", "language": "ru/en/...", "confidence": 0.0-1.0 }'
  );
}

export async function moderateImage(base64: string, mediaType: string) {
  return analyzeImage(base64, mediaType,
    'Проверь изображение на модерацию. Верни JSON: { "safe": true/false, "reason": "..." if unsafe, "categories": { "violence": false, "adult": false, "spam": false } }'
  );
}
```

## API Route

```ts
// src/routes/api/ai/photo/analyze/+server.ts
import { json, error } from '@sveltejs/kit';
import { analyzeImage } from '$lib/server/ai-photo';

export const POST = async ({ request, locals }) => {
  if (!locals.user) throw error(401);

  const formData = await request.formData();
  const image = formData.get('image') as string; // base64
  const mediaType = formData.get('mediaType') as string;
  const action = formData.get('action') as string || 'analyze';

  if (!image || !mediaType) throw error(400, 'Missing image data');
  if (image.length > 7_000_000) throw error(400, 'Image too large'); // ~5 MB base64

  const result = await analyzeImage(image, mediaType);
  return json(result);
};
```
