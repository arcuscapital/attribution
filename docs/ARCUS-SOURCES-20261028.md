# Portfolio Analysis: existing Arcus holdings and returns — 28 October 2026

## Release identity and scope

Watchlists repository: https://github.com/arcuscapital/arcus-watchlists.git
Attribution repository: https://github.com/arcuscapital/attribution.git
Separate branches in both repositories: `codex/analysis-arcus-sources`.
Starting commits: Watchlists `4cda1d5be514142e5ccc51053293d109fbf39e2f`; Attribution `742f11741c1aa8d37523bbdaf878e7f529ae20d4`.
Application commits and final deployment receipts are recorded below after deployment.

Preserved starting live versions:

| Worker / account | Application commit | Version | Deployment / UTC |
| --- | --- | --- | --- |
| arcus-watchlists / 42dd726446271f45425eab740741b864 | 5497fbe8b35e8530d340d84ac6aac90f424d1324 | 2258132b-346d-4f1f-8213-8461cf8650f1 | 5a272bfe-5ecb-44dd-95cf-59c3ebc2604c / 2026-10-28T09:14:44.434706Z |
| arcus-etf-holdings / same Watchlists account | edad379a3c33c4fb21d60ae67eb09cdaf8df35bc | 2055a974-af46-412f-92f3-92299c564cb3 | 627b7583-c852-4624-9ad5-befc1f49d880 / 2026-10-27T09:32:45.20841Z |
| arcus-attribution / 5695cae2becf35e049eb5df3e2849ae2 | 5b4ccff6378436d8a69387229c663a0f01cfdc24 | 83af05c9-f4a0-42fb-bf20-fc7c751fe674 | 084f48a1-2a93-401b-90e7-e4525f60d169 / 2026-10-28T09:26:58.03077Z |

The integrated analysis reads the same saved portfolio feed and dated USD return facts used by Arcus. Portfolio quantities, account values and source credentials are excluded from the new response. ETF allocations retain weights, cash and explicit private holdings from Arcus's existing issuer downloads; the former constituent-only parser discarded weights. Name and ticker identity must agree with Arcus's resolved constituent or named company catalogue. This resolves the APH source spelling and stale OKTA candidate without accepting bare tickers. New route and catalogue enrichment remain behind existing Arcus authentication; existing HMAC bridge, separate standalone login, secrets and account bindings are unchanged.

A one-time desktop-only issuer fetch validates 45 complete ETF allocations and seeds optional main-D1 keys, avoiding issuer downloads during comparison. The remaining 19 ETFs retain their explicitly dated archive allocation if Arcus has names but no complete weights. Failed/blocked issuer sources and incomplete derivative weights are not treated as current complete allocations. Source dates are displayed, including when the issuer's latest published snapshot is older. All 64 ETFs plus four portfolio choices remain available. The existing nightly holdings job preserves complete weights for subsequent refreshes; it adds no job types, messages, schedules, collectors or price providers.

Current weights are applied to the selected period as a research comparison, not a reconstruction of historical trading. Recent exact-dated completed Arcus USD returns take priority; they are not described as verified dividend-reinvested total returns. If Arcus lacks the whole selected period for a security, its existing adjusted-price/same-date-FX fallback is used for the entire security period. No mixing of price bases or arbitrary filling of listed-share prices. Existing explicit zero-assumption option, retry control, themed selectors/coloured returns, readable typography, column order and white/gridlined Excel remain.

## Cloudflare Free constraints

Reviewed the previous **Investigate Cloudflare alert** chat and `cloudflare-history-recovery-20261027-release.md`, plus the earlier recorder CPU release. The former had 50 ms queue CPU terminations; HTTP allowance is distinct (10 ms). Their smaller history batches, shared queue budget, delayed pending-price retries and stored-history protections are unchanged.

Foreground comparisons use read-only SQL projections over the existing Arcus databases. Main has two additional bindings in the same Watchlists account: `ANALYSIS_HOLDINGS_DB` (88c82183-a003-458d-a696-3f8f2d029e32) and `ANALYSIS_PORTFOLIO_DB` (e3739600-2ab1-45cd-bb88-2cb5ff77ae08). They expose no public database access. The authenticated route returns only the selected portfolio's names/weights/verified identifiers/cash weights and exact dated return facts; SQL excludes quantities, account values, histories and credentials before the Worker receives them. Existing same-date saved cash weights are used when absent from the feed. Two D1 reads for a portfolio, three for an ETF, independent of constituent count. There are no service fetches, provider requests, queue sends or writes in this route. The browser performs indexed identity matching and validates source dates/weights. Catalogue dates use saved VOO history, avoiding a separate SPY fetch. Calculations and Excel generation remain in the browser.

