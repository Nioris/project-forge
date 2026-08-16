---
name: yandex-ads
kind: tactical
description: "Yandex Mobile Ads SDK integration for Android: banner, interstitial, rewarded, native. Gradle setup, ad placement, callbacks."
---
# Yandex Mobile Ads SDK

## Gradle Setup

```gradle
// build.gradle (project)
allprojects {
    repositories {
        mavenCentral()
    }
}

// build.gradle (app)
android {
    defaultConfig {
        minSdk 21
        targetSdk 34
    }
}

dependencies {
    implementation 'com.yandex.android:mobileads:7.18.0'
}
```

## Init (Application class or MainActivity)

```kotlin
import com.yandex.mobile.ads.common.MobileAds

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        // SDK auto-initializes, but explicit init gives control:
        MobileAds.initialize(this) {
            // SDK ready, can load ads
        }
    }
}
```

## Ad Formats

### Banner (sticky, always visible)
```kotlin
// In layout XML:
// <com.yandex.mobile.ads.banner.BannerAdView
//     android:id="@+id/bannerAd"
//     android:layout_width="match_parent"
//     android:layout_height="wrap_content"
//     android:layout_gravity="bottom" />

val banner = findViewById<BannerAdView>(R.id.bannerAd)
banner.setAdUnitId("R-M-XXXXXXX-1") // from РСЯ dashboard
banner.setAdSize(BannerAdSize.stickySize(this, getScreenWidth()))
banner.setBannerAdEventListener(object : BannerAdEventListener {
    override fun onAdLoaded() { banner.visibility = View.VISIBLE }
    override fun onAdFailedToLoad(error: AdRequestError) { banner.visibility = View.GONE }
    override fun onAdClicked() {}
    override fun onLeftApplication() {}
    override fun onReturnedToApplication() {}
    override fun onImpression(data: ImpressionData?) {}
})
banner.loadAd(AdRequest.Builder().build())
```

### Interstitial (fullscreen between screens)
```kotlin
private var interstitialAd: InterstitialAd? = null
private var lastAdTime = 0L
private val AD_COOLDOWN = 60_000L // 60 seconds minimum

fun loadInterstitial() {
    val loader = InterstitialAdLoader(this)
    loader.setAdLoadListener(object : InterstitialAdLoadListener {
        override fun onAdLoaded(ad: InterstitialAd) {
            interstitialAd = ad
        }
        override fun onAdFailedToLoad(error: AdRequestError) {
            interstitialAd = null
        }
    })
    loader.loadAd(AdRequestConfiguration.Builder("R-M-XXXXXXX-2").build())
}

fun showInterstitial(onComplete: () -> Unit) {
    val now = System.currentTimeMillis()
    if (interstitialAd == null || now - lastAdTime < AD_COOLDOWN) {
        onComplete()
        return
    }
    interstitialAd?.apply {
        setAdEventListener(object : InterstitialAdEventListener {
            override fun onAdShown() { /* pause game, mute audio */ }
            override fun onAdDismissed() {
                lastAdTime = System.currentTimeMillis()
                onComplete()
                loadInterstitial() // preload next
            }
            override fun onAdClicked() {}
            override fun onAdImpression(data: ImpressionData?) {}
            override fun onAdFailedToShow(error: AdError) { onComplete() }
        })
        show(this@MainActivity)
    } ?: onComplete()
}
```

### Rewarded Video (user chooses to watch)
```kotlin
private var rewardedAd: RewardedAd? = null

fun loadRewarded() {
    val loader = RewardedAdLoader(this)
    loader.setAdLoadListener(object : RewardedAdLoadListener {
        override fun onAdLoaded(ad: RewardedAd) { rewardedAd = ad }
        override fun onAdFailedToLoad(error: AdRequestError) { rewardedAd = null }
    })
    loader.loadAd(AdRequestConfiguration.Builder("R-M-XXXXXXX-3").build())
}

fun showRewarded(rewardCallback: (Int) -> Unit) {
    rewardedAd?.apply {
        setAdEventListener(object : RewardedAdEventListener {
            override fun onAdShown() { /* mute audio */ }
            override fun onAdDismissed() { loadRewarded() }
            override fun onRewarded(reward: Reward) {
                rewardCallback(reward.amount)
            }
            override fun onAdClicked() {}
            override fun onAdImpression(data: ImpressionData?) {}
            override fun onAdFailedToShow(error: AdError) {}
        })
        show(this@MainActivity)
    }
}
```

## Capacitor Bridge (for HTML5 WebView games)

```java
// Create Capacitor plugin to call native ads from JS
@CapacitorPlugin(name = "YandexAds")
public class YandexAdsPlugin extends Plugin {

    @PluginMethod
    public void showInterstitial(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity)getActivity()).showInterstitial(() -> {
                call.resolve();
            });
        });
    }

    @PluginMethod
    public void showRewarded(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity)getActivity()).showRewarded((amount) -> {
                JSObject ret = new JSObject();
                ret.put("amount", amount);
                call.resolve(ret);
            });
        });
    }

    @PluginMethod
    public void showBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity)getActivity()).showBanner();
            call.resolve();
        });
    }

    @PluginMethod
    public void hideBanner(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            ((MainActivity)getActivity()).hideBanner();
            call.resolve();
        });
    }
}
```

```javascript
// In HTML5 game (www/js/ads-bridge.js):
const YandexAds = Capacitor.Plugins.YandexAds;

async function showInterstitial() {
    try { await YandexAds.showInterstitial(); }
    catch(e) { console.log('Ad not available'); }
}

async function showRewarded() {
    try {
        const result = await YandexAds.showRewarded();
        return result.amount; // reward
    } catch(e) { return 0; }
}

function showBanner() { YandexAds.showBanner(); }
function hideBanner() { YandexAds.hideBanner(); }
```

## Ad Unit IDs
- Create at https://partner.yandex.ru/
- Demo IDs for testing: R-M-DEMO-banner, R-M-DEMO-interstitial, R-M-DEMO-rewarded
- Replace with real IDs before release

## Non-Negotiable
- [ ] Interstitial cooldown >= 60s
- [ ] Rewarded: user-initiated only, reward granted in callback
- [ ] Banner: bottom or top, not covering content
- [ ] Mute game audio during fullscreen ads
- [ ] Preload next ad after each show
- [ ] Demo IDs replaced before release
- [ ] Capacitor bridge plugin registered
