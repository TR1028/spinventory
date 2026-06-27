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

## Deployment

This repo includes a GitHub Pages workflow at `.github/workflows/deploy.yml`.

To deploy:

1. Push to the `main` branch.
2. In GitHub, open repository settings.
3. Go to Pages.
4. Set the source to GitHub Actions.
5. The workflow will build `dist` and publish the app.

For this repository, the GitHub Pages URL should be:

```text
https://tr1028.github.io/spinventory/
```

The app is still local-first after deployment. Static hosting serves the app code; user data remains in each browser's IndexedDB.

## Data And Sync

In v1, data does not sync automatically between devices.

Examples:

- Data added on your phone stays on that phone's browser.
- Data added on your laptop stays on that laptop's browser.
- GitHub Pages, Vercel, Netlify, or Cloudflare Pages only host the static app files.

Recommended path:

1. Keep v1 fully local-first.
2. Add JSON import/export for manual backup and transfer.
3. Add optional cloud sync later only if multi-device sync becomes important.

Possible future sync options:

- file-based backup with JSON
- WebDAV / cloud-drive style sync
- Supabase or Firebase with login
- self-hosted backend

## Roadmap

- Racket detail page
- GitHub contribution graph style play-session heatmap
- Racket and rubber management
- Add / remove racket
- Install / remove rubber
- Add boosting log
- JSON import / export backup
