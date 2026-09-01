---
name: credentials-check
kind: tactical
description: "Check and safely provision required credentials, API keys, SDK IDs and signing identity before platform builds. ALWAYS run before /convert, /build-apk, /release-yandex or /deploy."
---

# Credentials Check — безопасная подготовка релиза

## Цель

Перед интеграцией SDK, production-сборкой или публикацией определить все обязательные параметры. Forge сам создаёт локальную release identity там, где это возможно. Секреты, которые выдаёт внешний кабинет, запрашиваются у пользователя только в момент безопасного сохранения.

## Жёсткие правила

- Не использовать фиктивные ключи, `YOUR_KEY_HERE`, пустые значения или debug-подпись в production.
- Не просить пользователя вставлять секрет в чат, аргумент команды, Markdown, `.env`, Gradle properties или файл проекта.
- Не создавать `.jks`, `.keystore`, `.p12`, `.pfx`, приватный PEM или `SIGNING_CREDENTIALS.md` внутри проекта.
- Не печатать секреты и их фрагменты в терминал, отчёты, telemetry или ошибки.
- Package ID, numeric app ID, public key ID и SHA-256 сертификата не являются секретами и могут храниться в публичном project playbook.
- Версии SDK и требования магазинов проверять по актуальной официальной документации перед релизом.

## 1. Локальная release identity

Для Android Forge генерирует один раз и затем неизменно переиспользует:

- reverse-DNS package ID;
- RSA-3072 PKCS12 signing key;
- alias и криптографически стойкий пароль;
- публичный SHA-256 fingerprint.

```powershell
node <forge-engine>/scripts/forge-security.mjs init --project .
node <forge-engine>/scripts/forge-security.mjs validate --project .
```

Приватные данные находятся во внешнем vault `<forge-data>/security/`, защищённом средствами ОС и расположенном вне проекта/Git. В `forge.identity.json` сохраняются только публичная identity и связь с vault. Повторный `init` обязан быть идемпотентным; отсутствие, повреждение или несовпадение существующего vault — STOP, а не генерация нового ключа.

До первой загрузки в магазин создать поддерживаемый Forge зашифрованный backup vault. Потеря signing key блокирует обновления приложения.

## 2. Секреты внешних сервисов

Долгоживущие API-токены и приватные ключи хранить через централизованный secret store Forge, передавая значение через stdin или защищённый UI:

```powershell
node <forge-engine>/scripts/forge-secrets.mjs set <provider> --stdin
node <forge-engine>/scripts/forge-secrets.mjs status
```

Секрет разрешено кратковременно передать только окружению дочернего процесса. После завершения процесса временный файл или переменная должны быть удалены. В логах показывать только `configured/missing`, provider, public ID и fingerprint.

## 3. Матрица обязательных данных

| Платформа | Forge создаёт | Пользователь/кабинет выдаёт |
|---|---|---|
| RuStore / Google Play / AppGallery / TapTap | package ID, Android signing identity | developer/company account, app numeric ID, store API key, IAP IDs |
| Яндекс Игры | build identity и файлы листинга | console game ID, OAuth/API token при автоматической загрузке |
| VK Mini Apps | web build identity | app ID, service token/secret при необходимости |
| Telegram Mini App | web build identity | bot token от BotFather, bot username |
| VK Play | desktop/web build identity | project ID, SDK credentials, signing requirements кабинета |
| Steam | desktop build identity | App ID, depot/build IDs, Steamworks credentials |

Публичные ID фиксировать в platform profile или store listing. Секреты сохранять только в vault/secret store.

## 4. Поведение агента

1. Определить целевую платформу и проверить её profile contract.
2. Запустить `forge-security validate`; если identity ещё нет — `init`.
3. Проверить status внешних credentials без чтения или отображения значений.
4. Автоматически создать всё локально генерируемое.
5. Если нужен внешний кабинет, остановиться с одной конкретной инструкцией: где создать значение и какой безопасной командой сохранить через stdin.
6. После появления значения повторить preflight и продолжить с того же шага.

## 5. Release gate

Релиз блокируется, если:

- package ID изменился после первой публикации;
- fingerprint сборки не совпадает с закреплённой identity;
- APK/AAB подписан debug-сертификатом или не проходит независимую проверку;
- проект/Git содержит signing key, пароль, приватный PEM, PEPK export либо запрещённый credentials-файл;
- обязательный внешний credential отсутствует;
- backup signing vault до первой публикации не подтверждён.

Успешный credentials check подтверждает только готовность локальных входов. Он не доказывает загрузку, модерацию или публикацию в магазине — для этого нужен отдельный submit receipt из внешней системы.

## Acceptance criteria

- [ ] Forge сам создал стабильные package ID, alias, пароль и signing key.
- [ ] Все приватные данные находятся вне project root и Git.
- [ ] `forge.identity.json` не содержит секретов.
- [ ] Secret scanner и `git check-ignore` проходят.
- [ ] Production artifact имеет ожидаемый package ID и SHA-256 сертификата.
- [ ] В выводе команд, логах и telemetry нет секретов или их фрагментов.
- [ ] Для отсутствующего внешнего секрета показано одно понятное действие без запроса вставить его в чат.
