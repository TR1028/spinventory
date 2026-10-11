# Racket Life (Spinventory)

Local-first PWA + Cloudflare (Workers + D1) cloud-synced app for tracking table tennis racket setups, spare equipment inventory, rubber calendar & play-time life, boosting logs, and re-boost reminders.

- **线上网址 (GitHub Pages)**: <https://tr1028.github.io/spinventory/>
- **云端后端服务 (Cloudflare Worker + D1)**: <https://spinventory-api.taoran2001.workers.dev>（已默认绑定，打开网页直接注册/登录即可同步）

## 快速使用指南 (How to Use)

1. **打开即用（默认本地模式）**：
   - 直接访问 <https://tr1028.github.io/spinventory/>，无需登录即可使用浏览器本地数据库（IndexedDB），首次打开自带 3 块球拍示例数据。
2. **核心功能操作**：
   - **记录打球**：点击首页右上角或球拍卡片上的 `+` 按钮，选择球拍、日期与时长（分钟）。
   - **球拍详情 & 换胶皮退役归档**：点击任意球拍卡片进入详情页：
     - 可直接编辑当前正/反手胶皮参数（含自定义寿命天数、小时数、灌油复灌提醒周期，默认 `120 天 / 90 小时 / 21 天复灌`）。
     - 点击 **「更换胶皮」** 可直接录入新胶皮或 **从囤货库存中选用闲置胶皮**，原胶皮会自动标记撕下日期并归档至底部的 **「历任退役胶皮档案」**（不再覆盖历史灌油记录）。
     - **打球记录与灌油记录**均支持展开、行内编辑修改与删除（灌油记录增删改后会自动按日期重排 `第 N 次` 序号）。
   - **囤货库存（`#/inventory`）**：点击首页的 **「囤货库存」** 按钮，管理手头未贴拍的 **闲置胶皮** 与 **闲置底板**，支持一键「贴到球拍」或「配胶启用」。
3. **开启多端云同步（Cloudflare Worker + D1 后台服务）**：
   - 点击首页顶部的 **「本地模式」** 徽章打开 **「云端同步」** 弹窗：
     - 在 **「服务器设置」** 中填入你的 Cloudflare Worker 地址（或通过仓库 Actions 变量 `VITE_API_BASE_URL` 预置）。
     - 注册/登录账号后即切换为 **「云端已同步」** 模式；点击 **「将本地数据导入云端」** 可一键将当前浏览器的本地数据安全合并至云端数据库。

## Overview

Racket Life is organized around rackets. Each racket has current forehand and backhand rubbers. Users log simple play sessions with only:

- racket
- date
- duration in minutes
- optional notes

Spare rubbers and blades wait in the inventory until they are mounted. Rubbers taken off a racket stay in that racket's archive of retired rubbers.

