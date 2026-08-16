---
name: appmetrica-integration
kind: tactical
description: "Integrate Yandex AppMetrica analytics SDK в Android wrapper. Auto-detects wrapper type (TWA, Capacitor, Cordova, Native Kotlin/Java) by project files, applies correct integration…"
---

# AppMetrica Integration

## Cel

Wire Yandex AppMetrica analytics SDK в Android wrapper of your project. Universal — works для:
- TWA wrappers (HTML5 game в WebView)
- Capacitor wrappers (Ionic)
- Cordova wrappers
- Native Kotlin/Java apps

Skill **auto-detects** wrapper type by inspecting project structure, applies correct integration pattern.

## When this matters

AppMetrica gives you:
- **Retention** (D1/D7/D30) — required for ASO ranking signals
- **Funnel analysis** — где юзеры drop off
- **In-app event tracking** — level_complete, prestige_done, IAP_purchase
- **Crash reports** — automatic crash collection
- **Push notifications** — targeted campaigns to user segments
- **Revenue attribution** — IAP source tracking
- **Real-time mode** — events visible в dashboard within 1-2 minutes

**Without analytics:** no retention data, RuStore editors don't feature, no funnel insights. AppMetrica is **de-facto mandatory** for RuStore game success.

## Prerequisites

```
[ ] AppMetrica account создан → https://appmetrica.yandex.ru/
[ ] App registered в AppMetrica → got API key (32-char UUID)
[ ] Android wrapper project exists (TWA, Capacitor, или native)
[ ] AndroidManifest.xml writable
[ ] build.gradle (app-level) writable
```

If нет AppMetrica account:
1. Open https://appmetrica.yandex.ru/
2. Sign in с Yandex ID
3. Create App → fill basic info → get API key
4. Copy API key (UUID, 32 chars hex с dashes)

## Step 1 — Auto-detect wrapper type

Read project structure:

```bash
# Check for TWA wrapper signals
ls platforms/rustore/app/ 2>/dev/null            # TWA Manifest
ls -d twa-* twa/ android/ 2>/dev/null            # alternative locations

# Check for Capacitor signals
ls capacitor.config.ts capacitor.config.json 2>/dev/null
ls -d android/app/ 2>/dev/null

# Check for Cordova signals  
ls config.xml 2>/dev/null

# Check for native Android signals
ls -d app/ src/main/ 2>/dev/null
ls build.gradle settings.gradle 2>/dev/null
```

Based on what's found:

| Detection | Wrapper type | Integration path |
|---|---|---|
| `platforms/rustore/app/build.gradle` | TWA (Forge platform) | `platforms/rustore/app/` |
| `capacitor.config.*` + `android/` | Capacitor | `android/app/` |
| `config.xml` + `platforms/android/` | Cordova | `platforms/android/app/` |
| `app/build.gradle` без TWA signals | Native Android | `app/` |

If multiple detected → ask user which target.
If none detected → tell user: "Run `$twa-wrap` или `$build-apk` first к create wrapper".

## Step 2 — Add Gradle dependency

В `<wrapper-path>/build.gradle` (module-level, not project-level):

```gradle
dependencies {
    // ... existing dependencies ...
    
    implementation 'com.yandex.android:mobmetricalib:7.4.0'
    
    // Optional modules (uncomment as needed):
    // implementation 'com.yandex.android:mobmetricalib-identifiers:7.4.0'  // ADV ID для attribution
    // implementation 'com.yandex.android:mobmetricalib-billing-v6:7.4.0'  // Google Billing events
    // implementation 'com.yandex.android:mobmetricalib-location:7.4.0'    // location (needs permission)
    // implementation 'com.yandex.android:mobmetricalib-ndkcrashes:7.4.0'  // native crash collection
}
```

For TWA wrappers Forge generates — already has Yandex repository in `repositories {}` block.

For Capacitor / Cordova / native — check that `mavenCentral()` is в `repositories {}` (AppMetrica is published к Maven Central).

## Step 3 — Add manifest meta-data + permissions

В `AndroidManifest.xml`:

```xml
<manifest>
    <!-- Required permissions for AppMetrica basic functionality -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    
    <application>
        <!-- ... existing meta-data ... -->
        
        <meta-data
            android:name="com.yandex.metrica.ApiKey"
            android:value="@string/appmetrica_api_key" />
    </application>
</manifest>
```

В `<wrapper-path>/src/main/res/values/strings.xml`:

```xml
<resources>
    <!-- ... existing strings ... -->
    <string name="appmetrica_api_key">YOUR_API_KEY_HERE</string>
</resources>
```

