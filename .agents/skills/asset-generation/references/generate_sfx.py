#!/usr/bin/env python3
"""Массовая генерация SFX через ElevenLabs Sound Generation.
Читает sfx_catalog.json — для каждого ключа sfx_*: prompt, duration, loop.
Кладёт mp3 в <out-dir>/<name>.mp3 (по умолчанию web/audio/sfx/ относительно ROOT).

ROOT определяется автоматически: ищем .elevenlabs_key вверх по дереву от скрипта.
Forge-portable: не привязано к конкретной структуре проекта.
"""
import urllib.request, urllib.error, json, sys, time, argparse
from pathlib import Path

HERE = Path(__file__).resolve().parent

def find_root(start, key_name=".elevenlabs_key", max_up=6):
    """Идём вверх от start пока не найдём key-файл (или предел max_up)."""
    p = start
    for _ in range(max_up):
        if (p / key_name).exists():
            return p
        if p.parent == p:
            break
        p = p.parent
    return start.parent.parent  # fallback к старому поведению

def generate(key, prompt, duration_seconds, retries=4):
    body = {"text": prompt, "duration_seconds": duration_seconds, "prompt_influence": 0.4}
    last_err = ""
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            "https://api.elevenlabs.io/v1/sound-generation",
            data=json.dumps(body).encode('utf-8'),
            headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=240) as resp:
                return None, resp.read()
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}: {e.read().decode('utf-8', errors='replace')[:300]}"
        except Exception as e:
            last_err = f"net: {e}"
        if attempt < retries:
            time.sleep(min(2 ** attempt, 10))
    return last_err, None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--catalog", default=str(HERE / "sfx_catalog.json"))
    ap.add_argument("--out-dir", default=None, help="default: <ROOT>/web/audio/sfx")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()

    root = find_root(HERE)
    key_file = root / ".elevenlabs_key"
    if not key_file.exists():
        sys.exit(f"ERROR: нет ключа {key_file} (положи .elevenlabs_key в корень проекта)")
    out_dir = Path(args.out_dir) if args.out_dir else (root / "web" / "audio" / "sfx")

    catalog = json.loads(Path(args.catalog).read_text(encoding='utf-8'))
    sfx = {k: v for k, v in catalog.items() if not k.startswith("_")}
    key = key_file.read_text(encoding='utf-8').strip()
    out_dir.mkdir(parents=True, exist_ok=True)

    total = len(sfx); done = 0; skipped = 0; failed = 0
    print(f"→ SFX: {total} звуков → {out_dir}")
    for name, item in sfx.items():
        prompt = item["prompt"]; dur = item.get("duration", 8)
        out = out_dir / f"{name}.mp3"
        if out.exists() and not args.force:
            print(f"  [skip] {name}: уже есть")
            skipped += 1; continue
        print(f"  → {name} ({dur}с): {prompt[:60]}...")
        err, audio = generate(key, prompt, dur)
        if err:
            print(f"      !! {err}")
            failed += 1
        else:
            out.write_bytes(audio)
            print(f"      ✓ {len(audio)} байт")
            done += 1
        time.sleep(0.5)
    print(f"\n→ Готово: {done} сгенерено, {skipped} пропущено, {failed} ошибок")

if __name__ == "__main__":
    main()
