# Bloomberg historical NAV import, 12 November 2026

Repository https://github.com/arcuscapital/attribution.git, branch `codex/bloomberg-nav-20261112`, starting at `f22d4e3` (full ID recorded in receipt). Preserves the final cumulative-return chart application `e447b645a94ecf413a280b06b1b44e246f25adec`, Worker version `838012a0-20bf-4ce3-b4c3-fe77c1558009`, deployment `4cd8a932-391f-4f5e-8ea3-b0b1c6baa33e`, UTC `2026-11-12T09:26:41.962797Z`.

Watchlists is unchanged: https://github.com/arcuscapital/arcus-watchlists.git, branch `claude/eco-bloomberg-font`, latest receipt `acac0d7`, production application `7541599ca18f861828997c0e85ad1105e4688411`, Worker `f9beb632-6805-433b-a731-2511c3b720cf`, deployment `b9dac964-d5cb-459c-9f5f-54b623214932`, UTC `2026-11-12T09:14:03.427508Z`. No Watchlists deployment is needed. Preserve its Treasury-original and graphs-only rollback points.

## Behavior and private data

Existing authenticated 1D NAV lookup first reads an exact adjacent pair from a private, versioned Bloomberg import, then falls back to the existing foreground issuer fetch. Labels identify Bloomberg historical imports separately. Nothing carries forward beyond the import's last date. Longer-period total-return calculation is unchanged because distributions and adjustment metadata were not supplied. No collector, queue, cron, new secret or public archive is added.

The supplied workbook has 60 US-listed funds, 150,395 positive observations through 2026-11-10, with FUND_NET_ASSET_VAL labels. All expected 60 identities match; no duplicate/reversed dates or adjacent moves over 35% were found. It omits the 19 funds whose earlier issuer histories were already collected. No explicit currency column was supplied; these US-listed fund native NAVs are treated as USD, consistent with existing issuer configuration. Historical completeness and distribution/split adjustment are not certified by this check.

Only the 60 supplied histories are imported into existing private HOLDINGS_ARCHIVE KV, keys `nav:bloomberg:20261112:TICKER`. Workbook, observations and bulk-import file remain outside Git and static assets. Existing archive entries are not overwritten. The versioned namespace makes rollback additive and reversible without deleting data.

## Validation

- Node 150/150, Python 21/21; Wrangler dry run and whitespace checks pass.
- 180 calculations against the actual import cover first, middle and latest adjacent pairs for each fund.
- Tests reject identity/currency/field mismatch, missing dates, intervening sessions, invalid values, extreme moves and storage failure. Existing bridge authentication and return-chart tests pass.
- Direct local issuer probe for 2026-11-11: 42/44 configured adapters succeeded. WTAI/WCLD returned HTTP 403. These local requests do not prove Cloudflare availability. Another 35 ETFs have no configured daily adapter. No automated Bloomberg connection exists.
- No physical device or Android testing. Brave production evidence and deployed IDs follow in the receipt.

## Deploy and rollback

Target only Attribution account `5695cae2becf35e049eb5df3e2849ae2`, Worker `arcus-attribution`. Existing authentication/ANALYSIS_BRIDGE_KEY remains compatible. Upload the versioned KV records, deploy Attribution; do not deploy Watchlists.

Exact rollback from this worktree:

```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 838012a0-20bf-4ce3-b4c3-fe77c1558009 --config wrangler.jsonc --message 'Rollback Bloomberg NAV import lookup; retain return chart'
npx --yes wrangler@4.129.0 deployments status --config wrangler.jsonc --json
```

The previous application ignores these KV keys. Preserve all existing secrets, archive keys and chart code. No other account needs rollback.
