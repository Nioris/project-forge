---
name: regional-calendar
description: >
  Russian regional calendar system — USDA climate zones, frost dates, moon phases (SunCalc), planting
  algorithms, push reminders, and 11-timezone support. Use this skill for Russian calendar, climate zones,
  planting dates, frost dates, moon phases, growing season, or scheduling for Russian regions.
---

# Regional Calendar Skill

Russian climate zones + moon phases + planting algorithms.

## Russian USDA Zone Mapping

Moscow: 4a, St. Petersburg: 5a, Krasnodar: 7a, Novosibirsk: 3a, Yakutsk: 1a, Sochi: 8a.
Store per region: `lastSpringFrost`, `firstFallFrost`, `growingSeasonDays`.

## Moon Phase Calculation

```ts
import SunCalc from 'suncalc';
const illum = SunCalc.getMoonIllumination(new Date());
// phase: 0=new, 0.25=first quarter, 0.5=full, 0.75=last quarter
```
SunCalc (3KB, BSD) — pre-compute year of phases, cache in Dexie for offline.

## Planting Date Algorithm

Calculate relative to frost dates:
- `startIndoors = lastFrost - 8 weeks`
- `transplant = lastFrost + 2 weeks`
- Check `growingSeasonDays >= crop.minGrowingDays`
- Lunar: waxing moon for above-ground crops, waning for root crops

## Push Reminder Integration

From calculated dates: seed start (3 days early), transplant (7 days early), harvest ready, first frost (2 weeks early).
Store in PB `reminders` collection → schedule via web push.

## Russian Timezones (11)

UTC+2 Kaliningrad → UTC+12 Kamchatka. Russia doesn't observe DST since 2014.
Auto-detect: `Intl.DateTimeFormat().resolvedOptions().timeZone`.

## Non-Negotiable Acceptance Criteria (Serudda)

1. **S — Source: government frost data + USDA zones.** Per-region climate data in PB/Dexie.
2. **E — Every Russian timezone supported.** UTC+2 to UTC+12. Auto-detected.
3. **R — Real-time moon phase.** SunCalc + pre-computed year cache.
4. **U — Updated annually.** Frost dates refined from historical data.
5. **D — Date math in UTC internally.** Display in local tz. No DST issues.
6. **D — Dexie offline cache.** Calendar, zones, phases all work offline.
7. **A — Accessible calendar grid.** ARIA grid role, keyboard nav, holidays announced.

## References

- `references/regional-calendar-setup.md` — Zone data, SunCalc, planting algo, reminders, calendar component.
