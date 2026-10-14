# Listed Japanese share returns — 14 October 2026

## Repositories and scope

Changed repository: https://github.com/arcuscapital/attribution.git, branch `codex/listed-holiday-returns`, preserved starting commit `70c78e065e5de963e7a67b86cf2d7606dbd1e132`.

Unchanged integration: https://github.com/arcuscapital/arcus-watchlists.git, branch `codex/portfolio-weighted-excel`, current commit `bc4a33e281d314262ba3fa85dfb0757f8537793f`, deployed application `0b47f75217b6584d92d86c9bfaa1c11488fe84d4`. Arcus account `42dd726446271f45425eab740741b864`, Worker `arcus-watchlists`, version `5e4ab4b7-76ce-4e41-9317-407ae23dec22`, deployment `6f62abd2-171a-43f9-baeb-652848a0f48a`, UTC `2026-10-14T10:03:12.550245Z`. No Arcus deployment is needed: existing authenticated module/data paths are unchanged.

Attribution account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`. Previous application `3dbcf41b2af49c9a5aedb91ce24f149a94cba830`, version `a34930dd-b5ac-4f9a-b7f7-ecb9185abfe0`, deployment `7189d0df-940f-452a-9bd0-fd0f3ba6009b`, UTC `2026-10-14T10:09:34.13475Z`. Final application commit and deployment evidence will be recorded in a documentation-only follow-up after release.

## Cause and correction

Resonac and Ibiden were already mapped to `4004.T` and `4062.T`. The missing returns were caused by requiring a 12 October adjusted close when Tokyo's cash-equity market was closed. Public price histories contain 9 and 13 October closes. The [official JPX calendar](https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html), checked 14 October, confirms Sports Day on 12 October. This is separate from derivatives holiday trading.

The online adapter now values Tokyo-listed shares on verified 2026–2027 closed dates using the immediately preceding open session's local adjusted close and the valuation date's observed FX. It checks `.T` identity, JPY currency and Asia/Tokyo timezone. It does not interpolate, cross a missing open session, backfill pre-listing history, substitute raw equity prices, or fill absent FX. Other markets/years remain exact-date-only. The existing completed-day exclusion, two-request concurrency, 15-minute cache, calculation engine, saved weights and two-sheet Excel format remain intact. Calendar maintenance will be needed before expanding supported years/markets.

The method disclosure records carried dates. Missing-return text distinguishes exchange-mapped shares lacking prices/FX, explicitly private/unlisted positions, cash income and unresolved symbols. In particular `Private/Unmapped` remains unresolved; it does not assert a private listing. No fuzzy name search or guessed parent-company price is used. No archive/holding records or collector schedules change. No new cron, queue, background collector, credentials or public private-data assets.

## Validation before release

- 65 Node tests passed (59 existing plus six new); 20 Python tests passed. Covers both securities through the online adapter and engine, security/weighted returns, opening versus end dates, multi-day returns, FX-only closed-day movement, multi-day closures, unknown calendars, missing open-session close, pre-listing history, missing FX, and private-versus-unresolved disclosure. Existing authentication, bridge, ETF, full-precision Excel and frozen-header regressions pass.
- Public Yahoo chart data exercised through the actual adapter/engine using synthetic 100% weights: 13 October USD returns `4062.T = -0.07956902267883514`, `4004.T = -0.07752408899124574`, with no price-request failures. These are vendor adjusted-close/FX research figures, not official portfolio NAV returns.
- Wrangler 4.128.0 dry run passed. No physical device, Android emulator or native Excel test claimed for this release. Browser production validation and final version evidence follow after deployment.

## Exact rollback and compatibility

Only Attribution is deployed. Existing `ANALYSIS_BRIDGE_KEY`, password/session secrets, rate limit, KV and Arcus bridge remain compatible. No data migration or Arcus rollback is needed. From `C:/Users/Skrom/ArcusAttribution` in PowerShell:

```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
npx --yes wrangler@4.128.0 rollback a34930dd-b5ac-4f9a-b7f7-ecb9185abfe0 --config wrangler.jsonc --message 'Rollback listed-share holiday valuation'
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
```

Check account/Worker before rollback, verify the previous version at 100% afterwards, then reload Analysis. Keep all authentication secrets unchanged. The earlier two-sheet export remains available after rollback; Japanese returns on this holiday boundary will again be missing. For a broader paired rollback use `docs/WEIGHTED-EXCEL-RELEASE.md` and `docs/ARCUS-INTEGRATION.md`, with Arcus first then Attribution. Treasury-original `98c4a615-05c3-4213-bd07-f69702de43c9` / commit `d51ae4d0a9757eb6ec2d0a969697f76fecface57` and graphs-only `42785cce-8059-4716-a5ef-882e5f47dc59` / commit `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` remain untouched.
