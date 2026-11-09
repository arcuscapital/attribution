# Portfolio Analysis header sorting release (2026-11-09)

## What changed
- **Rise vs Swix table:** every leaf heading sorts, ascending or descending: Name, Ticker, and Port and
  Bmrk under Avg % weight, Total return (%) and CTR (pp). Sectors sort by the chosen column first; the
  holdings inside each open sector then sort by the same column. Ticker sorts sectors by name and
  holdings by ticker (a holding without a ticker, such as cash, uses its name). Name sorts both by name.
  The Total row stays on top, blanks stay last in both directions, ties fall back to name then report
  order. The choice survives Live refreshes and resets when the Rise/Swix pair is re-entered. Headings
  are buttons with `aria-sort`, and focus returns to the clicked heading. The CSV keeps report order.
- **Ordinary comparisons (no sectors, for example IBKR vs BAI):** headings already sorted on click. A
  first Security click now sorts A to Z instead of Z to A, headings expose `aria-sort` and respond to
  Space as well as Enter, and the phone hint now says "Tap a heading to sort".
- Sorting logic is `sortRiseGroups` in `site/rise-swix-core.mjs`. Module URLs were versioned
  `header-sort-20261109`. No new files, so the Arcus bridge allowlist and the Watchlists Worker are
  unchanged. No data, KV, D1, cron or queue change.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/analysis-header-sort` |
| Starting point | `d41a675` (tip of `codex/rise-swix-zar`; contains live application `45fa68f33c72560d030487b4fb990ba573945adb` and all later Codex analysis branches) |
| Application commit | `d16443be7a34dcf1a56fa4ed5a5d707444e6a9fd` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` (auth in `C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth`) |
| Previous production | version `68cc4fdb-094f-45d3-b7ac-4efa4cb2cdd2`, deployment `71f0c3b7-bc5e-4134-8990-fa7b1eeacb08`, 2026-11-06T14:41:36Z (confirmed live immediately before deploying) |
| Deployment | 2026-11-09T07:49:22.263071Z, deployment `c368bb58-9039-4266-87f9-82afe8c8d55b`, version `9bc1cda1-0305-4f05-b611-4c0d59574244`, tag `d16443b`, 100% |
| Wrangler | 4.129.0, `--config wrangler.jsonc` |

Six assets were uploaded. `rise-swix-worker.mjs` was unchanged in content but re-uploaded because the
previous deploy came from a checkout with LF line endings and this one has CRLF; the Arcus Watchlists
live version (`69c1824` bridge) was not touched.

## Tests and limits
- `node --test tests/*.test.mjs`: 97/97 passed, including four new `sortRiseGroups` tests (report order
  kept until a heading is chosen and input not mutated; value columns sort sectors then holdings with
  blanks last both ways; Name and Ticker rules; ties).
- `python -m unittest discover -s tests -p 'test_*.py'`: 21/21 passed.
- Local browser harness (synthetic report, `localhost`): Name, Ticker, Total return Port and Bmrk in
  both directions with two sectors open; Total row first; focus kept on the clicked heading; phone width
  render checked. Local `tests/mobile-server.mjs`: ordinary and Sector views sort from the phone headings.
- Production, owner session in Brave (read only apart from running comparisons): new modules served;
  Rise vs Swix reported 2026-11-04 to 2026-11-05 (12 sectors, Financials and Communication Services
  open) passed all 15 checks: six value columns both ways (weight Bmrk descending only), Name and Ticker
  both ways, sectors and open holdings ordered, blanks last, Total first. IBKR vs BAI (78 rows) passed
  all 16 heading states on the eight columns; a first Security click sorts ascending.
- Not tested: Live mode sorting on production (covered locally and by the shared render path), Android
  emulator, physical phone.
- Pre-existing, not changed here: tickers in ordinary comparisons link to Arcus Watchlists (added
  2026-11-05), which also appear for the Marlow-only login.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 68cc4fdb-094f-45d3-b7ac-4efa4cb2cdd2 --config wrangler.jsonc --message 'Rollback header sorting'
npx --yes wrangler@4.129.0 deployments status --config wrangler.jsonc --json
```
Attribution only; no Watchlists step is needed. Earlier rollback landmarks in `docs/rise-swix-release.md`
(Watchlists Treasury-original and graphs-only versions) are unaffected.
