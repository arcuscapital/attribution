# J303 automatic holdings — 16 November 2026

J303 is a daily reconstructed price-return portfolio in Arcus Portfolio Analysis. Its name is J303, below Marlow and above Swix. The owner explicitly authorised a best public-data reconstruction, one year of history, automatic future rebalances, Git deployment, and live SWIX comparison. Total-return controls and changes to ordinary portfolio return conventions are outside this release.

## Method and sources

The initial model starts at the 13 November 2025 close (returns from 14 November). March 2025 Satrix's full constituent disclosure supplies the broad universe; September 2025 Satrix sector/top-ten disclosures, December 2025 and June 2026 Satrix top tens, March 2026 Prescient top tens, and September 2026 Satrix's publicly visible FundsData top ten calibrate the reconstruction. Residual allocations retain relative inferred float units. Historical calibration is retrospective and includes subsequently published information, so this is not a point-in-time trading backtest. Fund weights, rounding, optimisation, cash and reporting lag prevent exact official-index replication.

- https://www.sharedata.co.za/sensad.asp?id=508261
- https://etfsa.co.za/wp-content/uploads/2024/05/Satrix-Capped-All-Share-sept2025.pdf
- https://etfsa.co.za/wp-content/uploads/2026/01/Satrix-Capped-All-Share-dec2025.pdf
- https://www.itransact.co.za/Library/ITRANSACT%20MEDIA/FACT%20SHEETS/pres_core_cap.pdf
- https://www.fundsdata.co.za/Summary.aspx?c=STXCAP
- https://clientportal.jse.co.za/communication/ftse-jse-africa-index-series-documents
- https://sharedata.co.za/v2/scripts/SENS.aspx?id=556643

The supplied draft's delisting dates were not used as index removal dates: MultiChoice 16 October 2025, Barloworld 28 October 2025, Adcock 5 November 2025, Curro 7 January 2026. Known March/September 2026 review additions/removals are dated in the model. The attached Prescient September claim could not be independently reproduced at its live URL; the verified March disclosure and fresh September Satrix disclosure were used instead.

Effective units float with closing prices. Quarterly capping uses the second Friday's close and applies after the third Friday's close, effective the next JSE session. A holiday Friday uses the preceding session. Capping is iterative at 12%; a weight can subsequently exceed 12%. The underlying uncapped float-unit estimate is retained between reviews rather than compounding previous capping factors. Divisor continuity prevents a rebalance itself from generating a return.

2026 effective dates: 23 March, 22 June, 21 September, 21 December. The calendar is calculated for future years, including South African fixed/movable/observed holidays; exceptional future exchange closures still require calendar data. For example, March 2027 is effective 23 March because 22 March observes Human Rights Day.

Yahoo split-adjusted raw closes exclude ordinary dividends. Same-day independent Sharenet prices confirm historical 100x ZAR/ZAc repairs; adjusted-close dividend returns are not used. New splits restate stored units and the pending cap plan. Known membership removals redistribute weight without a spurious capital loss; this does not claim comprehensive official corporate-action treatment.

SWIX's saved November 2026 allocation is reverse/forward drifted using the same closing-price basis, without fitting its returns to J303. The follow-up membership audit uses six small SWIX allocation weights as proxies for constituents omitted by the optimised Satrix fund; membership is independently verified from JSE notices. The comparison is therefore partially dependent for those small names, while the major J303 allocations retain their public-fund calibrations. Its reported source period and the existing Rise/Swix report view remain unchanged. New daily comparisons compound daily contributions, rather than multiplying an average weight by a whole-period security return; charts use the same daily path.

## Automatic operation and limits

The shared `site/holdings-drift.mjs` engine takes an arbitrary dated allocation and security returns (or effective units and prices). It contains no JSE dates, capping, tickers or currency rules. Both J303's historical replay and scheduled publisher use it. A future 13F adapter should supply its filing/effective dates and replacement snapshots to this same engine; 13F discovery, filing lag, scope changes and cash/short exclusions belong in that separate adapter. No 13F feature is shipped here.

