# Compare funds speed, Stadio GICS, GICS sort on Live — release 2026-11-20

Owner requests (20 Nov): make Compare funds results faster ("check it yourself and see why it takes so long");
Stadio is Consumer Discretionary; with GICS and Live selected, a sorted column (e.g. Total return %) lost its order
on every price update; check a reported bug (time period + GICS: sectors visible but could not open them).

## Release

| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution.git |
| Branch | `claude/pa-compare-speed` (worktree `C:\Users\Skrom\ArcusPASpeed`), pushed |
| Base | `claude/pa-phone-compact` 28896e9 (live application a878d06, version 7c6a32ea) |
| Commits | 8f5aa55 (J303 batches, prices six at a time); 0379c4b (saved JSE histories, GICS sort kept on Live refresh); docs commit on top |
| Worker | `arcus-attribution`, Cloudflare account 5695cae2becf35e049eb5df3e2849ae2 |
| Deploys (UTC) | 73677b71-d253-4146-928c-ee7e07a89017 at 2026-11-20T08:36Z (8f5aa55); **9b672124-c12e-4288-9918-d9964577ca6a** at 2026-11-20T08:43Z (0379c4b) |
| KV data | `gics:v1` in `HOLDINGS_ARCHIVE` (98da8aed88f9416d84a9497daed06dc5): added `SDO.JO` = Consumer Discretionary (742 sectors). Previous value saved outside Git at `C:\Users\Skrom\ArcusAttributionBackups\gics-v1-before-20261120.json` |
| Rollback target | 7c6a32ea-01a9-4232-a8aa-0756ecb87b30 (phone tables a878d06) |

Arcus (`arcus-watchlists`) is unchanged: its bridge already passes `data/j303` and `data/prices` query strings through.
No new cron, queue or collector; the existing `*/2` J303 job is unchanged and is what keeps the saved histories current.

## Why Compare was slow (measured in the owner's Brave, EasyBest vs J303, ZAR)

- Live, before: 9.3 s. ~6–7 s of it was 117 single `data/j303?symbol=` requests (four at a time); each saved packet
  is a KV read that is ~210 ms when cold (KV keeps it warm about a minute) and ~30 ms warm.
- After the first deploy the J303 step took 1.0 s (5 requests), but a Compare after the 15-minute price cache expired
  took 25.8 s: the 35 EasyBest JSE prices went to Yahoo (and Sharenet) at ~1 s each, one (VKE.JO) took 16.3 s.
- After the second deploy, a never-requested period (Last Week, so no cached prices): **3.9 s** in total
  (J303 0.8 s, prices 1.5 s).

## What changed

- `cloudflare/data.mjs`: `data/j303?symbols=SYM~through,…` returns up to `J303_BATCH` (30) saved packets in request
  order (same `refreshArchivePrice` per listing as the single route; duplicates, bad dates, future dates and >30 are 400;
  any listing without closes fails the batch with 503, as the single route does).
- `site/online.mjs`: `j303Fetchers` — `many` checks the existing 15-minute cache per listing, asks for the rest in
  batches of 30, four batches at a time, and falls back to single requests if a batch fails or does not match.
  Generic price lookups run six at a time (were two; `docs/MOBILE-DATA.md` updated).
- `cloudflare/j303-market.mjs` `savedJseHistory` + prices route: a JSE price request is served from the J303 archive's
  saved close history when it covers the whole period (starts on or before the request, contains the last completed
  session, latest session checked within a day, current return version); the total-return levels are rebuilt for the
  requested dates, so the response matches a fresh download. Otherwise it downloads as before. Retry missing
  (`refresh=1`) always downloads.
- `site/app.mjs`: a 35-second Live refresh no longer calls `grid.reset()` on the GICS table, so the chosen column sort,
  the open sectors and the highlighted sector stay. A new Compare (any button press or selection change) still resets.
- Module versions: `app.mjs`, `online.mjs`, `j303-source.mjs` → `speed-20261120`.

## Tests

- `node --test tests/*.test.mjs`: 242/242 (230 before; new `tests/compare-speed.test.mjs`, 12 tests; two pinned
  expectations updated: price concurrency 2→6, online.mjs version). `python -m unittest`: OK.
- Production checks in the owner's Brave (desktop, 1397 px; not a phone or emulator):
  - Batched J303 packets equal the single-route packets for NPN, SBK, VKE, CPI, MTN, ADH (byte-identical apart from `checkedAt`).
  - Saved-history prices equal a forced download (`refresh=1`) for ADH, BOX, FFB, IMP, MTN, PAN: same 14 dates,
    same closes, identical daily total returns.
  - Stadio (SDO.JO) shows under Consumer Discretionary with GICS grouping.
  - Live + GICS + sort by Total return Port + Financials open: before the fix, the 35-second refresh cleared the sort
    and closed the sector (reproduced on 7c6a32ea/73677b71). After the fix, in a freshly opened tab: sort "Port ↓" and
    Financials (24 holdings) still open after a refresh (refresh at 13–15 s), and the sort was still on after more
    than 80 s of refreshes. A first check in an older tab still showed the reset; that tab froze and was replaced, and
    the fresh tab is the evidence used.
