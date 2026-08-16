/**
 * @file vk-pay.mjs
 * @description VK-PAY-* — validator for VK Pay integrations using
 *              VKWebAppOpenPayForm. Source verified against:
 *              - https://github.com/VKCOM/vk-mini-apps-api/blob/master/src/index.ts
 *                (official VKCOM package — canonical shape of props)
 *              - https://github.com/extype/vkpay/blob/master/site-example.php
 *                (VK Pay iframe signature example)
 *
 *   Checks:
 *
 *   1. VK-PAY-NESTED-PARAMS — VKWebAppOpenPayForm takes shape
 *      { action, app_id, params: {...} } — flag if `amount` appears at
 *      the top level instead of inside `params`.
 *
 *   2. VK-PAY-ACTION-VALID — `action` must be one of:
 *      'pay-to-user' | 'pay-to-group' | 'pay-to-service' |
 *      'transfer-to-user' | 'transfer-to-group'.
 *
 *   3. VK-PAY-MERCHANT-SIGN — for `action: 'pay-to-service'` the params
 *      should contain server-generated `merchant_data`/`merchant_sign`/`sign`.
 *      Without a signed payload, the server cannot verify the payment came
 *      from your app.
 *
 *   NOTE: We do NOT enforce `amount` type. The official VK JS SDK accepts
 *   `amount: number` in the `params` sub-object. Iframe protocol is separate.
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'vk-pay';
export const REQUIREMENTS = ['VK-PAY-NESTED-PARAMS', 'VK-PAY-ACTION-VALID', 'VK-PAY-MERCHANT-SIGN'];

const VALID_ACTIONS = new Set([
  'pay-to-user', 'pay-to-group', 'pay-to-service',
  'transfer-to-user', 'transfer-to-group',
]);

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Match bridge.send('VKWebAppOpenPayForm', { ... })
    const re = /bridge\.send\s*\(\s*["']VKWebAppOpenPayForm["']\s*,\s*(\{[\s\S]*?\})\s*\)/g;
    let m;
    while ((m = re.exec(t)) !== null) {
      const argStr = m[1];
      const line = t.slice(0, m.index).split('\n').length;

      // 1. Top-level `amount` without nested `params:`
      const hasTopAmount = /[,{\s]amount\s*:/.test(argStr);
      const hasParams = /\bparams\s*:\s*\{/.test(argStr);
      if (hasTopAmount && !hasParams) {
        issues.push({
          id: 'VK-PAY-NESTED-PARAMS',
          level: LEVELS.BLOCKER,
          message: 'VKWebAppOpenPayForm props: `amount` at top level. Canonical shape is { action, app_id, params: { amount, ... } }.',
          url: 'https://github.com/VKCOM/vk-mini-apps-api/blob/master/src/index.ts',
          file: f, line,
        });
      }

      // 2. action field validity
      const actionMatch = /\baction\s*:\s*["'](\w[\w-]*)["']/.exec(argStr);
      if (actionMatch) {
        if (!VALID_ACTIONS.has(actionMatch[1])) {
          issues.push({
            id: 'VK-PAY-ACTION-VALID',
            level: LEVELS.BLOCKER,
            message: `VKWebAppOpenPayForm action="${actionMatch[1]}" — not a recognised VK Pay action. Valid values: ${[...VALID_ACTIONS].join(', ')}.`,
            file: f, line,
          });
        }
      } else if (!/\baction\s*:/.test(argStr)) {
        issues.push({
          id: 'VK-PAY-ACTION-VALID',
          level: LEVELS.BLOCKER,
          message: 'VKWebAppOpenPayForm props missing `action` field.',
          file: f, line,
        });
      }

      // 3. merchant signature for pay-to-service
      const isPayToService = /action\s*:\s*["']pay-to-service["']/.test(argStr);
      if (isPayToService && !/merchant_data|merchant_sign|\bsign\s*:/.test(argStr)) {
        issues.push({
          id: 'VK-PAY-MERCHANT-SIGN',
          level: LEVELS.WARNING,
          message: 'pay-to-service VKWebAppOpenPayForm call has no merchant_data/merchant_sign/sign — server cannot verify the payment. Generate signature server-side with CLIENT_SECRET.',
          citation: "$params['sign'] = md5($sign) — signature per VK Pay iframe example",
          url: 'https://github.com/extype/vkpay/blob/master/site-example.php',
          file: f, line,
        });
      }
    }
  }

  return issues;
}