⚠️ **Don't hardcode** API key directly в manifest — use string resource. Easier to change без editing manifest.

For per-flavor builds (debug vs release с different keys):
```
src/debug/res/values/strings.xml    →  test API key
src/release/res/values/strings.xml  →  production API key
```

## Step 4 — Activation code

Per wrapper type:

### TWA / WebView wrappers

В `<wrapper-path>/src/main/java/.../LauncherActivity.kt` (или whatever class extends `androidx.browser.trusted.LauncherActivity`):

```kotlin
package <wrapper-package>

import android.os.Bundle
import com.yandex.metrica.AppMetrica
import com.yandex.metrica.AppMetricaConfig

class LauncherActivity : androidx.browser.trusted.LauncherActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Initialize AppMetrica BEFORE super.onCreate to track this activity launch
        val apiKey = getString(R.string.appmetrica_api_key)
        val config = AppMetricaConfig.newConfigBuilder(apiKey)
            .withCrashReporting(true)
            .withSessionTimeout(60)  // seconds; default 10
            .build()
        AppMetrica.activate(application, config)
        AppMetrica.enableActivityAutoTracking(application)
        
        super.onCreate(savedInstanceState)
    }
}
```

Also add JS bridge to allow HTML game к send events:

В same file:
```kotlin
override fun onResume() {
    super.onResume()
    // ...
    // Note: WebView в TWA is opened in Chrome Custom Tabs — JS bridge не работает напрямую.
    // For TWA-style apps, use Digital Asset Links + postMessage к web page.
    // For full JS bridge, use WebView (not TWA).
}
```

⚠️ **Critical for TWA limitation:** TWA opens game в Chrome Custom Tabs. JavaScript bridge **не доступен**. Options:
1. Switch к WebView wrapper если нужен JS bridge (use `$build-apk` instead of `$twa-wrap`)
2. Use postMessage protocol + custom intent handlers — complex
3. Accept что только activity-level events (open, close, session) tracked, без in-game events

For HTML5 games **требующих** in-game analytics → recommend WebView wrapper.

### WebView wrappers (more flexibility)

В `MainActivity.kt`:

```kotlin
import android.webkit.JavascriptInterface
import android.webkit.WebView
import com.yandex.metrica.AppMetrica
import com.yandex.metrica.AppMetricaConfig

class MainActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val apiKey = getString(R.string.appmetrica_api_key)
        val config = AppMetricaConfig.newConfigBuilder(apiKey)
            .withCrashReporting(true)
            .build()
        AppMetrica.activate(application, config)
        AppMetrica.enableActivityAutoTracking(application)
        
        val webView: WebView = findViewById(R.id.webview)
        webView.settings.javaScriptEnabled = true
        webView.addJavascriptInterface(AppMetricaJsBridge(), "AndroidAppMetrica")
        webView.loadUrl("file:///android_asset/index.html")
    }
}

class AppMetricaJsBridge {
    @JavascriptInterface
    fun reportEvent(eventName: String) {
        AppMetrica.reportEvent(eventName)
    }
    
    @JavascriptInterface
    fun reportEventWithParams(eventName: String, paramsJson: String) {
        AppMetrica.reportEvent(eventName, paramsJson)
    }
    
    @JavascriptInterface
    fun setUserProfileID(userId: String) {
        AppMetrica.setUserProfileID(userId)
    }
    
    @JavascriptInterface
    fun reportRevenue(productId: String, price: Double, currency: String) {
        val revenue = Revenue.newBuilder(price, java.util.Currency.getInstance(currency))
            .withProductID(productId)
            .build()
        AppMetrica.reportRevenue(revenue)
    }
}
```

Now HTML game can call:
```javascript
if (window.AndroidAppMetrica) {
    window.AndroidAppMetrica.reportEvent('level_completed');
    window.AndroidAppMetrica.reportEventWithParams(
        'iap_purchase',
        JSON.stringify({ product: 'coins_100', price: 99, currency: 'RUB' })
    );
}
```

### Capacitor

For Capacitor projects, use community plugin if available, или create custom plugin:

```bash
npm install @capacitor-community/appmetrica  # if such plugin published
npx cap sync android
```

Если plugin не available — create custom Capacitor plugin (out of scope this skill — recommend `$find-skill capacitor plugin` for guidance).

### Native Kotlin/Java

В `Application` subclass (или MainActivity onCreate если нет Application):

```kotlin
import android.app.Application
import com.yandex.metrica.AppMetrica
import com.yandex.metrica.AppMetricaConfig

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val apiKey = getString(R.string.appmetrica_api_key)
        val config = AppMetricaConfig.newConfigBuilder(apiKey)
            .withCrashReporting(true)
            .build()
        AppMetrica.activate(this, config)
        AppMetrica.enableActivityAutoTracking(this)
    }
}
```