Attribution runs `*/2 * * * *`, one listing per invocation, with final publication in a separate invocation to reduce peak CPU. It catches up sequentially by JSE session, publishes only after all closes are present, and retains the last good state on failure. A 121-listing session needs approximately four hours after the next calendar day starts in Johannesburg, plus any retries. The index level, holdings, pending cap factors and model revision are in private KV, using the existing `HOLDINGS_ARCHIVE` binding. No PC task or desktop upload is required after bootstrap. Full backfill snapshots and an immutable model revision are retained. The existing unrelated Arcus collectors, queues and schedules are unchanged.

Each Monday at 06:00 UTC it checks the freely visible Satrix top-ten disclosure. New valid disclosures update the next quarterly float-unit estimate and are saved with their observation date. Unknown symbols, partial tables and invalid dates retain the last valid source. Between disclosures, the model automatically carries its latest inferred universe/float units and recaps them from current prices. This does not provide a licensed complete future constituent, free-float or corporate-action feed; small/new constituents outside public disclosures remain a source limitation. Rebalancing the reconstruction itself is automatic even when no new disclosure is available.

Browser calculations use the same deterministic core as historical reconstruction. Missing latest constituent closes stop the comparison, and missing prices never silently delete holdings or renormalise them. A separate narrow authenticated route serves J303 model/price data; Marlow-only access cannot read it. All archives, snapshots and private SWIX data stay out of Git/static assets.

## Release control

Attribution: https://github.com/arcuscapital/attribution.git, branch `codex/j303-20261116`, starting checkout `0d25681192bb13e39d22c41a518231eeacabaed8`; previous application `cd7d468d7f92b58e32ca73f8141f31c4a77e5b9f`. Account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`, previous version `6d5ce316-5093-483f-860b-cb2ccf7f68d2`, deployment `6d594455-8b0d-458e-9ace-945a6ac5d205`, UTC `2026-11-16T08:16:52.220838Z`.

Arcus: https://github.com/arcuscapital/arcus-watchlists.git, branch `codex/j303-20261116`, starting checkout `08800fee3d4eb9617fc20be619fba437919196cd`; previous application `be726b3bc66f89106c7ac2a82d9ea08b33279466`. Account `42dd726446271f45425eab740741b864`, Worker `arcus-watchlists`, previous version `b4327795-1641-485e-b23e-3d4567a66c72`, deployment `f9997dae-1ed4-420e-b318-4c0db8fe21bc`, UTC `2026-11-16T10:28:28.161202Z`.

Deploy Attribution before Arcus; rollback Arcus before Attribution. Authentication secrets and existing bindings are unchanged. A rollback must also remove the newly added Attribution cron trigger; retained `j303:*` KV records are ignored by the old applications and need not be deleted. Treasury-original and graphs-only rollback points are preserved.

Application commits, final deployment IDs, exact rollback commands and live validation are recorded after deployment below. No Android emulator or physical device test is claimed.

## Deployed application and verification

Both branches are `codex/j303-20261116`. Application commits below identify the deployed code; subsequent commits only complete this release record.

| Repository / Worker | Full application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- |
| Attribution / arcus-attribution | 109bb627197a7a623c0d1b592f3a03aa4c9880cc | b7fb4065-4c6f-4e87-b09b-ab069e1ca241 | a96fbade-e4d8-4cbd-ac34-e0edf5f39717 | 2026-11-16T13:00:40.941308Z |
| Arcus / arcus-watchlists | c2d3cc642d4c1d885247a2543ffba692936f8dc6 | 5f7a7c1a-66f0-4436-88c7-ba82db9e39b2 | 1615705c-7b28-4418-aa6a-6dedebd3772c | 2026-11-16T12:50:57.20428Z |

The initial Attribution application `41dc552ab0b285f498716bf40f56ddef5bd1670d` was deployed at 12:49:56 UTC, before Arcus. Follow-up `3bf2e348f0def5fbe646cba36b7e7ba46aee1b28` makes the adapter lazy so a rolled-back Arcus catalog does not require the new module. The final follow-up clarifies the daily price-return methodology and restarts a pending source job when its disclosure date changes. Existing authentication secrets and bindings were retained.

