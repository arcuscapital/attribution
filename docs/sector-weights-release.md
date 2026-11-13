# GICS sector weights table (2026-11-13)

## Request (owner)
"in https://arcuscapital.co.za/portfolio-analysis/ after graph before method reconciliation can you put in a
table like the image based on the holdings and time period selected. this table must go in whether or not gics
had been selected from the drop down. The image is just an example to show it shows a column of gics sectors,
portfolio % weight, benchmark % weight. you must do the calc. do not use the image colouring or formatting …
all the styling must be done to match the light dark of the website, in dark mode this text will be orange".

## What changed (Attribution only)
- **Ordinary comparisons:** `#gics-weights` after the cumulative chart and before "Method, reconciliation and
  sector attribution", shown with Grouping = No grouping or GICS sector. Columns: GICS sector, <portfolio> %
  weight, <benchmark> % weight; rows: the 11 GICS sectors (0.00 when not held), Unknown GICS when anything has
  no sector (cash, funds, private, not on the list), and a Total. Weights are the comparison's average weights
  for the selected period (`gicsWeights` in `site/rise-swix-core.mjs`, same GICS map as the grouping, KV
  `gics:v1`).
- **Rise vs Swix:** the same table under its chart (report average weights by the Bloomberg report's sectors,
  including its "Not Classified"), in both grouping modes.
- **Styling** (`site/style.css`, scoped by id): light mode uses the page's table look; dark mode follows the
  other comparison tables (black panel, #232323 heading with grey text and the 20px amber band, sector names
  white, weights amber, Segoe UI 400, 24px rows, Total grey on black). Shared renderer `renderSectorWeights`
  in `site/ranges.mjs`.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/sector-weights`, from `claude/gics-grouping` at `6988006` (live application `0b79e3e`) |
| Previous production | version `d8664276-bc33-40b1-9d7a-910fc50b7734`, deployment `a1150858-8c75-452d-b963-7fa57bf005ac`, confirmed live |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0 |

| Commit | UTC | Version | Deployment | Change |
|---|---|---|---|---|
| `fafb21b1fb4b9d60c391336ff6d65396a49fd5b7` | 2026-11-13T10:37:32.143878Z | `3fe39b1a-6b41-446a-b0cc-cfe9318c09af` | `feb31da2-2960-4c38-9190-72acd8be4c8e` | Table |
| **`75f70aacd1087fb95b9524b3630e81388926c36a`** | **2026-11-13T10:39:47.694751Z** | **`06694292-d1fa-412e-8e55-101c09bb3a23`** | **`93147585-32c8-4630-a840-4be64193dc3f`** | Scoped styles (current) |

`c519841` (test-only, not deployed) relaxes the GICS style test for the table's own `#rise-swix .sector-weights`
scope. The `75f70aa` deploy ran before that test fix: one test failed at deploy time because of the new scope
itself (no page behaviour involved); after the fix the suite is 163/163 and the deployed site code is
unchanged.

## Tests and limits
- `node --test tests/*.test.mjs`: 163/163 (new: weights per sector with zeros, Unknown GICS only when needed,
  totals, placement after the chart and before Method).
- Production, owner session in Brave (desktop): IBKR vs BAI last month — table shown with No grouping and with
  GICS sector, between the chart and Method; Information Technology 40.28 / 72.59, Industrials 30.01 / 1.30,
  Health Care 5.77 / 1.20, Financials 2.65 / 0.00, Consumer Discretionary 0.00 / 4.11, Materials 0.00 / 0.81,
  Unknown GICS 21.30 / 20.01, Total 100.00 / 100.02 (matching the GICS table's sector rows); dark heading
  rgb(35,35,35) with a 20px amber band, names white, weights amber. Rise vs Swix last month: table under the
  chart (Communication Services 1.53 / 6.00 … Not Classified 10.44 / 0.00, Total 100.00 / 100.00), also with No
  grouping. The owner's saved selection (GPT vs MTUM, USD, 1D) was restored. No phone or emulator test.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback d8664276-bc33-40b1-9d7a-910fc50b7734 --config wrangler.jsonc --message 'Rollback GICS sector weights table'
```
That keeps the GICS grouping (`docs/gics-grouping-release.md`).
