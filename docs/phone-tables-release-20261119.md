# Phone comparison tables, J303 FX dates and tickers — release 2026-11-19

Owner request (19 Nov): on phones, Return contributions (GICS on and off) must show name, Avg % weight and
Total return for portfolio and benchmark without a sideways swipe; no side margins; short company and sector
names; no Ticker column on phones; desktop tickers populated; fix missing tickers for EasyBest vs J303.

## Release

| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution.git |
| Branch | `claude/pa-phone-compact` (worktree `C:\Users\Skrom\ArcusPACompact`) |
| Base | Codex `codex/satrix-j303-20261119` d31923c (production was 7f364c3 + docs) |
| Commits | 9776556 (tables, FX, tickers), bcbfd39 (phone hint, Famous Brands), a878d06 (Name heading, short-name list) |
| Worker | `arcus-attribution`, Cloudflare account 5695cae2becf35e049eb5df3e2849ae2 |
| Deploys (UTC) | 613e0d9d-246c-4119-8964-bc89d70e3431 at 2026-11-19T12:28Z (9776556); d20d8737-7f1f-4453-912e-e7272a1b0132 at 12:45Z (bcbfd39); **7c6a32ea-01a9-4232-a8aa-0756ecb87b30** at 12:55Z (a878d06) |
| Rollback target | 71da240e-bb21-45b4-b004-6f6106aae3dd (Codex "Daily STXCAP J303 import" 7f364c3) |

Arcus (`arcus-watchlists`) was deployed separately for the EasyBest benchmark rows; the bridge allowlist did not
change (no new files), so the two Workers can be rolled back independently.

## What changed

- **Phones (≤600 px)**: the flat table (`#results`, class `phone-paired`), the GICS table (`#gics-table`) and Rise vs
  Swix (`#rise-swix`) run edge to edge (panel `margin-inline:-16px`, no side padding or borders). Columns: Name 34vw,
  then Avg % weight Port/Bmrk and Total return Port/Bmrk at 16.5vw each (exactly 100vw), then CTR Port/Bmrk to the
  right. Ticker column hidden. Name stays sticky when swiping.
- **Short names**: `shortName`/`shortNames`/`shortSector` in `rise-swix-core.mjs` (first meaningful word, two when
  the first says nothing on its own (Mr Price, Gold Fields), ticker overrides for Amplats, Std Bank, BAT, Richemont, TSMC…,
  ticker added when two holdings would share a name (Investec INP / INL)). Sectors: Tech, Comm Serv, Cons Disc,
  Cons Staples, Health Care… Drawn from `data-short` with `::before`, so the element text, titles, downloads, desktop
  and screen readers keep the full name. Flat-table row details start with the full Name and the Ticker (linked).
- **J303 FX (bug)**: `j303-source.mjs` dated USD/ZAR closes with UTC dates. Yahoo stamps them 23:00 UTC during UK
  summer time, so each rate moved a day early and every Friday looked missing: Last Month, QTD and Last 3 Months
  failed for EasyBest vs J303 ("USD/ZAR closing rate missing on 2026-10-02"). Now uses `completedPrices` (exchange
  time zone). Last Month loads after the deploy (125 rows).
- **Tickers**: J303 and SWIX rows now carry the full JSE ticker (`VOD.JO`), the same as the EasyBest rows (`MTN.JO`);
  before, the two sides mixed `VOD` and `MTN.JO`. The pre-release scan found no blank tickers; AVI showed only "AVI"
  because that is its company name.
- Module versions bumped to `phone-20261119` (app, style, ranges, rise-swix, rise-swix-core).

## Tests

- `node --test tests/*.test.mjs`: 230/230 pass (224 before, plus `tests/phone-compact.test.mjs`: short names,
  dedupe, sectors, London-dated FX, full J303 tickers, phone columns/CSS). `python -m unittest`: 21 pass.
- Limits: no DOM tests exist here; layout was checked on the **Android emulator** (marlow17, Pixel 7 profile, Android 17,
  Chrome, 411 CSS px) against production after deploy, not on a physical phone. Flat and GICS tables measured: Name
  ends at 140 px, Bmrk return at 411 px, CTR at 479/547 px. Design agent results below.

## Rollback

```
cd C:\Users\Skrom\ArcusPACompact
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'; $env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 71da240e-bb21-45b4-b004-6f6106aae3dd --message "Roll back phone tables"
```
Rolling back to d20d8737 or 613e0d9d keeps the tables and FX fix but brings back the clipped Name heading.

## Design agent check (emulator, after deploy)

Independent agent, Android emulator (Chrome, 411 CSS px), light and dark (dark via the page class, not saved):
- Flat and GICS tables: edge to edge, Name ends at 139.9 px, Total return Bmrk at 411.4 px, CTR at 411–547 px, no
  page sideways scroll, no clipped numbers. Fonts: cells 14px/400, headings 12px/600, matching the metrics cards and the
  sector weights table. Rise vs Swix fits the same way.
- Last Month EasyBest vs J303 loads (125 rows; portfolio −0.47%, benchmark −0.29%).
- Problem found: swiping to CTR clipped the sticky two-row "Name" heading and let "Port" show through. Fixed in a878d06
  (Name in the lower heading row over a sticky blank cell; no rowspan on phones), re-checked on the emulator.
- Weak short names it listed, now fixed by ticker: DRDGOLD, WBHO, Alex Forbes, Southern Sun, AB InBev, Super Group,
  WeBuyCars; Rise vs Swix tickers ending " SJ" now match the list (Pick n Pay, Richemont). "Blue" kept: it is the owner's own example.
- Not done: a tap-through of the flat-table row details by the agent (the data-short/full-name split was confirmed).
- Emulator Portfolio Analysis selection restored to IBKR vs BAI, Last Month, No grouping, USD.
