# Cumulative return chart release (2026-11-12)

## Request
Owner, after a report-and-plan step: add a chart under the comparison table, above "Setup and daily
use", like Bloomberg's PORT Total Return chart, without its left definitions column (the page header
already has those controls). Owner then gave permission to build it.

## What changed (Attribution only)
- **Chart:** cumulative return (%) from the starting close for the portfolio (white line) and benchmark
  (orange line), then "Performance difference" (portfolio minus benchmark) as a shaded area: green when
  ahead, dark red when behind. End values tagged at the right, legends top right, daily x-axis with day
  numbers and month labels, hover readout of each day's values. Plain SVG, no library; dark theme follows
  the Bloomberg chart, light theme has its own readable colours; resizes with the page.
- **Where:** under the Rise vs Swix table, and under the ordinary holdings table (a new `#return-chart`
  section before "Method, reconciliation and sector attribution"), above "Setup and daily use". Hidden
  for 1D, Live and the Bloomberg-reported day (one session); shown for two or more valuation days.
- **Figures:** each side follows its headline method so the last point matches the headline:
  - Ordinary comparisons (`returnSeries` in `site/engine.mjs`, computed in the existing calculation
    worker): a reference fund's own return to date; a portfolio's average weights times each security's
    return to date; 0%-assumed rows stay at 0; days without a price carry the last value.
  - Rise vs Swix (`riseSeries` in `site/rise-swix-core.mjs`): the report's average weights times each
    holding's return to date from the same daily prices the table uses (Yahoo adjusted closes, Sharenet
    closes where Yahoo had none); the last point equals the table's total contribution.
- **No new data requests:** the chart reuses prices the comparison already loaded; no Cloudflare
  collector, cron, queue, KV or D1 change.
- The chart code is in `site/ranges.mjs`: the Arcus bridge (and Attribution bridge) serve only a fixed
  list of page files, so a new file would need a Watchlists deployment.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/return-chart`, from `claude/rise-swix-backup-prices` at `0100b84` (live application `458f6ab`) |
| Previous production | version `ce2b9207-3081-42a4-9a94-af71f97295a1`, deployment `3c9daff9-75ed-4b2a-9840-b821e19a1372`, application `458f6ab` (confirmed live before deploying) |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0 (dry run first) |

| Commit | UTC | Version | Deployment | Change |
|---|---|---|---|---|
| `3da98400f8564f06b3fa7b4c16969e6d2adb0b00` | 2026-11-12T08:32:45.429311Z | `fb22ccdc-64d5-4a63-aadd-4f5ee53a648e` | `67041f44-ae5a-45a0-9447-77dc0ce6da22` | Chart |
| `c38d46ed0791455a0edbf8941ab96a94ed8c0767` | 2026-11-12T08:34:43.919872Z | `eecedb81-c1b0-48b6-8da2-3fd54c804c5d` | `c4b8e604-3234-4267-ab81-d1d618716b2c` | Edge date labels |
| **`e447b645a94ecf413a280b06b1b44e246f25adec`** | **2026-11-12T09:26:41.962797Z** | **`838012a0-20bf-4ce3-b4c3-fe77c1558009`** | **`4cd8a932-391f-4f5e-8ea3-b0b1c6baa33e`** | Chart counts exactly the headline's holdings (current) |

## Tests and limits
- `node --test tests/*.test.mjs`: 147/147 passed (new: engine series follows each headline method and
  carries missing days; Rise series equals the table total and carries gaps; axis ticks and labels).
- `python -m unittest discover -s tests -p 'test_*.py'`: 21 passed (one earlier run reported an error
  that did not repeat).
- Production, owner session in Brave: Rise vs Swix last month (30 Sep to 30 Oct): chart shown with 23
  daily points, legend Rise -3.16 / Swix -0.28 / difference -2.88, matching the table totals; IBKR vs BAI
  last month: legend -15.23 / -16.83 / 1.60 matching the headline metrics, chart directly after the
  table and before Method. The first date label was cut off on the left; fixed in `c38d46e`.
- The chart uses current/report weights held from the start (Bloomberg's chart uses actual day-by-day
  holdings), so long periods can differ from Bloomberg. Not tested: Android emulator, physical phone.

## Full QA agent test (all of the day's work)
A separate agent tested the live site in Brave, read-only, after everything was deployed: 8 Rise vs Swix
periods (1D, Live, WTD, MTD, last month, Bloomberg day, custom) and 9 ordinary cases (IBKR, EasyAI,
Marlow and EasyGE portfolios; BAI, QQQ, VOO, SOXX and SHLD benchmarks; day to last year), the
Bloomberg table styles, sorting, italic returns, ticker links, the 0% default and red lines, and ECO. 15
of 16 chart cases matched the headline. EasyGE vs VOO last year showed 94.03 against a 95.42 headline:
holdings missing a price on any day are left out of the headline but were still counted in the chart.
Fixed in `c67778f` (deployed with `e447b64`); production then showed 95.42 / 17.82 / 77.59 exactly, and
IBKR vs BAI last month still -15.23 / -16.83 / 1.60. No console errors were found.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback ce2b9207-3081-42a4-9a94-af71f97295a1 --config wrangler.jsonc --message 'Rollback cumulative return chart'
```
That keeps the backup prices and 0% default (`docs/backup-prices-release.md`). Attribution only.
