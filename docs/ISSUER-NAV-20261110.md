# Issuer NAV, 1D comparison

Adds a separate dated issuer NAV per-share change beside the existing market return and holdings contribution subtotal. Missing, inaccessible, mismatched-date or unsupported data displays `No data`. NAV less contributions and market return less NAV make the two comparisons explicit. This is NAV price change excluding distributions, not a verified distribution-reinvested total return.

Only a foreground single-session Compare fetches NAV for its selected ETFs. Public issuer observations may be cached for 15 minutes. Fixed official source URLs, bounded responses/workbooks and exact dates prevent market-price substitution or accidental date carry-forward. USD is native; ZAR conversion requires both exact comparison FX dates. Longer comparisons, attribution engine, saved holdings and existing authentication remain unchanged. No collector, queue, cron, schema migration or new secret is introduced.

## Repositories and preserved starts

- Attribution: https://github.com/arcuscapital/attribution.git, branch `codex/nav-1d-attribution-20261110`, starting commit `658788157c84ff47098d9119b3b5b80e988144b9`.
- Watchlists: https://github.com/arcuscapital/arcus-watchlists.git, branch `codex/nav-1d-watchlists-20261110`, starting commit `cb57c37ca032a0ff60195bc1b62405365b992ed6`.
- Attribution previous application: `54921a7ce69c1ddd49e20d1e1b8cfc2f212e10e7`; version `ec6367e6-4281-44d9-a630-fcb1864c39c6`; deployment `1eb27562-787a-4a3b-a9c2-b31afd60679a`, `2026-11-10T09:08:58.712718Z`.
- Watchlists previous application: `26733201ac5b64495da6c1c4a9b5412e85b1f906`; version `3f590f34-e6d1-460b-9c34-4fbe00374e0a`; deployment `3b222fe2-f468-4157-bc55-5df582891de7`, `2026-11-10T09:20:43.148573Z`.

## Compatibility and order

Deploy Attribution first, Watchlists second. The signed `data/nav` route uses the existing `ANALYSIS_BRIDGE_KEY`; exact queries are signed, cookies are not forwarded, and the Marlow-only restriction also covers NAV. Existing standalone password secrets, LOGIN_LIMITER and HOLDINGS_ARCHIVE remain required. No credentials or private reports belong in Git or release logs.

