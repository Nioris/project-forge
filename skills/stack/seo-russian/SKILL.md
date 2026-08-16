---
name: seo-russian
description: "Russian SEO: Yandex Webmaster, SvelteKit SSG articles, meta tags, sitemap, structured data. Triggers on: SEO, yandex, articles, content, sitemap, meta, SSG."
---
# Russian SEO

## Purpose
Organic traffic from Yandex. SSG articles with SvelteKit.

## Instructions

### Step 1: Article Structure
```markdown
---
title: "Когда сажать помидоры в 2027 году"
description: "Сроки посадки томатов по регионам России"
keywords: "посадка помидоров, сроки, 2027"
date: "2027-02-15"
---
# H1: Когда сажать помидоры — сроки по регионам
## H2: Средняя полоса
## H2: Сибирь и Урал
```

### Step 2: Meta Tags
```svelte
<svelte:head>
  <title>{article.title}</title>
  <meta name="description" content={article.description} />
  <meta property="og:title" content={article.title} />
  <link rel="canonical" href="https://app.ru/blog/{article.slug}" />
</svelte:head>
```

## Non-Negotiable Acceptance Criteria
- [ ] Every page has title + description
- [ ] Sitemap.xml generated
- [ ] Yandex.Metrika counter installed
- [ ] Articles 1500-3000 words, Russian
- [ ] Internal links to app features
