# Portfolio weighted returns and Excel export — 14 October 2026

## Repositories and preserved starting states

| Repository | Branch | Preserved starting commit | Application commit |
| --- | --- | --- | --- |
| https://github.com/arcuscapital/attribution.git | codex/portfolio-weighted-excel | 9e14fe6d7df09a888f148a2f229a3a525c1c5da8 | 3dbcf41b2af49c9a5aedb91ce24f149a94cba830 |
| https://github.com/arcuscapital/arcus-watchlists.git | codex/portfolio-weighted-excel | 6c08efa688813fa08f488d5d706d03dc07f94baf | 0b47f75217b6584d92d86c9bfaa1c11488fe84d4 |

Both application commits were pushed before deployment. Following documentation-only commits record deployment evidence and do not change the deployed application.

Previous Attribution: account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`, version `1dc0e8af-e761-49a5-8cad-99f3ffd5c8a4`, deployment `72b7a786-f035-4d25-ad27-946158aeb267`, UTC `2026-10-11T09:35:08.157539Z`.

Previous Arcus: account `42dd726446271f45425eab740741b864`, Worker `arcus-watchlists`, version `6a5ce40e-dd05-4a9c-9a3f-394f66cb0135`, deployment `51561e48-5e80-4936-86e5-78f3f094abc5`, UTC `2026-10-10T13:36:39.67634Z`.

## Behaviour and calculation scope

Selecting any `PORTFOLIO:*` account now shows the sum of average opening weight × security period return. The average includes every included valuation day's opening weight. Both contribution columns in an account comparison use these same period products. Source weights, including shorts and leverage, are retained without normalization. ETF headlines continue to use their observed reference series. The portfolio ID is never substituted with the similarly named listed stock.

An unavailable security contribution remains blank. If some returns are missing, the portfolio headline is explicitly the available weighted estimate, with covered absolute source weight shown; it is not a complete NAV return. If no held security has usable returns, the portfolio headline remains blank. Exact endpoints, held-day price checks, requested date coverage and same-date FX requirements remain enforced. Daily sector Brinson/Carino effects are withheld for this different period-weight method. ETF-versus-ETF calculation behaviour is unchanged.

The download is a real `.xlsx` file created entirely in the browser, with two sheets. Summary contains dates, selections, currency/view, returns, basis and coverage, without frozen panes. Analysis contains the eight core columns, a narrow security-code column, 90% initial zoom, blue/white headers, alternating rows and filters. Analysis row 1 repeats the selected portfolio/benchmark returns, linked to Summary; row 3 holds the column headers; the pane freezes below row 3 (`A4`) so both remain visible during vertical scrolling. All weights, security returns and contributions are numeric decimal fractions with Excel's `0.00%` format and unrounded source precision. Contribution cells use weight × return formulas; the portfolio Summary sums the available Analysis products, and the repeated Analysis return row links back to that Summary. The sum ranges begin at row 4, so no circular reference is introduced. Missing cells remain blank. Text is encoded as inline strings, preventing formula injection. The previous long disclaimer/holdings-warning rows are omitted from the workbook; website method disclosures remain. Website CSS/layout is unchanged.

Arcus changes only the authenticated static bridge allowlist for `export.mjs`. Attribution also allowlists that module; it is fetched only when downloading. The app loads it dynamically so a briefly older Arcus bridge does not prevent comparison during rollout. Authentication is checked before and after loading the export module, including result/generation checks after the final await. No secrets, sessions, private holdings, archives or test workbooks are committed or exposed as public assets.

## Tests and evidence

- Attribution: 59 Node tests passed; 20 Python tests passed. Weighted cases cover one/multiple days, changing/removed weights, partial/all-missing returns, actual zero, shorts/leverage, reversed account/ETF selection, two accounts, FX, held-day gaps and missing requested dates/snapshots. Existing ETF linked-return/reconciliation regressions pass.
- Arcus: 855 Node tests passed; unchanged asset manifest check passed. The new module requires Arcus authentication and a fresh method/path-bound bridge signature. Existing session, forgery, query signing and data-route tests pass.
- Both production configurations completed pinned Wrangler 4.128.0 dry-run builds; expected accounts, Worker names and unchanged bindings were verified. Production versions were checked before each upload.
- Actual Brave Work-profile local synthetic comparison and Holdings/Sector downloads passed. The downloaded workbooks were independently parsed with openpyxl and ZIP checksums checked. The final two-sheet export tests additionally verify sheet order, cross-sheet headline/product links, return row 1/header row 3 and the `A4` freeze on Analysis only. Eight detail columns, fractional numeric percentages, retained precision, cached headline/product reconciliation, blank missing data and removed disclaimer rows are verified.
- A synthetic workbook was imported/recalculated with the bundled spreadsheet engine: product/sum and cross-sheet headline results matched independent JS values, and missing cells stayed blank. Both final sheets were rendered and visually inspected. The exporter uses no external browser dependency. This is spreadsheet-engine verification, not a claim of Microsoft Excel native-app testing.
- Desktop browser testing only in this release. No new actual Android emulator or physical-device test is claimed. No trades, collectors, queues, crons or data migrations were added; the desktop updater/Google collector is unchanged.
- Synthetic workbooks and previews are local QA artifacts outside Git/static hosting. Live production verification is recorded below without private holdings or credentials.

## Deployment (UTC)

| Application | Application commit | Account / Worker | Version | Deployment | UTC / traffic |
| --- | --- | --- | --- | --- | --- |
| Initial weighted-return + one-sheet export | 69ffc0fd6f3d69765ec4666315008be42f9f6475 | 5695cae2becf35e049eb5df3e2849ae2 / arcus-attribution | a9ffa84e-a608-4c51-9129-39b471f8c3df | 42437e25-79b6-4be6-8d76-859f84918d3a | 2026-10-14T10:01:55.436191Z / 100% |
| Arcus export allowlist | 0b47f75217b6584d92d86c9bfaa1c11488fe84d4 | 42dd726446271f45425eab740741b864 / arcus-watchlists | 5e4ab4b7-76ce-4e41-9317-407ae23dec22 | 6f62abd2-171a-43f9-baeb-652848a0f48a | 2026-10-14T10:03:12.550245Z / 100% |
| Final two-sheet export | 3dbcf41b2af49c9a5aedb91ce24f149a94cba830 | 5695cae2becf35e049eb5df3e2849ae2 / arcus-attribution | a34930dd-b5ac-4f9a-b7f7-ecb9185abfe0 | 7189d0df-940f-452a-9bd0-fd0f3ba6009b | 2026-10-14T10:09:34.13475Z / 100% |

The final two-sheet revision changes only the export module, app import version, page module version and export tests; Arcus's bridge remains compatible and requires no second deploy. Wrangler reported 1 ms Attribution / 4 ms Arcus startup; these are not end-user load-time measurements.

Anonymous production requests to Arcus `export.mjs` and `data/catalog`, and standalone `export.mjs` and `arcus-bridge/export.mjs`, all returned HTTP 401 after the initial paired deployment. In logged-in Brave, IBKR versus BAI completed with the weighted portfolio headline and available-data coverage displayed. Private holdings, account details, cookies and downloaded live workbooks stay outside this release record and Git.

After the final deployment, logged-in Brave loaded `app.mjs?v=weighted-excel-2-20261014`; IBKR versus BAI, One Day through 13 October, completed. Download Excel produced the final live two-sheet workbook with no browser errors. Independent openpyxl/ZIP validation verified Summary/Analysis order, Summary without panes, Analysis returns in row 1 and headers in row 3, freeze at `A4`, all seven numerical detail columns using `0.00%`, exact cached cross-sheet return equality and portfolio headline reconciliation to the available product cells within `1e-12`. The long disclaimer rows were absent. The downloaded live workbook stays on the user's PC outside Git. No native Microsoft Excel or Android/physical-device test is implied.

## Compatible configuration and exact rollback

The existing `ANALYSIS_BRIDGE_KEY` on both Workers, Attribution's `PASSWORD_PEPPER`, `PASSWORD_VERIFIER`, `SESSION_KEY`, `LOGIN_LIMITER` and `HOLDINGS_ARCHIVE`, and Arcus's existing authentication/configuration remain compatible. No secret changes. Deploy Attribution first, Arcus second. Roll back Arcus first, Attribution second, then reload the page. During that rollback interval comparisons work but the new export module may be unavailable. No database/holdings rollback is needed.

PowerShell, in the Arcus Watchlists repository:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.jsonc --json
npx --yes wrangler@4.128.0 rollback 6a5ce40e-dd05-4a9c-9a3f-394f66cb0135 --config cloudflare/wrangler.jsonc --message 'Rollback weighted Excel bridge'
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.jsonc --json
```

Then in `C:/Users/Skrom/ArcusAttribution`:

```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
npx --yes wrangler@4.128.0 rollback 1dc0e8af-e761-49a5-8cad-99f3ffd5c8a4 --config wrangler.jsonc --message 'Rollback weighted returns and Excel export'
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
```

Verify the expected account/Worker/version before executing rollback and 100% old-version traffic after it. Keep all authentication secrets intact. Treasury-original Arcus version `98c4a615-05c3-4213-bd07-f69702de43c9` / commit `d51ae4d0a9757eb6ec2d0a969697f76fecface57` and graphs-only version `42785cce-8059-4716-a5ef-882e5f47dc59` / commit `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` remain preserved; see the existing paired integration release record for those broader rollback choices.