Attribution account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`, config `wrangler.jsonc`; use `XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth`. Watchlists account `42dd726446271f45425eab740741b864`, Worker `arcus-watchlists`, config `cloudflare/wrangler.jsonc`; remove that XDG override before deploying Watchlists. Use Wrangler 4.128.0.

## Validation before deployment

- Attribution Node: 140/140; Python: 21/21.
- NAV coverage: current-page and history parsers, exact dates, positive/negative/zero values, NAV vs market column separation, malformed compressed workbook bounds, fixed URL requests, unavailable issuer/cache behavior, FX conversion, authenticated signed route, UI missing-data and longer-period guards.
- Both Worker dry runs passed. Watchlists asset manifest and whitespace checks passed. Live issuer access and Brave UI checks are recorded after deployment; fixtures do not establish live coverage.
- Desktop Brave testing is not physical-device, Android or emulator testing. The broader unrelated TipRanks fixture is outside these targeted checks.

## Exact rollback

Rollback Watchlists first, then Attribution, preserving secrets and bindings:

```powershell
# In the Watchlists worktree
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
npx --yes wrangler@4.128.0 rollback 3f590f34-e6d1-460b-9c34-4fbe00374e0a --config cloudflare/wrangler.jsonc --message 'Rollback issuer NAV 1D'
npx --yes wrangler@4.128.0 deployments status --config cloudflare/wrangler.jsonc --json
# In the Attribution worktree
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.128.0 rollback ec6367e6-4281-44d9-a630-fcb1864c39c6 --config wrangler.jsonc --message 'Rollback issuer NAV 1D'
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
```

Do not reset either user's working branch. Preserve Treasury-original application `d51ae4d0a9757eb6ec2d0a969697f76fecface57` / Worker `98c4a615-05c3-4213-bd07-f69702de43c9`, and graphs-only application `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` / Worker `42785cce-8059-4716-a5ef-882e5f47dc59`.

## Deployment receipt

Final production application versions (100% traffic):

| Application | Repository / branch | Full application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- | --- |
| Attribution | https://github.com/arcuscapital/attribution.git / `codex/nav-1d-attribution-20261110` | `2e492aeb0d4f73cb8ae4fb3ec221ca0349bd47ab` | `90a65ba3-0665-44ef-8de3-688e10bbd4ad` | `ce067e92-1b9e-4652-9a8d-26054a3315b2` | `2026-11-10T10:34:39.921239Z` |
| Watchlists | https://github.com/arcuscapital/arcus-watchlists.git / `codex/nav-1d-watchlists-20261110` | `cf5b2e54cd12ac7434836f691768cb9072316692` | `9b88dcb0-53f2-4a50-af81-db649d82f609` | `950a68c5-18c9-4b1a-b913-04678be12142` | `2026-11-10T10:21:42.970925Z` |

Initial Attribution deployment: application `2facaa232e4f6bfaee83b019f4df20a7bb88d9e8`, version `302ebb9e-436b-4b28-8d1e-019323f04762`, deployment `ed622ea8-ff24-4169-871e-bf7f30c508cd`, UTC `2026-11-10T10:21:14.191833Z`. Live testing caught Workers rejecting `redirect:error`; all NAV sources therefore safely returned No data. The correction uses supported `redirect:manual` and rejects non-2xx responses, retaining the no-redirect policy. Roundhill's canonical lowercase CSV paths were also corrected.

Runtime correction: application `dd22ca9a20781b435b4c29eaf9f482656455c0a4`, version `5eb0e1cc-9ddf-4412-8666-d864c01bc90e`, deployment `0b8d039b-db3c-4f5a-8ac5-ffe22fdd048d`, UTC `2026-11-10T10:27:27.266468Z`. The final application above additionally uses IBB's current canonical issuer URL. Watchlists remained compatible throughout. No database, secret, holdings archive, existing queue or cron configuration changed.

## Completed validation and limits

- Final Attribution application: Node 140/140. Python 21/21 passed before the subsequent issuer-request-only corrections; Python code was unchanged. Watchlists targeted analysis/bridge tests: 29/29. Both builds, asset manifest and whitespace checks passed.
- Local Workers-runtime probe reproduced the unsupported redirect mode, then successfully fetched and parsed iShares, Global X, State Street, First Trust and Roundhill sources. The pinned local runtime supports compatibility dates through 2026-09-07; production uses 2026-10-01. Final verification therefore also used the deployed Workers.
- Actual Brave desktop, dark mode: IBKR/WTAI, BAI/CHAT and ARKK/WTAI comparisons; USD and ZAR; repeated Compare; month-to-date comparison without 1D NAV rows. ARKK displayed No data while its existing market return and contributions remained available. Browser console had no errors at completion.
- All 44 configured issuer sources were requested through the authenticated live route for 2026-11-09 against 2026-11-06. 43 returned valid dated NAV changes. XLI returned No data from the deployed source despite its local issuer workbook parsing successfully. This is a point-in-time access check, not a guarantee of future issuer availability. The remaining 35 of 79 ETFs have no configured verified NAV adapter and return No data; ARKK was checked live as an example.
- Live dated-source isolation: BAI's current-only source returned No data for 2026-11-06, while XLK history returned the exact 2026-11-06 change against 2026-11-05. No newer observation was carried backward.
- Live WTAI on 2026-11-09: market return 6.34%, issuer NAV per-share change 4.94%, holdings contribution subtotal 4.76 pp, NAV less contributions +0.18 pp, market return less NAV +1.40 pp. Gaps use unrounded values; separately rounded rows can differ by 0.01 pp.
- Unauthenticated requests to both integrated and standalone NAV routes returned 401. Existing signed-query and Marlow fund-scope restrictions passed tests. No auth cookies or secrets were exported to tests or issuer requests.
- No physical device, Android emulator or Android release was tested. The full unrelated Watchlists suite was not rerun; no assertion is made about its earlier TipRanks fixture result.
- Public-data live screenshot and local history artifacts are outside Git at `C:/Users/Skrom/OneDrive - FIRST WORLD TRADER (PTY) LTD/Documents/Arcus Research/NAV History 2026-11-10/`.

## Local historical research only

`Arcus NAV history.html` is a self-contained local table with 81,277 dated observations: 19 multi-year issuer histories, plus current-month AIRR and QQEW data. The table includes all 79 ETF identities, exact summary endpoints, missing-data labels, issuer links, daily pagination, a separate raw-observation JSON and a 60-fund Bloomberg request list with names. WTAI/WCLD pre-inception observations were excluded using issuer inception dates.

Five confirmed 2:1 splits effective 2025-12-05 (XLB, XLE, XLK, XLU, XLY) are adjusted in this local table using the [State Street notice](https://www.ssga.com/library-content/products/fund-docs/etfs/us/information-schedules/ap-notice/notice-to-aps-stock-splits-11-21-25.pdf). Three older large jumps remain unavailable pending confirmation. These local calculations do not include distributions and are not NAV total returns. No historical data or longer-period feature was deployed.

Local table checks in Brave covered missing BAI history, 60-fund coverage filtering, exact WTAI 1D calculation, XLK split-day +0.75% instead of its raw per-share drop, SLYV unresolved-jump No data, pagination and visual layout. The page was served only on loopback for testing; the delivered HTML embeds its observations and has no external script/data dependency. Longer-period rollout is recommended only for verified histories after distribution/corporate-action reconciliation.

This receipt is documentation only. Production application commits are the exact IDs in the deployment table; the subsequent receipt commit is not a new application deployment.
