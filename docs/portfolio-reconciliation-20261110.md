# Portfolio comparison reconciliation — 10 November 2026

## Scope and repositories

- Watchlists: https://github.com/arcuscapital/arcus-watchlists.git, branch `codex/wtai-reconciliation-20261110`, starting commit `11916665a4bde1a7bc03849a93283e59ca9cf661`.
- Attribution: https://github.com/arcuscapital/attribution.git, branch `codex/wtai-reconciliation-20261110`, starting commit `7c47deef844504b8e09fd90f45ff0e69eb7258ce`.

Public fallback holdings previously discarded weights. WTAI therefore fell back to an October 5 archive although November 5 constituents were saved. Schwab and MoneyDJ now preserve complete dated weights, including cash. Compare checks the archive catalog and foreground source freshness, reuses recently checked complete weights, and refreshes when required. An older/incomplete provider response cannot overwrite newer weights. If a fresh source is unavailable, an existing complete allocation is explicitly labelled as potentially stale; no complete allocation means comparison stops. Concurrent same-fund requests are deduplicated.

Source weights are never scaled to close a reconciliation gap. ETF market-price references, holdings contributions, measured coverage, missing returns and residual are displayed separately. The reported 6.70% example was the IBKR estimate; WTAI's November 9 reference was 6.343165239454485%, matching the freshly loaded Watchlist. 3.140333660451433% was WTAI's November 6 return. The quoted 3.34% was not reproduced.

UI: additive column totals, non-additive security return marked unavailable in totals, Theme after Difference from verified Arcus classifications, explicit horizontal scroll controls, bounded vertically scrolling securities with sticky headers, USD defaults except SWIX benchmark ZAR. Every explicit RISE/SWIX Compare re-fetches its published report; its dated-report scope remains explicit.

## Compatibility and deployment order

Attribution first (account `5695cae2becf35e049eb5df3e2849ae2`, separate auth directory), then holdings Worker, then Watchlists (both account `42dd726446271f45425eab740741b864`). The optional allocationCheck packet field and company memberships are backward compatible. Existing ANALYSIS_BRIDGE_KEY, standalone authentication secrets, bindings and database schemas remain unchanged. No new collectors, cron triggers, queues or background refresh work were added. Foreground source checks may update validated allocation weights in the existing fund body with a compare-and-swap guard; previous_body is retained.

## Preserved rollback states

- Watchlists live before release: application `e9e34303a5a4a24e412de4735e65343295983e7a`, Worker version `1a803466-2231-4b9c-8bb5-6e0896494aba`, deployment `9aa046bb-245d-4399-8ddd-598dbecfcd46`, UTC `2026-11-10T08:27:24.108582Z`.
- Holdings: application `5ac529273f49a35c6f180351a0d08fd49066838a`, Worker version `16aebeb3-ce16-456c-a7da-b18b113a7e07`, deployment `0ef29cd2-741f-4e59-9117-ba011dabece1`, UTC `2026-11-05T12:12:30.920883Z`. No intervening changes in its existing source/parser/config dependencies were found before this task.
- Attribution: application `e2a73fd381d7f985f745e933de2150cf5d853f91`, Worker version `2cfe053c-82eb-4ad3-bcbb-0603b0734e4e`, deployment `cec78c01-6e8d-40e9-b8cb-b74aa8368935`, UTC `2026-11-09T10:11:07.100292Z`.
- Treasury-original: application `d51ae4d0a9757eb6ec2d0a969697f76fecface57`, Worker `98c4a615-05c3-4213-bd07-f69702de43c9`.
- Graphs-only: application `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091`, Worker `42785cce-8059-4716-a5ef-882e5f47dc59`.

## Exact rollback

In a new PowerShell process, from the Watchlists task worktree:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
npx --yes wrangler@4.128.0 rollback 1a803466-2231-4b9c-8bb5-6e0896494aba --config cloudflare/wrangler.jsonc
npx --yes wrangler@4.128.0 rollback 16aebeb3-ce16-456c-a7da-b18b113a7e07 --config cloudflare/wrangler.holdings.jsonc
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.jsonc
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.holdings.jsonc
```

Then, from the Attribution task worktree:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.128.0 rollback 2cfe053c-82eb-4ad3-bcbb-0603b0734e4e --config wrangler.jsonc
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc
```

