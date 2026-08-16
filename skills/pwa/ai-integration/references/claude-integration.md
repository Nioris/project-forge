# Claude API Integration — Full Reference

## Dependencies

```bash
pnpm add @anthropic-ai/sdk
```

## Environment

```env
ANTHROPIC_API_KEY=sk-ant-xxxxxxx
AI_MODEL=claude-sonnet-4-6
AI_MAX_TOKENS=4096
AI_DAILY_LIMIT=50000  # tokens per user per day
```

## Streaming API Route

```ts
// src/routes/api/ai/chat/+server.ts
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY, AI_MODEL, AI_MAX_TOKENS } from '$env/static/private';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401);

  const { messages, systemPrompt } = await request.json();

  // Check daily limit
  const today = new Date().toISOString().split('T')[0];
  const logs = await locals.pb.collection('ai_logs').getFullList({
    filter: `user="${locals.user.id}" && created >= "${today}"`,
  });
  const usedTokens = logs.reduce((sum, l) => sum + (l.input_tokens + l.output_tokens), 0);
  if (usedTokens > Number(AI_DAILY_LIMIT)) {
    throw error(429, 'Дневной лимит токенов исчерпан');
  }

  const stream = await client.messages.stream({
    model: AI_MODEL,
    max_tokens: Number(AI_MAX_TOKENS),
    system: systemPrompt || 'Ты полезный ассистент. Отвечай на русском языке.',
    messages: messages.map((m: any) => ({
      role: m.role,
      content: m.content,
    })),
  });

  const encoder = new TextEncoder();
  let inputTokens = 0;
  let outputTokens = 0;

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`));
          }
          if (event.type === 'message_delta') {
            outputTokens = event.usage?.output_tokens || 0;
          }
          if (event.type === 'message_start') {
            inputTokens = event.message.usage?.input_tokens || 0;
          }
        }

        // Log usage
        await locals.pb.collection('ai_logs').create({
          user: locals.user.id,
          model: AI_MODEL,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost: calculateCost(inputTokens, outputTokens),
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, usage: { inputTokens, outputTokens } })}\n\n`));
        controller.close();
      } catch (err: any) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};

function calculateCost(input: number, output: number): number {
  // Sonnet pricing (update as needed)
  return (input * 3 / 1_000_000) + (output * 15 / 1_000_000);
}
```

## Chat Component

```svelte
<!-- src/lib/components/AiChat.svelte -->
<script lang="ts">
  interface Message { role: 'user' | 'assistant'; content: string }

  let messages = $state<Message[]>([]);
  let input = $state('');
  let streaming = $state(false);

  async function send() {
    if (!input.trim() || streaming) return;
    const userMsg: Message = { role: 'user', content: input };
    messages = [...messages, userMsg];
    input = '';
    streaming = true;

    const assistantMsg: Message = { role: 'assistant', content: '' };
    messages = [...messages, assistantMsg];

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.slice(0, -1) }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));
          if (data.text) {
            assistantMsg.content += data.text;
            messages = [...messages.slice(0, -1), { ...assistantMsg }];
          }
        }
      }
    } catch (err) {
      assistantMsg.content = 'Ошибка при обращении к ИИ. Попробуйте снова.';
      messages = [...messages.slice(0, -1), { ...assistantMsg }];
    } finally {
      streaming = false;
    }
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex-1 overflow-y-auto p-4 space-y-4">
    {#each messages as msg}
      <div class="rounded-xl px-4 py-3 {msg.role === 'user' ? 'bg-blue-100 ml-12' : 'bg-gray-100 mr-12'}">
        <p class="whitespace-pre-wrap text-sm">{msg.content}</p>
      </div>
    {/each}
  </div>

  <form onsubmit={(e) => { e.preventDefault(); send(); }} class="border-t p-4 flex gap-2">
    <input bind:value={input} placeholder="Напишите сообщение..."
      class="flex-1 rounded-xl border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      disabled={streaming} />
    <button type="submit" disabled={streaming}
      class="rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white disabled:opacity-50">
      {streaming ? '...' : '→'}
    </button>
  </form>
</div>
```

## Tool Use Example

```ts
const toolResponse = await client.messages.create({
  model: AI_MODEL,
  max_tokens: 1024,
  tools: [{
    name: 'get_weather',
    description: 'Получить текущую погоду в городе',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'Название города' },
      },
      required: ['city'],
    },
  }],
  messages: [{ role: 'user', content: 'Какая погода в Москве?' }],
});
```
