---
name: tailwind-mobile
description: >
  Mobile-first Tailwind CSS 4.x design system for SvelteKit PWA targeting 45+ audience. CSS-first config,
  safe areas, 48px touch targets, Cyrillic font stack, 18px base, 7:1 AAA contrast, dark mode, bottom nav.
  Use this skill for mobile UI, responsive design, Tailwind for mobile, safe areas, accessibility, or
  touch-friendly UI in SvelteKit.
---

# Tailwind Mobile Skill

Tailwind CSS 4.x mobile-first design system for Russian 45+ audience.

## Tailwind v4: CSS-First Setup

```bash
npm install tailwindcss @tailwindcss/vite
```

```css
/* src/app.css */
@import "tailwindcss";
@custom-variant dark (&:where(.dark, .dark *));

@theme {
  --font-sans: "Inter", "PT Sans", "Noto Sans", system-ui, sans-serif;
  --color-accent: #0055aa;       /* 7.2:1 on white — AAA */
  --color-text-primary: #1a1a1a; /* 16.1:1 on white */
  --spacing-touch: 48px;
}

@layer base {
  html { font-size: 18px; line-height: 1.7; }
}
```

## Design Rules for 45+ Audience

- **Touch targets**: **48×48px** minimum (exceeds WCAG AAA 44px). `min-h-[48px] min-w-[48px]`.
- **Font size**: 18px base — Cyrillic Ж, Щ, Ы need larger sizes for readability.
- **Line height**: 1.6–1.8 for Cyrillic body text.
- **Contrast**: Target **7:1 AAA**. Minimum 4.5:1 AA. Never use `#999` on white (2.8:1 — fails AA).
- **Cyrillic fonts**: **Inter** (best UI), **PT Sans/Serif** (designed for RF), **Noto Sans** (universal).

## Common Mistakes

- `sm:` means ≥640px, not mobile. Unprefixed = mobile in Tailwind.
- Missing `@custom-variant dark` in v4 → dark mode breaks.
- Bottom nav needs `pb-20` on main content + `safe-area-inset-bottom` for notched devices.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Safe area insets on all edges.** `env(safe-area-inset-*)` for notch, home indicator, gesture bar.
2. **E — Every interactive element ≥ 48×48px.** Buttons, links, inputs meet WCAG AAA.
3. **R — Responsive 320px to 1440px.** Tested on iPhone SE (320px). Breakpoints: sm:640, md:768, lg:1024.
4. **U — User dark mode preference honored.** `prefers-color-scheme` + manual toggle. `@custom-variant dark`.
5. **D — Design tokens in @theme block.** Tailwind v4 CSS-first config. No tailwind.config.ts.
6. **D — Disabled states visible.** `opacity-50 pointer-events-none`. Focus rings on all interactive elements.
7. **A — Animations respect reduced motion.** `motion-safe:` prefix. `prefers-reduced-motion` honored.

## References

- `references/tailwind-mobile-system.md` — App shell, bottom nav, dark toggle, pull-to-refresh, font loading.
