# Lumen — Sleep Tracker

A premium, private, mobile-first sleep tracker built with React + TypeScript + Vite.
Everything is calculated from what you log. Nothing is simulated: no fake stage data or invented measurements.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for time & sleep calculations
npm run build      # type-check + production build
```

## Features
- **Home**: last night's duration ring vs. goal, a Sleep Score you can tap for its breakdown, comparisons with the previous night and the 7-night average, a sleep timeline, sleep stages (manual or imported only), schedule vs. targets, sleep debt, streaks, weekly goal and insights.
- **Tracking**: start or stop a live sleep session, log nights manually (nights crossing midnight are resolved automatically), edit, delete with undo, notes, time to fall asleep, awake time, awakenings, quality and optional stage minutes.
- **History**: a color-coded month calendar, best and toughest nights, the full record list and CSV export.
- **Analytics**: 7D/30D/90D ranges with averages, consistency, goal completion, duration bars, a sleep-window chart, score and efficiency trends, highlights, schedule changes vs. the previous period and a weekday pattern.
- **Journal**: a morning check-in (mood, energy, how rested you feel) and daytime habits (caffeine, exercise, stress, tags, notes), plus habit/sleep patterns shown as associations rather than causation.
- **Profile**: sleep goal, target times, weekly goal, reminders (browser notifications), the gentle-wake smart alarm, 12h/24h clock, Midnight/Dawn theme, CSV import/export and a delete-all option.

## Architecture
```
src/
  data/       types, SleepRepository interface, LocalStorage implementation, CSV, Supabase sketch
  lib/        pure logic: time.ts (timezone-aware), sleep.ts (metrics, score, stats), alarm.ts
  state/      StoreProvider (data + actions), UIProvider (routing, sheets, toasts)
  components/ reusable UI, SVG charts, sheets, alarm controller
  pages/      Home, History, Analytics, Journal, Profile
```
- **Storage**: the UI only talks to `SleepRepository` (async). To move to Supabase, implement it (see `src/data/supabaseRepository.example.ts`) and pass it as `<StoreProvider repository={...}>`.
- **Time**: instants are stored in UTC along with the record's IANA timezone. Durations are exact across DST changes, and clock times render in the zone where the night was logged. A night is labelled by its wake-up date.

## Sleep Score (0–100, not a medical measure)
| Factor | Weight | Full marks |
|---|---|---|
| Duration vs. goal | 40 | at goal (up to +2h) |
| Efficiency (asleep ÷ in bed) | 20 | ≥ 90% |
| Consistency vs. your recent routine (or targets) | 20 | within 15 min |
| How it felt (your 1–5 rating) | 20 | 5/5 |

If a factor was not recorded, its weight is shared among the factors that were.

## Honest limitations
- A web page cannot detect sleep stages. The smart alarm instead ramps up gently across your wake window, and only while the tab is open during a sleep session.
- There is no direct sync with wearables or health platforms. Stage minutes can be entered manually or imported via CSV.

## Deploy
Pushing to `master` runs `.github/workflows/deploy.yml`, which tests, builds and publishes to GitHub Pages
(enable it once under **Settings → Pages → Source: GitHub Actions**). The site is served at
`https://mishanyaprivet.github.io/Sleep/`.
