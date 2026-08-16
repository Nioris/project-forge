#!/usr/bin/env python3
"""Пилот озвучки v2 — теперь через ElevenLabs v3 (model_id=eleven_v3).

Использует audio tags в квадратных скобках для выразительности:
  [calm], [sigh], [reflective], [tender], [pause], [softly]

Параметры:
- stability=0.3 (Creative) — наибольшая отзывчивость на теги
- style=0.4 — выразительность без избытка
- similarity_boost=0.85 — держится голоса

Для русского: ставим неочевидные ударения через знак "+" перед ударной гласной
(некоторые голоса/модели понимают, у v3 поддержка частичная).
"""

import urllib.request, urllib.error, json, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
KEY_FILE = ROOT / ".elevenlabs_key"
OUT_DIR = ROOT / "web" / "audio" / "voice_audition"

# Тестовая фраза с audio tags для V3.
# Маша-старуха вспоминает Заречье — спокойно, с теплом, с лёгкой грустью.
TEST_TEXT = (
    "[reflective] Деревня наша называлась Заречье. "
    "Двадцать восемь дворов, церковь без креста — "
    "крест ещё в тридцатом сняли. "
    "[softly] Папа был на войне. Уже месяц. "
    "[sigh] Нас осталось двое — я и Катя. "
    "Я работала, Катя училась. "
    "[tender] Катя хотела быть учительницей."
)

# 6 женских голосов; для Маши-старухи ищем тёплый, не дрожащий, ясный.
VOICES = [
    ("01_Lily",      "pFZP5JQG7iQjIQuC4Bku", "мягкая женская"),
    ("02_Sarah",     "EXAVITQu4vr4xnSDxMaL", "нейтральная, тёплая"),
    ("03_Alice",     "Xb7hH8MSUJpSbSDYk0k2", "британская, спокойная"),
    ("04_Charlotte", "XB0fDUnXU5powFXDhCwa", "глубокая, размеренная"),
    ("05_Matilda",   "XrExE9yKIg1WjnnlVkGX", "тёплая, уверенная"),
    ("06_Dorothy",   "ThT5KcBeYPX3keUQqHPh", "пожилая, мягкая"),
]

MODEL = "eleven_v3"  # самая выразительная, лучшая на тегах

def load_key():
    if not KEY_FILE.exists():
        sys.exit(f"ERROR: нет ключа в {KEY_FILE}")
    key = KEY_FILE.read_text(encoding='utf-8').strip()
    if not key or key.startswith("PASTE"):
        sys.exit(f"ERROR: впиши настоящий ключ в {KEY_FILE}")
    return key

def generate(key, voice_id, text, out_path):
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    body = {
        "text": text,
        "model_id": MODEL,
        "voice_settings": {
            "stability":         0.3,   # Creative — отзывается на теги
            "similarity_boost":  0.85,  # держится голоса
            "style":             0.4,   # выразительно, но не театрально
            "use_speaker_boost": True
        }
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode('utf-8'),
        headers={
            "xi-api-key":  key,
            "Content-Type": "application/json",
            "Accept":       "audio/mpeg",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            return None, resp.read()
    except urllib.error.HTTPError as e:
        return f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:400]}", None
    except Exception as e:
        return f"network: {e}", None

def main():
    key = load_key()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"→ ElevenLabs пилот v2 (eleven_v3, audio tags + Creative stability)")
    print(f"→ Тестовая фраза: {len(TEST_TEXT)} симв.")
    print(f"→ Выход: {OUT_DIR}\n")
    for name, voice_id, desc in VOICES:
        out = OUT_DIR / f"{name}.mp3"
        print(f"  [{name}] {desc}")
        err, audio = generate(key, voice_id, TEST_TEXT, out)
        if err:
            print(f"    !! {err}")
        else:
            out.write_bytes(audio)
            print(f"    ✓ {out.name} ({len(audio)} байт)")
    print(f"\n→ Прослушай, скажи номер. Если ни один не зайдёт — скажи, добавлю ещё 6 других голосов.")

if __name__ == "__main__":
    main()