Automated verification: Attribution `node --test tests/*.test.mjs` passed 195/195; `python -m unittest discover -s tests -p 'test_*.py'` passed 21/21. Arcus Node tests passed 1178/1178; its build-manifest check passed. Tests cover shared static-allocation drift and replacement snapshots, quarterly dates through 2028, iterative capping, reference-to-implementation drift, split restatement, rebalance continuity, historical/scheduled parity, complete-day publication, missing-price rejection, signed-query authentication and Marlow-only restrictions. Rollback trigger configuration was validated with Wrangler's dry-run; production rollback itself was not executed.

Protected live Portfolio Analysis was tested in the existing Brave browser, without desktop/native control or Chrome. The menu order is Marlow, J303, Swix. SWIX versus J303 produced:

| Completed period (ZAR price returns) | SWIX | J303 | SWIX minus J303 |
| --- | ---: | ---: | ---: |
| 13 November 2026 | -0.421566% | -0.452898% | +0.031332 pp |
| 1 January–13 November 2026 | -2.897103% | -3.162953% | +0.265850 pp |
| 14 November 2025–13 November 2026 | -0.876242% | -1.008386% | +0.132145 pp |

The displayed values agree with the deterministic local calculation. Both sides had complete return coverage, no missing prices, visible charts, and contribution totals/chart endpoints reconciling to the headline returns. The final deployed UI was reloaded and the full-year comparison rerun, with the zero-return assumption control hidden for this daily path and an explicit price-return methodology. No browser console errors were captured. An existing Marlow-versus-QQQ one-day USD comparison still completed; its pre-existing labelled private-position/zero-assumption disclosures remained visible. This regression does not assert that every original portfolio position has market-return coverage.

The real scheduled handler published the 13 November close at 2026-11-16T13:00:37.198Z. To exercise publication immediately, the new J303-only state was staged at 12 November with 116 already validated public quotes; the real invocation fetched the final two listings and performed the actual publish. All 118 weights sum to exactly 1 and match the full historical reconstruction with maximum absolute weight difference 0; the index level is 98.99161365132944 in both. A subsequent invocation at 13:05:37.198Z completed without redoing a completed day. This proves real scheduling/fetch/publication and idempotence; the complete multi-batch run and future quarterly boundary are covered by automated tests rather than a five-hour live observation.

From approximately 12:51 to 13:08 UTC, the sampled Attribution tail contained 101 successful events and no exceptions, including the publication (10 ms CPU) and subsequent idle scheduled run (1 ms CPU). This is a bounded observation, not a guarantee about future vendor availability or CPU use. Brave's Arcus Cloudflare dashboard showed the deployed version Ready at 100%, 11.42k invocations in its last-24-hours panel, and zero reported Worker errors after testing. The Attribution account was unavailable in that browser login, so its deployment and health were verified through the separately authenticated Wrangler CLI and live tail. No credentials, private reports or raw request logs are committed.

## Holdings audit and final follow-up deployment

This section supersedes the initial model/results above. The earlier deployment record remains as evidence of the first release; current private model revision is `j303-20261116-v2`.

Both repositories remain on branch `codex/j303-20261116`:

| Repository URL / Worker | Account | Full deployed application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- | --- |
| https://github.com/arcuscapital/attribution.git / arcus-attribution | 5695cae2becf35e049eb5df3e2849ae2 | b32baa1fccb8ea2196fd0905e791664f149d5d2f | 09e6bd92-73d3-4720-8373-626fc7167350 | 4da7aacd-73c6-452b-9c56-4900695ab02f | 2026-11-16T13:37:47.671645Z |
| https://github.com/arcuscapital/arcus-watchlists.git / arcus-watchlists | 42dd726446271f45425eab740741b864 | c2d3cc642d4c1d885247a2543ffba692936f8dc6 | 5f7a7c1a-66f0-4436-88c7-ba82db9e39b2 | 1615705c-7b28-4418-aa6a-6dedebd3772c | 2026-11-16T12:50:57.20428Z |

Arcus application code is unchanged in this follow-up. Subsequent commits update this record only. Authentication, existing bindings, other collectors and their schedules remain unchanged. The compatible rollback below still applies, including removal of the Attribution cron before restoring its previous application. Preserve both starting checkouts and the Treasury-original/graphs-only rollback points listed above.

