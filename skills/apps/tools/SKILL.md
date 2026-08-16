---
name: tools-app
description: "Create tool web apps: QR generators, password generators, color pickers, JSON formatters, regex testers, markdown editors, gradient makers, lorem ipsum generators. Trigger on: generator, QR, password, color picker, JSON, regex, markdown, gradient, lorem ipsum, encoder, decoder, hash."
---

# Tools App Prototype

Developer and creative tools: instant, professional, handle edge cases.

## Sub-types

| Type | Input | Output |
|------|-------|--------|
| QR Generator | Text/URL | QR code |
| Password Gen | Length + options | Random password |
| Color Picker | Click/input | HEX, RGB, HSL |
| JSON Formatter | Raw JSON | Pretty + validated |
| Regex Tester | Pattern + text | Matches highlighted |
| Gradient Maker | Colors + direction | CSS code + preview |
| Markdown Editor | Markdown | Rendered HTML |

## Visual Style
- Slate: `#636E72, #00CEC9, #FAFBFC, #2D3436, #DFE6E9`
- OR Midnight dark: `#1E272E, #485460, #00CEC9, #D2DAE2`
- Monospace for code
- Copy button on every output
- Split-pane (input | output)

## Key Pattern: Copy Button
```javascript
async function copy(text, btn) {
  await navigator.clipboard.writeText(text);
  const orig = btn.textContent;
  btn.textContent = 'Copied!';
  btn.style.background = '#00B894';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1500);
}
```

## Checklist
- [ ] Input -> Output is instant
- [ ] Copy-to-clipboard works
- [ ] Edge cases handled
- [ ] Professional look
- [ ] Responsive
- [ ] Keyboard shortcuts
