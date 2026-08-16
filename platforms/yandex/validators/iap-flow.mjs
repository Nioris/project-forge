// scripts/validators/iap-flow.mjs
//
// REQ-1.13.1 — purchase must be consumed (consumePurchase) after grant
// REQ-1.13.5 — purchased items must apply (appear in game) after purchase
// REQ-IAP-PERMIT — must request permission via games-partners@yandex-team.ru BEFORE submission
// REQ-1.13.3 — purchases sync between devices (use getPurchases at startup)
//
// Sources:
//   https://yandex.ru/dev/games/doc/ru/requirements/1/13
//   https://yandex.ru/dev/games/doc/ru/console/purchases

import { LEVELS, resolveGamePaths, walkFiles, readTextSafe, runCli, isMain } from './_lib.mjs';

export const ID = 'iap-flow';
export const REQUIREMENTS = ['REQ-1.13.1', 'REQ-1.13.3', 'REQ-1.13.5', 'REQ-IAP-PERMIT'];
export const URL_113 = 'https://yandex.ru/dev/games/doc/ru/requirements/1/13';
export const URL_PURCHASES = 'https://yandex.ru/dev/games/doc/ru/console/purchases';

export function validate(gamePath) {
  const { workPath } = resolveGamePaths(gamePath);
  const issues = [];

  const files = walkFiles(workPath, ['.js', '.html']);
  let hasGetPayments = false;
  let hasPurchaseCall = false;
  let hasConsumePurchase = false;
  let hasGetPurchases = false;
  let hasGetCatalog = false;
  let hasIapPermitMarker = false;  // a comment / config flag indicating permission obtained

  // Scan everything.
  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;

    if (/\bgetPayments\s*\(/.test(text)) hasGetPayments = true;
    if (/\bpayments\.purchase\s*\(|\.purchase\s*\(\s*\{[^}]*productID|payments\b[^.]*\.purchase\b/.test(text)) hasPurchaseCall = true;
    if (/\bconsumePurchase\s*\(/.test(text)) hasConsumePurchase = true;
    if (/\bgetPurchases\s*\(/.test(text)) hasGetPurchases = true;
    if (/\bgetCatalog\s*\(/.test(text)) hasGetCatalog = true;
    if (/IAP[-_]?(?:permit|enabled|approved)|games-partners@yandex|purchases?:\s*['"]?(approved|enabled)/i.test(text)) {
      hasIapPermitMarker = true;
    }
  }

  // If no IAP at all — nothing to check.
  if (!hasGetPayments && !hasPurchaseCall && !hasConsumePurchase && !hasGetPurchases && !hasGetCatalog) {
    return issues;
  }

  // === REQ-1.13.1: purchase must be followed by consumePurchase ===
  if (hasPurchaseCall && !hasConsumePurchase) {
    issues.push({
      id: 'REQ-1.13.1', level: LEVELS.BLOCKER,
      message: 'purchase() is called but consumePurchase() never appears. Purchases will not complete on the platform.',
      citation: '"Подключен метод консумирования" (1.13.1)',
      url: URL_113, file: workPath
    });
  }

  // === REQ-1.13.3: getPurchases at startup for cross-device sync ===
  if ((hasPurchaseCall || hasConsumePurchase) && !hasGetPurchases) {
    issues.push({
      id: 'REQ-1.13.3', level: LEVELS.BLOCKER,
      message: 'getPurchases() not called at startup. Past rejection: pending purchases lost across devices.',
      citation: '"Покупки, сделанные с одного аккаунта, должны сохраняться" (1.13.3)',
      url: URL_113, file: workPath
    });
  }

  // === REQ-1.13.5: purchase applied — check that purchase callback grants something ===
  // Heuristic: in the same function/file as purchase() call, look for state mutation
  // BEFORE consumePurchase. Patterns: setData(...), grantItem(...), this.coins +=, S.money +=,
  // saveProgress(), localStorage.setItem...
  // This is a soft check: WARNING if we cannot confirm.
  let suspectPurchaseFlow = false;
  for (const file of files) {
    const text = readTextSafe(file);
    if (!text) continue;
    // Look at purchase() handler regions.
    const re = /\bpayments\.purchase\s*\([^)]+\)\s*\.\s*then\s*\(\s*(?:\([^)]*\)|function\s*\([^)]*\))\s*=>?\s*\{([\s\S]{0,500}?)\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const body = m[1];
      const grants = /(setData|grantItem|coins\s*[+\-*/]?=|money\s*[+\-*/]?=|gold\s*[+\-*/]?=|gems?\s*[+\-*/]?=|player\.\w+\s*=|inventory|save(?:Progress|Game))/i.test(body);
      const consumes = /consumePurchase/.test(body);
      if (consumes && !grants) {
        suspectPurchaseFlow = true;
        break;
      }
    }
  }
  if (suspectPurchaseFlow) {
    issues.push({
      id: 'REQ-1.13.5', level: LEVELS.WARNING,
      message: 'Purchase handler calls consumePurchase but no obvious item-grant logic detected. Manual verify: does the player actually receive what they bought?',
      citation: 'Past rejection (DeepWorld): "механика покупки не работает и/или покупка не применяется" (1.13.5)',
      url: URL_113, file: workPath
    });
  }

  // === REQ-IAP-PERMIT: reminder ===
  if (hasGetPayments || hasPurchaseCall) {
    if (!hasIapPermitMarker) {
      issues.push({
        id: 'REQ-IAP-PERMIT', level: LEVELS.WARNING,
        message: 'IAP code detected but no marker (comment / config) confirming you have requested approval via games-partners@yandex-team.ru. Past rejection (BattleFront): "Покупки не подключены... Дождитесь ответного письма".',
        citation: 'Email request to games-partners@yandex-team.ru is required BEFORE submission.',
        url: URL_PURCHASES, file: workPath
      });
    }
  }

  // Catalog usage — recommended for currency display (REQ-3.8).
  if ((hasGetPayments || hasPurchaseCall) && !hasGetCatalog) {
    issues.push({
      id: 'REQ-1.13', level: LEVELS.WARNING,
      message: 'IAP present but getCatalog() not called. Catalog provides priceCurrencyCode / getPriceCurrencyImage — required by REQ-3.8.',
      url: URL_113, file: workPath
    });
  }

  return issues;
}

if (isMain(import.meta.url)) {
  runCli({ ID, validate });
}
