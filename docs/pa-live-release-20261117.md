# Portfolio Analysis: Live for every portfolio and benchmark pair - 17 November 2026

Owner request (17 Nov 2026): "portfolio analysis must also have live working", then "in portfolio analytics live should be working for all portfolio and benchmark combinations git deploy test".

Repository: https://github.com/arcuscapital/attribution.git

Branch: `claude/pa-live-easybest` (worktree `C:\Users\Skrom\ArcusPALive`)

Application commit: `8318f9b252be5869cc61da7058ca21002475e8ab`, on production branch `codex/sa-total-returns-20261116` at `4359f4e` (application `80751ad`, version `086cc39c`), so Codex's share-return and J303 work is kept.

Companion: Arcus `claude/easybest-returns` (EasyBest name, LIVE estimate and chart, history; site `2b487898`, notifications `15c60651`). This release only uses the existing Arcus route `/api/live-prices/shard` (already used by Rise vs Swix Live) and the existing bridge allowlists; no Arcus change or deploy was needed for it.

## Before

The Live range existed only for Rise vs Swix (hidden for every other pair). Ordinary comparisons used completed sessions only ("Today’s intraday session is excluded").

## Change

- `index.html`: Live in the date-range menu after One Day, for every pair. `rise-swix.mjs` reuses that option, no longer hides it outside Rise vs Swix, and no longer resets Live to One Day when leaving Rise vs Swix. Rise vs Swix keeps its own live model.
- `online.mjs` (`live`, `liveDataset`, `liveMove`, `listingCurrency`): the last completed session is loaded exactly as for One Day (holdings, closing levels, cached ten minutes per selection). Live quotes for every priced listing, the ETF itself, each foreign currency against the dollar and USD/ZAR come from `/api/live-prices/shard` in batches of 32. Today's level per listing = its close × its move today against the previous close (US pre-market before the open) × its currency's move against the dollar. Not traded yet today = 0%. No quote = no return (reported as missing; the labelled 0% assumption applies as usual). Daily-holdings indices (J303 and its SWIX) move with their closing weights; a rand-only J303 comparison keeps USD/ZAR at 1. The existing engine then attributes the one session as for One Day.
- `app.mjs`: Compare with Live loads that dataset; the result refreshes every 35 seconds while the page is visible, keeping the shown table in place (no collapse or scroll, controls stay usable). The status line reads "Live quotes at HH:MM:SS against the <date> close · n moving today, k not traded yet (0%) · m without a quote · currency · refreshes every 35 s". The intraday 5-minute chart is not drawn for Live.
- No new page files, no server-side collector, queue or schedule. The Attribution cron (`*/2 * * * *`) is unchanged.

## Validation

- `npm test`: 217 tests, 217 passed (base `4359f4e`: 209 passed). New `tests/live-comparison.test.mjs` (8 tests: live move rules, listing currency, rand portfolio vs US ETF in rand and in dollars through the real engine, missing quote reported, no-session and no-quote messages, rand-only J303 daily holdings, page wiring and bridge allowlist). Updated: `compare-controls.test.mjs` (the submit test's sandbox gets the Live timer helpers), `trade-slider.test.mjs` (module version tokens `live-20261117`). The Python tests were not run (no Python files changed).
- Live, desktop Brave (signed in), after deploy, 17 Nov 12:07–12:09Z (JSE open, US pre-market):
  - EasyBest vs EasyBF, ZAR: EasyBest −0.93%, EasyBF −1.31%, 39 moving, 41 rows (matches the My portfolios LIVE estimate).
  - EasyAI vs QQQ, USD: EasyAI +2.17%, QQQ +0.41% (pre-market), 101 moving, 22 not traded yet, 130 rows.
  - EasyBest vs QQQ, ZAR: EasyBest −0.91%, QQQ +0.23%, 113 moving, 21 not traded yet, 140 rows.
  - QQQ vs VOO, USD: +0.40% vs +0.03%, 290 moving, 230 not traded yet, 2 without a price (Kenvue, Skydance), 538 rows.
  - Rise vs Swix still uses its own Live.
  - The owner's saved selection (Swix vs J303, YTD, ZAR) was restored afterwards.
- Limits:
  - J303 pairs: Live and One Day both stop today with "MTM.JO: latest completed closing price is unavailable" (J303's own 16 Nov price data); not caused by this change. Live for J303 works once that close is in J303's prices.
  - The 35-second refresh was not observed live: the extension's tab is a background tab, where the page deliberately pauses. Covered by the wiring test only.
  - Desktop only; not tested on a phone or the Android emulator.
  - Live is a research estimate on the last close's holdings; intraday trades are not reflected. Provider quotes may be delayed.

## Deployment

Cloudflare account: `5695cae2becf35e049eb5df3e2849ae2` (Worker `arcus-attribution`, 100% traffic), wrangler 4.129.0, after `deployments status` showed `086cc39c`.

| UTC | Commit | Version | Deployment | Previous version |
|---|---|---|---|---|
| 2026-11-17T12:04:44.369818Z | 8318f9b | `19cea4e2-94ba-4832-8f25-78ae8424f3f0` | `a02aecd3-225c-461f-bb5b-65a12ae8766c` | `086cc39c-a0e9-428d-957d-b9a3faf00b21` |

## Rollback

```powershell
Set-Location C:\Users\Skrom\ArcusPALive
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 086cc39c-a0e9-428d-957d-b9a3faf00b21 --config wrangler.jsonc --message 'Rollback PA Live for every pair'
```

Independent of the Arcus releases: rolling back either repository leaves the other working (Live disappears outside Rise vs Swix; the EasyBest name in the fund list comes from Arcus).
