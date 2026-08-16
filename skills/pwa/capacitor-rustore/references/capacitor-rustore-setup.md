# Capacitor + RuStore — Full Reference

## Capacitor Config

```ts
// capacitor.config.ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.yourapp.pwa',
  appName: 'МоёПриложение',
  webDir: 'build',
  server: {
    androidScheme: 'https',
  },
  android: {
    buildOptions: {
      keystorePath: process.env.KEYSTORE_PATH || 'release.jks',
      keystoreAlias: process.env.KEYSTORE_ALIAS || 'release',
      keystorePassword: process.env.KEYSTORE_PASSWORD,
      keystoreAliasPassword: process.env.KEY_PASSWORD,
      releaseType: 'AAB',
    },
  },
  plugins: {
    SplashScreen: { launchAutoHide: true, androidScaleType: 'CENTER_CROP' },
    StatusBar: { style: 'DARK', backgroundColor: '#1e40af' },
  },
};

export default config;
```

## Build Commands

```bash
# Build web
pnpm build

# Sync to Android
npx cap sync android

# Build release AAB
cd android && ./gradlew bundleRelease
# Output: android/app/build/outputs/bundle/release/app-release.aab
```

## RuStore Publish Gradle Plugin

```groovy
// android/build.gradle (root)
buildscript {
    repositories {
        gradlePluginPortal()
    }
    dependencies {
        classpath "ru.cian.rustore-plugin:plugin:0.4.0"
    }
}

// android/app/build.gradle
apply plugin: 'ru.cian.rustore-publish-gradle-plugin'

rustorePublish {
    instances {
        release {
            credentialsPath = "$rootDir/rustore-credentials.json"
            buildFormat = "aab"
            releaseNotes = [
                new ru.cian.rustore.publish.ReleaseNote("ru-RU", file("release-notes/ru.txt").text)
            ]
        }
    }
}
```

## rustore-credentials.json

```json
{
  "key_id": "YOUR_KEY_ID",
  "client_secret": "YOUR_CLIENT_SECRET"
}
```

Get credentials at: https://console.rustore.ru → API

## CI Build & Publish (GitHub Actions)

```yaml
name: Build & Publish to RuStore
on:
  push:
    tags: ['v*']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - uses: actions/setup-java@v4
        with: { distribution: 'temurin', java-version: '17' }

      - name: Install and build web
        run: |
          corepack enable
          pnpm install --frozen-lockfile
          pnpm build

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Decode keystore
        run: echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/app/release.jks

      - name: Build AAB
        working-directory: android
        env:
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew bundleRelease

      - name: Create RuStore credentials
        run: |
          echo '{"key_id":"${{ secrets.RUSTORE_KEY_ID }}","client_secret":"${{ secrets.RUSTORE_SECRET }}"}' > android/rustore-credentials.json

      - name: Publish to RuStore
        working-directory: android
        run: ./gradlew publishReleaseRustore
```

## Deep Links (AndroidManifest.xml addition)

```xml
<intent-filter android:autoVerify="true">
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="https" android:host="yourapp.ru" />
</intent-filter>
```

## Version Auto-Increment

```groovy
// android/app/build.gradle
def versionPropsFile = file('version.properties')
def versionProps = new Properties()
if (versionPropsFile.canRead()) {
    versionProps.load(new FileInputStream(versionPropsFile))
}
def code = (versionProps['VERSION_CODE'] ?: '1').toInteger()

android {
    defaultConfig {
        versionCode code
        versionName "1.0.${code}"
    }
}
```
