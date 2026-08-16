---
name: yukassa-payments
description: >
  ЮKassa (YooKassa) payment integration for SvelteKit. Payment creation, SBP, recurring payments,
  webhooks (no HMAC — verify via GET!), refunds, 54-ФЗ receipts with НДС 22% (vat_code 11 since Jan 2026),
  and Checkout.js. Use this skill for Russian payments, ЮKassa, YooMoney, SBP, recurring, receipts, online-kassa.
---

# ЮKassa Payments Skill

Full payment integration with ЮKassa API v3.

## CRITICAL: 2026 Changes

- **НДС increased to 22%** since January 2026. Use `vat_code: 11` (not 1).
- Receipt item amounts **must sum to total payment amount exactly**.

## Payment Methods

| Method | Code | Limits |
|---|---|---|
| Bank card | `bank_card` | Standard |
| SBP (СБП) | `sbp` | 1–700,000 RUB. Desktop = QR, mobile = bank list |
| SberPay | `sberbank` | Via Sber app |
| YooMoney | `yoo_money` | e-wallet |
| Mir Pay | `mir_pay` | Mir cards |

## Recurring Payments

First payment: `save_payment_method: true`. Subsequent charges: use `payment_method_id` — no user interaction.
Supported on bank cards, YooMoney, Mir Pay, SberPay, SBP.

## Webhook Security

YooKassa has **NO HMAC signatures**. Security = IP whitelist + **always verify via GET API call**:
```
IPs: 185.71.76.0/27, 185.71.77.0/27, 77.75.153.0/25, 77.75.156.11, 77.75.156.35, 77.75.154.128/25
```
After webhook → `GET /v3/payments/{id}` → compare status. Return HTTP 200 to acknowledge — retries for 24 hours on failure.

## Test Cards

- `5555555555554444` — successful payment (non-3DS only for autopayments)
- Demo store rejects real cards.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Shop credentials server-only.** `YUKASSA_SHOP_ID` + `YUKASSA_SECRET_KEY` in `$env/static/private`.
2. **E — Every payment has Idempotence-Key.** UUID in header prevents double charges.
3. **R — Receipt uses vat_code 11 (22% НДС).** Per 54-ФЗ. Items sum to total exactly.
4. **U — Unhandled webhooks verified via GET.** Never trust webhook payload alone — always confirm with API.
5. **D — Duplicate charges prevented.** Idempotency key + payment status check before order update.
6. **D — Database update atomic.** Payment status + order status in single PocketBase transaction.
7. **A — All payment methods supported.** Bank card, SBP, SberPay, YooMoney. Recurring flow tested.

## References

- `references/yukassa-api.md` — Full API code, webhook handler with GET verification, SBP, recurring, Checkout.js.
