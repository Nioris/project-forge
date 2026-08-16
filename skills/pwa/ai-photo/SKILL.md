---
name: ai-photo
description: >
  On-device AI photo processing with TensorFlow.js for SvelteKit PWA. Model loading with IndexedDB cache,
  WebGL/WASM backend selection, hybrid identification (on-device + PlantNet API fallback), and memory
  management. Use this skill for AI image recognition, on-device ML, TensorFlow.js, photo classification,
  plant identification, or "ИИ-обработка фото".
---

# AI Photo Skill

TensorFlow.js on-device AI with cloud fallback.

## Model Loading with IDB Cache

```ts
const INDEXED_DB_KEY = 'indexeddb://classifier-v1';
async function loadModel() {
  if (localStorage.getItem('model-version') === CURRENT_VERSION) {
    try { return await tf.loadGraphModel(INDEXED_DB_KEY); } catch {}
  }
  const model = await tf.loadGraphModel(MODEL_URL);
  await model.save(INDEXED_DB_KEY);
  localStorage.setItem('model-version', CURRENT_VERSION);
  return model;
}
```

**Always warm up** with `model.predict(tf.zeros([1,224,224,3]))` — first inference is 3–10x slower.

## Backend Selection

- **WebGL**: mid-range+ devices, 2–8x faster for medium models
- **WASM**: budget Android, better stability, no driver issues
- Check `tf.ENV.getBool('WEBGL_RENDER_FLOAT32_CAPABLE')` — many budget GPUs only 16-bit

## Hybrid Strategy

On-device first (MobileNetV2 uint8 ~3.5MB). If confidence < 0.7 and online → **PlantNet API**
(77,900+ species, 500 free IDs/day): `https://my-api.plantnet.org/v2/identify/all`.

## Memory Management

- **Always** use `tf.tidy()` for all inference code — prevents GPU memory leaks.
- Monitor with `tf.memory()`.
- Quantize to uint8 during conversion (14MB → 3.5MB, ~2% accuracy loss).
- Use `GraphModel` (not LayersModel) for graph-level optimizations.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Model cached in IndexedDB.** Version-checked. No re-download on each visit.
2. **E — Every inference wrapped in tf.tidy().** No memory leaks. Monitor tf.memory().
3. **R — Result in < 3 s on mid-range device.** Model warm-up on first load.
4. **U — User consent before processing.** Explicit opt-in for camera/photo access.
5. **D — Degradation to API fallback.** On-device confidence < 0.7 → PlantNet API.
6. **D — Data stays on device by default.** Only sent to API if fallback needed + user consented.
7. **A — All common formats.** JPEG, PNG, WebP. HEIC converted before inference.

## References

- `references/ai-photo-setup.md` — TF.js setup, model loading, backend selection, PlantNet, Web Worker.
