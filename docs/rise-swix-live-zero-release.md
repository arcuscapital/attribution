# Rise vs Swix Live: missing share at 0% release (2026-11-10)

## Finding
Rise vs Swix Live showed no table on production at 15:38 SAST: "No complete live snapshot: 1 of 126
holdings have a missing or stale quote", with SUPERMARKET INCOME REIT PLC (SRI SJ) in the red list.
SRI trades thinly on the JSE; its last quote was older than the previous session, so `liveReturn`
rejected it and the complete-snapshot rule blocked every refresh. SRI is held only by Swix (0.03%).

## What changed (Attribution only, Live only)
- A holding without a usable live quote (missing from the quote response, or stale) counts as a
  **0% return**. The table, sector and fund figures render; the share's return cells show in red with a
  tooltip; the red line reads "No live price, counted as 0% return: <name> (<ticker>)"; the status says
  "N share(s) at 0% (no live price)"; the footer explains the rule.
- If more than half the holdings have no usable quote, it is treated as a price outage: the previous
  result is kept and the shares are listed in red (no mostly-zero valuation).
- A failed or mismatched quote batch still rejects the refresh, as before.
- Historical periods (1D estimates, presets, custom) keep the strict complete-price rule.
- New core functions `collectQuotes` and `liveReturns`; `completeQuotes` keeps its strict behaviour.
  Module URLs versioned `live-zero-20261110`. No data, KV, D1, cron, queue or Watchlists change.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/rise-swix-live-zero`, from `origin/codex/nav-1d-attribution-20261110` at `fa8b6e8` (application `2e492ae`, which already contains `58122aa` and `e2a73fd`) |
| Application commit | `f72d3f30de44137e268400a9de737f73db8ad087` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `90a65ba3-0665-44ef-8de3-688e10bbd4ad`, deployment `ce067e92-1b9e-4652-9a8d-26054a3315b2`, application `2e492aeb0d4f73cb8ae4fb3ec221ca0349bd47ab` (Codex issuer NAV release; confirmed live immediately before deploying) |
| Deployment | 2026-11-10T13:41:58.601752Z, deployment `8bf6d18e-ba22-4d3c-9bd2-87838ee8210a`, version `572ad495-ee49-4452-97ed-06b8b871591e`, tag `f72d3f3`, 100% |
| Wrangler | 4.129.0, `--config wrangler.jsonc` (dry run passed first) |

## Tests and limits
- `node --test tests/*.test.mjs`: 141/141 passed, including a new test for 0% on missing and stale
  quotes, the more-than-half outage rule and failed batches.
- `python -m unittest discover -s tests -p 'test_*.py'`: passed (Python 3.14.10).
- Local harness (`localhost`, synthetic data, mocked quotes): one withheld quote rendered the table with
  that share at 0.00 in red and the red line; six of ten withheld kept the previous result and listed
  them; all quotes restored gave "Complete snapshot" with no red line.
- Production, owner session in Brave: new build served; Rise vs Swix Live rendered all 140 rows at
  15:42:30 SAST (Rise +0.15%, Swix +0.28%) with SRI SJ at 0.00 in red and the red line naming it; the
  automatic refresh at 15:43:05 rendered again.
- Not tested: Android emulator, physical phone. The 0% figure is an assumption for shares without a
  usable quote, not an observed price.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 90a65ba3-0665-44ef-8de3-688e10bbd4ad --config wrangler.jsonc --message 'Rollback Rise vs Swix Live missing share at 0%'
```
That returns to Codex's issuer NAV release (`docs/ISSUER-NAV-20261110.md`), where one stale quote blocks
Live again. Attribution only; Watchlists unchanged.
