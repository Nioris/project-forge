# RuStore Requirements Reference

> Source: rustore.ru/help (snapshot 2026-05-14) + verified through real publication.
> Update on Console UI changes.

## App technical requirements

### Android API levels
- **minSdkVersion**: 21 (Android 5.0) recommended, 19 (4.4) acceptable
- **targetSdkVersion**: 34 (Android 14) mandatory от Sept 2024
- **compileSdkVersion**: 34+

### APK / AAB format
- Both accepted, AAB preferred (smaller download)
- Max size: 4 GB (AAB), 100 MB (APK directly)
- Signing: v2 mandatory, v1+v2 recommended

### Permissions
- Declare only what's needed (over-permission flags moderation)
- Sensitive permissions (CAMERA, LOCATION, READ_CONTACTS) need privacy policy URL

## Required SDKs

### AppMetrica (analytics) — DE-FACTO MANDATORY для RuStore games

Without analytics:
- No retention data (D1/D7/D30)
- No funnel analysis
- No revenue attribution
- Featured editors require analytics для consideration

Gradle dependency:
```gradle
dependencies {
    implementation 'com.yandex.android:mobmetricalib:7.4.0'
}
```

Optional modules (depends on needs):
- `mobmetricalib-identifiers` — collect ADV IDs (advertising attribution)
- `mobmetricalib-billing-v6` — collect billing events from Google Billing Library
- `mobmetricalib-location` — collect location (needs ACCESS_COARSE_LOCATION permission)
- `mobmetricalib-ndkcrashes` — native crash collection
- `push-rustore-provider` — push notifications через RuStore push service

AndroidManifest.xml:
```xml
<application>
    <!-- ... -->
    <meta-data
        android:name="com.yandex.metrica.ApiKey"
        android:value="YOUR_API_KEY_FROM_APPMETRICA_DASHBOARD" />
</application>

<!-- Required permissions для basic analytics: -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
```

Activation в MainActivity (Kotlin):
```kotlin
import com.yandex.metrica.AppMetrica
import com.yandex.metrica.AppMetricaConfig

class MyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        val config = AppMetricaConfig.newConfigBuilder("YOUR_API_KEY")
            .withLogs()  // enable logs in debug builds only
            .withCrashReporting(true)
            .withLocationTracking(false)  // require user consent for true
            .build()
        AppMetrica.activate(this, config)
        AppMetrica.enableActivityAutoTracking(this)
    }
}
```

Activation в MainActivity (Java):
```java
import com.yandex.metrica.AppMetrica;
import com.yandex.metrica.AppMetricaConfig;

AppMetricaConfig config = AppMetricaConfig.newConfigBuilder("YOUR_API_KEY")
    .withCrashReporting(true)
    .build();
AppMetrica.activate(getApplicationContext(), config);
AppMetrica.enableActivityAutoTracking(this);
```

### WebView/TWA wrapper bridge (HTML5 game в Android shell)

Если игра HTML5 wrapped в TWA/WebView, AppMetrica events отправляются из JavaScript через bridge:

```kotlin
// MainActivity.kt — add JS interface
webView.addJavascriptInterface(AppMetricaJsBridge(), "AndroidAppMetrica")

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
    fun setUserProfileID(id: String) {
        AppMetrica.setUserProfileID(id)
    }
}
```

```javascript
// HTML game — call from JS
if (window.AndroidAppMetrica) {
    window.AndroidAppMetrica.reportEvent('level_completed');
    window.AndroidAppMetrica.reportEventWithParams(
        'iap_purchase',
        JSON.stringify({ product: 'coins_100', price: 99 })
    );
}
// Fallback for Yandex Games (browser): use Yandex Games SDK ysdk.adv events
```

### RuStore Pay SDK (for IAP, optional)

If your game has real-money in-app purchases:
```gradle
implementation 'ru.rustore.sdk:pay-client:9.0.2'
```

Manifest:
```xml
<meta-data
    android:name="ru.rustore.sdk.pay.console_application_id"
    android:value="YOUR_RUSTORE_APP_ID" />
```

### RuStore App Update SDK (recommended)
For in-app update prompts:
```gradle
implementation 'ru.rustore.sdk:appupdate:5.0.0'
```

### RuStore Reviews SDK (recommended)
For native rating prompt:
```gradle
implementation 'ru.rustore.sdk:review:6.0.0'
```

## RuStore Console required fields

### App info
- **App name**: same as in-game title (clause 5.x)
- **Short description**: 80 chars max
- **Full description**: 4000 chars max
- **App icon**: 512×512 PNG, opaque background (rule 6.4 — full fill, no transparency)
- **Screenshots**: 1080×1920 (portrait) или 1920×1080 (landscape), 4 minimum
- **Featured image**: 1024×500 (banner для каталога)
- **Category**: select from RuStore categories (different from Yandex Games!)
- **Age rating**: 0+/6+/12+/16+/18+ — must match content
- **Privacy policy URL**: mandatory
- **Support email**: mandatory

### Analytics tool integration
В Console → Аналитика → Connect:
- AppMetrica (recommended)
- MyTracker
- Adjust
- AppsFlyer

## RuStore categories (separate dictionary from Yandex)

(Snapshot 2026-05; verify in Console для current values)

Games subcategories:
- Аркады
- Гонки
- Головоломки
- Карточные
- Казуальные
- Настольные
- Приключения
- Ролевые
- Симуляторы
- Спортивные
- Стратегии

Apps subcategories: many (Финансы, Работа, Образование, etc.) — see Console.

⚠️ Categories diверst from Yandex Games. **Идл/тапалки** в RuStore = «Казуальные» (нет «Экономических» как у Яндекса).

## Common moderation rejection reasons

1. **App imitation** (rule 6.x) — icon/name похоже на existing popular app
2. **Insufficient analytics** — no AppMetrica/MyTracker → may flag для review
3. **Missing privacy policy** — link broken or absent
4. **Permission abuse** — declared permissions не used in code
5. **Crash on launch** — devices с specific configs crash (test на 2-3 emulator API levels)
6. **APK signing** — debug keystore in release submission
7. **Title CAPS** — same as Yandex, RuStore не разрешает CAPS app names

## Test mode procedures

### AppMetrica
- Activate `withLogs()` в debug builds — see events в logcat
- Real-time mode в AppMetrica dashboard: events show within 1-2 minutes
- Test users: add device ID к "Test devices" в dashboard для clean data

### RuStore Pay SDK
- Test purchases: enable test mode в Console → Monetization → Test
- Test users: add user emails for IAP simulation
- Use debug build с same keystore as production до final test

## Files in this reference

- `rustore-requirements.md` — this file (technical + SDK + Console requirements)
- `appmetrica-events-template.md` — recommended event taxonomy (TBD)
- `rustore-categories-full.md` — Console categories dictionary (TBD, snapshot when verified)
