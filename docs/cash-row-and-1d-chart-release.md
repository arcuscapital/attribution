# Cash row and 1D intraday chart (2026-11-13)

## Requests (owner)
1. "After biggest contribution difference section, before return contribution section add a small row. this
   row shows cash of portfolio on the left and cash of [benchmark] on the right, get a mini design agent to
   design it so its in line with the rest of the page … git deploy".
2. "we discussed a graph being displayed after the table comparing the portfolio to benchmark where is that,
   why isnt it there now, put it back" — then "its ok if it works for all days except one day for all
   portfolios and benchmarks" — then "although if you can make it work for one day that would be a real win,
   so do it if you can".

## What changed (Attribution only)
- **Cash row** (`#cash-row`, between `#contribution-chart` and the Return contributions panel): average cash
  weight of the portfolio (left) and benchmark (right), counting holdings whose asset kind is Cash or Money
  Market (`assetKind` in `site/arcus-source.mjs`, the same rules that mark non-listed holdings), with the
  three largest cash lines in a muted note and all of them on hover; "No holdings data" for a reference index.
  Mini design agent spec: thin strip lighter than a panel, amber figure, grey label, dim note in dark mode;
  stacks on phones. `site/engine.mjs` now carries each row's `asset`.
- **Cumulative chart, all ranges except 1D:** unchanged and verified (it was hidden on the owner's screen
  because the page was on 1D, where one session gives no daily path).
- **1D chart (new):** for a one-session comparison the page fetches the session's 5-minute prices for the
  largest holdings (up to 150 listings per side, four requests at a time, chart only) and draws "Intraday
  return (%)" with the performance difference underneath, on a clock-time axis in the viewer's time zone.
  Each holding starts at 0% (previous close), follows its own bars scaled so its last bar equals its
  official 1D return, and holds that value afterwards; holdings without bars move only at the close; a
  reference fund follows its own bars. The last point therefore equals the headline. Session gaps between
  markets are compressed (points are evenly spaced). The subtitle states the share of weight with intraday
  prices. A failure leaves the chart hidden and never affects the comparison.
- **Price route** (`cloudflare/data.mjs`): `data/prices?…&interval=5m` with start = end = the session date;
  Yahoo 5-minute bars filtered to that date in the listing's own time zone, identity-checked, cached six
  hours. Requests pass through the Arcus bridge unchanged (no Watchlists change). On demand only: no
  collector, cron or queue.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/theme-subtheme` (continues from the Theme/Sub-theme release, `docs/theme-subtheme-release.md`) |
| Previous production | version `a4f23a00-f15a-474f-a20e-0d577d46bb2e`, deployment `cf70645c-27e3-4abb-9c8c-65c311bbc5a5` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0, live version checked before each deploy |

| Commit | UTC | Version | Deployment | Change |
|---|---|---|---|---|
| `314f5bb715264479ff14f22ea090a8367400395e` | 2026-11-13T08:05:39.284181Z | `197ddcba-65c7-4820-b3c0-c1002db7e5fb` | `40e7479c-eec9-43d0-a15b-44a05df12b94` | Cash row |
| `6d44bc7a6a6aab56eb1d5c9432bb5214eb035128` | 2026-11-13T08:17:29.910804Z | `7346666a-41f7-4cf0-ba52-ab81a23045e6` | `93ea4419-6b77-470a-915f-4d8aa923098b` | 1D intraday chart (the first deploy attempt stopped after uploading assets; the retry deployed) |
| **`3702787b620e4a44c7077046d654398b4306b980`** | **2026-11-13T08:19:17.298835Z** | **`1ec2f7ca-ee26-42b2-aa27-b43a1ec7117e`** | **`3f43ca7c-93e1-4891-a113-59ba50858f01`** | No label on the previous-close point (current) |

A 1D variant that drew only a start-to-end line was written and discarded before commit when the owner
said 1D could stay hidden; the intraday chart replaced it.

## Tests and limits
- `node --test tests/*.test.mjs`: 158/158 (new: cash kinds and cash side totals; intraday series start,
  path, close and coverage; intraday route filters to the local date, caches and refuses multi-day requests).
- Git Bash was briefly unavailable while the IT patch agent updated Git to 2.56.1; work continued in
  PowerShell and resumed in Bash afterwards.
- Production, owner session in Brave (desktop):
  - Cash row: EasyGE 7.69% (USD 7.19, ZAR 0.50) vs IBKR 15.45%; Marlow 23.50% vs VOO -0.12% (USD -0.17,
    MKTLIQ 0.05, SLBBH1142 0.00).
  - Daily chart, legend equal to the headline in every case: EasyGE vs IBKR WTD 10.25/9.26 and MTD
    -1.83/0.23; EasyAI vs QQQ QTD -21.78/-6.98 and YTD 33.08/12.40; IBKR vs SOXX last week -8.07/-13.13;
    Marlow vs VOO last 3 months -10.68/1.45; Marlow vs BAI last year 85.50/25.21.
  - 1D chart for 2026-11-12, legend equal to the headline, intraday prices for 100% / 100% of weight:
    EasyGE vs IBKR -2.03/-1.47; EasyAI vs QQQ -2.23/-0.32; Marlow vs BAI -1.50/-0.95; IBKR vs VOO -1.47/-0.34.
  - The owner's saved selection (EasyGE vs IBKR, USD, 1D) was restored afterwards.
- Intraday paths use local-currency prices; FX moves during the day are not shown, but the close point
  includes them through the official 1D return. Rise vs Swix is unchanged. No phone or emulator test.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
# Remove the 1D chart only (keeps the cash row):
npx --yes wrangler@4.129.0 rollback 197ddcba-65c7-4820-b3c0-c1002db7e5fb --config wrangler.jsonc --message 'Rollback 1D intraday chart'
# Remove both (back to the Theme/Sub-theme release):
npx --yes wrangler@4.129.0 rollback a4f23a00-f15a-474f-a20e-0d577d46bb2e --config wrangler.jsonc --message 'Rollback cash row and 1D chart'
```
