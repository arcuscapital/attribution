# Live Refresh button and Marlow-only ticker links release (2026-11-09)

## What changed
- **Rise vs Swix Live Refresh:** a Refresh button to the right of Download CSV, shown only when Live is
  selected (hidden for 1D and other ranges). It refreshes immediately without clearing the table, is
  disabled while refreshing and for five seconds after each refresh, and restarts the 35-second timer.
  The automatic interval is unchanged at 35 seconds.
- **Marlow-only login:** ordinary comparisons link tickers to Arcus Watchlists (added 2026-11-05). When
  the page is served by the Marlow-only Arcus login, whose `restrictAnalysisPage` replaces the back link
  with an empty `<span id="back-arcus">`, `buildSecurityLinks` now returns no links, so tickers are plain
  text and the hint no longer mentions links. The owner page keeps its links. Arcus is unchanged; this
  relies on the span that the Arcus rewrite already produces (asserted by
  `test/portfolio-analysis-bridge.test.js` in arcus-watchlists).
- Module URLs versioned `live-refresh-20261109`. No new files, no data, KV, D1, cron or queue change.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/analysis-header-sort` |
| Application commit | `9500d79d291e67a2fc84347c4030641ad39f0b66` (on header sorting `d16443b`) |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `9bc1cda1-0305-4f05-b611-4c0d59574244`, deployment `c368bb58-9039-4266-87f9-82afe8c8d55b` (confirmed live before deploying) |
| Deployment | 2026-11-09T08:17:02.298581Z, deployment `d98fea50-d1a2-4659-8e44-5b8ef0ca9cb2`, version `d069151c-1acd-4eae-bc9a-e0165454cb5f`, tag `9500d79`, 100% |
| Wrangler | 4.129.0, `--config wrangler.jsonc` |

## Tests and limits
- `node --test tests/*.test.mjs`: 98/98 passed, including a new test that the Marlow-only page (back link
  served as a span) gets no company links while the owner page does.
- `python -m unittest discover -s tests -p 'test_*.py'`: passed.
- Local harness (`localhost`, synthetic data, mocked live quotes): owner ARKK vs BAI shows ticker links;
  the same comparison on the page as the Marlow-only login receives it shows none, with page links only
  `./` and `/`. Refresh hidden in 1D, shown in Live beside Download CSV, disabled during and 5 s after a
  refresh, keeps the table and sort, ignores presses during the cooldown.
- Production, owner session in Brave: new build served; IBKR vs BAI 78 rows with 71 ticker links (owner
  unchanged); Rise vs Swix Live: Refresh hidden in 1D and shown in Live, a press at 10:18:08 SAST
  refreshed the 10:18:03 snapshot while keeping the table and sort, and the next automatic refresh came
  at 10:18:44.
- Production Marlow-only check: see the receipt below.
- Not tested: Android emulator, physical phone.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 9bc1cda1-0305-4f05-b611-4c0d59574244 --config wrangler.jsonc --message 'Rollback Live refresh button'
```
That keeps header sorting. To remove header sorting as well, roll back to `68cc4fdb-094f-45d3-b7ac-4efa4cb2cdd2`
(see `docs/header-sort-release.md`). Attribution only; Watchlists unchanged.

## Marlow-only production receipt
Pending: the owner signs in as the Marlow-only user in the Claude app's built-in browser.