- Reported bug (time period + GICS, sectors would not open): not reproduced in three tries — Last Month (11 sectors,
  125 holdings opened), Live then Last 3 Months (127), GICS first then Year to Date plus No grouping→GICS and a sort
  (130). Before this release, every Live refresh closed all open sectors every 35 s, which looks the same; that is fixed.
  A 390 px phone frame could not be used (the page refuses to load in a frame); no emulator or phone test this time.
- Owner's saved selection restored afterwards (EasyBest vs J303, ZAR, Live, No grouping).

## Rollback

```powershell
cd C:\Users\Skrom\ArcusPASpeed
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'; $env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 7c6a32ea-01a9-4232-a8aa-0756ecb87b30 --config wrangler.jsonc --message "Roll back compare speed"
```
Rolling back to 73677b71 keeps only the J303 batches. The old version ignores `symbols=`, so open pages fall back to
single requests. Stadio's sector is data, not code: to undo it,
`npx --yes wrangler@4.129.0 kv key put gics:v1 --path C:\Users\Skrom\ArcusAttributionBackups\gics-v1-before-20261120.json --namespace-id 98da8aed88f9416d84a9497daed06dc5 --remote`.

## Still Unknown GICS in EasyBest vs J303

Canal+ (CNP.JO), Brait (BAT.JO), Greencoat Renewables (GCT.JO), NewGold (GLD.JO, an ETF) and ZAR cash. Not changed.

## Follow-up release, same day: loading in parallel + more GICS sectors

| Item | Value |
|---|---|
| Commit | 7c28a12 (on 7c24824) |
| Deploy (UTC) | **83d48407-62af-47a2-a25d-a9ee22c3a562** at 2026-11-20T08:58Z |
| Rollback target | 9b672124-c12e-4288-9918-d9964577ca6a (previous release), or 7c6a32ea for everything |
| KV data | `gics:v1`: added CNP.JO Communication Services, BAT.JO Financials, GCT.JO Utilities (745 sectors). Backup before this change: `C:\Users\Skrom\ArcusAttributionBackups\gics-v1-before-20261120b.json` |

- `site/j303-source.mjs`: the other side of a J303/SWIX comparison (e.g. EasyBest holdings and prices) now loads at the same
  time as the J303 closes, on the expected basis (`expectedBasis`: one JSE session = price return, otherwise total
  return). If J303's actual basis differs, it loads again as before. While both load, the button shows the other
  side's price count.
- `site/app.mjs`: `data/arcus-funds` is requested together with the catalog check, then applied after the catalog as
  before. Module versions `speed-20261120b`.
- Tests: 244/244 (two new; the compare-controls harness gained `integrated:false`). Python OK.
- Production, owner's Brave, fresh tab, EasyBest vs J303 ZAR. Figures identical before and after:

| Period | Before (9b672124) | After (83d48407) | Figures (Port / Bmrk / Diff) |
|---|---|---|---|
| Last Week | 4.5 s | 2.3 s | 0.45% / −0.21% / 0.66%, 126 rows |
| Last 3 Months | 2.1 s | 1.5 s | 1.07% / −1.92% / 2.99% |
| One Day | 1.9 s | 1.4 s | 0.01% / −0.33% / 0.34%, 122 rows |
| Live | ~2.5 s | 1.5 s | (moves with quotes) |

  EasyBest vs QQQ (no J303), Last Week: works, 8.0 s on first use: QQQ's US holdings still need Yahoo total-return
  histories (six at a time). Not changed in this release.
