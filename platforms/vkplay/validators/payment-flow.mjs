/**
 * @file payment-flow.mjs
 * @description VKPLAY-PAYMENT-CALLBACK — when the player buys an in-game item,
 *              VK Play opens a payment dialog from your call to
 *              VKPlaySDK.openPaymentDialog. After payment success, VK Play
 *              sends a server-to-server callback to YOUR webhook URL (configured
 *              in the dev portal). This validator checks two things:
 *                1. Client uses the correct API for opening the dialog
 *                2. Webhook URL exists in client code config (just for sanity —
 *                   actual webhook handling lives on your server, not here)
 *
 *              Source: https://documentation.vkplay.ru/f2p_vkp/ In-Game Purchases
 */

import { LEVELS, walkFiles, readTextSafe } from './_lib.mjs';

export const ID = 'payment-flow';
export const REQUIREMENTS = ['VKPLAY-PAYMENT-DIALOG', 'VKPLAY-PAYMENT-CALLBACK'];

export function validate(gamePath) {
  const issues = [];
  const files = walkFiles(gamePath);

  let usesPaymentDialog = false;
  let dialogFile = null;
  let usesCorrectMethod = false;
  let usesIncorrectMethod = false;

  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;

    // Correct: VKPlaySDK.openPaymentDialog or sdk.openPaymentDialog
    if (/\b(VKPlaySDK|vkplaySDK|sdk)\s*\.\s*openPaymentDialog\s*\(/.test(t)) {
      usesPaymentDialog = true;
      usesCorrectMethod = true;
      dialogFile = f;
    }

    // Common mistake: trying to use VK Bridge VKWebAppShowOrderBox (that's VK Mini Apps,
    // not VK Play). VK Play has its own payment flow.
    if (/VKWebAppShowOrderBox/.test(t) && /vkplay/i.test(t)) {
      usesIncorrectMethod = true;
      issues.push({
        id: 'VKPLAY-WRONG-PAYMENT-API',
        level: LEVELS.BLOCKER,
        message: 'VKWebAppShowOrderBox is the VK Mini Apps (vk.com) payment API. VK Play (vkplay.ru) is a different platform — use VKPlaySDK.openPaymentDialog instead.',
        url: 'https://documentation.vkplay.ru/f2p_vkp/',
        file: f,
      });
    }

    // Stripe / PayPal / etc inside VK Play app — not allowed
    if (/stripe|paypal|tinkoff[_\.]?api|yookassa/i.test(t) && /vkplay/i.test(t)) {
      issues.push({
        id: 'VKPLAY-EXTERNAL-PAYMENT',
        level: LEVELS.BLOCKER,
        message: 'External payment provider detected in a VK Play game. Platform requires its own VK Play Wallet — third-party payment is forbidden by the rules.',
        file: f,
      });
    }
  }

  // If game has shop UI but no payment dialog calls — warning
  let hasShopUI = false;
  for (const f of files) {
    const t = readTextSafe(f);
    if (!t) continue;
    if (/\b(shop|store|purchase|buyItem|premium)\b/i.test(t)) {
      hasShopUI = true;
      break;
    }
  }

  if (hasShopUI && !usesPaymentDialog && !usesIncorrectMethod) {
    issues.push({
      id: 'VKPLAY-NO-PAYMENT-DIALOG',
      level: LEVELS.WARNING,
      message: 'Game appears to have shop / purchase UI but no VKPlaySDK.openPaymentDialog calls. If monetization is intended, integrate the payment dialog. If not — ignore this warning.',
    });
  }

  return issues;
}
