# ЮKassa API — Full Reference

## CRITICAL: vat_code 11 since January 2026 (НДС 22%)

## Payment Service

```ts
// src/lib/server/yukassa.ts
import { YUKASSA_SHOP_ID, YUKASSA_SECRET_KEY } from '$env/static/private';

const API = 'https://api.yookassa.ru/v3';
const auth = Buffer.from(`${YUKASSA_SHOP_ID}:${YUKASSA_SECRET_KEY}`).toString('base64');

export async function createPayment(params: {
  amount: number; description: string; returnUrl: string;
  customerEmail: string; items: any[]; metadata?: Record<string,string>;
  paymentMethodType?: 'bank_card' | 'sbp' | 'sberbank' | 'yoo_money';
  savePaymentMethod?: boolean;
}) {
  const body: any = {
    amount: { value: params.amount.toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: params.returnUrl },
    description: params.description,
    metadata: params.metadata || {},
    receipt: {
      customer: { email: params.customerEmail },
      items: params.items.map(i => ({
        description: i.name,
        quantity: String(i.qty),
        amount: { value: i.price.toFixed(2), currency: 'RUB' },
        vat_code: 11,  // 22% НДС since Jan 2026!
        measure: 'piece',
        payment_subject: 'commodity',
        payment_mode: 'full_payment',
      })),
    },
  };

  if (params.paymentMethodType) {
    body.payment_method_data = { type: params.paymentMethodType };
  }
  if (params.savePaymentMethod) {
    body.save_payment_method = true;
  }

  const res = await fetch(`${API}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Idempotence-Key': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`YooKassa: ${(await res.json()).description || res.statusText}`);
  return res.json();
}

// Recurring: charge saved payment method (no user interaction)
export async function chargeRecurring(paymentMethodId: string, amount: number, description: string, customerEmail: string) {
  const res = await fetch(`${API}/payments`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Idempotence-Key': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: { value: amount.toFixed(2), currency: 'RUB' },
      capture: true,
      payment_method_id: paymentMethodId,
      description,
      receipt: {
        customer: { email: customerEmail },
        items: [{ description, quantity: '1',
          amount: { value: amount.toFixed(2), currency: 'RUB' },
          vat_code: 11, measure: 'piece', payment_subject: 'service', payment_mode: 'full_payment',
        }],
      },
    }),
  });
  return res.json();
}

export async function getPayment(id: string) {
  const res = await fetch(`${API}/payments/${id}`, {
    headers: { 'Authorization': `Basic ${auth}` },
  });
  return res.json();
}

export async function createRefund(paymentId: string, amount: number) {
  const res = await fetch(`${API}/refunds`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Idempotence-Key': crypto.randomUUID(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ payment_id: paymentId, amount: { value: amount.toFixed(2), currency: 'RUB' } }),
  });
  return res.json();
}
```

## Webhook Handler — ALWAYS verify via GET

```ts
// src/routes/api/webhooks/yukassa/+server.ts
import { json, error } from '@sveltejs/kit';
import { getPayment } from '$lib/server/yukassa';
import PocketBase from 'pocketbase';
import { PB_URL, PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD } from '$env/static/private';

// YooKassa has NO HMAC signatures. Security = IP whitelist + GET verification.
const ALLOWED_PREFIXES = ['185.71.76.', '185.71.77.', '77.75.153.', '77.75.156.', '77.75.154.'];

export const POST = async ({ request, getClientAddress }) => {
  // IP check (basic — use proper CIDR matching in production)
  const ip = getClientAddress();
  const allowed = ALLOWED_PREFIXES.some(prefix => ip.startsWith(prefix));
  if (!allowed) throw error(403, 'Forbidden');

  const body = await request.json();
  if (body.type !== 'notification') throw error(400);

  const paymentId = body.object?.id;
  if (!paymentId) return json({ status: 'ignored' });

  // CRITICAL: Always verify payment status via GET API call
  const payment = await getPayment(paymentId);
  const orderId = payment.metadata?.orderId;
  if (!orderId) return json({ status: 'ignored' });

  const pb = new PocketBase(PB_URL);
  await pb.collection('_superusers').authWithPassword(PB_ADMIN_EMAIL, PB_ADMIN_PASSWORD);

  const statusMap: Record<string, string> = {
    'succeeded': 'paid', 'canceled': 'cancelled',
    'waiting_for_capture': 'awaiting_capture',
  };
  const orderStatus = statusMap[payment.status];
  if (orderStatus) {
    await pb.collection('orders').update(orderId, {
      paymentStatus: payment.status,
      orderStatus,
      paidAt: payment.status === 'succeeded' ? new Date().toISOString() : undefined,
    });
  }

  return json({ status: 'ok' }); // Return 200 — YooKassa retries for 24h on failure
};
```

## Test Cards

- `5555555555554444` — successful (non-3DS, for autopayment testing)
- Demo store rejects real cards. Switch to live mode for real testing.

## SBP Payment Example

```ts
const payment = await createPayment({
  amount: 1500,
  description: 'Заказ #123',
  returnUrl: 'https://yourapp.ru/orders/123',
  customerEmail: 'user@example.com',
  items: [{ name: 'Подписка', qty: 1, price: 1500 }],
  paymentMethodType: 'sbp', // Desktop = QR, mobile = bank list. Max 700,000 RUB.
});
```
