# Release/ — выход конвейера

Для каждого проекта создаётся `Release/{ProjectName}/` с поддиректориями по платформам:

```
Release/MyGame/
├── yandex/        # 3 ZIP + 13 store-listings + art-prompts + rodrik-import
├── vk/            # VK Mini App build + manifest
├── telegram/      # HTTPS-ready bundle + bot-manifest.md
├── ok/            # OK Mini App bundle
├── rustore/       # .apk + .aab + signing-report
└── web/           # Dockerfile + nginx.conf + bundle
```

НИКОГДА не редактировать файлы здесь напрямую — только пересобирать.
