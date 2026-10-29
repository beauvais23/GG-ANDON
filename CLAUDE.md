# CLAUDE.md — GG-ANDON / ManufacturingOS

This is the G&G Industrial Lighting production-floor ANDON system ("G&G Production Response System"),
being evolved into a Manufacturing Operating System (MOS). **It is in live use on the floor.**
Read this file fully before changing anything.

## Hard rules (never break)

1. `react-v2` auto-deploys BOTH Railway production services on every push. Never push or merge to `react-v2` directly.
   Work on feature branches → PR into `staging` (the default branch) → after staging sign-off, PR `staging` → `react-v2`.
   Claude never opens, merges or pushes to `react-v2`, and never changes the Railway **production** environment (deploys, variables, settings).
   Claude **may merge PRs into `staging`** after the Director of Manufacturing replies "approved" on that PR (approval Oct 28 2026). For promotions, Claude prepares a pre-filled `react-v2`...`staging` compare link; the Director creates and merges that PR.
2. Production deploys may happen during shift hours (Mon–Thu 6:00–16:30 ET). **Standing approval from the Director of Manufacturing, Oct 28 2026**; no per-release approval is needed.
   **Mid-shift is the default (Director, Oct 29 2026):** Claude no longer recommends waiting for lunch or 16:45 ET unless the Director says not to deploy mid-shift for a given release. A redeploy still causes a short backend outage (about 35 s, Oct 27), so for an in-shift release Claude still states the cost (outage, floor-visible changes, age of the newest backup). See "Promotion pre-flight".
   This rule is about *when*. Who merges is unchanged by it: see hard rule 1.
3. No secrets in code, commits, logs, or test fixtures. Env vars are referenced by name only.
4. No real people's names in committed code or seed files. People, roles, and Slack IDs are entered through the Admin UI per environment.
5. Every schema change is a numbered migration in `server/migrations/` with `up` and `down`. The runner backs up the DB before applying any migration (built in; see "Migrations and backups").
6. Staging must never notify production channels. Notification code runs only when `APP_ENV=production`, or when a staging-specific channel is configured.
7. Every PR description includes three sections: **What changed**, **How to test**, and **How to roll back**.
8. Add tests for anything touching the event lifecycle, escalation timers, plan-vs-actual math, or adapter normalization.
9. Keep the stack (Express 5, better-sqlite3, React 19, Vite, MUI). Don't add frameworks without a stated defect, fix, and cost.
10. Read before you write. Line references below come from commit `5e304a6` (staging, Oct 27 2026). Verify them; the code may have moved.
11. A new required env var is not "done" until it is on the promotion pre-flight list below. Missing production variables fail silently or break features.

## Stack and layout

| Area | Location | Notes |
|---|---|---|
| Backend | `server/index.js` (~2,470 lines, all routes inline) | Express 5, JWT auth, better-sqlite3. Exports `app`; listens only when run directly |
| DB layer | `server/database.js` | Opens the DB, runs `restoreIfRequested` then `migrateUp`, seeds empty tables, prepares statements. Registers SQL function `ny_month()` |
| Migrations | `server/migrations/` | `runner.js` (up/down, backups, retention), `restore.js` (`RESTORE_BACKUP`), `0001_baseline`, `0002_alerts_cancelled_at`, `0003_normalize_availability`, `0004_cancel_clears_resolved`, `0005_archive_lines_responders` |
| Auth middleware | `server/middleware/auth.js` | `authenticateToken`, `requireAdmin` (applied to all config-change and backup routes) |
| Notifications | `server/services/` | `notificationManager.js` fans out to `telegram.js`, `telegramUpdate.js`, `googleChat.js`; all gated by `appEnv.js` (`notificationsEnabled()`) |
| Other services | `server/services/` | `nyTime.js` (America/New_York day/month math), `workingTime.js` (working minutes for MTTA/MTTR), `availability.js` (responder enum), `dailyBackup.js`, `offsiteBackup.js` (Google Drive copy of every backup), `notificationQueue.js` (background notifications, per-alert order, time limit), `network.js` (outbound connect settings, loaded first in `index.js`) |
| Tests | `server/test/` | `node:test` + `supertest`, temp SQLite per file. Run `cd server && npm test`. GitHub Actions (`.github/workflows/ci.yml`) runs them on every PR |
| Frontend | `app/src/` | React 19, MUI 9, MUI X DataGrid, Recharts; polling, no websockets. Backend URL from `VITE_API_BASE_URL` (build fails if unset). Open screens reload themselves after a deploy (`hooks/useAutoReload.js` + `/version.json`): checked every 2 min, only when idle 60 s with no alert screen, dialog or typing. Staging pages show an orange "STAGING (test system)" bar and a `[STAGING]` tab title (`components/StagingBanner.jsx`, detected from "staging" in the hostname; no variable). **Look (Option E, mockup approved Oct 29 2026):** one dark industrial theme in `theme/theme.js` (tokens: ground `#0B0D10`, panel `#14181D`, line `#262C33`, G&G blue `#237EB5`; Barlow Condensed / Inter / JetBrains Mono from Google Fonts); never hard-code light backgrounds. Top bar + **PAGES** menu on every page (`Header.jsx`, `PagesMenu.jsx`, page list in `config/pages.js`); alert colors in `config/alertColors.js` |
| Cleanup (Oct 29 2026) | removed | Legacy root site (`index.html`, `css/`, `js/`, root `package.json`/lock, `assets/`, `scripts/backup-production-db.sh`) and 17 unused frontend files. Railway and CI build only `/server` and `/app` |

