---
name: finance-app-foundation
kind: architectural
description: "Architectural foundation для finance/fintech apps. Поверх app-data-model + permissions добавляет: PCI-DSS compliance hooks, transaction integrity (atomic + audit), decimal…"
---

# Finance App Foundation — money handling done right

## Зачем

Финансовые приложения = высокий риск + жёсткое регулирование:

- **PCI-DSS** — если касаешься card data, даже косвенно (Stripe iframe не освобождает от responsibilities)
- **РФ Финмониторинг (115-ФЗ)** — anti-money-laundering для крупных сумм
- **РФ ФЗ-152** — финансовые данные = special category
- **GDPR** — financial data is "ordinary" но requires lawful basis
- **EU PSD2** — strong customer authentication для платежей >€30
- **Налоговое законодательство** — exports должны быть compatible с налоговой отчётностью

Технические ловушки:
- **Float arithmetic** — `0.1 + 0.2 !== 0.3` в JavaScript. Один такой bug = разозлённые пользователи + lawsuit risk.
- **No transaction atomicity** — частичный update transfer money = lost funds
- **Currency formatting** — "$1,000.50" vs "1.000,50 €" vs "1 000,50 ₽" — locale-dependent
- **Race conditions** — двойной spend без proper locking
- **Audit trail missing** — disputes без audit = guaranteed loss

Это **architectural skill**, требующий precision уровня которого random app skill не имеет.

## Когда вызывать

После `$start` для category=finance, ПОСЛЕ:
- `$i18n-foundation` — локализация (особенно number formatting)
- `$app-data-model` — entities (расширяется decimal + audit layer)
- `$app-permissions` — RBAC (для multi-account/family budget apps)
- `$app-onboarding-flow` — onboarding (с trust UX)

Subcategories:
- **Personal budgeting** (income/expense tracking) — minimal compliance
- **Investment tracking** (portfolio, P/L) — disclaimer + decimal arithmetic critical
- **Crypto wallets** — extreme security + private key management
- **Lending / credit** — regulatory disclosure
- **Bank-connected** (Open Banking, Plaid) — PSD2 + bank API auth

## Pipeline

### Шаг 1 — Read context, classify subcategory

```
wiki/_map.md                       # category should be finance
wiki/architecture/data-model.md    # transactions, accounts, etc
```

Spawn разговор с юзером если subcategory неясна:
- "Это бюджетный трекер для личных трат, или подключаешь банковские счета?"
- "Будут ли пользователи переводить друг другу деньги или только tracking?"
- "Investment tracking — реальные позиции или только обучение/симуляция?"

### Шаг 2 — Decimal arithmetic — NO FLOAT for money

JavaScript Number == IEEE 754 float. **Никогда** для денег:

```javascript
0.1 + 0.2;           // 0.30000000000000004
1.005 * 100;         // 100.49999999999999  (rounds wrong)
0.07 - 0.06;         // 0.009999999999999996
```

**Решение:** хранить как **integer minor units** (центы / копейки) ИЛИ использовать decimal library.

#### Approach 1: Integer minor units (recommended)

```typescript
// All money stored as integer of smallest currency unit
// USD: cents (1/100)
// JPY: yen (1/1)  // no minor unit
// BTC: satoshi (1/100,000,000)

interface Money {
  amount: bigint;       // integer minor units
  currency: string;     // ISO 4217 (USD, EUR, RUB) or crypto (BTC, ETH)
}

// Arithmetic
function add(a: Money, b: Money): Money {
  if (a.currency !== b.currency) throw new Error('Currency mismatch');
  return { amount: a.amount + b.amount, currency: a.currency };
}

// Display
function format(money: Money, locale = 'en'): string {
  const major = Number(money.amount) / 100;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
  }).format(major);
}
```

#### Approach 2: decimal.js library

```typescript
import Decimal from 'decimal.js';

const a = new Decimal('0.1');
const b = new Decimal('0.2');
a.plus(b).toString();  // '0.3' — correct
```

Use library for tax calculations / interest где нужно много precision. Integer minor units для всего остального.

**ENFORCE через verifier**: создать `scripts/check-no-float-money.mjs` который flag'ит любые `.balance`, `.amount`, `.price` с типом `number` (не `bigint` / `Decimal`).

### Шаг 3 — Transaction integrity

Money operations = ATOMIC. Транзакция между счетами:

```typescript
// WRONG — partial failure = lost funds
async function transfer(from: Account, to: Account, amount: Money) {
  await accountRepo.debit(from, amount);
  // If process crashes here — money debited but not credited!
  await accountRepo.credit(to, amount);
}

// CORRECT — atomic via transaction
async function transfer(from: Account, to: Account, amount: Money) {
  await db.transaction(async (tx) => {
    // Within transaction — all-or-nothing
    await tx.account.debit(from, amount);
    await tx.account.credit(to, amount);
    await tx.audit.log({
      type: 'transfer',
      from: from.id,
      to: to.id,
      amount,
      timestamp: Date.now(),
      userId: currentUser.id,
    });
  });
}
```

