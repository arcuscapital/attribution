# Rise vs Swix share returns and missing-price list release (2026-11-09)

## Finding
The owner reported Omnia (OMN SJ), Gold Fields (GFI SJ) and many similar shares as empty in Rise vs Swix
and suspected missing Arcus price tracking. Checked on production before the change, in the owner's
signed-in Brave:
- All 126 listed quote symbols in the report receive live quotes through `/api/live-prices/shard`
  (four batches, 32/32/32/30 returned, none missing). Omnia was +0.11% and Gold Fields +3.86% at the time.
- The report has 127 rows: 1 ZAR cash, 92 held only by Swix, 6 held only by Rise and 28 held by both.
  The blanks were the Port (Rise) return and CTR of the 92 Swix-only shares (and the Bmrk side of the 6
  Rise-only shares). Bloomberg leaves a share's return blank on the side that does not hold it.
- In the report, every share held by both sides has an identical Port and Bmrk return.

No price data was missing, so no Arcus price tracking or universe change was needed.

## What changed (Attribution only)
- **Share returns on the non-holding side:** `withShareReturns` (in `site/rise-swix-core.mjs`) fills a
  share's blank return on the side that does not hold it with the share's own return, shown in italic
  with a tooltip (Bloomberg reported view, history estimates and Live). Weights, contributions, sector and
  total figures are unchanged. Sector returns stay blank where a side holds nothing in that sector
  (Energy and Utilities for Rise). The footer explains the italic values. CSV export carries the values.
- **Red missing-price list:** when any holding has no usable price, a red line under the status names
  each share, for example "Not getting prices for 1 share: OMNIA HOLDINGS LTD (OMN SJ)". Live covers
  quotes missing from the shard response and missing or stale quotes; other periods cover missing
  adjusted history. The complete-snapshot rule is unchanged: Live keeps the previous complete result and
  no holding is dropped. The line is hidden when every holding is priced, and cleared on selection change.
- Module URLs versioned `share-returns-20261109`. No data, KV, D1, cron, queue or Watchlists change.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/rise-swix-missing-prices` (from `claude/analysis-header-sort` at `c8d4ee4`) |
| Application commit | `58122aa008dbde5a660aa40e6dbbce15df98c10d` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `d069151c-1acd-4eae-bc9a-e0165454cb5f`, deployment `d98fea50-d1a2-4659-8e44-5b8ef0ca9cb2`, application `9500d79` (confirmed live immediately before deploying) |
| Deployment | 2026-11-09T09:38:32.49191Z, deployment `d33dc7e8-035d-4cfb-9fef-2832e007a803`, version `ef277e6e-cc79-4b08-963f-099cf67c4074`, tag `58122aa`, 100% |
| Wrangler | 4.129.0, `--config wrangler.jsonc` (dry run passed first) |

## Tests and limits
- `node --test tests/*.test.mjs`: 100/100 passed, including new tests for `withShareReturns` (both
  directions, zero returns, no fill without a return, cash untouched, input not mutated, sector values
  unchanged) and the missing-quote list from `completeQuotes`.
- `python -m unittest discover -s tests -p 'test_*.py'`: 21 passed (run with Python 3.14.10; a newly
  installed `C:\Program Files\Python315` would not start on this PC and was not used).
- Local harness (`localhost`, synthetic data with one-sided holdings, mocked quotes): Bloomberg reported
  view shows italic returns on both sides; Live with two quotes withheld kept the previous complete
  table and listed both shares in red; the red line cleared when the quotes returned; an estimate period
  without history listed every share in red; Refresh hidden outside Live.
- Production, owner session in Brave: new build served; Live complete snapshot with 92 Port and 6 Bmrk
  italic returns, Gold Fields 3.74% and Omnia 0.07% on the Rise side, only ZAR cash blank, red line
  hidden. With Omnia's quote removed from the shard responses inside that browser tab only (a page-side
  fetch wrapper; nothing changed on the server), Refresh kept the 11:39:15 result and showed "Not getting
  prices for 1 share: OMNIA HOLDINGS LTD (OMN SJ)" in red; after restoring, the next refresh was complete
  and the line was hidden. 1D estimate (6 November) and the Bloomberg reported day (5 November, totals
  2.68 / 3.65 unchanged) show the italic returns. IBKR vs BAI unchanged: 78 rows, 71 ticker links,
  currency selectable.
- Not tested: Android emulator, physical phone; the Marlow-only login (it has no Rise vs Swix access).

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback d069151c-1acd-4eae-bc9a-e0165454cb5f --config wrangler.jsonc --message 'Rollback Rise vs Swix share returns and missing-price list'
```
That keeps the Live Refresh button and header sorting. Earlier points: `9bc1cda1-0305-4f05-b611-4c0d59574244`
(header sorting, no Refresh button; see `docs/live-refresh-release.md`) and
`68cc4fdb-094f-45d3-b7ac-4efa4cb2cdd2` (before header sorting; see `docs/header-sort-release.md`).
Attribution only; Watchlists unchanged.