Register Application class в `AndroidManifest.xml`:
```xml
<application
    android:name=".MyApplication"
    ...>
```

## Step 5 — Recommended event taxonomy

Per game/app type, set up these events. Skill generates `Release/{Project}/rustore/appmetrica-events.md`:

### Universal (all apps)
```
session_start          - automatic, no code needed
session_end            - automatic, no code needed
app_open               - automatic if enableActivityAutoTracking
crash                  - automatic if withCrashReporting(true)
```

### Idle/clicker games
```
tutorial_complete      - {step: "1_first_tap" | "2_first_purchase" | "3_first_prestige"}
prestige_done          - {era: "soviet" | "90s" | "legal", duration_sec, currency_earned}
level_up               - {item: "barrel" | "still" | "lab", new_level, cost}
iap_purchase           - {product: "passport", price, currency: "RUB"}
ad_shown               - {placement: "post_prestige", type: "interstitial" | "rewarded"}
ad_completed           - {placement, reward_given}
emigration             - {era_from, era_to, gold_goblets_earned}
```

### General games
```
level_started          - {level_id, difficulty}
level_completed        - {level_id, duration_sec, score}
level_failed           - {level_id, attempt}
game_over              - {final_score, max_level}
character_selected     - {character_id}
purchase               - {product_id, price, currency}
```

### Apps
```
screen_view            - {screen_name, source}
feature_used           - {feature_id}
search                 - {query, results_count}
share                  - {content_id, platform: "telegram" | "vk"}
profile_completed      - automatic
subscription_started   - {plan_id, period}
```

## Step 6 — Validation

After integration, run:

```bash
node scripts/check-appmetrica.mjs <wrapper-path>
```

Validator checks:
- `mobmetricalib` dependency present в build.gradle
- API key placeholder заменён на real UUID (32 char hex c dashes)
- Manifest `com.yandex.metrica.ApiKey` meta-data present
- Required permissions (INTERNET, ACCESS_NETWORK_STATE) present
- `AppMetrica.activate()` called в Application или MainActivity
- (Optional) JS bridge present для WebView wrappers

## Step 7 — Test mode procedure

Build debug APK с `.withLogs()` enabled, install на emulator:

```bash
# Build debug APK
cd <wrapper-path>
./gradlew assembleDebug

# Install
adb install -r app/build/outputs/apk/debug/app-debug.apk

# Watch logs filtered к AppMetrica
adb logcat -s AppMetrica:V
```

Open app — should see в logcat:
```
AppMetrica: Session started
AppMetrica: Event: app_open
```

Open AppMetrica dashboard → Real-time mode → events should appear within 1-2 minutes.

If events не appear:
- Check API key is valid (try в dashboard "Test API key")
- Check device has internet
- Check `<uses-permission INTERNET>` в manifest
- Check `withLogs()` enabled и see exact error в logcat

## Anti-patterns

❌ Hardcoded API key в Java/Kotlin code (use string resource)
❌ Hardcoded API key в Git commit (use BuildConfig + local.properties для secrets)
❌ Same API key для debug+release builds (use flavor-specific)
❌ Tracking PII (emails, names, exact location) without consent
❌ Reporting events synchronously в UI thread (use `reportEvent` async)
❌ Forgetting `enableActivityAutoTracking` (manual tracking is error-prone)

## Integration с другими RuStore skills

- `$fill-rustore` — after integration, store-listing-rustore mentions analytics (для moderator clarity)
- `$release-rustore` — final APK built с AppMetrica embedded, ready к Console upload
- `$release-ready rustore` — validator checks AppMetrica setup как mandatory gate

## Non-Negotiable

- [ ] AppMetrica API key obtained from https://appmetrica.yandex.ru/
- [ ] `mobmetricalib` dependency added к build.gradle
- [ ] API key stored в string resource (not hardcoded)
- [ ] Manifest meta-data `com.yandex.metrica.ApiKey` configured
- [ ] Required permissions (INTERNET, ACCESS_NETWORK_STATE) declared
- [ ] `AppMetrica.activate()` called в Application or MainActivity onCreate
- [ ] `enableActivityAutoTracking(application)` called
- [ ] `withCrashReporting(true)` enabled
- [ ] `node scripts/check-appmetrica.mjs` returns exit 0
- [ ] Real-time events visible в AppMetrica dashboard after debug build test
- [ ] Event taxonomy documented в `Release/{Project}/rustore/appmetrica-events.md`