### Membership and allocation verification

The direct holdings audit found that the optimised Satrix fund seed omitted index members. The revised model adds Premier and Karooooo throughout supported history, ASP Isotopes from 22 December 2025, and historical SRI/PHP/RCL until their removals. SRI and Montauk Renewables leave on 23 March 2026; PHP and RCL leave on 21 September 2026. Previously sourced Optasia (23 March) and Canal+/Greencoat Renewables/Stadio/Brait (21 September) additions remain.

Membership evidence:

- Premier: https://www4.sharenet.co.za/v3/sens_display.php?scode=PMR&seq=2&tdate=20251016070500
- Karooooo: https://www.sharenet.co.za/v3/sens_display.php?seq=42&tdate=20210602174000
- ASP Isotopes: https://www.sharenet.co.za/v3/sens_display.php?seq=67&tdate=20251203173000
- March review: https://www.sharenet.co.za/v3/sens_display.php?seq=50&tdate=20260306161500
- September review: https://www.sharedata.co.za/v2/scripts/SENS.aspx?id=559116

Six small omitted constituents use the saved November 2026 SWIX allocation reverse-drifted as weight proxies. Their membership dates are independently sourced; the comparison is partially dependent for these names. Premier/Karooooo/ASP Isotopes are the three still active, together 0.176532% of current J303. Major J303 weights retain the public-fund calibration. Neither weights nor returns were fitted to force equality with SWIX.

At the 13 November 2026 close: 120 SWIX and 121 J303 holdings, 116 common, weighted overlap 95.362096%, active share 4.637904%, shared names covering 99.923117% of SWIX and 99.581097% of J303. Nine of the top ten and nineteen of the top twenty names are shared. Top-ten concentrations are 47.758221% and 47.920149%. The largest allocation difference is Glencore, 0.679112 percentage points. Daily overlap ranges from 95.273607% to 96.831104% over supported history. This is a close reconstructed comparison, not proof of exact official index replication.

Arcus's SWIX is a saved portfolio allocation, not an official 2026 SWIX feed. The JSE terminated the official SWIX series after 31 December 2025: https://clientportal.jse.co.za/Content/ICANoticeItems/FTSE-JSE-Africa/20251104%20REMINDER%20Termination%20of%20SWIX%20Indices%20-%20Informative%20Notice.pdf . The saved allocation contains four subsequently removed names and lacks five newer additions. Those small membership differences are preserved according to the separate source data.

### Follow-up fixes and validation

Verified Sharenet history extends SRI's truncated vendor packet; overlapping closes agree before the older prefix is retained. On-demand and scheduled updates now preserve a verified older prefix only for matching symbol/currency/basis and at least three agreeing overlapping prices. Consistent vendor split restatements rescale the retained prefix.

Historical admission of new constituents now uses reference-date prices, matching the scheduled rebalance plan. A regression with a 30% price change during the review week failed before the fix and passes afterwards. Custom ranges ending on a weekend accept the preceding JSE close after strict latest-price validation; missing trading-day prices remain rejected. Tests cover the truncated-packet weekend case exposed by the live run.

The final scheduled publisher requests only a short overlap with its retained price history, handles one listing per invocation, and publishes in a separate invocation. The cron is now `*/2 * * * *`; full-day processing takes approximately four hours plus retries for 121 constituents. This reduces peak CPU and avoids redownloading the full history each day.

Final Attribution Node verification passed 198/198 tests. The earlier unchanged Python 21/21 and Arcus 1178/1178 suites and Arcus manifest check were not rerun for these Attribution-only follow-up changes. No Android/physical-device testing is claimed.

Live Brave verification covered 15 supported periods: latest day; WTD; MTD; QTD; YTD; last completed week, month and three months; custom full year; custom March, June and September rebalance windows; custom July; weekend boundaries; and the first supported day. Every displayed holding weight in every period (121–126 union rows) matched the locally calculated expected table within its two-decimal display rounding, with zero missing prices or weight discrepancies. Contribution totals and return-series endpoints reconcile to floating-point precision. Multi-day charts were checked; single-day checks cover cards and holdings. The previous-calendar-year preset correctly reports history starting 14 November 2025 and hides stale results. The custom 19 September–4 October range ends its trading series on 2 October.

