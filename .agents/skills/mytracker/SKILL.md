---
name: mytracker
kind: tactical
description: "MyTracker SDK integration for Android: analytics, attribution, events. Recommended by RuStore."
---
# MyTracker SDK

## Why
RuStore рекомендует MyTracker для аналитики. Бесплатный, российский, интегрирован с VK Рекламой и RuStore.

## Gradle Setup

```gradle
// build.gradle (project)
repositories {
    mavenCentral()
}

// build.gradle (app)
dependencies {
    implementation 'com.my.tracker:mytracker-sdk:3.3.+'
}
```

## Init

```kotlin
import com.my.tracker.MyTracker

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // SDK ID from my.tracker dashboard
        val params = MyTracker.getTrackerParams()
        params.setTrackingLaunchEnabled(true)
        MyTracker.initTracker("SDK_KEY", this)
    }
}
```

## Track Events

```kotlin
// Level complete
MyTracker.trackEvent("level_complete", mapOf(
    "level" to "5",
    "score" to "1200",
    "time" to "45"
))

// Purchase
MyTracker.trackEvent("purchase", mapOf(
    "item" to "premium",
    "price" to "299",
    "currency" to "RUB"
))

// Ad watched
MyTracker.trackEvent("ad_watched", mapOf(
    "type" to "rewarded",
    "reward" to "50_coins"
))

// Subscription
MyTracker.trackEvent("subscription_start", mapOf(
    "plan" to "monthly",
    "price" to "149"
))
```

## Track Revenue

```kotlin
// For in-app purchases
MyTracker.trackEvent("revenue", mapOf(
    "orderId" to purchaseId,
    "amount" to "299",
    "currency" to "RUB",
    "product" to "premium_monthly"
))
```

## Capacitor Bridge

```java
@CapacitorPlugin(name = "Analytics")
public class AnalyticsPlugin extends Plugin {

    @PluginMethod
    public void trackEvent(PluginCall call) {
        String name = call.getString("name");
        JSObject params = call.getObject("params", new JSObject());
        Map<String, String> map = new HashMap<>();
        Iterator<String> keys = params.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            map.put(key, params.getString(key));
        }
        MyTracker.trackEvent(name, map);
        call.resolve();
    }
}
```

```javascript
// In HTML5 (www/js/analytics-bridge.js):
const Analytics = Capacitor.Plugins.Analytics;

function track(name, params) {
    Analytics.trackEvent({ name, params });
}

// Usage:
track('level_complete', { level: '5', score: '1200' });
track('ad_watched', { type: 'rewarded' });
track('subscription_start', { plan: 'monthly' });
```

## Key Events to Track
| Event | When | Params |
|-------|------|--------|
| app_start | App opened | — |
| tutorial_complete | Finished onboarding | — |
| level_complete | Beat a level | level, score, time |
| level_fail | Died/lost | level, attempt |
| ad_watched | Watched rewarded | type, reward |
| ad_shown | Interstitial shown | placement |
| purchase | Bought something | item, price, currency |
| subscription_start | Started sub | plan, price |
| subscription_cancel | Cancelled | plan, reason |

## Non-Negotiable
- [ ] Init in Application.onCreate()
- [ ] SDK_KEY from dashboard (not hardcoded demo)
- [ ] Track at least: app_start, level_complete, ad_watched, purchase
- [ ] Capacitor bridge for HTML5 games
