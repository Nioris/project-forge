# platforms/rustore/ — RuStore Android APK/AAB

**Статус:** beta — использует существующие Forge skills (`skills/pwa/capacitor-rustore/`) и slash-command `/build-apk`.

## Что делает

Оборачивает HTML5-проект в Android-приложение через Capacitor и подписывает APK/AAB для публикации в RuStore.

Документация: https://rustore.ru/help/developers/

## Требования

ОБЯЗАТЕЛЬНО:
- Keystore `.jks` — для подписи. Нет? Claude сгенерирует по запросу.
- Пароль keystore + alias + пароль ключа
- Иконка приложения (минимум 512×512 png)

ОПЦИОНАЛЬНО (если проект использует):
- Yandex Ads Block ID — https://partner.yandex.ru
- AppMetrica API Key — https://appmetrica.yandex.ru
- MyTracker SDK Key — https://tracker.my.com
- RuStore SDK (Company ID + Key ID + .pem)

## Процесс

```bash
# 1. Проверить credentials
/credentials-check

# 2. Мобильный аудит
Прочитай skills/pwa/capacitor-rustore/ и сделай аудит WorkProgress/{Project}/

# 3. Конвертация + сборка
/build-apk
```

## Вывод

```
Release/{Project}/rustore/
├── app-debug.apk        # для тестирования на устройстве
├── app-release.apk      # подписанный для RuStore
├── app-release.aab      # Android App Bundle
├── signing-report.txt   # SHA-1, SHA-256 fingerprints
└── rustore-publish.md   # инструкция по заливке
```

## NEVER

- Никогда не собирать release без реального keystore
- Никогда не использовать стандартную иконку Capacitor — заменить во ВСЕХ `mipmap-*`
- Никогда не коммитить keystore или пароли в git
