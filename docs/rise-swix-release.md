# Rise / Swix ZAR release — 6 November 2026

Rise (Port) and Swix (Bmrk) now have an isolated comparison view in Portfolio Analysis. Names and tickers are rows; Avg % weight, Total return and CTR each have Port/Bmrk columns. Twelve sectors start collapsed. Currency is locked to ZAR for 1D, Live, presets and custom dates. 1D remains the default, with Live immediately below it. Other comparisons retain their existing layout and currency choices.

## Repositories and verified starting versions

Both repositories use separate `codex/rise-swix-zar` branches and isolated worktrees; both branches are pushed.

| Application | Repository | Starting branch / full checkout commit | Starting deployed application |
| --- | --- | --- | --- |
| Watchlists | https://github.com/arcuscapital/arcus-watchlists.git | `claude/analyst-target-history` / `bdf298dc142511b0d5e625826745c15afebec5ec` | `4ac1766fcac46622258408740ac07e125f64c86b` |
| Attribution | https://github.com/arcuscapital/attribution.git | `codex/analysis-ticker-links-20261105` / `4f08181a31a1811d0558bd3d4e246d22fca1b75f` | `fd15826d1612c1124beaea40280f236f0c47344f` |

The Watchlists application retains the custom-chart-dates and analyst-target-history releases. Git ancestry of `4ac1766` was rechecked after deployment.

Starting Watchlists deployment: account `42dd726446271f45425eab740741b864`, Worker `arcus-watchlists`, version `5f5c384e-7cfe-41a8-8fea-c03a6f371a83`, deployment `0a163330-f9d9-4357-ac90-c807b67a0a45`, UTC `2026-11-06T13:51:23.464701Z`, 100%.