Verify authenticated comparison and anonymous access denial after rollback. No schema or credential rollback is required; valid source allocations remain usable by the older code. Do not reverse the application rollback order. If historical versions expire, rebuild the exact application commits with their recorded configuration and matching assets. Treasury/graphs-only alternatives remain documented in Watchlists docs/portfolio-analysis-release.md.

## Validation before deployment

Watchlists: 1038/1039 full Node tests pass. The only failure is the previously diagnosed unrelated TipRanks fixture at test/tipranks-analyst.test.js:303 (fixed October 29 alert versus undated current-time duplicate outside the 10-day window). It is unchanged. Updated source freshness/bridge tests pass after the final guarded fallback change. Asset manifest check and both Worker dry-run bundles pass.

Attribution: 123/123 Node and 21/21 Python tests pass. Behavioral tests cover freshness before prices/calculation, changed/unchanged archive versions, error paths, currency defaults, themes, totals, reconciliation, SWIX foreground report refresh and session-lock cleanup.

Public source probes: WTAI Schwab November 5, 54 allocation rows, 99.99%; ARKK issuer November 10, 44 rows, approximately 100%; QQQ saved issuer November 8, 106 rows (fresh issuer HTTP 406, fallback November 5 rejected as older); VOO issuer September 30, 519 rows, 100.0000433%; BAI issuer November 6, 67 rows, 100.03%. Publication dates are retained, not relabelled as today. These are source/mapping checks, not proof that estimated holdings contributions must equal fund market-price return.

Deployment receipts and live Brave results are appended below after verification. No private portfolio reports, credentials or cookies are included.

## Deployment receipts (UTC)

| Worker / account | Full application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- |
| arcus-attribution / 5695cae2becf35e049eb5df3e2849ae2 | e911a1348fc01ce119aad9777a424b865904bb3a | c9a219f2-c42a-41ec-871d-9bafebe0844f | 9ea24a3e-1ee7-46c0-aa9e-fb2fe0dacca3 | 2026-11-10T08:57:33.747328Z |
| arcus-etf-holdings / 42dd726446271f45425eab740741b864 | c441a8557f2854e265c16329ac05c682d6e4634e | 402b101f-9e1e-4153-818e-aa73d6af4bb9 | dd712095-f20f-403b-b6c3-0613e2889f3d | 2026-11-10T08:58:11.257991Z |
| arcus-watchlists / 42dd726446271f45425eab740741b864 | c441a8557f2854e265c16329ac05c682d6e4634e | 9ca89bf9-6a67-42be-a4e1-99b1b0cce577 | 26cd1274-4352-44d1-a69f-0ca32761c103 | 2026-11-10T08:58:43.55465Z |
| arcus-attribution / 5695cae2becf35e049eb5df3e2849ae2 | cf9cd321dc873b4c1e3b0a5b71f76494fb32212c | f855a4b1-71db-41ed-abb2-6bd8733a10b7 | ca0a209e-9ecb-4a28-8d77-eabcb06ca3a9 | 2026-11-10T09:02:29.976055Z |
| arcus-attribution / 5695cae2becf35e049eb5df3e2849ae2 | 54921a7ce69c1ddd49e20d1e1b8cfc2f212e10e7 | ec6367e6-4281-44d9-a630-fcb1864c39c6 | 1eb27562-787a-4a3b-a9c2-b31afd60679a | 2026-11-10T09:08:58.712718Z |

The final two Attribution revisions are backward compatible with the already deployed Arcus packet. The first recovers unique verified name-only listings (empty candidates) without bypassing explicit candidate restrictions; it also recognises public-source cash/money-market labels. The second carries reference basis through the calculation and visibly distinguishes market-price references from verified imported total returns and mixed sources. It does not alter return values.

## Live validation and limits

