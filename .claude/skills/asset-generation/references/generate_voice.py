#!/usr/bin/env python3
"""Массовая генерация озвучки.
Usage: python generate_voice.py says.json [--force]
- читает JSON из extract_says.js (массив {who, text, hash})
- для каждой генерит mp3 в web/audio/voice/<hash>.mp3
- если файл уже есть — пропускает (если не --force)
- prefix-теги по роли добавляются автоматически (только в TTS, не в отображение)
- manifest.json обновляется
"""
import urllib.request, urllib.error, json, sys, time, hashlib
from pathlib import Path

HERE = Path(__file__).resolve().parent

def _find_root(start, key_name=".elevenlabs_key", max_up=6):
    p = start
    for _ in range(max_up):
        if (p / key_name).exists():
            return p
        if p.parent == p:
            break
        p = p.parent
    return start.parent.parent  # fallback

ROOT = _find_root(HERE)  # project root = nearest ancestor with .elevenlabs_key
KEY_FILE = ROOT / ".elevenlabs_key"
OUT_DIR  = ROOT / "web" / "audio" / "voice"
MANIFEST = OUT_DIR / "manifest.json"

CATALOG = json.loads((HERE / "voice_catalog.json").read_text(encoding='utf-8'))
VOICES  = {k: v for k, v in CATALOG.items() if not k.startswith("_")}
SET_NARR = CATALOG["_settings_narrator"]
SET_DIAL = CATALOG["_settings_dialogue"]

# Автоматические audio-tag префиксы по роли — добавляются только в текст для TTS,
# в отображение игры не идут (текст в скрипте остаётся как есть).
TAG_PREFIX = {
    "narrator": "[reflective] ",
    "m":        "",                  # Маша — без префикса, теги в тексте сцен по необходимости
    "k":        "[softly] ",         # Катя
    "t":        "[urgent, firm] ",   # Тимофей
    "p":        "[official, loud] ", # Полицай
    "s":        "[flatly] ",         # Солдат
    "g":        "[softly, warm] ",   # Тётя Глаша — старая учительница
    "l":        "[hoarse, firm] ",   # Лена — жёсткая, хриплая
    "iv":       "[softly, tired] ",  # Доктор Иванов
    "kl":       "[flatly] ",         # Кладовщик
    "h":        "[stern, slowly, accented] ",  # Хмурый — немец, ломаный русский
    "child":    "[whispers, fearful] ",        # Мальчишка
    # --- Глава 3 ---
    "n":        "[warmly, with quiet spark] ", # Нина — рыжая бодрая, живая внутри
    "serezha":  "[softly, weak, child] ",      # Серёжа — обессиленный мальчик 10 лет
    "clerk":    "[flatly, official, German] ",# Чиновник Arbeitsamt — формальная регистрация
    # остальные роли — добавим когда подберём voice_id
}

def generate(key, voice_id, full_text, settings, retries=4):
    body = {"text": full_text, "model_id": "eleven_v3", "voice_settings": settings}
    last_err = ""
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
            data=json.dumps(body).encode('utf-8'),
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                return None, resp.read()
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:200]}"
        except Exception as e:
            last_err = f"net: {e}"
        if attempt < retries:
            time.sleep(min(2 ** attempt, 10))
    return last_err, None

def main():
    args = sys.argv[1:]
    if not args:
        sys.exit("usage: generate_voice.py says.json [--force]")
    force = "--force" in args
    says_path = Path([a for a in args if not a.startswith("--")][0])
    if not says_path.exists(): sys.exit(f"не найден: {says_path}")

    says = json.loads(says_path.read_text(encoding='utf-8'))
    key = KEY_FILE.read_text(encoding='utf-8').strip()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    manifest = {}
    if MANIFEST.exists():
        try: manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
        except: pass

    total = len(says); done = 0; skipped = 0; failed = 0
    print(f"→ Озвучка: {total} реплик")
    for i, item in enumerate(says, 1):
        who, text, h = item["who"], item["text"], item["hash"]
        vtag = item.get("vtag", "").strip()
        voice_id = VOICES.get(who)
        if not voice_id:
            print(f"  [{i:03d}/{total}] {who}: НЕТ voice_id — пропуск")
            failed += 1; continue
        out = OUT_DIR / f"{h}.mp3"
        if out.exists() and not force:
            manifest[h] = {"who": who, "text": text}
            skipped += 1; continue
        # vtag (per-line override) перебивает дефолтный TAG_PREFIX[who]
        prefix = (vtag + " ") if vtag else TAG_PREFIX.get(who, "")
        full_text = prefix + text
        settings = SET_NARR if who == "narrator" else SET_DIAL
        print(f"  [{i:03d}/{total}] {who} ({h}): {text[:50]}{'…' if len(text)>50 else ''}")
        err, audio = generate(key, voice_id, full_text, settings)
        if err:
            print(f"      !! {err}")
            failed += 1
        else:
            out.write_bytes(audio)
            manifest[h] = {"who": who, "text": text}
            done += 1
            print(f"      ✓ {len(audio)} байт")
        time.sleep(0.2)

    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"\n→ Итого: сгенерено {done}, пропущено (уже было) {skipped}, ошибок {failed}")
    print(f"→ Манифест: {MANIFEST}")

if __name__ == "__main__":
    main()