| Current completed period (ZAR price returns) | SWIX | J303 | SWIX minus J303 |
| --- | ---: | ---: | ---: |
| 13 November 2026 | -0.421586% | -0.451478% | +0.029892 pp |
| 1 January–13 November 2026 | -2.897346% | -3.182539% | +0.285194 pp |
| 14 November 2025–13 November 2026 | -0.876445% | -1.104614% | +0.228169 pp |
| 9–27 March 2026 | -4.211423% | -4.440579% | +0.229156 pp |
| 8–26 June 2026 | -0.856611% | -0.600347% | -0.256264 pp |
| 7–25 September 2026 | -5.066244% | -5.053293% | -0.012951 pp |
| 19 September–4 October 2026 | -4.046389% | -4.137340% | +0.090952 pp |

The final real scheduler test staged the new J303-only state at 12 November with 120 already validated quotes and one pending listing. At `2026-11-16T13:40:37.198Z` it fetched the final quote in 5 ms CPU; at `2026-11-16T13:42:42.356Z` it published separately in 4 ms CPU. Later 13:44 and 13:46 invocations used 2 ms CPU and left the completed day unchanged. The live state is restored to 13 November with 121 positions, weight sum 0.9999999999999992, and level 98.89538605069238; maximum weight difference and level difference from full historical replay are both exactly zero. The final all-constituent multi-batch run and future quarterly boundary are tested automatically rather than observed for four hours live.

The captured follow-up Attribution sample contains 124 successful events and zero Worker exceptions. An earlier combined invocation completed in 18 ms CPU, prompting the smaller batches; the final fetch/publication observations are above. The tail connection intermittently reconnected, so this is a bounded sample, not continuous coverage or a future guarantee. Brave's Arcus dashboard showed the existing version Ready at 100%, 12.07k invocations in its 24-hour panel, and zero Worker errors. Attribution used authenticated Wrangler because its account was unavailable in the browser login. No browser console errors were captured. Raw logs, private allocations, price archives, model revisions and snapshots remain outside Git/static assets.

## Exact compatible rollback

Run the Arcus step first from the Arcus checkout:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
$env:XDG_CONFIG_HOME=Join-Path $env:APPDATA 'xdg.config'
npx --yes wrangler@4.129.0 rollback b4327795-1641-485e-b23e-3d4567a66c72 --config cloudflare/wrangler.jsonc --message 'Rollback J303 to previous Arcus application' --yes
npx --yes wrangler@4.129.0 deployments status --config cloudflare/wrangler.jsonc
```

Then, from the Attribution checkout, remove only the new Attribution schedule and restore its previous application. Cron triggers are configuration and must not be assumed to disappear when a Worker version is rolled back:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$j303RollbackConfig=Join-Path ([System.IO.Path]::GetTempPath()) 'arcus-j303-disable-cron.json'
@'
{"name":"arcus-attribution","account_id":"5695cae2becf35e049eb5df3e2849ae2","compatibility_date":"2026-10-01","workers_dev":true,"preview_urls":false,"triggers":{"crons":[]}}
'@ | Set-Content -LiteralPath $j303RollbackConfig -Encoding utf8
npx --yes wrangler@4.129.0 triggers deploy --config $j303RollbackConfig
npx --yes wrangler@4.129.0 rollback 6d5ce316-5093-483f-860b-cb2ccf7f68d2 --config wrangler.jsonc --message 'Rollback J303 to previous Attribution application' --yes
npx --yes wrangler@4.129.0 deployments status --config wrangler.jsonc
```

After rollback, verify protected sign-in, an existing comparison, and the absence of the J303 menu entry. Do not delete private KV history or change the bridge/password/session secrets. Preserve the existing Treasury-original and graphs-only rollback versions. To resume J303 later, deploy the recorded Attribution application/configuration first, then the recorded Arcus application; retain the existing private seed/history.