For client-side (no server): use IndexedDB transactions. For sync to cloud: use server-side ACID transactions.

### Шаг 4 — Audit log (NEVER skip)

Every money-changing operation → audit entry. Not just for permissions (как в `$app-permissions`), а **финансовый аудит**:

```typescript
interface FinancialAuditEntry {
  id: string;
  type: 'create_account' | 'transfer' | 'deposit' | 'withdraw' | 'reconcile' | 'edit_transaction' | 'delete_transaction';
  userId: string;
  accountId: string;
  amount?: Money;
  balanceBefore?: Money;
  balanceAfter?: Money;
  counterparty?: string;  // Account ID or merchant name
  metadata?: Record<string, any>;  // Reason, transaction ID, etc.
  timestamp: number;
  ipAddress?: string;
  deviceId?: string;
}
```

Audit log = **append-only**, never deleted. Even if user "deletes a transaction" — log shows the deletion event.

Retention: minimum 7 years для tax (РФ требование 4 года, но 7 лет общепринято).

### Шаг 5 — Currency handling

Multi-currency apps complex:

```typescript
// Storage: always store original currency, never auto-convert
interface Transaction {
  id: string;
  amount: Money;          // original currency
  exchangeRate?: number;  // rate at time of transaction (if cross-currency)
  baseCurrencyAmount?: Money;  // converted to user's base currency at time
  // baseCurrencyAmount snapshotted — don't recompute (rates change)
}
```

Display:
- Show original currency by default
- Optionally show "≈ {converted}" for context
- Use Intl.NumberFormat per locale
- Handle RTL languages (Arabic) для финансовых apps в этих regions

