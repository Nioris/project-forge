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
      // Forge release builder injects these only into an isolated build process.
      keystorePath: process.env.KEYSTORE_PATH,
      keystoreAlias: process.env.KEYSTORE_ALIAS,
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

## RuStore API credentials

Не хранить `rustore-credentials.json` в проекте. Forge получает `key_id` из публичного platform profile, извлекает `client_secret` из внешнего secret store и материализует файл только в изолированной build-папке на время публикации.

Если ключ отсутствует, сохранить его через защищённый ввод: `node <forge-engine>/scripts/forge-secrets.mjs set rustore --stdin`.

Get credentials at: https://console.rustore.ru → API

## CI Build & Publish

CI разрешён только через поддерживаемый зашифрованный экспорт Forge vault либо аппаратный/облачный signing service с независимой проверкой fingerprint. Не копировать base64-keystore и пароли в workflow и не придумывать неподтверждённую CI-схему. Пока такой backend не настроен, production-подпись и публикация выполняются локальным Forge release coordinator, а CI ограничивается тестами и unsigned/debug сборками.

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
