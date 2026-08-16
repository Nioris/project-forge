---
name: monetization-strategy
kind: tactical
description: "Analyze app/game and decide: where to place ads, what to lock behind subscription, pricing. Outputs monetization plan."
---
# Monetization Strategy

## Purpose
Analyze the HTML5 project and create a monetization plan: ad placements, subscription tiers, free vs premium features. Agent reads this BEFORE integrating ads/payments.

## Step 1: Classify Content

Scan the project and categorize all features:

```
FREE (always available):
- Core gameplay / main function
- First N levels (enough to hook)
- Basic UI and navigation
- Banner ads shown

REWARDED (watch ad to unlock):
- Extra lives / continues
- Double coins after run
- Hints in puzzles
- Bonus levels
- Temporary boosts (2x speed, shield)

PREMIUM (subscription only):
- Remove ALL ads
- Unlimited lives/energy
- All levels unlocked
- Exclusive skins/themes
- Cloud save sync
- Statistics/analytics dashboard
- No cooldowns/wait timers
```

## Step 2: Ad Placement Map

### Where to show each format:

**Banner (sticky):**
- Bottom of screen during menus, leaderboards, shop
- HIDE during active gameplay (covers content)
- Show in pause screen

**Interstitial (fullscreen):**
- After level complete / game over → button press → ad → next screen
- Every 3rd game over (not every one)
- When returning to main menu from game
- NEVER during gameplay
- NEVER on first session (let user enjoy first)
- Cooldown: 60 seconds minimum

**Rewarded (opt-in):**
- "Watch ad for extra life" on game over screen
- "Double your coins" on result screen
- "Free hint" in puzzle/strategy games
- "Skip wait timer" in idle/tycoon games
- "Unlock skin for 24h" in menu
- ALWAYS show exact reward before asking
- ALWAYS user-initiated (button press)

### Placement by Genre:

| Genre | Banner | Interstitial | Rewarded | Best Hook |
|-------|--------|-------------|----------|-----------|
| Arcade/Casual | Menu only | After death (every 3rd) | Extra life, 2x coins | Continue playing |
| Puzzle | Menu, level select | After level complete | Hint, undo, skip level | Free hints |
| Runner | Menu | After run end | 2x multiplier, revive | Revive and continue |
| Strategy | Settings, menu | Between rounds | Speed boost, resources | Resource boost |
| Idle/Tycoon | Always bottom | After prestige/reset | 2x production 30min | Time skip |
| RPG | Menu, inventory | After dungeon | Extra loot, revive | Revive at boss |
| Utility app | Bottom always | Between actions | Remove ads 1 day | Ad-free trial |

## Step 3: Subscription Design

### Tiers:

```
FREE:
- Core app with ads
- Limited feature set
- Basic content

PREMIUM MONTHLY (149-299 ₽/month):
- No ads (banner, interstitial, rewarded all removed)
- All content unlocked
- Premium features enabled
- Cloud sync

PREMIUM YEARLY (999-1999 ₽/year — highlight "save 40%"):
- Same as monthly but cheaper per month
- Mark as "ЛУЧШАЯ ЦЕНА"
```

### What to Lock (by app type):

**Games:**
```
Lock: levels after level 10-20 (free = enough to hook)
Lock: cosmetic skins/themes (premium exclusive)
Lock: energy/lives system (premium = unlimited)
Lock: advanced statistics
Free: core gameplay always available
Free: first 10-20 levels
Free: basic skin
```

**Utility apps:**
```
Lock: export/share features
Lock: advanced settings/filters
Lock: unlimited usage (free = 5/day)
Lock: cloud sync across devices
Free: basic functionality
Free: limited daily uses
```

**Content apps:**
```
Lock: full catalog (free = preview/sample)
Lock: offline access
Lock: no watermarks
Lock: HD quality
Free: limited free content with ads
```

## Step 4: RuStore Billing Integration

```gradle
dependencies {
    implementation "ru.rustore.sdk:billingclient:6.1.0"
}
```

```kotlin
// Init
val billingClient = RuStoreBillingClient.create(
    context = this,
    consoleApplicationId = "your_app_id",
    deeplinkScheme = "yourapp"
)

// Get products
billingClient.products.getProducts(listOf("premium_monthly", "premium_yearly"))
    .addOnSuccessListener { products ->
        // Show subscription UI with prices
    }

// Purchase
billingClient.purchases.purchaseProduct("premium_monthly")
    .addOnSuccessListener { result ->
        // Grant premium, track event
        MyTracker.trackEvent("subscription_start", mapOf("plan" to "monthly"))
    }

// Check active subscriptions on startup
billingClient.purchases.getPurchases()
    .addOnSuccessListener { purchases ->
        val hasPremium = purchases.any {
            it.productId in listOf("premium_monthly", "premium_yearly")
            && it.purchaseState == PurchaseState.CONFIRMED
        }
        if (hasPremium) enablePremium()
    }

// Confirm purchase (REQUIRED — like Yandex consume)
billingClient.purchases.confirmPurchase(purchaseId)
```

```javascript
// Capacitor bridge (www/js/billing-bridge.js):
const Billing = Capacitor.Plugins.RuStoreBilling;

async function buyPremium(plan) {
    const result = await Billing.purchase({ productId: plan });
    if (result.success) {
        isPremium = true;
        hideBanner();
        track('subscription_start', { plan });
    }
}

async function checkPremium() {
    const result = await Billing.checkSubscription();
    return result.active;
}

async function restorePurchases() {
    const result = await Billing.restore();
    return result.active;
}
```

## Step 5: Output — Monetization Plan

Create `output/{project}/MONETIZATION_PLAN.md`:

```markdown
# Monetization Plan: {App Name}

## Classification
| Feature | Tier | Notes |
|---------|------|-------|
| Core gameplay | FREE | Always available |
| Levels 1-15 | FREE | Hook content |
| Levels 16+ | PREMIUM | Subscription unlock |
| Extra lives | REWARDED | Watch ad for +1 life |
| ...

## Ad Placements
| Format | Where | When | Frequency |
|--------|-------|------|-----------|
| Banner | Bottom | Menu, pause, shop | Always (hide in gameplay) |
| Interstitial | Fullscreen | After game over | Every 3rd, cooldown 60s |
| Rewarded | Game over screen | "Extra life" button | User-initiated |

## Subscription
| Tier | Price | Includes |
|------|-------|----------|
| Free | 0 | Core + ads + limited |
| Monthly | {price} ₽ | No ads + all content |
| Yearly | {price} ₽ | Same, save 40% |

## Revenue Estimate
- Banner eCPM: ~50-150 ₽ (Russia)
- Interstitial eCPM: ~200-500 ₽
- Rewarded eCPM: ~300-800 ₽
- Subscription conversion: ~2-5% of DAU

## Implementation Checklist
- [ ] Yandex Ads SDK initialized
- [ ] Banner in menu layout
- [ ] Interstitial after game over (with cooldown)
- [ ] Rewarded button with reward preview
- [ ] Subscription screen with 2 tiers
- [ ] RuStore Billing connected
- [ ] Premium check on app start
- [ ] MyTracker events for all monetization
```

## Non-Negotiable
- [ ] MONETIZATION_PLAN.md created before implementing
- [ ] Core functionality ALWAYS free (not paywall-only app)
- [ ] Free tier is playable and enjoyable (not crippled)
- [ ] Subscription clearly describes what's included
- [ ] "Restore purchases" button exists
- [ ] Ad placements follow genre table
- [ ] Interstitial never during active gameplay
- [ ] Rewarded always shows reward before asking
- [ ] MyTracker tracks every monetization event