Actual Brave desktop, DOM controls only, no desktop takeover. Root tested IBKR/WTAI, BAI/VOO, BAI/WTAI; design agent independently tested ARKK/QQQ in a separate public-only tab. Both freshly loaded Watchlist and Analysis showed WTAI +6.34% for November 9. Repeated comparisons reused the recent valid WTAI allocation check from 08:59:26 UTC, rather than writing/downloading holdings on every click. The live QQQ issuer check succeeded in Cloudflare at 09:00:54 UTC and retained November 8 holdings; the HTTP406 mentioned above occurred in the local source probe.

Public ETF one-day USD results on November 9:

| Fund | Observed market reference | Holdings subtotal | Reference less contributions | Measured weight coverage | Missing listed returns |
| --- | --- | --- | --- | --- | --- |
| WTAI | 6.34% | 4.76 pp | 1.59 pp | 99.71% | 0 |
| ARKK | 4.66% | 4.73 pp | -0.07 pp | 94.06% | 0 |
| QQQ | 3.54% | 3.39 pp | 0.15 pp | 99.83% | 0 |
| BAI | 6.14% | 5.76 pp | 0.39 pp | 92.07% | 0 |
| VOO | 2.35% | 2.55 pp | -0.20 pp | 99.85% | 1 |

Values are independently rounded; totals and residuals use unrounded numbers. Measured coverage excludes explicitly assumed non-listed returns; it is not a count of positions. WTAI's allocation totals 99.99% across 54 rows. The final BAI/WTAI footer showed allocation totals 100.03%/99.99% and contribution totals 5.76%/4.76%, matching the reconciliation cards. Verified Arcus theme memberships were populated; absent classifications remain explicitly Unclassified, not guessed.

WTAI's remaining 1.59 pp is not claimed to be fully reconciled or forced to zero. [WisdomTree's November 9 NAV return](https://www.wisdomtree.com/us/products/megatrends/wtai) was 4.94%, versus the 6.34% market reference. Thus about 1.40 pp separates market price and published NAV returns, while about 0.18 pp separates published NAV and the holdings estimate. This arithmetic comparison is not proof of the precise causes of the latter difference. The available complete fallback weights are dated November 5; the issuer website shows November 6 top holdings. Different close/valuation bases, cash income, changes in weights and trading can affect the estimate. No NAV time series or fabricated balancing contribution was added.

VOO's 0.05% Kenvue holding remains explicitly unavailable after its last October 30 price. [Kimberly-Clark confirmed the acquisition closed November 2 and KVUE ceased trading](https://www.investor.kimberly-clark.com/news-releases/news-release-details/kimberly-clark-completes-acquisition-kenvue-creating-preeminent). The September 30 source snapshot does not reconstruct the actual cash/stock transaction; the application does not invent its return or substitute KMB as though it were the same security. This is a documented attribution limitation.

Design agent verified sticky headers at internal scroll positions 436 and 11700.8, totals below 138 securities, and the upward boundary: Home returned the table to its first row while outer page position stayed unchanged; subsequent PageUp scrolled the outer page. Horizontal buttons exposed Theme after Difference and disabled at the correct boundary. SWIX selection chose ZAR; leaving SWIX restored USD. Dark mode text, headers and rows were visually readable. Long theme lists wrap and may increase row height. Public-only screenshot is retained outside Git at C:/Users/Skrom/AppData/Local/Temp/arcus-public-table-design-qa.png.

Final Attribution Node suite: 128/128 passed, including new reference-provenance tests; Python remains 21/21 (Python unchanged after its run). Watchlists full suite: 1038/1039, with only the unchanged TipRanks fixture failure; the final refresh/bridge subset passed 9/9. Anonymous requests to Analysis HTML, module and holdings data each returned 401. No physical device, Android emulator, mobile touch, complete historical-trade reconstruction or universal provider availability was tested or claimed.

Final application commits are the last deployment for each Worker in the table. Documentation-only receipt commits are not application deployments. Both release branches are pushed; original working branches and rollback points remain unchanged.


