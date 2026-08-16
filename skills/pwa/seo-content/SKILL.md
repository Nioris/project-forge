---
name: seo-content
description: >
  SEO for SvelteKit targeting Yandex + Google. SSG with adapter-static, JSON-LD, Yandex behavioral signals,
  IndexNow, Host/Clean-param directives, OG for VK/Telegram, and sitemap generation. Use this skill for
  SEO, meta tags, Yandex Webmaster, Open Graph, structured data, sitemap, or search optimization.
---

# SEO Content Skill

Production SEO for SvelteKit 2.x — Yandex-first, Google-compatible.

## Yandex-Specific Ranking Factors

- **Behavioral signals are primary**: session duration, bounce rate, pogo-sticking.
- **Regional geo-targeting critical**: set up to 7 target regions in Yandex.Webmaster.
- **JS rendering is weaker than Google**: SSG/SSR mandatory. Use `adapter-static` + `prerender = true`.
- **IndexNow**: instant indexing, up to 100 URLs/day. Submit to both Yandex and Bing simultaneously.

## SSG Setup

```ts
// src/routes/+layout.ts
export const prerender = true;
export const trailingSlash = 'never';
```

## robots.txt for Yandex

Include Yandex-specific directives:
```
Host: yourdomain.com
Clean-param: utm_source&utm_medium /
```

## Social Sharing (Russian platforms)

- VK reads standard OG tags. Clear cache: `vk.com/dev/pages.clearCache`
- Telegram prefers Twitter Card tags.
- OK.ru uses OG.
- Universal image: **1200×630px**, absolute HTTPS URLs. `og:locale` = `ru_RU`.

## JSON-LD in SvelteKit

Always use `{@html}` pattern — direct `<script>` in `<svelte:head>` causes duplicate tags during SSR.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — SSR/SSG renders all meta in raw HTML.** View source shows title, description, OG. Yandex needs this.
2. **E — Every page has unique title + description.** No duplicates across pages.
3. **R — robots.txt has Host: and Clean-param:.** Yandex-specific directives included.
4. **U — URL canonicalization enforced.** `<link rel="canonical">` on every page. Trailing slash consistent.
5. **D — Dynamic JSON-LD validated.** Article, Product, BreadcrumbList pass Google Rich Results Test.
6. **D — Dual webmaster verified.** Yandex + Google verification meta tags. Registered in Yandex.Business.
7. **A — Automatic IndexNow on publish.** New/updated content pings IndexNow endpoint within 1 minute.

## References

- `references/seo-setup.md` — SeoHead component, JSON-LD helpers, sitemap, robots.txt, IndexNow integration.
