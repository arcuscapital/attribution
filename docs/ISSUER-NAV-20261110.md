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

Application commit IDs, deployment IDs and UTC times are recorded in the deployment receipt after rollout.
