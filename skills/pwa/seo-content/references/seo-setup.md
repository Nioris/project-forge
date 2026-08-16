# SEO Setup — Full Reference

## SEO Head Component

```svelte
<!-- src/lib/components/SeoHead.svelte -->
<script lang="ts">
  import { page } from '$app/stores';

  interface Props {
    title: string;
    description: string;
    image?: string;
    type?: string;
    noindex?: boolean;
    jsonLd?: Record<string, unknown>;
  }

  let { title, description, image = '/og-default.png', type = 'website', noindex = false, jsonLd }: Props = $props();

  const siteName = 'МоёПриложение';
  const canonical = $derived($page.url.href);
</script>

<svelte:head>
  <title>{title} | {siteName}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />

  <!-- Open Graph -->
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:image" content={image} />
  <meta property="og:url" content={canonical} />
  <meta property="og:type" content={type} />
  <meta property="og:site_name" content={siteName} />
  <meta property="og:locale" content="ru_RU" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />

  <!-- Robots -->
  {#if noindex}
    <meta name="robots" content="noindex, nofollow" />
  {/if}

  <!-- Yandex & Google Verification -->
  <meta name="yandex-verification" content="YOUR_YANDEX_CODE" />
  <meta name="google-site-verification" content="YOUR_GOOGLE_CODE" />

  <!-- JSON-LD -->
  {#if jsonLd}
    {@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`}
  {/if}
</svelte:head>
```

## JSON-LD Helpers

```ts
// src/lib/seo/json-ld.ts
export function articleSchema(data: {
  title: string; description: string; url: string;
  image: string; datePublished: string; dateModified: string;
  authorName: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: data.title,
    description: data.description,
    image: data.image,
    url: data.url,
    datePublished: data.datePublished,
    dateModified: data.dateModified,
    author: { '@type': 'Person', name: data.authorName },
    publisher: {
      '@type': 'Organization',
      name: 'МоёПриложение',
      logo: { '@type': 'ImageObject', url: '/logo.png' },
    },
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

export function productSchema(data: {
  name: string; description: string; image: string;
  price: number; currency?: string; availability?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: data.name,
    description: data.description,
    image: data.image,
    offers: {
      '@type': 'Offer',
      price: data.price,
      priceCurrency: data.currency || 'RUB',
      availability: data.availability || 'https://schema.org/InStock',
    },
  };
}
```

## Sitemap Generation

```ts
// src/routes/sitemap.xml/+server.ts
import type { RequestHandler } from './$types';
import PocketBase from 'pocketbase';
import { PB_URL } from '$env/static/private';

export const GET: RequestHandler = async () => {
  const pb = new PocketBase(PB_URL);
  const pages = await pb.collection('pages').getFullList({ sort: '-updated' });

  const staticPages = ['/', '/about', '/pricing', '/contacts'];

  const urls = [
    ...staticPages.map(p => `<url><loc>https://yourapp.ru${p}</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>`),
    ...pages.map(p => `<url><loc>https://yourapp.ru/p/${p.slug}</loc><lastmod>${p.updated}</lastmod><changefreq>monthly</changefreq><priority>0.6</priority></url>`),
  ];

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`,
    { headers: { 'Content-Type': 'application/xml' } }
  );
};
```

## robots.txt

```ts
// src/routes/robots.txt/+server.ts
export const GET = () => new Response(
  `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /auth/\nSitemap: https://yourapp.ru/sitemap.xml`,
  { headers: { 'Content-Type': 'text/plain' } }
);
```