- GICS for Canal+, Brait, Greencoat confirmed on the live catalog. Their ISIN/SEDOL are not in Arcus's trade identifier
  table (nor Stadio's); the SEDOLs supplied for Canal+ and Greencoat look like London-line codes, not JSE lines.

## Third release, same day: all fund pairs (QQQ, VOO, US portfolios)

| Item | Value |
|---|---|
| Commits | afd4065 (shared histories, 16 requests + retry, JSE closed days); 705cead (one note per set of JSE closed days); 726b204 (cut by market-local start date) |
| Deploys (UTC) | 20a32a56-782e-4405-90a5-d81e1b7986e2 at 09:12Z; 0cf79e40-02c5-4d52-b3d4-6668797a0c99 at 09:17Z; **c39e8c66-1521-46d7-babc-b3fd8f18fc9f** at 09:21Z |
| Rollback target | 83d48407-62af-47a2-a25d-a9ee22c3a562 (previous release; keeps J303 batches and parallel loading), or 7c6a32ea for everything |

Measured first (owner's Brave): EasyBest vs QQQ Month to Date 8.5 s, EasyBest vs VOO 26.6 s (419 Yahoo requests six at a
time, ~240 ms each). Concurrency test against production, 102 uncached US listings: 6 → 5.3 s, 12 → 2.3 s,
16 → 1.85 s, 24 → 1.7 s, all 102/102 OK.

- `cloudflare/data.mjs`: US/other (non-JSE) prices are downloaded once per listing and end date as a three-year history
  (cache key `history-v1/<symbol>?end=`; 15 min for recent ends, 6 h for ends more than five days old) and cut to each
  request's start (`sliceHistory`, by the market's own date). A direct check on AAPL, MSFT, KO, JNJ, NVDA and ZARUSD=X
  found Yahoo's closes and adjusted closes identical for a two-month and a three-year window. `refresh=1` downloads again.
- `site/online.mjs`: `PRICE_CONCURRENCY` 16; one retry 600 ms after a failed price request (not for sign-in errors or a
  cancelled comparison). Listings Yahoo has no data for (e.g. Kenvue, the Honeywell spin-offs) still show as missing,
  after one retry.
- `site/price-data.mjs`: JSE closed days (the J303 calendar, 2024–2027) carry the last JSE close onto other markets'
  dates, as Tokyo and Taiwan already did. **Bug fixed:** 4 November 2026 (election holiday) made every JSE holding drop
  out of EasyBest vs QQQ/VOO for any period spanning it (0% coverage). One note per set of carried dates.
- **Regression found and fixed within this release:** cutting at midnight UTC dropped USD/ZAR bars that Yahoo stamps
  23:00 UTC during UK summer time, so EasyBF/EasyBest vs J303 Last Month failed ("USD/ZAR closing rate missing on
  2026-09-30") on 20a32a56 and 0cf79e40, from 09:12Z to 09:21Z. Fixed in 726b204 (c39e8c66).
- Tests: 250/250 (new: history cut incl. the 23:00 UTC FX bar and Tokyo, shared download, retry, JSE closures, grouped
  notes). Python OK.

Production results after the release (owner's Brave, desktop). Figures equal the pre-release baseline where one was taken:

| Pair | Period | Time | Port / Bmrk | Note |
|---|---|---|---|---|
| EasyBest vs QQQ (ZAR) | Last Week | 3.0 → 2.2 s | 0.45% / 5.37% | identical |
| EasyBest vs VOO (ZAR) | Last Week | 22.0 → 4.4 s | 0.45% / 4.30% | identical |
| Marlow vs QQQ (USD) | Last Week | 2.1 → 1.3 s | 5.74% / 3.63% | identical |
| EasyBest vs VOO (ZAR) | MTD | 26.6 → 4.1 s | −0.78% / −1.51% | EasyBest was 0% coverage before (4 Nov) |
| Marlow vs QQQ / VOO (USD) | YTD, 3M, MTD, 1D | 1.8–12.0 s | e.g. YTD 14.45% / 5.36% (QQQ), 5.83% (VOO) | all load |
| IBKR vs VOO (USD) | YTD, 3M, MTD, 1D | 2.1–4.9 s | YTD 19.08% / 5.83% | all load |
| EasyAI vs QQQ (ZAR) | YTD, 3M, MTD, 1D | 1.4–2.1 s | YTD 23.80% / 9.71% | all load |
| EasyGE vs VOO (ZAR/USD) | YTD, 3M, MTD, 1D, Last Month | 2.1–8.2 s | YTD 27.29% / 10.20% | all load |
| EasyBF vs VOO (ZAR) | YTD, MTD | 10.9 / 6.0 s | 3.53% / 10.20% | loads |
| EasyBF vs J303 (ZAR) | Last Month, 3M, YTD | 2.2 / 3.0 / 11.4 s | LM −5.72% / −0.29% | J303 −0.29% equals the 19 Nov record |
| EasyBest vs J303 (ZAR) | Last Month, Live | 1.5 / 1.7 s | LM −0.35% / −0.29% | loads |

The slowest cases (8–12 s) are the first request of a new end date for VOO's ~420 shares; later periods ending on the
same date reuse that download (e.g. VOO Last Year then MTD: 22.5 s, then 2.5 s).

Found, not changed (existing rules): ZAR comparisons spanning 21 April 2025 (Easter Monday) fail with 0% coverage
because Yahoo has no USD/ZAR rate that day and the code never fills a missing FX rate ("FX must still be observed on
the valuation date"). This affects Last Year in ZAR. EasyBF vs SWIX switches to Rise vs SWIX by design.
