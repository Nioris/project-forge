---
name: tailwind-system
description: "Tailwind CSS 4.x design system: theme tokens, component patterns, responsive, dark mode, 18px+ fonts, 48px+ touch. Triggers on: tailwind, CSS, theme, design, responsive, dark mode."
---
# Tailwind Design System

## Purpose
Consistent accessible UI. Font 18px+, touch 48px+, Russian text.

## Instructions

### Step 1: Theme (app.css)
```css
@import 'tailwindcss';
@theme {
  --color-primary: #16A34A;
  --color-primary-light: #DCFCE7;
  --color-surface: #FFFFFF;
  --color-background: #F0FDF4;
  --color-text: #1C1917;
  --color-text-secondary: #57534E;
  --color-border: #E7E5E4;
  --color-success: #16A34A;
  --color-warning: #EA580C;
  --color-danger: #DC2626;
  --font-size-base: 1.125rem;
}
```

### Step 2: Patterns
```html
<!-- Button: min 48px touch -->
<button class="bg-primary text-white px-6 py-3 rounded-xl text-lg font-semibold min-h-12 active:scale-95 transition-transform">Текст</button>

<!-- Card -->
<div class="bg-surface rounded-2xl p-4 shadow-sm border border-border">
  <h3 class="text-lg font-bold">Заголовок</h3>
</div>

<!-- Bottom Nav -->
<nav class="fixed bottom-0 inset-x-0 bg-surface border-t flex justify-around py-2 pb-safe">
  <button class="flex flex-col items-center min-w-16 min-h-12">
    <span class="text-xs mt-0.5">Таб</span>
  </button>
</nav>
```

## Non-Negotiable Acceptance Criteria
- [ ] Font >= 18px
- [ ] Touch targets >= 48px
- [ ] Colors via theme tokens only
- [ ] Dark mode via class strategy
- [ ] All UI text in Russian
