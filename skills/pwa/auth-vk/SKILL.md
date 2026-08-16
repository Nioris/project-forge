---
name: auth-vk
description: >
  VK OAuth authentication for SvelteKit using PocketBase built-in VK provider. Covers both popup and
  server-side flows, PKCE, state CSRF validation, SSO patterns, and session management. Use this skill
  for VK login, VK ID, VK OAuth, social login Russia, "Войти через ВК", or PocketBase OAuth.
---

# VK Auth Skill

VK authentication via **PocketBase built-in VK OAuth provider** (simplest approach).

## Two Approaches

### 1. Client-Side Popup (Simplest)

```ts
const authData = await pb.collection('users').authWithOAuth2({ provider: 'vk' });
// Done! PocketBase handles everything.
```

### 2. Server-Side SSR Flow

```ts
// +page.server.ts load
const authMethods = await locals.pb.collection('users').listAuthMethods();
const vkProvider = authMethods.oauth2?.providers?.find(p => p.name === 'vk');
cookies.set('oauth_state', vkProvider.state, { path: '/', httpOnly: true });
cookies.set('oauth_verifier', vkProvider.codeVerifier, { path: '/', httpOnly: true });
return { authProviderRedirect: vkProvider.authURL + url.origin + '/auth/callback' };
```

## Setup in PocketBase

1. Dashboard → Collection → users → OAuth2 → VK
2. Enter Client ID and Secret from VK developer dashboard
3. Redirect URL: `https://yourdomain.com/api/oauth2-redirect`

## SSO Across Multiple PWA Apps

Single PocketBase at `api.example.com` with cookie domain `.example.com` — all subdomains share auth.
For different domains: central auth service with short-lived authorization codes.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — State parameter validated against stored cookie.** CSRF protection mandatory.
2. **E — Export cookie with SameSite: 'lax'.** `strict` breaks OAuth redirects.
3. **R — Redirect flow completes in < 3 s.** No unnecessary round-trips.
4. **U — User profile synced on login.** Name, avatar from VK stored in PB user record.
5. **D — Duplicate accounts prevented.** PB handles OAuth linking by email/provider ID.
6. **D — Denial graceful.** User cancels VK consent → redirect with error, no crash.
7. **A — Also supports @vkid/sdk for custom UI.** VK One Tap widget available as option.

## Important Notes

- PocketBase doesn't store OAuth provider tokens — only uses them during initial auth, then issues own JWT.
- VK doesn't support standard refresh tokens — use `offline` scope for long-lived access.
- Safari: don't use `async/await` in OAuth click handler — popup is blocked.

## References

- `references/vk-auth-setup.md` — PocketBase OAuth config, popup flow, SSR flow, VK ID SDK custom UI.
