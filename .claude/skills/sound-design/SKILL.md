---
name: sound-design
kind: tactical
description: "Procedural game audio: Web Audio API SFX, background music loops, audio manager. No external files. Triggers on: sound, audio, music, SFX, mute, volume."
---
# Sound Design — Procedural Audio

> **Нужны РЕАЛЬНЫЕ аудио-файлы** (озвучка диалогов, записанные SFX, музыка), а не процедурный
> Web Audio? → `/asset-generation`. Этот скил (`/sound-design`) — для синтезированного кодом звука
> без внешних файлов; `/asset-generation` генерит mp3 через ElevenLabs + промпты для Suno.

## Audio Manager
```javascript
const SFX = (() => {
  let ctx, master, musicGain, sfxGain, muted = false, savedVol = 0;
  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); musicGain = ctx.createGain(); sfxGain = ctx.createGain();
    musicGain.connect(master); sfxGain.connect(master); master.connect(ctx.destination);
    musicGain.gain.value = 0.3; sfxGain.gain.value = 0.7;
  }
  function unlock() { init(); if (ctx.state === 'suspended') ctx.resume(); }
  function mute() { if (muted) return; savedVol = master.gain.value; master.gain.setTargetAtTime(0, ctx.currentTime, 0.02); muted = true; }
  function unmute() { if (!muted) return; master.gain.setTargetAtTime(savedVol || 1, ctx.currentTime, 0.02); muted = false; }
  return { init, unlock, mute, unmute, get ctx(){return ctx}, get sfxGain(){return sfxGain}, get musicGain(){return musicGain}, get muted(){return muted} };
})();
['click','touchstart','keydown'].forEach(e => document.addEventListener(e, () => SFX.unlock(), {once:true}));
```

## 12 Procedural SFX Presets
```javascript
function playSound(type) {
  if (!SFX.ctx || SFX.muted) return;
  const ctx = SFX.ctx, now = ctx.currentTime, p = 0.9 + Math.random() * 0.2;
  const make = (wave, freq, endFreq, dur, vol) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(SFX.sfxGain);
    o.type = wave; o.frequency.setValueAtTime(freq*p, now);
    o.frequency.exponentialRampToValueAtTime(endFreq*p, now+dur);
    g.gain.setValueAtTime(vol, now); g.gain.exponentialRampToValueAtTime(0.01, now+dur);
    o.start(now); o.stop(now+dur);
  };
  const noise = (dur, vol, hpf) => {
    const buf = ctx.createBuffer(1, ctx.sampleRate*dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
    const s=ctx.createBufferSource(), g=ctx.createGain(), f=ctx.createBiquadFilter();
    s.buffer=buf; f.type='lowpass'; f.frequency.value=hpf||2000;
    s.connect(f); f.connect(g); g.connect(SFX.sfxGain);
    g.gain.setValueAtTime(vol,now); g.gain.exponentialRampToValueAtTime(0.01,now+dur);
    s.start(now);
  };
  ({
    shoot:    () => make('sawtooth', 800, 200, 0.1, 0.3),
    hit:      () => make('square', 300, 100, 0.08, 0.4),
    explosion:() => noise(0.3, 0.5, 2000),
    pickup:   () => { make('sine',600,600,0.05,0.25); setTimeout(()=>make('sine',900,900,0.05,0.25),50); setTimeout(()=>make('sine',1200,1200,0.1,0.2),100); },
    jump:     () => make('sine', 250, 600, 0.15, 0.2),
    death:    () => make('sawtooth', 400, 50, 0.5, 0.35),
    click:    () => make('sine', 1000, 1000, 0.04, 0.15),
    levelup:  () => { [523,659,784].forEach((f,i) => setTimeout(()=>make('sine',f,f,0.2,0.2), i*100)); },
    powerup:  () => make('sine', 400, 1200, 0.3, 0.25),
    error:    () => { make('square',200,200,0.1,0.2); setTimeout(()=>make('square',200,200,0.1,0.2),100); },
    coin:     () => { make('sine',1200,1200,0.05,0.15); setTimeout(()=>make('sine',1600,1600,0.08,0.12),50); },
    swoosh:   () => noise(0.15, 0.2, 3000),
  })[type]?.();
}
```

## Procedural Background Music
```javascript
function startMusic(style) {
  if (!SFX.ctx) return;
  const ctx = SFX.ctx;
  const S = {
    chill: {base:110, notes:[0,3,5,7,12,15], tempo:0.8, wave:'triangle'},
    tense: {base:82, notes:[0,1,5,6,7,12], tempo:0.5, wave:'sawtooth'},
    epic:  {base:130, notes:[0,4,7,11,12,16], tempo:0.4, wave:'square'},
    menu:  {base:220, notes:[0,4,7,12,16,19], tempo:1.2, wave:'sine'},
  }[style] || {base:110,notes:[0,3,5,7,12],tempo:0.8,wave:'triangle'};

  const drone = ctx.createOscillator(), dg = ctx.createGain();
  drone.type='sine'; drone.frequency.value=S.base; dg.gain.value=0.06;
  drone.connect(dg); dg.connect(SFX.musicGain); drone.start();

  let mt;
  function note(){
    const n=S.notes[Math.floor(Math.random()*S.notes.length)];
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type=S.wave; o.frequency.value=S.base*Math.pow(2,n/12);
    o.connect(g); g.connect(SFX.musicGain);
    const now=ctx.currentTime;
    g.gain.setValueAtTime(0,now); g.gain.linearRampToValueAtTime(0.08,now+0.1);
    g.gain.exponentialRampToValueAtTime(0.001,now+S.tempo*0.9);
    o.start(now); o.stop(now+S.tempo);
    mt=setTimeout(note, S.tempo*1000);
  }
  note();
  return ()=>{ drone.stop(); clearTimeout(mt); };
}
```

## Sound-Event Map (apply to EVERY game)
| Event | Sound | When |
|-------|-------|------|
| Player shoots | shoot | On fire |
| Enemy hit | hit | Damage taken |
| Enemy dies | explosion | HP=0 |
| Player dies | death | Game over |
| Jump | jump | Spacebar/button |
| Collect coin | coin | Overlap pickup |
| Health pack | pickup | Overlap |
| Power up | powerup | Activate |
| Level complete | levelup | All enemies dead / goal reached |
| Button press | click | Any UI button |
| Menu transition | swoosh | Screen change |
| Error/denied | error | Can't buy / locked |

## Non-Negotiable
- [ ] SFX.unlock() on first user interaction
- [ ] At least 8 sounds per game
- [ ] Pitch ±10% on EVERY sound (no robotic repeats)
- [ ] Background music for menu AND gameplay
- [ ] mute()/unmute() exposed (for future ad integration)
- [ ] ALL sounds procedural (zero external files)
