# Racket Life

Local-first PWA for tracking table tennis racket setups, rubber calendar age, boosting logs, and simple play-session time.

## Overview

Racket Life is organized around rackets. Each racket has current forehand and backhand rubbers. Users log simple play sessions with only:

- racket
- date
- duration in minutes

There is no backend in v1. Data lives locally in IndexedDB through Dexie.
The repository contains application code and optional demo seed data only; a user's real racket, rubber, session, and boosting data stays in their own browser storage.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Dexie / IndexedDB
- PWA manifest + service worker

## Current MVP

- Dashboard with mobile-first racket cards
- Seed data for three rackets and current rubbers
- Rubber life bars based on fixed calendar and play-time parameters
- Boosting summary with count and days since last boost
- Add play session flow
- Local IndexedDB persistence

## Business Rules

- Rubber calendar life starts from `installedAt`.
- A play session duration is roughly from removing the protective film to cleaning and reapplying it.
- Boosting does not reset rubber life.
- Boosting only records date, count, layers, and notes.
- Life prediction uses fixed parameters for v1, not machine learning.

## Seed Data

- Harimoto Innerforce ALC
  - FH: H3 Provincial Blue 41 2.2, boosted 2026-04-07
  - BH: T05 2.1
- Hurricane Long 5
  - FH: H3 National Blue 40 2.2, boosted 2026-05-22
  - BH: H8-80 38 2.1
- Cybershape Carbon
  - FH: H3 Provincial Blue 40 2.2, boosted 2026-06-05
  - BH: H8-80 37 2.1

## Development

Install dependencies:

```bash
pnpm install
```

Start the dev server:

```bash
pnpm run dev
```

Build for production:

```bash
pnpm run build
```

## Roadmap

- Racket detail page
- GitHub contribution graph style play-session heatmap
- Racket and rubber management
- Add / remove racket
- Install / remove rubber
- Add boosting log
- JSON import / export backup
