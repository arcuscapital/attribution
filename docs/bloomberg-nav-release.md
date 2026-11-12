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

## Final receipt

- Starting Attribution commit: `f22d4e38c4a2c1825549715badf726a5ada74df6`.
- Unchanged Watchlists receipt commit: `acac0d719ae6ed2f47ffa8886d38d6e1375b23c2`. Its production deployment was verified unchanged after this release.
- Deployed application commit: `55b9867c6f900a858957b67d7b3dd873618cfec1`, pushed before deployment.
- Worker version: `0c2ca754-7a70-4b66-a812-307496252922`.
- Deployment: `de488412-7798-42a3-af6a-592bca06ae22`, UTC `2026-11-12T09:41:25.01373Z`, 100% traffic.
- Input workbook SHA-256: `F43A0443788C0B056C33429282968DC03B3AF55335B5FF5CEB68E2A4BD80E4C0`. Sixty KV records uploaded successfully; remote ARKK record read-back confirmed 3,024 observations through 2026-11-10.
- Brave desktop live: BAI 2026-11-10 NAV -0.21%, ARKK -2.37%, matching the independent workbook ratios. Both identify Bloomberg historical import. ARKK 2026-11-11 shows No data. BAI 2026-11-11 uses fresh iShares NAV +5.51%. Monthly cumulative-return chart remained visible with matching previously verified endpoints. Browser error log was empty at completion.
- WTAI/WCLD live UI checks were inconclusive because their comparisons reported current Arcus holdings temporarily unavailable. Their local issuer requests returned 403; do not claim production NAV availability from those attempts.
- Both integrated and standalone unauthenticated NAV requests returned 401. Existing account scope restrictions and authentication tests passed.
- Browser inventory IDs had changed since the previous session: the old Brave ID opened a Chrome tab initially; it was closed immediately after detecting the mismatch. All comparison validation was then performed in confirmed Brave Work (browser 3). No native desktop automation was used. No separately named Brave browser skill was found in the available skill files; the supported browser tool was used.
- Evidence and complete daily-coverage report remain outside Git. No private financial report or workbook is in the release. This subsequent receipt commit is documentation only.
