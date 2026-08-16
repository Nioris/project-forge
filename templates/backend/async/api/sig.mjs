/**
 * Проверка подписи игрока Яндекс Игр.
 * Клиент присылает signature вида "<base64url подпись>.<base64url JSON данных>".
 * Сервер пересчитывает HMAC-SHA256 от второй части секретным ключом из Консоли
 * и сравнивает. ID игрока брать ТОЛЬКО отсюда, никогда из тела запроса.
 *
 * ⚠️ Если проверка стабильно не проходит — сверь алгоритм с актуальным разделом
 * «Защита от накруток» в документации Яндекс Игр: формат подписи мог измениться.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');

export function verifyYandexSignature(signature, secret) {
  if (!signature || typeof signature !== 'string' || !secret) return null;
  const dot = signature.indexOf('.');
  if (dot < 1) return null;
  const sigPart = signature.slice(0, dot);
  const dataPart = signature.slice(dot + 1);

  const expected = b64u(createHmac('sha256', secret).update(dataPart).digest());
  const a = Buffer.from(sigPart), b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(dataPart, 'base64url').toString('utf8'));
    if (!data || !data.id) return null;
    return { id: String(data.id), name: data.name || null, raw: data };
  } catch { return null; }
}
