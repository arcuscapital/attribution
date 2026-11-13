# Grouping by GICS sector (2026-11-13)

## Request (owner)
"Attached is gics sectors for all shares. save this in a database somewhere. then in
https://arcuscapital.co.za/portfolio-analysis/ between date range and currency add a block called grouping,
default should be no grouping but I can sort by GICS sector as a selection. Then if I select gics then when I
compare two funds, eg ibkr and bai it should look like when I compare Rise and SWix … the formatting of the
table it must be the same, so if no gics is selected then it looks like now and if gics selected then it looks
like rise swix. Rise Swix should default to Gics selected however I can select no grouping … when you do gics
if an item isnt in a gics classification have another group call it unknows gics … git deploy and check".
File: `Arcus-GICS-Sector-Bloomberg16544.xlsx` (sheet "GICS Sector": 855 Arcus tickers, Bloomberg
`BDP(security,"GICS_SECTOR_NAME")`).

## What changed (Attribution only)
- **Database:** the 741 tickers with a GICS sector are saved in the Attribution KV namespace
  `HOLDINGS_ARCHIVE` (`98da8aed88f9416d84a9497daed06dc5`), key `gics:v1`:
  `{asOf:"2026-11-13", source, count:741, sectors:{TICKER: sector}}`. 110 funds/indices/FX ("n.a.") and four
  failed Bloomberg lookups (`#N/A N/A`: EA, QRVO, SLP, WEAV) are left out and therefore show as Unknown GICS.
  The spreadsheet data is not committed to Git. The catalog route (`cloudflare/data.mjs`) returns it as
  `catalog.gics`; the Arcus bridge passes catalog fields through unchanged (no Watchlists change).
- **Grouping control** (`site/index.html`): between Date range and Currency, "No grouping" (default) or
  "GICS sector". Phones: Date range full width, Grouping and Currency side by side.
- **GICS view for ordinary comparisons** (`site/app.mjs`, `groupByGics` in `site/rise-swix-core.mjs`,
  `createGroupedTable` in `site/ranges.mjs`): the Rise vs Swix table — Name, Ticker, Avg % weight / Total
  return (%) / CTR (pp) each over Port | Bmrk; the first row "<portfolio> vs <benchmark>" with the headline
  returns; white sector rows (alphabetical) that open with ▸/▾ to the holdings in orange; the last clicked
  sector on the blue band; sortable headings (sectors, then holdings inside); italic returns for a side that does
  not hold the share; 0%-assumed returns in red. Sector returns are contribution over weight on each side.
  Holdings not on the GICS list (including cash, funds, private and unlisted holdings) form "Unknown GICS",
  listed last and drawn like the other sectors. Matching: row id, symbol or ticker, case-insensitive,
  class-share `.`/`/` → `-`. The Rise vs Swix table rules in `site/style.css` now cover `#gics-table` too
  (`:is(#rise-swix,#gics-table)`), so the formatting is identical in dark, light and phone layouts. No grouping
  keeps the existing table.
- **Rise vs Swix:** choosing Rise sets Grouping to GICS sector (the report's sectors); No grouping lists every
  holding without sector rows (`rise-flat`, no indent); leaving Rise vs Swix restores the previous choice.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/gics-grouping`, from `claude/theme-subtheme` at `522cc39` (live application `3702787`) |
| Previous production | version `1ec2f7ca-ee26-42b2-aa27-b43a1ec7117e`, deployment `3f43ca7c-93e1-4891-a113-59ba50858f01`, confirmed live before deploying |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0, dry run first |
| KV write | `wrangler kv key put gics:v1 --namespace-id 98da8aed88f9416d84a9497daed06dc5 --remote` (2026-11-13, before the deploy) |

| Commit | UTC | Version | Deployment |
|---|---|---|---|
| **`0b79e3e6f3e37e1879b3de1d596df80c042a57ea`** | **2026-11-13T09:53:11.208574Z** | **`d8664276-bc33-40b1-9d7a-910fc50b7734`** | **`a1150858-8c75-452d-b963-7fa57bf005ac`** |

## Tests and limits
- `node --test tests/*.test.mjs`: 162/162 (new `tests/gics-grouping.test.mjs`: lookup rules, sector totals,
  contribution-over-weight returns, reference and 0% rows, Unknown GICS last, catalog from KV, control order,
  Rise default and flat mode, every Rise table rule also covering the GICS table).
- Production, owner session in Brave (desktop): control order Portfolio > Benchmark > Date range > Grouping >
  Currency; IBKR vs BAI last month with No grouping showed the existing table; with GICS sector: first row
  "IBKR vs BAI" 100.00 / 100.02, -13.70 / -16.83, -13.70 / -12.60; sectors Consumer Discretionary,
  Financials, Health Care, Industrials, Information Technology, Materials, Unknown GICS (21.30% / 20.01%:
  USD cash, BAI's Taiwanese/Japanese local-code holdings, SpaceX, Akamai, private OpenAI/Anthropic, money-market
  fund — none on the Arcus GICS list); same headings and widths as Rise (Name 360, others 100), companies amber,
  clicked sector on rgb(35,84,184). Rise vs Swix: Grouping switched to GICS sector on selection (12 sectors);
  No grouping listed 127 holdings in amber with no sector rows; leaving Rise restored No grouping. The owner's
  saved selection (GPT vs MTUM, USD, 1D) was restored.
- Coverage is the Arcus share list only; shares outside it are Unknown GICS until added to the spreadsheet
  (new rows) and `gics:v1` is rewritten. No phone or emulator test.

## Updating the sectors
Export the sheet's columns A (Arcus ticker) and F (GICS sector), keep the 11 GICS sector names, write
`{asOf, source, count, sectors}` with upper-case tickers, then:
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 kv key put gics:v1 --path <file.json> --namespace-id 98da8aed88f9416d84a9497daed06dc5 --remote
```
No deploy is needed for a sector update.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 1ec2f7ca-ee26-42b2-aa27-b43a1ec7117e --config wrangler.jsonc --message 'Rollback GICS grouping'
```
The `gics:v1` key can stay (the previous version ignores it). Attribution only.