The first production version succeeded but used 26 ms HTTP CPU for VOO (519 rows), 10:20:10.035 UTC, request `1a6a53284799910220302e7a919b3730`, trace `7536fad52c32280d54098f4667e0e244`, and 9 ms for IBKR. These readings were inspected in Brave and were **not accepted as adequate Free HTTP headroom**. The final revision moves projection/serialization to D1 and matching to the browser. The old heavy `data/arcus-holdings` endpoint returns a cheap authenticated 409 asking older open tabs to refresh; the new client uses `data/arcus-source`.

Local IJR 655-row parse benchmark (including existing constituent parsing plus optional weight capture): median 7.46 ms, p95 11.90 ms over 100 runs. This is local Node timing, **not Cloudflare CPU evidence**. Production CPU evidence and its limits are recorded below. Queue allowance is account-wide; no claim of zero additional read/HTTP usage or a full overnight run.

## Verification before release

Final CPU revision: 959 Watchlists tests and 78 Attribution JavaScript tests (pure source tests moved into the browser repository) pass. Builds passed for main, holdings and Attribution. New tests cover exact source weights and signed cash, private-data projection, named identity checks, private-preferred classification, duplicate verified listings, stale-weight refusal, bounded read-only source access, authentication/error redaction, compounding exact dated Arcus returns, whole-period fallback and repeat holdings reads. Existing UI/Excel/auth/holiday/assumption regressions remain passing.

Private production-data replay: IBKR 2026-10-27 (40 rows, 39 listed), BAI 2026-10-26 (53 rows, 46 listed). Every weight matches its actual source exactly. 73 unique Arcus series reused for 27 October; zero external price requests. Listed returns present; five report rows remain for USD cash, two private companies and Treasury fund income. Private fixtures and comparison values are excluded from Git/logs. Browser verification is Brave DOM automation only, with no native desktop takeover, emulator or physical-device claim.

## What the previously reported missing returns mean

| Security or source names | Plain-English cause and durable fix |
| --- | --- |
| SUSS MICROTEC SE; S.O.I.T.E.C. | The old comparison needed a separate closing-price/currency download. That data request was unavailable at the time. Reuse the dated Arcus return first; retry the existing price fallback only if the requested period is absent. |
| UNIMICRON TECHNOLOGY CORP / UNIMICRON TECHNOLOGY | Two source names for the same Taiwan listing. Use Arcus's verified listing and completed USD return. |
| ELITE MATERIAL CO LTD / ELITE MATERIAL | Two names for the same Taiwan listing. Reuse the verified Arcus return, including its currency conversion. |
| DELTA ELECTRONICS INC / DELTA ELECTRONICS | Same company under two source names. Use the verified Arcus listing/return rather than repeat a separate price request. |
| MACRONIX INTERNATIONAL CO | Taiwan-listed share. Arcus already has its dated USD return; use it first. |
| ASIA VITAL COMPONENTS | Taiwan-listed share. Reuse Arcus's verified dated return. |
| ASE TECHNOLOGY HOLDING | Taiwan listing must stay distinct from a US depositary receipt. Reuse the exact Arcus listing/return. |
| GLOBAL UNICHIP | Reuse Arcus's verified Taiwan listing and dated USD return. |
| CHROMA ATE INC | Reuse Arcus's verified Taiwan listing and dated USD return. |
| ACCTON TECHNOLOGY | Reuse Arcus's verified Taiwan listing and dated USD return. |
| ANTHROPIC SERIES G PREF EQ Prvt | Private preferred shares, not an exchange-traded stock. A price refresh cannot create a daily market quote. Use verified dated private valuations when available, or the explicitly labelled 0% research assumption. Now correctly classified as private. |
| OPENAI SERIES C PREF EQ Prvt | The same private-share valuation issue; do not substitute a public company ticker. Supply verified dated valuations or use the labelled assumption. |
| BLK CSH FND TREASURY SL AGENCY | A money-market fund. Its share value alone can hide interest paid as income. An exact return needs this share class's NAV plus distributions. Repeated stock-price retries cannot supply that. |
| USD cash | Cash interest is not a stock return. Exact contribution needs the account's accrued interest; a labelled 0% assumption can be used for research. |
| TWD CASH | Requires cash interest and the chosen reporting-currency effect. A missing data point is not proof of a holiday or zero return. In the current BAI allocation its weight rounds to zero, so it does not create a nonzero-weight return gap. |

