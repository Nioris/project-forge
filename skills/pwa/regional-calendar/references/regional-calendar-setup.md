# Regional Calendar — Full Reference

## Russian Holidays Data (2025 example — update annually)

```ts
// src/lib/calendar/holidays.ts
export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: 'holiday' | 'shortened' | 'transfer_workday' | 'transfer_dayoff';
}

// Official holidays + transfers per government decree
export const HOLIDAYS_2025: Holiday[] = [
  { date: '2025-01-01', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-02', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-03', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-04', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-05', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-06', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-01-07', name: 'Рождество Христово', type: 'holiday' },
  { date: '2025-01-08', name: 'Новогодние каникулы', type: 'holiday' },
  { date: '2025-02-23', name: 'День защитника Отечества', type: 'holiday' },
  { date: '2025-03-08', name: 'Международный женский день', type: 'holiday' },
  { date: '2025-05-01', name: 'Праздник Весны и Труда', type: 'holiday' },
  { date: '2025-05-09', name: 'День Победы', type: 'holiday' },
  { date: '2025-06-12', name: 'День России', type: 'holiday' },
  { date: '2025-11-04', name: 'День народного единства', type: 'holiday' },
  // Transfers (example — check government decree)
  // { date: '2025-05-02', name: 'Перенос с субботы', type: 'transfer_dayoff' },
];

export function isHoliday(dateStr: string, year = 2025): Holiday | undefined {
  const holidays = year === 2025 ? HOLIDAYS_2025 : [];
  return holidays.find(h => h.date === dateStr);
}

export function isWorkingDay(date: Date): boolean {
  const dateStr = date.toISOString().split('T')[0];
  const holiday = isHoliday(dateStr);
  if (holiday) {
    return holiday.type === 'transfer_workday'; // Saturday made workday
  }
  const day = date.getDay();
  return day !== 0 && day !== 6; // Mon-Fri
}
```

## Russian Timezone Utility

```ts
// src/lib/calendar/timezones.ts
export const RUSSIAN_TIMEZONES = [
  { name: 'Калининград', tz: 'Europe/Kaliningrad', utc: '+02:00' },
  { name: 'Москва', tz: 'Europe/Moscow', utc: '+03:00' },
  { name: 'Самара', tz: 'Europe/Samara', utc: '+04:00' },
  { name: 'Екатеринбург', tz: 'Asia/Yekaterinburg', utc: '+05:00' },
  { name: 'Омск', tz: 'Asia/Omsk', utc: '+06:00' },
  { name: 'Красноярск', tz: 'Asia/Krasnoyarsk', utc: '+07:00' },
  { name: 'Иркутск', tz: 'Asia/Irkutsk', utc: '+08:00' },
  { name: 'Якутск', tz: 'Asia/Yakutsk', utc: '+09:00' },
  { name: 'Владивосток', tz: 'Asia/Vladivostok', utc: '+10:00' },
  { name: 'Магадан', tz: 'Asia/Magadan', utc: '+11:00' },
  { name: 'Камчатка', tz: 'Asia/Kamchatka', utc: '+12:00' },
];

export function detectUserTimezone(): string {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const match = RUSSIAN_TIMEZONES.find(t => t.tz === tz);
  return match?.tz || 'Europe/Moscow';
}

export function formatDateInTz(date: Date, tz: string): string {
  return date.toLocaleDateString('ru-RU', { timeZone: tz, day: 'numeric', month: 'long', year: 'numeric' });
}
```

## Calendar Grid Component

```svelte
<script lang="ts">
  import { isHoliday, isWorkingDay } from '$lib/calendar/holidays';

  interface Props { year: number; month: number }
  let { year, month }: Props = $props();

  const days = $derived.by(() => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Monday start
    const cells: { date: Date; inMonth: boolean }[] = [];

    for (let i = -startPad; i < lastDay.getDate(); i++) {
      const date = new Date(year, month, i + 1);
      cells.push({ date, inMonth: i >= 0 });
    }
    return cells;
  });

  function cellClass(date: Date, inMonth: boolean): string {
    if (!inMonth) return 'text-gray-300';
    const dateStr = date.toISOString().split('T')[0];
    const holiday = isHoliday(dateStr);
    if (holiday) return 'bg-red-100 text-red-700 font-bold';
    if (!isWorkingDay(date)) return 'text-red-500';
    return 'text-gray-900';
  }
</script>

<div class="grid grid-cols-7 gap-1 text-center text-sm" role="grid" aria-label="Календарь">
  {#each ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'] as day}
    <div class="py-1 font-medium text-gray-500" role="columnheader">{day}</div>
  {/each}
  {#each days as { date, inMonth }}
    {@const holiday = isHoliday(date.toISOString().split('T')[0])}
    <button
      class="rounded-lg p-2 {cellClass(date, inMonth)}"
      role="gridcell"
      aria-label="{date.getDate()} {holiday ? `— ${holiday.name}` : ''}"
      title={holiday?.name || ''}
    >
      {date.getDate()}
    </button>
  {/each}
</div>
```
