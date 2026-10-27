# CLAUDE.md — GG-ANDON / ManufacturingOS

This is the G&G Industrial Lighting production-floor ANDON system ("G&G Production Response System"),
being evolved into a Manufacturing Operating System (MOS). **It is in live use on the floor.**
Read this file fully before changing anything.

## Hard rules (never break)

1. `react-v2` auto-deploys BOTH Railway services to production on every push. Never push or merge to `react-v2` directly.
   Work on feature branches → PR into `staging` → after staging sign-off, PR `staging` → `react-v2`.
2. Production deploys happen outside shift hours (Mon–Thu 6:00–16:30 ET), because the backend has a mounted volume and redeploys cause a short outage.
3. No secrets in code, commits, logs, or test fixtures. Env vars are referenced by name only.
4. No real people's names in committed code or seed files. People, roles, and Slack IDs are entered through the Admin UI per environment.
5. Every schema change is a numbered migration with `up` and `down`. The app backs up the DB before applying any migration.
6. Staging must never notify production channels. Notification code runs only when `APP_ENV=production`, or when a staging-specific channel is configured.
7. Every PR description includes three sections: **What changed**, **How to test**, and **How to roll back**.
8. Add tests for anything touching the event lifecycle, escalation timers, plan-vs-actual math, or adapter normalization.
9. Keep the stack (Express 5, better-sqlite3, React 19, Vite, MUI). Don't add frameworks without a stated defect, fix, and cost.
10. Read before you write. Line references below come from commit `39e8b5d5`. Verify them; the code may have moved.

## Stack and layout

| Area | Location | Notes |
|---|---|---|
| Backend | `server/index.js` (~2,300 lines, all routes inline) | Express 5, JWT auth, better-sqlite3 |
| DB layer | `server/database.js` | Schema created on boot; ad-hoc `ALTER` migrations at lines 68–84 |
| Auth middleware | `server/middleware/auth.js` | `authenticateToken`, `requireAdmin` |
| Notifications | `server/services/` | `notificationManager.js` fans out to `telegram.js`, `telegramUpdate.js`, `googleChat.js` |
| Frontend | `app/src/` | React 19, MUI 9, MUI X DataGrid, Recharts; polling, no websockets |
| Legacy (unused) | repo root `index.html`, `css/`, `js/`, root `package.json`, committed root `node_modules/` | Remove in the cleanup PR |
| Dead components | `ConfirmAlert.jsx`, `AlertSent.jsx`, `ActiveAlertList.jsx`, `pages/ActiveAlert.jsx` | Not imported or routed |

### Railway (project GGLED)

| Service | Root dir | Branch | Notes |
|---|---|---|---|
| GG-ANDON (backend) | `/server` | `react-v2` | Volume mounted at `/data`; DB at `DATABASE_PATH` |
| ManufacturingOS Frontend | `/app` | `react-v2` | `serve -s dist` |

Backend env var names: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `PRODUCTION_USERNAME`, `PRODUCTION_PASSWORD`, `AUTH_SECRET`,
`DATABASE_PATH`, `SUPERVISOR_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `GOOGLE_CHAT_WEBHOOK`.
`SERVER_URL` is unset in production and falls back to a hard-coded prod URL (`server/config.js:5-7`).

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

## Known defects (Phase 0 audit, commit 39e8b5d5)

| # | Defect | Location |
|---|---|---|
| 1 | Frontend API URL hard-coded to prod | `app/src/config/config.js:7` |
| 2 | Telegram `setWebhook` on every boot (skips only if the token is missing) | `server/index.js:2254-2306, 2322` |
| 3 | Telegram webhook unauthenticated, no `secret_token` check | `server/index.js:2066` |
| 4 | `GET /telegram/test` unauthenticated | `server/index.js:2013-2060` |
| 5 | `requireAdmin` imported but never applied | `server/index.js:5`; config routes at ~605, 665, 712, 763, 880, 947, 994, 1727, 1846, 1965 |
| 6 | JWT expiry 8 h vs 10.5 h shift | `server/index.js:117` |
| 7 | Ad-hoc, non-reversible migrations | `server/database.js:68-84` |
| 8 | MTTR includes cancelled alerts (cancel sets `resolved`) | `server/database.js:462-464, 520-536, 565-572` |
| 9 | "resolvedToday" is an all-time count | `server/index.js:1675-1700` |
| 10 | Monthly trends grouped in UTC | `server/database.js:490, 506, 524` |
| 11 | Availability case mismatch (`AVAILABLE` vs `Available`); web ack doesn't set Responding | `server/database.js:107`, `RespondersPanel.jsx:64, 245`, `server/index.js:2131, 2224` |
| 12 | 409 duplicate alert silently ignored on the tablet | `app/src/components/ButtonGrid.jsx` (handleAlert) |
| 13 | Notifications awaited in the request with no timeouts | `server/index.js:364, 1223, 1447, 1619`; `googleChat.js:358`; `telegram.js:410` |
| 14 | Resolution notes hard-coded to "Resolved" | `ProductionResponseCenter.jsx:542-546`, `ActiveAlertList.jsx:141`, `Dashboard.jsx:186` |
| 15 | Hard deletes; `PRAGMA foreign_keys` off | `server/index.js:763-792, 1965-2005` |
| 16 | No tests, no CI, no Railway healthcheck | repo / Railway |

## Testing

- Use `node:test` + `supertest` against a temporary SQLite file. Never use the real DB.
- Freeze time in tests that touch shift or working-minute math. Cover Thu → Mon spans, breaks, and an active OT shift.