Verified Taiwan/Tokyo holidays retain the earlier explicit calendar rule. Unknown missing prices never silently become holidays. At the user's subsequent request, these non-listed positions now use labelled 0% returns by default and sit at the bottom; a refresh cannot create an observed private valuation or cash-income record.

## Deployment and rollback order

Initial deployment: Attribution, holdings, Watchlists. For the CPU correction deploy main first to install the new route/module allowlist and bindings, then Attribution to use that route. Already-open older analysis tabs receive an explicit refresh instruction; a reload obtains the new client. Apply the public allocation transition seed before the new Watchlists source route is enabled. No migration or authentication change. Do not deploy notifications, maintenance, price workers or another account.

Rollback Watchlists first, holdings second, then optionally Attribution. In Watchlists checkout:

```powershell
Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
npx --yes wrangler@4.128.0 rollback 2258132b-346d-4f1f-8213-8461cf8650f1 --config cloudflare/wrangler.jsonc
if ($LASTEXITCODE -ne 0) { throw 'Main rollback failed' }
npx --yes wrangler@4.128.0 rollback 2055a974-af46-412f-92f3-92299c564cb3 --config cloudflare/wrangler.holdings.jsonc
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.jsonc --json
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.holdings.jsonc --json
```

In Attribution checkout:

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.128.0 rollback 83af05c9-f4a0-42fb-bf20-fc7c751fe674 --config wrangler.jsonc
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
```

Verify the specified accounts and versions at 100%. No KV archive/catalog rollback is required: all 68 original archive records remain untouched. Optional allocation fields/cache keys are ignored by old code. To remove just the one-time seed, in Watchlists with its normal account/auth run:

```powershell
node tools/seed-analysis-allocations.cjs --rollback C:/Users/Skrom/ArcusAttribution/private/arcus-sources/allocation-final
```

This verifies every backup and refuses to overwrite later changes. If Cloudflare expires an old version, rebuild/deploy the recorded application commit with its matching config and assets in an isolated checkout. Never discard existing secrets. Treasury-original `98c4a615-05c3-4213-bd07-f69702de43c9` / application `d51ae4d0a9757eb6ec2d0a969697f76fecface57` and graphs-only `42785cce-8059-4716-a5ef-882e5f47dc59` / application `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` remain preserved; see `portfolio-analysis-release.md` and `portable-release.md`.

## Listed-share focus follow-up

At the user's request, explicitly classified private/unlisted holdings, cash, money-market funds, derivatives and corporate-action positions now default to a labelled 0% return in the chosen reporting currency. Their source weights remain intact and they are placed after listed shares in the website and Excel. They are removed from missing-price errors and are not fetched as stock quotes. Measured coverage excludes assumptions. This is a research convention, not a claim about actual cash income, derivative performance or private valuations. Unresolved ordinary shares are never reclassified as private just because a request fails. Listed gaps remain blank unless the user selects the separate all-missing-zero option.

Current allocations may contain names absent from an older constituent index. The main SQL projection now includes current allocation tickers when selecting already-stored Arcus facts. Browser matching can also reuse a saved verified archive identity only when ticker and company name agree; it never copies archived weights or dates into the current allocation. This addresses AIRR/Willis Towers Watson mapping gaps while preserving cash-acquisition classifications.

The final follow-up passed all 959 Watchlists and 78 Attribution tests, including mixed listed/non-listed calculations, retained measured coverage, default-zero labels, bottom ordering in Excel, strict archive identity matching and current-seed quote selection. Final live receipts and Brave results follow after deployment.


Classifier evidence: ARK's [Q3 2026 issuer update](https://www.ark-funds.com/articles/etf/q3-26-market-update-summary) identifies OpenAI and Kalshi as private-company exposures. The source identities PPOPENAIC and PPKALSHIC are matched together with their exact names; a generic Private/Unmapped archive label alone does not establish private status. [Goldman Sachs' fund facts](https://am.gs.com/public-assets/documents/b7a57c0f-24de-11ef-ad18-bdd12dea47d8) identifies Treasury Obligations as a money-market fund. WTS, CVR, TRS and futures source descriptions are classified separately from ordinary shares. Currency balances and receivables/payables are retained with the user's labelled zero convention.


## Production receipts

All application commits below were pushed to the repository and branch identified above. Documentation-only receipt commits do not change deployed application content. Existing authentication, bridge secrets and account boundaries were preserved. The final compatible classification client was deployed in Attribution; the main SQL source revision remains independently compatible. No changes were deployed to notification, maintenance or price Workers.

| Worker | Full application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- |
| Watchlists, first source revision | 76700ccd058dc7257bb016d541f25f8dd08240fe | 642e49b6-9046-433a-a7f1-7311cee9335f | d453d8d4-da27-42c8-bb7d-c6fd00d2e8ac | 2026-10-28T10:16:12.827726Z |
| Watchlists, SQL projection | 8b1e925c439c1e5a674b3744f4cc94f04ebc7490 | 73251e7f-bde4-4129-b8db-fe61e90f330f | be7df562-b441-433c-8f36-c75896e2d6f7 | 2026-10-28T10:31:34.773588Z |
| Watchlists, FINAL | e31885d1cf4289576f00fd0d6e2531946f92c006 | b98930b6-77c4-45ee-a013-158f63073a3f | 1944f8e3-11d7-46d1-8bab-bf6172def319 | 2026-10-28T10:59:55.501402Z |
| Holdings, FINAL | 76700ccd058dc7257bb016d541f25f8dd08240fe | 46c834e2-242c-46e0-909b-68d43b47f93c | 27363034-03b6-4036-9890-0ee2676d7501 | 2026-10-28T10:15:35.847266Z |
| Attribution | 73f4617f5542af340b4523b0712fba1126f342f0 | 3a46616c-280a-4428-96b6-db61d57cebaa | 5838262d-8440-42d6-9b82-ed3c000a4313 | 2026-10-28T10:14:47.487228Z |
| Attribution | e4c5f4ab317af1f0c8a1018dff35b7b11cdcb5c5 | 5a38263a-9b11-44f7-ad29-77da0b988b12 | 7a108bb7-8cd8-4d9f-8a26-bd03784e57cf | 2026-10-28T10:19:02.676482Z |
| Attribution | 6f9d529418083e4670b95c02075b6a8bb1010eb9 | 2aefa16f-a5f3-48e2-96b9-ad9f9eb509da | 2e7cdb33-1620-42b9-8dc6-b4a95623c4f6 | 2026-10-28T10:32:20.382933Z |
| Attribution | f814414c8b40931ca8158e00c7ae6c7b345988f8 | 5804601a-c92c-4342-b077-b59a1d232279 | 6101c718-aada-411d-88ca-d8e5aee94eff | 2026-10-28T10:39:18.143167Z |
| Attribution | 593124eafad2ec7dbdfa73dd95cb3d52a0a1c194 | a9e5b434-ad78-4060-8006-c3a483ecf9e4 | b421d559-647e-4166-b522-bea0664dcdaa | 2026-10-28T10:59:23.607790Z |
| Attribution | 72f739b9fa8e9375fc83172b164ee81d68f2c463 | 9468f617-e42f-4b42-a626-463ede5b1350 | 5d1f9e53-d74a-4f47-aa63-3c92723ba872 | 2026-10-28T11:02:34.839766Z |
| Attribution, FINAL | 02836dbaa5b3f81f07cfeb0ab4f826ece2b90b16 | 1199d83b-3cb7-4fb2-ba7d-cd6a8bfbab7f | 5a0fa4f3-d26e-476f-9301-c468d722b61c | 2026-10-28T11:06:52.802987Z |

## Final Cloudflare CPU evidence

Brave Cloudflare Observability showed successful requests for final main version b98930b6-77c4-45ee-a013-158f63073a3f:

| Source | UTC | CPU ms | Wall ms | Request ID |
| --- | --- | ---: | ---: | --- |
| VOO | 2026-10-28T11:00:56.497Z | 8 | 1736 | 5d375f9d19ea1add8a2d0d182776b7de |
| VOO | 2026-10-28T11:02:41.330Z | 3 | 1172 | d4eb817d0db47652e96595cd779ad9c4 |
| IBKR | 2026-10-28T11:01:44.275Z | 2 | 370 | a309cc17fcfeab81db6b4e5ebee82189 |
| BAI | 2026-10-28T11:01:44.297Z | 2 | 387 | 580f263b831c0c4be89f5ae01889bebd |

Earlier SQL revision 73251e7f also measured VOO 8/9 ms, IBKR 1 ms and BAI 2 ms. This confirms improvement over the initial 26 ms VOO request for the samples observed, not a guarantee about every cold request or unrelated overnight jobs. Database read time and network wall time are not Worker CPU. No new background jobs or price collectors were added.

## Source coverage and honest limits

Brave checked all 64 ETF source endpoints successfully; all four portfolios were exercised in full comparisons. Forty-five ETFs have complete issuer allocations retained in Arcus. Nineteen still use an explicitly dated archive allocation because current whole-fund issuer weights could not be obtained/validated: AIQ, FINX, SHLD, EART, IVES, IVEP, QQQ, IGPT, WCLD, WTAI, FFLS, UFO, TIME, GPT, URA, BOTZ, LIT, PAVE, IJR. The endpoint audit confirms responses and source shape; it does not claim every security in all 64 ETFs has a complete return for every period. VOO's source allocation remains its published 30 September snapshot; dates are not relabelled as today.

Weave Communications (WEAV) remained a listed-share price gap in the EasyAI/WCLD one-day comparison. The manual Retry missing prices action was exercised in Brave and the provider still did not supply the required completed adjusted-price interval. This pre-existing provider gap is documented in the history-recovery release. It remains visible and blank by default; the separate explicit missing-zero option may include a labelled estimate. No missing open-market price was misrepresented as a holiday.


## Final Brave and Excel verification

Production final client 02836dbaa5b3f81f07cfeb0ab4f826ece2b90b16, main e31885d1cf4289576f00fd0d6e2531946f92c006; one-day USD interval 27 October 2026:

| Comparison | Listed-share result | Displayed rows | Labelled non-listed zero rows |
| --- | --- | ---: | ---: |
| IBKR / BAI | No listed-share return gaps | 77 | 5 |
| IBKR / Marlow | No listed-share return gaps | 46 | 1 |
| Marlow / AIRR | No listed-share return gaps; prior unresolved AIRR listings recovered | 85 | 2 |
| EasyGE / VOO | No listed-share return gaps | 538 | 19 |
| EasyAI / WCLD | WEAV missing after manual retry; explicit archive allocation warning remains | 97 | 3 |
| ARKK / SOXX | No listed-share return gaps | 72 | 6 |
| RSP / VOO | No listed-share return gaps | 527 | 23 |

These are real Brave DOM/browser checks, not Chrome, native PC control, emulator or physical-device tests. Final selectors contain 68 choices (64 ETFs plus four portfolios), bold theme headers (700), Arcus green/red daily returns (rgb 14,122,61 / 192,52,60), Segoe UI table font and dark text (rgb 23,33,47). Security return precedes Active weight, including the two-portfolio comparison. Non-listed rows stay at the bottom and show Assumed 0%. Current source dates remain visible; archived fallback dates are explicitly identified.

All 959 Watchlists and 78 Attribution automated tests passed. A final synthetic XLSX generated by the actual exporter was reopened as OOXML: valid worksheet XML, showGridLines=1, fillId=0 for every data-row text/numeric style, Security return column D before Active weight E, and the assumed-zero row placed last even when supplied first. No native Excel session or new browser blob download is claimed; the browser connector cannot capture those downloads. Existing earlier workbook verification and export regression tests remain applicable.

Anonymous Node HTTP checks returned 401 with private, no-store for the analysis root, arcus-source.mjs, catalogue and VOO source route. Python urllib requests were blocked earlier by the edge with 403; those are not presented as authentication-engine evidence. No private portfolio values, cookies, tokens or raw request headers were committed.