Starting Attribution deployment: account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`, version `d0a244c3-3bd7-4f4c-8f19-892f4df6018b`, deployment `4c980288-6578-4787-9aca-5fd99071e6f0`, UTC `2026-11-05T12:31:23.639016Z`, 100%.

## Deployments

All deployments below serve 100%. Attribution was deployed first, then the Watchlists bridge; subsequent changes affected Attribution only. The final active pair is the Watchlists bridge row plus the final Attribution row.

| Application stage | Full application commit | Deployment UTC | Worker version | Deployment ID |
| --- | --- | --- | --- | --- |
| Attribution initial | `352c366e5dee11a1ed9c2b926bb9e0f0bd8c0c13` | 2026-11-06T14:27:08.070337Z | `693d1082-2cdc-4259-b438-703bce16af55` | `7bf694f1-5cee-401c-93f8-111a829ea2df` |
| Watchlists bridge | `69c1824a5e16b0683e5db02ba2226849e22bce48` | 2026-11-06T14:27:54.501556Z | `e39c15cd-0484-4bb5-9399-11c2327180ce` | `caa99350-9211-4b3d-9f88-4f1e57cde694` |
| Attribution design/history | `60cb4fbeed3b172d832b9a7b4a0a13759ea3ec21` | 2026-11-06T14:37:08.37787Z | `1b353f4a-128b-4e35-a48e-9941ccaf2507` | `8cc0c445-46f7-48a2-99a5-9eb6369de4b2` |
| Attribution final / bounded batches | `45fa68f33c72560d030487b4fb990ba573945adb` | 2026-11-06T14:41:36.268532Z | `68cc4fdb-094f-45d3-b7ac-4efa4cb2cdd2` | `71f0c3b7-bc5e-4134-8990-fa7b1eeacb08` |

Documentation commits after these application commits are not additional deployments.

## Data, estimates and privacy

The owner's November 4–5 workbook is imported with `tools/import-rise-swix.py`. It supplies 12 sectors and 127 detail rows, including cash; 126 unique listed quote symbols. Source blanks and source sector totals remain intact for the exact reported period. JSE calendar handling includes the November 4 holiday, so the corresponding completed one-day report also uses these reported figures.

The private JSON is held in the existing Attribution `HOLDINGS_ARCHIVE` namespace `98da8aed88f9416d84a9497daed06dc5` under `rise-swix:report:v1`. `rise-swix:ready` enables catalog discovery. Its upload was read back and compared byte for byte. Neither the workbook nor imported holdings are in Git, static assets or release evidence. Public source code contains only the importer and synthetic tests.

Other periods are explicitly labelled estimates: report average weights are assumed across the period, trades/actual historic average weights are not reconstructed, and ZAR cash assumes zero income. Securities use vendor-adjusted prices, except NEWSLV and SBCOP: Yahoo has current quotes but no usable daily history for these two ETNs. The isolated, allowlisted fallback reads their public Sharenet closing-price history, checks symbol identity and exact endpoints, and labels their returns as price-only estimates. No dollar-denominated commodity proxy is substituted. Price ratios remain ZAR returns whether the listing is quoted in rand or cents. Unavailable endpoints fail the complete valuation; no listed holding is dropped or assumed flat.

Live uses the existing authenticated quote-shard route and a browser worker for calculation. Four batches, at most 32 symbols each, share a cycle ID; all must succeed before holdings, sector results and both totals are committed together. A missing/stale quote retains the previous complete snapshot and its timestamp. Updates target 35 seconds start-to-start, never overlap, and stop when the tab is hidden or selection/session changes. There are no 6-second partial row updates for this pair. Quotes are fetched together, but exchange trade timestamps naturally differ; provider prices may be delayed. Live is a price-return estimate and excludes intraday distributions.

## Authentication and compatible configuration

Existing Arcus login, Attribution standalone login and matching `ANALYSIS_BRIDGE_KEY` remain unchanged. New modules and private data use the signed fixed-origin bridge; browser cookies and bridge credentials are not forwarded to the market-data provider. Responses carrying the report are private/no-store. The restricted Marlow-only login does not receive the Rise/Swix catalog entries and is denied the private report route.

The catalog capability flag prevents the Attribution-first deployment from loading new modules through an older Watchlists bridge. No D1 migration, new Worker, cron, queue, background collector or scheduled task was added. Existing unrelated cron/queue bindings were preserved; this release does not start extra background work.

## Validation and limits

- Watchlists: `node --test test/*.test.js` — 1,014/1,014 passed. The prior extended-hours failure was an incomplete VM fixture: the existing analyst-price refresh callback is now stubbed in that fixture; application logic was not altered.
- Attribution: `node --test tests/*.test.mjs` — 93/93 passed after the history fallback. The final batch-size change then passed all 15 affected core/data tests and the browser harness.
- Both Wrangler dry runs passed; Watchlists asset-manifest check passed. Source reconciliation checks covered every source sector and total. All 126 Yahoo listing identities/currencies were checked; this is not a claim of independent ISIN verification for every listing.
- An isolated headless Edge fixture exercised reported 1D, historical estimates, Live, failed refresh retention, ZAR enforcement, collapsed/expanded sectors, CSV export and exit back to an ordinary fund. Core tests separately exercised all four quote batches and cycle-identity rejection. Desktop and 390px CSS viewport assertions passed; no horizontal document overflow.
- Production signed-in Brave checks: Rise auto-pairs with Swix; reload defaults to 1D; eight columns and 12 collapsed sectors; reported source, live snapshots, month-to-date and custom 2–5 November estimates render in ZAR. Live updates were observed 35 seconds apart. The final 32-name batch version produced a complete result. Strong group dividers, positive green and negative red were inspected after the design-agent pass. A narrow desktop viewport retained eight columns with sticky names; temporary viewport override was reset.
- Anonymous production requests to the private report, new module, standalone report and unsigned bridge report returned 401/private-no-store. Marlow-only denial and session/failure paths are covered by tests. No real production logout, full-duration expiry or premarket wall-clock session was exercised.
- The requested design agent worked after initial deployment and changed only the scoped Rise/Swix CSS. It also corrected the mobile Port subheader being frozen as if it were the Name column.
- No Android emulator or physical device was tested in this release. The browser CSV download test passed using synthetic data; production browser automation did not complete its download-event observation, so no production-download success is claimed.

## Cloudflare CPU evidence

Calculations run in the browser; historical fetches use three concurrent one-symbol requests, and the two ETN histories are cached for 15 minutes. The final Live batch bound is 32 names to reduce parsing/formatting CPU per quote-service invocation. Multiple visible browser tabs can still generate independent demand; this is not a cross-tab collector or a hard account-wide budget cap.

Cloudflare GraphQL sampled metrics, UTC 14:28:00–14:39:42 (includes other traffic and the initial 64-name batches):

| Worker | Requests | CPU p50 | CPU p95 | CPU p99 | Reported errors |
| --- | ---: | ---: | ---: | ---: | ---: |
| arcus-attribution | 282 | 1.084 ms | 2.002 ms | 3.461 ms | 0 |
| arcus-watchlists | 326 | 0.777 ms | 2.817 ms | 11.899 ms | 0 |
| arcus-visible-prices | 25 | 2.847 ms | 8.159 ms | 10.561 ms | 0 |

These are sampled, whole-Worker metrics, not per-route maxima or a guarantee. The existing account already had requests over 10 ms before deployment (Watchlists p99 18.689 ms, visible-prices p99 12.093 ms in the earlier 13:54–14:24 sample). The current Paid account is operating without sampled errors, but **the whole account cannot be certified to stay within Free limits**. The final 32-name bound adds headroom for this feature; unrelated background workloads were not retuned. Route-level Observability API inspection was unavailable to the current CLI token (403); no broader permission was requested or granted.

After the final batch reduction, the 14:43:00–14:46:58 UTC sample recorded Attribution p99 2.755 ms (23 requests), visible-prices p99 9.985 ms (25 requests), and Watchlists p99 10.455 ms (58 requests), all with zero reported errors. These are again mixed-traffic sampled values, so the Free-limit caveat remains.

Cloudflare's [documented Free HTTP CPU limit](https://developers.cloudflare.com/workers/platform/limits/) is 10 ms; network waiting does not count as CPU. Reducing server CPU does not guarantee the separate daily account request allowance under arbitrary traffic.

## Exact rollback

Rollback Watchlists first, from the Watchlists checkout. This retains the analyst-history/custom-chart-dates baseline and removes the new catalog/bridge capability:

```powershell
Set-Location 'C:/Users/Skrom/ArcusRiseSwix/watchlists'
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
$env:XDG_CONFIG_HOME=Join-Path $env:APPDATA 'xdg.config'
npx --yes wrangler@4.129.0 rollback 5f5c384e-7cfe-41a8-8fea-c03a6f371a83 --config cloudflare/wrangler.jsonc --message 'Rollback Rise Swix to analyst-history baseline'
npx --yes wrangler@4.129.0 deployments status --config cloudflare/wrangler.jsonc --json
```

Then optionally restore Attribution's preceding release under its separate account/auth directory:

```powershell
Set-Location 'C:/Users/Skrom/ArcusRiseSwix/attribution'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.129.0 rollback d0a244c3-3bd7-4f4c-8f19-892f4df6018b --config wrangler.jsonc --message 'Rollback Rise Swix analysis'
npx --yes wrangler@4.129.0 deployments status --config wrangler.jsonc --json
```

Do not reverse that order: the new bridge expects the new Attribution modules. The two new KV keys may remain inert after rollback; no data deletion or database rollback is required. Keep all existing authentication secrets and namespace bindings. Verify the normal signed-in comparison and anonymous 401 after rollback. If version retention prevents direct rollback, create clean checkouts of the exact starting application commits above and deploy matching assets/configuration in the same Watchlists-first rollback order.

To restore this release, deploy Attribution application `45fa68f33c72560d030487b4fb990ba573945adb` first, verify the private report/readiness keys, then Watchlists `69c1824a5e16b0683e5db02ba2226849e22bce48`, using the respective account/auth settings above.

Preserved earlier rollback landmarks: Treasury-original `98c4a615-05c3-4213-bd07-f69702de43c9` / application `d51ae4d0a9757eb6ec2d0a969697f76fecface57`; graphs-only `42785cce-8059-4716-a5ef-882e5f47dc59` / application `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091`. These were not deployed or modified. See `docs/portfolio-analysis-release.md`, `docs/portable-release.md` and `docs/analyst-forecasts-release.md` in Watchlists for their original release context.