### Railway (project GGLED)

| Environment | Service | Root dir | Branch | Notes |
|---|---|---|---|---|
| production | GG-ANDON (backend) | `/server` | `react-v2` | Volume at `/data`; DB `/data/andon.db`; backups `/data/backups` |
| production | ManufacturingOS Frontend | `/app` | `react-v2` | `serve -s dist` |
| staging | GG-ANDON-staging | `/server` | `staging` | Own volume at `/data`; healthcheck `/health`; https://gg-andon-staging-staging.up.railway.app |
| staging | ManufacturingOS Frontend-staging | `/app` | `staging` | https://manufacturingos-frontend-staging-staging.up.railway.app |

The Railway plan has **no volume backups** (Hobby). Backups are written to the same volume as the DB and copied automatically to the **G&G ANDON** Shared Drive in Google Drive (see "Migrations and backups").

### Environment variables (names only)

| Service | Variable | Required | Notes |
|---|---|---|---|
| Backend | `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PRODUCTION_USERNAME`, `PRODUCTION_PASSWORD`, `AUTH_SECRET` | yes | Different values per environment |
| Backend | `DATABASE_PATH` | yes | `/data/andon.db` |
| Backend | `APP_ENV` | yes | `production` only in production. Anything else disables all Telegram/Google Chat traffic and `setWebhook` |
| Backend | `TELEGRAM_WEBHOOK_SECRET` | production | 1–256 chars `A-Z a-z 0-9 _ -`. Missing/invalid → webhook rejects every call (Telegram buttons dead) |
| Backend | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_CHAT_WEBHOOK` | production only | Never set in staging. `TELEGRAM_CHAT_ID` is a Telegram **channel** (no member replies; only button presses reach the bot) |
| Backend | `SERVER_URL` | staging | Unset in production; falls back to the prod URL (`server/config.js:5-7`) |
| Backend | `SUPERVISOR_URL` | staging | Unset in production; falls back to the prod frontend (`server/config.js:11-13`) |
| Backend | `JWT_EXPIRES_IN` | no | Default `12h`. A malformed value breaks every login |
| Backend | `DAILY_BACKUP_HOUR` | no | New York hour 0–23, default `17` |
| Backend | `NOTIFY_TIMEOUT_MS` | no | Time limit per Telegram/Google Chat call, default `5000` |
| Backend | `BACKUP_DIR` | no | Default `<DATABASE_PATH dir>/backups` |
| Backend | `RESTORE_BACKUP` | incident only | Backup file name to restore at next boot; delete after use |
| Backend | `RESTORE_FROM_DRIVE` | incident only | Backup file name in the Drive folder: downloaded at next boot, then restored like `RESTORE_BACKUP`. Never set both; delete after use |
| Backend | `GDRIVE_SERVICE_ACCOUNT_JSON` | yes (secret) | Service account key (JSON) for the off-site copy. Pasted by the Director only; never in chat, code or logs. Same service account for both environments |
| Backend | `GDRIVE_BACKUP_FOLDER_ID` | yes | Folder in the **G&G ANDON** Shared Drive: `production` = `1W4mdfHzxuFh5bt57LFSDhd86Z6iGyH0b`, `staging` = `1BV06LlANjP7b0mCnGsxSTIfqRI97yOnl`. Either variable missing → off-site copy off (warning on `/admin` → Backups) |
| Frontend | `VITE_API_BASE_URL` | yes (build time) | Backend URL for that environment |

## Migrations and backups

- **Migrations**: `server/migrations/NNNN_name.js` exporting `up(db)` / `down(db)`; applied in order at boot, each in a transaction; recorded in `schema_migrations`. `npm run migrate:status`, `npm run migrate:down` (needs a shell, so not usable from a browser).
  `0001_baseline` is the pre-migration schema and cannot be reverted.
- **Pre-migration backup**: before any pending migration runs on a DB that has tables, `VACUUM INTO` writes `andon-<UTC>-before-NNNN.db`. If it fails, the server does not start.
- **Daily backup**: at boot and every 10 min; after 17:00 ET, if today's (NY date) file is missing, `db.backup()` writes `andon-<UTC>-daily-<YYYY-MM-DD>.db` (via `.partial` + rename).
- **Retention**: newest 14 daily and newest 14 other backups, kept separately.
- **Restore (browser only)**: set `RESTORE_BACKUP=<file>` on the backend → Deploy. Snapshots the current DB as `…-before-restore.db`, integrity-checks the backup, swaps it in before the DB opens; runs once per file name. Any problem skips the restore and boots normally.
  After a bad migration, **revert the code first**, then restore; otherwise the migration re-runs.
- **Restore from Drive** (volume lost or file pruned locally): set `RESTORE_FROM_DRIVE=<file>` → Deploy. At boot, before the DB opens, the file is downloaded from the Drive folder into the backup folder (child process, 2-min limit), then the `RESTORE_BACKUP` flow above runs. Download failure → restore skipped, normal boot. Lost volume: attach a new volume at `/data`, keep `DATABASE_PATH`, set `RESTORE_FROM_DRIVE` to the newest `…-daily-….db` in the Drive `production` folder, Deploy, then delete the variable.
- **Off-site copy** (`services/offsiteBackup.js`): at boot and every 10 min, every local backup not yet in the Drive folder is uploaded (service account, Shared Drive "G&G ANDON"). Drive keeps all copies. `/admin` → Backups shows the newest copy and an "In Drive" column. In production, a Google Chat warning goes out once a day while the newest Drive copy is over 26 h old.
- **Download**: `/admin` → Backups tab (`GET /admin/backups`, `GET /admin/backups/:file`, admin only). The weekly manual copy is optional now that the off-site copy runs daily.

## Promotion pre-flight (staging → react-v2)

1. All tests pass on the staging tip (green CI ✓ on the latest `staging` commit); staging deploy logs are clean.
2. **Every required production variable for this release exists in Railway production before the merge**, and the staged-changes banner is gone. Check the table above for anything new in this release.
3. Timing: any time, mid-shift included, unless the Director says otherwise for that release (hard rule 2). In-shift: warn the floor first. Write "In-shift deploy (standing approval)" in the PR description when merging during a shift.
4. Watch the backend log for: `Database backup … before-NNNN` (if migrations), `Migration applied`, `Notifications Enabled`, `Telegram webhook configured`.
5. Download the new `before-NNNN` backup from `/admin` → Backups to Drive.
6. Smoke test **on the production URL** (not staging, which never notifies): tablet alert → Telegram + Chat delivered → **Telegram Acknowledge** works → duplicate banner → cancel the test alert (tablet CANCEL REQUEST → **Test**, or CANCEL on `/supervisor` with a reason; cancelled alerts are excluded from MTTR).

Incident record, Oct 27 2026: Phase 0.5 was merged to `react-v2` at 14:36 ET without `APP_ENV`/`TELEGRAM_WEBHOOK_SECRET` set. Production ran 16 minutes with notifications disabled and one live alert (#48) unannounced. Steps 2 and 3 above exist because of this.

## Plant model

- Timezone: America/New_York for all shift, day, and month math. Railway runs in UTC.
- Standard shift (all lines): Mon–Thu, 6:00–16:30. Overtime shifts (Fri/Sat/Sun) are optional and exist only when scheduled.

| Period | Planned downtime | Work min |
|---|---|---|
| 6:00–7:00 | Start up (5) | 55 |
| 7:00–8:00 | — | 60 |
| 8:00–9:00 | — | 60 |
| 9:00–10:00 | Break 1 (15) | 45 |
| 10:00–11:00 | — | 60 |
| 11:00–12:00 | Lunch (30) | 30 |
| 12:00–13:00 | — | 60 |
| 13:00–14:00 | — | 60 |
| 14:00–15:00 | Break 2 (15) | 45 |
| 15:00–16:00 | — | 60 |
| 16:00–16:30 | Clean up / EOD huddle (10) | 20 |
| **Total** | 75 | **555** |

- Escalation timers, MTTA/MTTR, and downtime minutes count **working minutes only**: inside a scheduled shift and outside planned downtime.
- Planned downtime clock times (`services/workingTime.js`, confirmed Oct 28 2026): start-up 6:00–6:05 AM, break 1 9:00–9:15 AM, lunch 11:00–11:30 AM, break 2 2:00–2:15 PM, clean-up / EOD huddle 4:20–4:30 PM.
- Overtime days: there is no OT schedule yet. A Fri/Sat/Sun counts as an OT day when at least one alert was raised on it (New York date), using the standard schedule. Replace with a real shift calendar when the hour-by-hour board adds one.
- App production lines (live DB) and line groups:

| App line | Line group | Work centers |
|---|---|---|
| Team A | Team A | Assembly, Final Test |
| Team B | Team B | Assembly, Final Test |
| Gigabay | SpaceX | PCB Test, Assembly, Final Test, Packaging |
| Gigabay - Vertical | SpaceX | PCB Test, Assembly, Final Test, Packaging |
| Terabay | SpaceX | PCB Test, Assembly, Final Test, Packaging |
| Deca | SpaceX | PCB Test, Assembly, Final Test, Packaging |

  Do not rename lines. Alerts reference lines and work centers **by name** (TEXT), so renaming a line orphans its history.
  "SpaceX" (formerly Special Projects) is a grouping (`line_group`), not a new line. The Control Panel Area (CNTL, PRX, PDT and VLS-CNTL SKUs) may become a 4th line group; not decided.
- Pending Report line mapping (Gen column H): Gen 2 and 3 = Team A; Gen 1, 4, and 5 = Team B; blank Gen = SpaceX. A blank Status means the order has not been released to production.

## Locked decisions

- **Event types (7):** Downtime, Quality, Material Shortage, Maintenance/Equipment, Safety, Near Miss, Supervisor Assist.
  Existing `SUPERVISOR` alerts map to Supervisor Assist; `QUALITY`, `MAINTENANCE`, `MATERIAL`, and `SAFETY` map to their counterparts.
- **Roles for routing:** Production Lead (per line group), Production Manager, Manufacturing Manager, Director of Manufacturing,
  Leadership (VP Engineering, President), CI and Safety Specialist, Procurement, Warehouse Manager, Inventory and Controls, Engineering.
- **Special routing:** Safety and Near Miss events notify CI and Safety immediately. Material Shortage events notify Procurement and the Warehouse Manager.
- **Escalation:** the admin-configurable matrix ships in **shadow mode** first. It logs who would have been notified and sends nothing.
  It goes live only after thresholds are confirmed from shadow data.
- **Quality capture / NCM sync:** dropped. The NCM failure-code list is used only as the reason-code list for hour-by-hour failures.
- **QuickBooks:** read-only through CData Connect AI (QuickBooks Desktop behind it). Views: `Company_OpenOrderLines`, `Company_SalesOrderLines`, `Company_Items`.
- **Slack:** comes last. Telegram and Google Chat stay live until Slack's parallel run completes.

### Hour-by-hour board (plan vs actual)

1. One board per app line, so SpaceX gets one board per product family.
2. Rates are set in Admin: Line → Product Family → SKU. A family rate applies to all its SKUs; a SKU rate overrides it. Rates carry an effective date, and plans snapshot the rate used.
3. Plans are a sequence of runs (SKU + qty), one lane per line (single piece flow).
4. Each hour's plan per SKU = `ROUNDDOWN(rate × that SKU's work minutes in the period / 60, 0)` (matches the Excel sheet).
   **Remainder true-up:** the final period of each run plans `run qty − already planned`. A single-SKU full shift with no qty target must total 154 at 17/hr.
5. No changeover deduction. "Changeover" is a variance reason code.
6. Actual = good units through Final Test, entered one tap per unit, with a sticky SKU selector, a 30 s undo, an offline queue, and idempotent tap IDs.
7. Failures: FAIL → code. A failure stays open until it is dispositioned as Rework passed (adds 1 to that hour's Actual) or Scrap (offers a pre-filled NCM Google Form link).
8. FPY = first-pass good ÷ (first-pass good + first-pass fails). Reworked passes are excluded from the numerator.
9. RAG per hour: green ≥100% of plan, amber 90–99%, red <90% (admin-editable).

## Known defects

### Fixed

Phase 0.5 (PRs #2–#8, promoted Oct 27 2026) fixed #1–#12. Later fixes are marked with their branch.

| # | Defect | Fix |
|---|---|---|
| 1 | Frontend API URL hard-coded to prod | `VITE_API_BASE_URL`, build fails if unset (0.5a) |
| 2 | Telegram `setWebhook` on every boot | Runs only when `APP_ENV=production`, with `secret_token` (0.5a, 0.5b) |
| 3 | Telegram webhook unauthenticated | `X-Telegram-Bot-Api-Secret-Token` checked, fails closed (0.5b) |
| 4 | `GET /telegram/test` unauthenticated | Deleted (0.5b) |
| 5 | `requireAdmin` never applied | Applied to the 10 config-change routes and the backup routes (0.5b, 0.5f) |
| 6 | JWT expiry 8 h | `JWT_EXPIRES_IN`, default 12 h (0.5b) |
| 7 | Ad-hoc, non-reversible migrations | Migration runner + backups + restore (0.5c, 0.5c2, 0.5e) |
| 8 | MTTR included cancelled alerts | Queries use `status='RESOLVED'`; `cancelled_at` added (0.5d) |
| 9 | "resolvedToday" was all-time | Since 00:00 America/New_York (0.5d) |
| 10 | Monthly trends in UTC | `ny_month()` (0.5d) |
| 11 | Availability case mismatch; web ack didn't set Responding | Enum `Available/Responding/Busy/Away`; web ack/resolve/cancel update it (0.5d) |
| 12 | 409 duplicate ignored on tablet | "TYPE: Already open since h:mm AM/PM" banner (0.5d) |
| 13 | Notifications awaited in the request with no timeouts | Routes answer first; notifications queued per alert; every outbound call limited by `NOTIFY_TIMEOUT_MS` (fix-13) |
| 14 | Resolution notes hard-coded to "Resolved" (web) | "What fixed it?" dialog on `/supervisor` and `/dashboard`; API requires a note, max 500 chars (fix-14). Telegram resolves still write "Resolved from Telegram" |
| 17 | Seed data contained real people's names (hard rule 4) | Responder seed removed; a new environment starts with no responders (fix-17). The names remain in git history and in any DB that was seeded before |
| 20 | Resolving or cancelling one alert set the responder Available while they still held another open alert | `releaseResponders()` in `index.js` (web resolve, cancel, Telegram resolve): Available only when no ACKNOWLEDGED alert is left; also releases the acknowledger when someone else resolves (fix-20) |
| 23 | Telegram press on an alert ID that doesn't exist returned 500 | Every press gets a reason: not found, already resolved by, cancelled, already acknowledged by, acknowledge first (fix-23-24) |
| 24 | Telegram Resolve (and the "✅ RESOLVED" button) answered "Acknowledged ✔"; a losing Acknowledge never saw "Already acknowledged by" (Telegram takes one answer per press) | Each press answered exactly once, after the DB update; a failed answer is logged and the webhook still returns 200 (fix-23-24) |
| 16 | No CI | `.github/workflows/ci.yml`: backend tests + frontend lint and build on every PR into `staging`/`react-v2` and every push to `staging`; Node 22 like Railway (ci-16) |
| 18 | MTTA/MTTR used wall-clock time | `services/workingTime.js` (`workingMs`, `responseStats`) feeds `/dashboard/executive` and `/dashboard/kpis`; trend SQL removed. Live Wallboard/Response Center timers are still wall-clock (escalation work) (fix-18) |
| 22 | Backups were only on the Railway volume | Every backup copied to the G&G ANDON Shared Drive (feat-22, `offsiteBackup.js`); `RESTORE_FROM_DRIVE` restores from Drive at boot (feat-22b, `restore.js` + `fetchFromDrive.js`) |
| 25 | Tablet stayed silent when an alert was NOT created (backend 400/500, no connection, line with no work centers) | `ButtonGrid.jsx`: red "<TYPE> alert NOT sent: <reason>. Call your lead." banner; persistent warning when the line has no work centers (`workCentersLoaded` in `WorkCenterContext`) (fix-25) |
| 26 | Only the tablet could cancel an alert; once the tablet moved on, a false alarm or test could only be resolved (counted in MTTR) | CANCEL button with a required reason on `/supervisor` and `/dashboard` (`CancelDialog.jsx`); `PATCH /alerts/:id/cancel` accepts optional `reason` (1–500) + `cancelledBy`, stored as `resolution_notes` "Cancelled by <name>: <reason>" (fix-26) |
| 19 | Cancel wrote `resolved` too, so Telegram/Google Chat showed a cancelled alert as "Resolved" with its duration | `cancelAlert` sets only `cancelled_at`; formatters end a cancelled alert at `cancelled_at` and label the note "Cancel reason"; migration `0004` clears the copied `resolved` on old cancelled rows (fix-19) |
| 21 | Reorder routes returned 500 on an empty or malformed body, and applied a list partly | `PUT /production-lines/order` and `/work-centers/order` share `applyOrder()` in `index.js`: 400 on a bad body or unknown id; the whole list in one transaction (fix-21) |
| 14b | Telegram resolves had no real note (a button can't carry text) | The ANDON Telegram is a **channel**: members can't reply to the bot, so a force_reply prompt fails (400; first try fix-14b, Oct 29). Now (fix-14b-add-note): Telegram Resolve pop-up says to add the note in ManufacturingOS; `GET /alerts/needs-note` lists RESOLVED alerts still noted "Resolved from Telegram"; **Needs a resolution note** panel with **Add note** on `/supervisor` and `/dashboard` (`NeedsNotePanel.jsx`); `PATCH /alerts/:id/note` (1–500 chars) replaces only that placeholder and edits the Telegram message. `setWebhook` asks for `callback_query` only. Google Chat keeps the card it already got |
| 15 | Admin Delete erased production lines and responders for good (a deleted line orphaned its work centers) | Delete now **archives** (`archived_at`, migration `0005`): hidden from the tablet, wallboard, pickers and Admin lists; refused (409) while the line or responder has open alerts; **Archived** list with Restore in Admin (`ArchivedList.jsx`). Work centers stay with an archived line and return with it. A new line can't reuse an archived line's name. `PRAGMA foreign_keys` stays off by decision (option A, Oct 29 2026) (fix-15) |
| 27 | Telegram calls sometimes failed ~0.25 s in ("connect ETIMEDOUT …; ENETUNREACH 2001:…"): Node tries IPv4 for 250 ms, then IPv6, which Railway lacks. Alert #72 (Oct 29) never reached Telegram; Acknowledge pop-ups failed Oct 28 and 29 | `services/network.js`: IPv4 gets 2 s (`setDefaultAutoSelectFamilyAttemptTimeout`) and is tried first (`ipv4first`), for fetch and axios alike. `sendTelegram` (new alert) retries once after 2 s, only when the connection itself failed (`isConnectError`), so it can't double-post (fix-27) |
| 28 | Tablet CANCEL REQUEST recorded no reason | Tablet asks "Why cancel this … alert?" with one-tap reasons **Pressed by mistake / Problem cleared itself / Test / Other** (Other = short text) and **Keep alert open** (`TabletCancelDialog.jsx`, labels approved Oct 29 2026); stored as "Cancelled by Operator (tablet): <reason>". A failed cancel keeps the alert screen up with a red reason. Backend still accepts a cancel without a reason (old tablets until they reload) (feat-tablet-cancel-reason) |
| 29 | `/dashboard` stat tiles showed no numbers and its alert cards no elapsed time (wrong props to `DashboardStats`; `AlertList` never passed `elapsed`) | E3: both pages use `utils/alertTime.js` (`alertStats`, `elapsed`) and the shared `AlertBoard` (e3-response-dashboard) |
| 30 | `/dashboard` had no responder picker: Acknowledge, Resolve and Cancel were always recorded under the first person on the team list | E3: "Acting as" picker on both pages (`ResponderPanel.jsx`, `hooks/useResponseTeam.js`); the choice is remembered per browser (`localStorage` `actingAs`); team availability refreshes every 30 s (e3-response-dashboard) |

### Open

None.

The dead work-center delete icon in Admin → Production Lines was removed (Director, Oct 29 2026); work centers are set inactive instead.

## Testing

- Use `node:test` + `supertest` against a temporary SQLite file (`server/test/helpers.js` → `loadApp()`). Never use the real DB.
- Freeze time in tests that touch shift, day, or month math (`mock.timers.enable({ apis: ["Date"], now })`). Cover Thu → Mon spans, breaks, an active OT shift, and both DST change days.
- Migration tests that are about the baseline itself use a folder containing only `0001` (see `baselineOnly()` in `migrations.test.js`).
- Prove a fix by running its test against the old code once and seeing it fail.
