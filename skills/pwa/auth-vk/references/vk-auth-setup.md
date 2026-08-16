# VK Auth — Full Reference (PocketBase Built-in)

## PocketBase VK OAuth Setup

1. Go to `id.vk.com/about/business/go` → Create app → get Client ID + Secret
2. In PocketBase Dashboard → Collection → users → OAuth2 → Add VK provider
3. Enter Client ID and Client Secret
4. Redirect URL: `https://yourdomain.com/api/oauth2-redirect`

## Approach 1: Client-Side Popup (Simplest)

```svelte
<script lang="ts">
  import { pb } from '$lib/pocketbase';
  import { goto } from '$app/navigation';

  async function loginWithVK() {
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'vk' });
      goto('/dashboard');
    } catch (err) {
      console.error('VK auth failed:', err);
    }
  }
</script>

<button onclick={loginWithVK}
  class="flex min-h-[48px] items-center gap-3 rounded-xl bg-[#0077FF] px-6 py-3 text-white font-medium">
  <svg class="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.587-1.496c.598-.188 1.368 1.259 2.183 1.815.616.42 1.084.328 1.084.328l2.175-.03s1.138-.071.598-.972c-.044-.074-.314-.667-1.616-1.886-1.363-1.276-1.18-1.069.462-3.275.999-1.342 1.398-2.162 1.273-2.513-.119-.334-.856-.246-.856-.246l-2.45.015s-.182-.025-.316.056c-.131.079-.215.263-.215.263s-.387 1.028-.903 1.903c-1.09 1.85-1.525 1.948-1.703 1.834-.414-.266-.31-1.068-.31-1.637 0-1.78.27-2.523-.527-2.716-.265-.064-.46-.106-1.138-.113-.87-.009-1.605.003-2.022.207-.278.136-.492.438-.361.455.161.021.527.098.72.363.25.342.241 1.11.241 1.11s.144 2.094-.336 2.354c-.329.178-.78-.186-1.75-1.854-.496-.856-.871-1.8-.871-1.8s-.072-.177-.201-.272c-.156-.115-.374-.151-.374-.151l-2.328.015s-.35.01-.478.161c-.114.135-.009.413-.009.413s1.82 4.247 3.878 6.386c1.887 1.963 4.032 1.834 4.032 1.834h.972z"/>
  </svg>
  Войти через VK
</button>
```

**Safari warning**: Don't use `async/await` in click handler — popup gets blocked.
Wrap in `setTimeout(fn, 0)` if needed.

## Approach 2: Server-Side SSR Flow

```ts
// src/routes/login/+page.server.ts
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
  const authMethods = await locals.pb.collection('users').listAuthMethods();
  const vkProvider = authMethods.oauth2?.providers?.find((p: any) => p.name === 'vk');

  if (!vkProvider) return { vkAuthUrl: null };

  // Store state and verifier for CSRF protection
  cookies.set('oauth_state', vkProvider.state, { path: '/', httpOnly: true, sameSite: 'lax' });
  cookies.set('oauth_verifier', vkProvider.codeVerifier, { path: '/', httpOnly: true, sameSite: 'lax' });

  const redirectUrl = `${url.origin}/auth/callback`;
  return { vkAuthUrl: vkProvider.authURL + redirectUrl };
};
```

```ts
// src/routes/auth/callback/+server.ts
import { redirect, error } from '@sveltejs/kit';

export const GET = async ({ url, locals, cookies }) => {
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const storedState = cookies.get('oauth_state');
  const codeVerifier = cookies.get('oauth_verifier');

  // CSRF check
  if (!code || !state || state !== storedState) throw error(400, 'Invalid OAuth state');

  try {
    await locals.pb.collection('users').authWithOAuth2Code(
      'vk', code, codeVerifier || '', `${url.origin}/auth/callback`
    );
  } catch (err: any) {
    throw error(400, err.message);
  }

  cookies.delete('oauth_state', { path: '/' });
  cookies.delete('oauth_verifier', { path: '/' });
  throw redirect(303, '/dashboard');
};
```

## Important Notes

- PocketBase doesn't store VK tokens — it only uses them during auth, then issues its own JWT.
- VK doesn't support standard refresh tokens — use `offline` scope.
- SameSite must be `lax` — `strict` breaks OAuth redirects.

## Optional: @vkid/sdk for Custom UI

```bash
pnpm add @vkid/sdk
```
Use `VKID.OneTap` or `VKID.FloatingOneTap` widgets if you want VK-branded UI.
Works alongside PocketBase auth — exchange VK token for PB session server-side.
