# GameIntegration/ — вход конвейера

Клади сюда ИСХОДНИКИ игры/приложения в виде папки: `GameIntegration/{ProjectName}/`.

Правила:
- Не редактируй ничего внутри после старта
- Работа будет в `WorkProgress/{ProjectName}/`
- Выход — в `Release/{ProjectName}/{platform}/`

Команды:
- `/release yandex`       — собрать под Яндекс Игры (3 ZIP'а + 13 переводов)
- `/release vk`           — собрать под VK Mini Apps
- `/release telegram`     — собрать под Telegram Mini App
- `/release ok`           — собрать под Одноклассники
- `/release rustore`      — собрать APK/AAB для RuStore
- `/release web`          — собрать для VPS-деплоя
- `/release all`          — все платформы подряд
