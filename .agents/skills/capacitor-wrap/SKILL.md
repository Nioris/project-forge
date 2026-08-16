---
name: capacitor-wrap
kind: tactical
description: "Wrap HTML5 in Capacitor shell → Android APK/AAB. For offline projects without server."
---
# Capacitor Wrap

## When: Simple HTML5, Canvas games, Multi-page, Unity WebGL, local PWA

## Steps

### 1. Setup
```bash
mkdir -p output/{project}/
cp -r input/{project}/ output/{project}/www/
cd output/{project}/
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android
npx cap init "{App Name}" "dev.rodrik.{appid}" --web-dir www
npx cap add android
```

### 2. capacitor.config.ts
```typescript
const config = {
  appId: 'dev.rodrik.{appid}',
  appName: '{App Name}',
  webDir: 'www',
  android: { allowMixedContent: true },
  server: { androidScheme: 'https' },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0a0a12',
    }
  }
};
```

### 3. Orientation (AndroidManifest.xml)
- Game landscape: `android:screenOrientation="landscape"`
- App portrait: `android:screenOrientation="portrait"`
- Auto: `android:screenOrientation="unspecified"`

### 4. Fullscreen
```xml
<activity android:theme="@style/AppTheme.NoActionBar">
<!-- styles.xml: -->
<item name="android:windowFullscreen">true</item>
<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>
```

### 5. Back button
```javascript
document.addEventListener('backbutton', function(e) {
  e.preventDefault();
  // game → pause, menu → confirm exit
}, false);
```

### 6. Build
```bash
npx cap sync android
cd android
./gradlew assembleDebug    # → apk/debug/app-debug.apk
./gradlew bundleRelease    # → bundle/release/app-release.aab
```

### 7. Sign
```bash
keytool -genkey -v -keystore release.keystore -alias {appid} -keyalg RSA -keysize 2048 -validity 10000
# Add signingConfigs to build.gradle
```

## Common Fixes
| Problem | Fix |
|---------|-----|
| White flash | SplashScreen backgroundColor |
| Mixed content | allowMixedContent: true |
| Audio silent | User gesture required first |
| APK >150MB | Use AAB or split assets |
| Keyboard hides input | windowSoftInputMode="adjustResize" |

## Non-Negotiable
- [ ] www/index.html is entry point
- [ ] Orientation from analysis
- [ ] Fullscreen + immersive
- [ ] Back button handled
- [ ] No white flash (splash configured)
- [ ] Debug APK verified working