Exchange rates:
- Use API (e.g. exchangeratesapi.io, OpenExchangeRates)
- Cache for 1-24 hours (rates don't change drastically)
- Snapshot rate at transaction time — do NOT recompute historical transactions

### Шаг 6 — Privacy + sensitive data

Encrypt at-rest:

```typescript
const SENSITIVE_FIELDS = [
  'accountNumber',     // bank account
  'cardLast4',         // even last 4 — PCI
  'taxId',             // SSN/INN
  'address',           // KYC info
  'incomeBracket',     // for investing apps
];
```

Use same encryption pattern as `$health-app-foundation` (PBKDF2 + AES-GCM).

**NEVER store**:
- Full card numbers (PAN) — even encrypted, you become PCI-DSS Level 1
- CVV / CVC — never, even briefly
- Bank login credentials — use OAuth/Plaid/etc

Use payment processor (Stripe / Tinkoff API / etc) — they handle PCI scope.

### Шаг 7 — Disclaimer + regulatory text

Subcategory determines disclaimers:

#### Personal budgeting (minimal)
> "{App} помогает отслеживать траты. Это инструмент для личного использования, не финансовое консультирование."

#### Investment tracking (heavy)
> "{App} — инструмент отслеживания инвестиций. Это **не** инвестиционный совет. Прошлая доходность не гарантирует будущей. Перед инвестициями проконсультируйся с лицензированным финансовым советником. Investing involves risk of loss."

#### Crypto wallets (max)
> "{App} non-custodial wallet. Ты sole responsible за safety своего seed phrase. Потерянная фраза = потерянные средства. {App} не имеет доступа к твоим ключам и не может их восстановить. Не делись seed phrase ни с кем. Crypto markets are volatile and largely unregulated."

#### Lending / credit
> Regulatory disclosure varies by jurisdiction. Russia: ЦБ требования. EU: APR disclosure. US: TILA disclosure. Consult legal counsel.

Display:
- On first run (acknowledge to proceed)
- In settings → "About / Disclaimers"
- On every page where regulated info shown (е.g. portfolio P/L view)

### Шаг 8 — Trust UX

Финансовые apps живут на доверии. UX patterns:

#### Confirmation для destructive ops
- Delete transaction: confirm modal с amount preview
- Transfer >threshold: re-auth (biometric/passcode)
- Edit historical transaction: warn "This affects past month's summary"

#### Visual reassurance
- "✓ Saved" indicators after every save (not just toast)
- Last sync timestamp visible
- Connection status indicator (online/offline/syncing)
- Bank logos for connected accounts (if applicable)

#### Anti-anxiety patterns
- Never show "−$X loss" в красном без context (e.g. "this month's normal range")
- Show trend arrow with "compared to {period}"
- Avoid 0% balance or "$0" displays without explanation (looks like data lost)

#### Error handling
- Network errors: "Не удалось синхронизировать. Данные сохранены локально." (not "ERROR")
- API timeouts: graceful retry with progress indicator
- Conflict resolution: show both versions, ask user to choose

### Шаг 9 — Backups + export для tax

Russian users → налоговая requires expenses report для tax deductions. EU users → annual statements.

```typescript
// src/finance/export/tax-export.ts
export async function generateTaxReport(year: number, format: 'pdf' | 'csv' | 'xml'): Promise<Blob> {
  const transactions = await txRepo.list({
    year,
    types: ['expense', 'donation'],  // tax-relevant only
  });

  const grouped = groupBy(transactions, tx => tx.category);

  if (format === 'pdf') return renderTaxPDF(grouped);
  if (format === 'csv') return renderTaxCSV(grouped);
  if (format === 'xml') return renderTaxXML(grouped);  // 1С-Налогоплательщик format
}
```

Format compatible with major tax software:
- РФ: 1С формат XML, ФНС CSV
- US: TurboTax CSV, IRS Schedule formats
- EU: country-specific

### Шаг 10 — Generate `src/finance/` structure

```
src/finance/
├── money/
│   ├── types.ts         # Money interface (bigint amount + currency)
│   ├── arithmetic.ts    # add, subtract, multiply, divide (typed)
│   ├── format.ts        # display formatting per locale
│   └── currency.ts      # exchange rates, conversion
├── transaction/
│   ├── atomic.ts        # transactional wrappers
│   ├── audit.ts         # financial audit log
│   ├── validate.ts      # business rule validation
│   └── reconcile.ts     # reconciliation logic
├── encryption/
│   └── (reuse from health-app-foundation if present)
├── export/
│   ├── tax-export.ts    # tax-format reports (РФ XML, US CSV, etc)
│   ├── statement.ts     # bank-statement-style PDF
│   └── csv.ts           # generic CSV
├── compliance/
│   ├── disclaimer.ts    # regulatory disclaimers per subcategory
│   └── kyc.ts           # (if applicable) KYC flow
└── ui/
    ├── confirmation.tsx     # destructive op confirmations
    ├── disclaimer-modal.tsx
    └── tax-export.tsx
```

### Шаг 11 — Verifier: `scripts/check-no-float-money.mjs`

```javascript
#!/usr/bin/env node
/**
 * Scan src/ for any field looking like money (.balance, .amount, .price, .total)
 * with type `number` instead of `bigint` or `Money`.
 */

import fs from 'fs';
import path from 'path';

const MONEY_FIELDS = ['balance', 'amount', 'price', 'total', 'subtotal', 'cost', 'fee', 'tax', 'change', 'paid', 'owe'];
const NUMBER_TYPES = ['number'];  // we want bigint or Money

function walk(dir) { /* same as check-inline-strings */ }

const violations = [];
for (const file of walk('src')) {
  const content = fs.readFileSync(file, 'utf8');
  // Look for: `: number` after a money-looking field
  for (const field of MONEY_FIELDS) {
    const re = new RegExp(`(${field})\\s*:\\s*number\\b`, 'gi');
    let m;
    while ((m = re.exec(content)) !== null) {
      const lineNum = content.slice(0, m.index).split('\n').length;
      violations.push({ file, line: lineNum, field: m[1] });
    }
  }
}

if (violations.length) {
  console.log(`✗ ${violations.length} float-typed money fields:`);
  violations.forEach(v => console.log(`  ${v.file}:${v.line}  ${v.field}: number  →  use bigint or Money`));
  process.exit(1);
}
console.log('✓ No float-typed money fields detected');
```

### Шаг 12 — Document

Save to `wiki/design/finance-foundation.md` — structure analogous to health-foundation.md.

## Common pitfalls

1. **Float for money** — Most common bug. ENFORCE through verifier + code review.

2. **No atomicity** — `await debit(from); await credit(to);` — process crashes between = lost funds. Always transactional.

3. **No audit trail** — disputes без audit = customer always wins. Audit from day 1.

4. **Currency mixing** — adding USD + EUR = nonsense. Type system should prevent (Money has currency tag).

5. **Storing card data** — even encrypted = PCI scope explodes. Use payment processors.

6. **Display before format** — `${amount}` instead of `formatMoney(amount, locale)` = wrong currency symbol, wrong decimals, wrong separators.

7. **Tax export missing** — frustrated users at year-end = bad reviews. Build from day 1.

8. **No re-auth for transfers** — biometric/passcode for >threshold operations is industry standard.

## Non-Negotiable

- [ ] Subcategory classified
- [ ] Money type uses `bigint` minor units OR Decimal library — NEVER `number`
- [ ] All money operations within transactions (atomic)
- [ ] Financial audit log (append-only, 7-year retention)
- [ ] Sensitive fields encrypted at-rest
- [ ] NO storage of full card numbers / CVV
- [ ] Currency handling with snapshot rates
- [ ] Disclaimer per subcategory on first run + always accessible
- [ ] Trust UX patterns (confirmations, sync status, anti-anxiety displays)
- [ ] Tax export functionality from day 1
- [ ] Re-auth for transfers >threshold
- [ ] Verifier script `check-no-float-money.mjs` in CI
- [ ] Document в `wiki/design/finance-foundation.md`
