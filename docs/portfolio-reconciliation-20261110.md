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