By default there is no backend: data lives locally in IndexedDB through Dexie (Local Mode).
Optionally, signing in to your own Cloudflare Worker + D1 backend switches to Cloud Mode so the data follows your account across devices (see [Cloud Sync](#cloud-sync-optional)).
The repository contains application code and optional demo seed data only; a user's real racket, rubber, session, and boosting data stays in their own browser storage or their own Cloudflare account.

## Tech Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Dexie / IndexedDB
- PWA manifest + service worker
- Optional cloud sync: Cloudflare Workers (Hono) + D1

## Features

- **Dashboard** (`#/`)
  - mobile-first cards for the rackets in use, with rubber life bars and a boosting summary
  - header chip showing the data mode (本地模式 / 云端已同步 · user); tapping it opens the 云端同步 dialog
  - 建议复灌 banner listing the rubbers due for a re-boost
  - totals: rackets in use, spare rubbers / blades, minutes played in the last 7 days
- **Racket detail** (`#/rackets/:id`)
  - edit name, blade, status (在用 / 闲置 / 退役) and notes; delete the racket
  - per-side life bars; each rubber can override its calendar limit, play-time limit and re-boost cycle
  - 更换胶皮: mount a new rubber or one from the inventory; the old rubber is retired on the replacement date
  - 撕下退役: retire a rubber and leave the side empty
  - boosting logs and play sessions in expandable lists with inline edit and delete
  - 历任退役胶皮档案: the racket's retired rubbers; restore one to its empty side, or delete it
- **Inventory** (`#/inventory`)
  - 闲置胶皮: add, edit and delete spare rubbers, or 贴到球拍 (a rubber already on that side is retired automatically)
  - 闲置底板: add, edit and delete spare blades, or 配胶启用 with new or inventory rubbers
  - 已退役球拍: 恢复为闲置 or delete
- **Add racket** (`#/rackets/new`): each side takes a new rubber, an inventory rubber, or 暂不贴. A blade with no rubbers is saved as a spare.
- **Record session** (`#/add-session`): racket, date, duration and optional notes
- Demo seed data for three rackets on first launch, local IndexedDB persistence, installable PWA

## Business Rules

- Rubber calendar life starts from `installedAt`. Rubbers in the inventory have not started aging.
- A play session duration is roughly from removing the protective film to cleaning and reapplying it. A session counts toward the rubbers on that racket on the session date.
- A rubber is used up when it reaches either limit: calendar days (default 120) or play time (default 90 h). Each rubber can override both limits.
- Taking a rubber off (撕下退役 or 更换胶皮) sets `removedAt`. Its age and play time stop counting on that date.
- Replacing a rubber retires the old one and mounts the new one on the same date.
- Boosting does not reset rubber life.
- Boosting only records date, count, layers, and notes. Boost numbers follow date order and are renumbered when a log is added, edited, or deleted. Adding a log marks the rubber as boosted; deleting its last log clears the mark.
- 建议复灌 (re-boost reminder): a boosted rubber still in use whose last boost is at least one re-boost cycle old (default 21 days, adjustable per rubber).
- Racket status: 在用 (active, shown on the dashboard), 闲置 (spare blade in the inventory), 退役 (retired).
- Life prediction uses simple per-rubber parameters, not machine learning.

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

The app is still local-first after deployment. Static hosting serves the app code; user data remains in each browser's IndexedDB unless the user signs in to Cloud Mode.

## Cloud Sync (Optional)

Signed out, the app works exactly as before (Local Mode). Signing in switches to Cloud Mode: records are stored in Cloudflare D1 behind a Cloudflare Worker, so they follow the account across devices. Local data is never deleted; it can be imported into the account once and comes back after signing out.

- `worker/`: Hono API (`/api/auth/*`, `GET /api/snapshot`, `POST /api/sync/import`, CRUD for rackets, rubbers, sessions and boosting logs). Passwords use PBKDF2-SHA256 and sessions use HS256 JWTs, both via Web Crypto (no extra dependencies).
- `worker/schema.sql`: D1 schema (`users`, `oauth_accounts`, `rackets`, `rubbers`, `boosting_logs`, `play_sessions`). Safe to re-run.
- `src/db/domain.ts`: business rules shared by the Worker and Local Mode (rubber replacement, retirement, boost numbering, ...).
- `src/db/store.tsx`: `useAppData()` hook used by the pages; it picks Local or Cloud Mode automatically.

### In the app

Tap the chip in the dashboard header (本地模式) to open 云端同步:

- 登录 / 注册 with a username or email and a password. Registration follows the Worker's `ALLOW_REGISTRATION`. When sign-ups are closed, the tab reads 注册（已关闭）.
- 将本地数据导入云端 uploads this browser's records to the account one by one. Records the cloud already has in the same or a newer version are skipped, so running it again is safe.
- 退出登录 returns to Local Mode with the local data unchanged.
- 服务器设置 saves a Worker URL for this browser, overriding `VITE_API_BASE_URL` (a trailing `/api` is removed). Switching servers signs you out; 恢复默认 removes the override.
- GitHub / Google sign-in buttons are shown but disabled (即将支持).

### Local development

```bash
cp .dev.vars.example .dev.vars   # set JWT_SECRET (at least 16 characters)
pnpm db:migrate:local            # create the local D1 tables
pnpm dev:worker                  # Worker on http://127.0.0.1:8787
pnpm dev                         # in another terminal; Vite proxies /api to the Worker
```

### Deploy the Worker

```bash
pnpm exec wrangler login
pnpm exec wrangler d1 create spinventory-db   # copy the printed database_id into wrangler.toml
pnpm db:migrate:remote
pnpm exec wrangler secret put JWT_SECRET      # a long random string, e.g. `openssl rand -base64 48`
pnpm deploy:worker                            # prints https://spinventory-api.<account>.workers.dev
```

Then point the app at the Worker in either of two ways:

- Add a repository variable `VITE_API_BASE_URL` (Settings → Secrets and variables → Actions → Variables) set to the Worker URL, and re-run the Pages workflow. Every visitor then uses it by default.
- Open 云端同步 → 服务器设置 in the deployed app and enter the Worker URL. It is saved in that browser only.

### Worker settings (`wrangler.toml` → `[vars]`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `ALLOW_REGISTRATION` | `"true"` | `"false"` closes sign-ups. The first account can always register. |
| `CORS_ORIGINS` | `"*"` | Comma-separated origins allowed to call the API. |
| `PBKDF2_ITERATIONS` | `"10000"` | Password hashing cost. Keep 10000 on the Workers Free plan (10 ms CPU limit); use `"100000"` on Workers Paid. Existing hashes are upgraded at the next sign-in. |
| `TOKEN_TTL_DAYS` | `30` | Sign-in lifetime in days. |

Cloud Mode needs a connection to save changes; the last synced data stays readable offline. GitHub / Google sign-in is reserved (`/api/auth/oauth/:provider` answers 501 for now).

## Data And Sync

In Local Mode, data does not sync automatically between devices.

Examples:

- Data added on your phone stays on that phone's browser.
- Data added on your laptop stays on that laptop's browser.
- GitHub Pages, Vercel, Netlify, or Cloudflare Pages only host the static app files.

To use the same data on several devices, deploy the Worker (see [Cloud Sync](#cloud-sync-optional)), sign in on each device, and import the existing local data once from the device that has it.

Other possible sync options:

- file-based backup with JSON
- WebDAV / cloud-drive style sync

## Roadmap

- GitHub contribution graph style play-session heatmap
- JSON import / export backup
- GitHub / Google sign-in
