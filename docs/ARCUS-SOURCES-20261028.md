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

Current weights are applied to the selected period as a research comparison, not a reconstruction of historical trading. Recent exact-dated completed Arcus USD returns take priority; they are not described as verified dividend-reinvested total returns. If Arcus lacks the whole selected period for a security, its existing adjusted-price/same-date-FX fallback is used for the entire security period. No mixing of price bases or arbitrary zero filling. Existing explicit zero-assumption option, retry control, themed selectors/coloured returns, readable typography, column order and white/gridlined Excel remain.

## Cloudflare Free constraints

Reviewed the previous **Investigate Cloudflare alert** chat and `cloudflare-history-recovery-20261027-release.md`, plus the earlier recorder CPU release. The former had 50 ms queue CPU terminations; HTTP allowance is distinct (10 ms). Their smaller history batches, shared queue budget, delayed pending-price retries and stored-history protections are unchanged.

Foreground comparisons use read-only SQL projections over the existing Arcus databases. Main has two additional bindings in the same Watchlists account: `ANALYSIS_HOLDINGS_DB` (88c82183-a003-458d-a696-3f8f2d029e32) and `ANALYSIS_PORTFOLIO_DB` (e3739600-2ab1-45cd-bb88-2cb5ff77ae08). They expose no public database access. The authenticated route returns only the selected portfolio's names/weights/verified identifiers/cash weights and exact dated return facts; SQL excludes quantities, account values, histories and credentials before the Worker receives them. Existing same-date saved cash weights are used when absent from the feed. Two D1 reads for a portfolio, three for an ETF, independent of constituent count. There are no service fetches, provider requests, queue sends or writes in this route. The browser performs indexed identity matching and validates source dates/weights. Catalogue dates use saved VOO history, avoiding a separate SPY fetch. Calculations and Excel generation remain in the browser.

The first production version succeeded but used 26 ms HTTP CPU for VOO (519 rows), 10:20:10.035 UTC, request `1a6a53284799910220302e7a919b3730`, trace `7536fad52c32280d54098f4667e0e244`, and 9 ms for IBKR. These readings were inspected in Brave and were **not accepted as adequate Free HTTP headroom**. The final revision moves projection/serialization to D1 and matching to the browser. The old heavy `data/arcus-holdings` endpoint returns a cheap authenticated 409 asking older open tabs to refresh; the new client uses `data/arcus-source`.

Local IJR 655-row parse benchmark (including existing constituent parsing plus optional weight capture): median 7.46 ms, p95 11.90 ms over 100 runs. This is local Node timing, **not Cloudflare CPU evidence**. Production CPU evidence and its limits are recorded below. Queue allowance is account-wide; no claim of zero additional read/HTTP usage or a full overnight run.

## Verification before release

Final CPU revision: 959 Watchlists tests and 75 Attribution JavaScript tests (pure source tests moved into the browser repository) pass. Builds passed for main, holdings and Attribution. New tests cover exact source weights and signed cash, private-data projection, named identity checks, private-preferred classification, duplicate verified listings, stale-weight refusal, bounded read-only source access, authentication/error redaction, compounding exact dated Arcus returns, whole-period fallback and repeat holdings reads. Existing UI/Excel/auth/holiday/assumption regressions remain passing.

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

Verified Taiwan/Tokyo holidays retain the earlier explicit calendar rule. Unknown missing prices never silently become holidays. The remaining private/cash gaps cannot be eliminated honestly by a refresh button alone.

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
