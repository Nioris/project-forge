---
name: finance-app
description: "Create financial web apps: budget trackers, expense managers, savings goals, investment dashboards, currency converters, loan calculators. Trigger on: finance, budget, money, expenses, savings, investment, stocks, crypto, currency, loan, mortgage, invoice."
---

# Finance App Prototype

Finance apps need trust (professional look), clarity (numbers readable), actionable insights.

## Sub-types

| Type | Core | Key UI |
|------|------|--------|
| Budget tracker | Income vs expenses | Pie chart, balance |
| Expense logger | Log spending | Calendar, totals |
| Savings goal | Track progress | Progress ring, milestones |
| Investment dashboard | Portfolio | Line chart, gain/loss |
| Currency converter | Convert amounts | Input/output, swap |
| Loan calculator | Monthly payment | Amortization schedule |
| Invoice generator | Create invoices | PDF-like layout |

## Visual Style
- Amber/Gold: `#F39C12, #FDCB6E, #2D3436, #636E72, #FAFBFC`
- OR Ocean/Blue: `#0984E3, #74B9FF, #2D3436, #DFE6E9, #FAFBFC`
- Numbers in monospace, right-aligned
- Green positive, red negative
- Currency symbols prominent

## Key Code

```javascript
function formatMoney(amount, currency = '$') {
  const formatted = Math.abs(amount).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}${currency}${formatted}`;
}

function drawPieChart(canvas, categories) {
  const ctx = canvas.getContext('2d');
  const cx = canvas.width/2, cy = canvas.height/2, r = 70;
  let angle = -Math.PI/2;
  const total = categories.reduce((s,c) => s + c.amount, 0);
  for (const cat of categories) {
    const slice = (cat.amount / total) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, angle, angle + slice);
    ctx.fillStyle = cat.color; ctx.fill();
    angle += slice;
  }
  ctx.beginPath(); ctx.arc(cx, cy, r*0.55, 0, Math.PI*2);
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.fillStyle = '#2D3436'; ctx.font = 'bold 18px system-ui';
  ctx.textAlign = 'center'; ctx.fillText(formatMoney(total), cx, cy+6);
}
```

## Checklist
- [ ] Numbers formatted with commas and currency
- [ ] Green/red for positive/negative
- [ ] At least one chart
- [ ] Add/edit/delete entries
- [ ] Totals correct
- [ ] localStorage persistence
- [ ] Responsive
