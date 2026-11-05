# Analysis security links - 5 November 2026

Attribution repository: https://github.com/arcuscapital/attribution.git
Branch: `codex/analysis-ticker-links-20261105`
Starting commit: `bc5755100ce7bb62c846a8c9fd25bfba1a586c9c` (documentation after deployed application `753e549481307cf96c44bdea7dbbc823de769f6a`).

Compatible Watchlists repository: https://github.com/arcuscapital/arcus-watchlists.git
Branch: `codex/index-holdings-20261105`; deployed main application `b742ef5046dbee72421f88789b6e1fc43d82359e`, version `40eaf2a3-5265-4e6a-85be-fbe326c9c9c3`.
No Watchlists deployment is needed. Holdings remains application `5ac529273f49a35c6f180351a0d08fd49066838a`, version `16aebeb3-ce16-456c-a7da-b18b113a7e07`.

Security tickers in the Holdings results table open the existing Arcus `/?tab=watchlist&symbol=...` route in a new tab, preserving the calculation. Links use the resolved exchange listing from the calculation inputs; raw issuer tickers are not guessed. Cash, private holdings, unresolved/ambiguous symbols and sector aggregates remain plain text. Phone row expansion ignores link clicks and keyboard activation. Link generation runs in the browser with no additional requests, polling, collection, queues or cron changes. Opening a link uses the existing Watchlists behavior and authentication.

Validation before release: 83/83 JavaScript tests; Wrangler 4.128.0 dry run; diff whitespace check. Brave local synthetic comparison verified AAPL/NVDA links, unresolved plain text and zero sector links. At a 390x844 desktop viewport, company-name tap expands details and Enter on the ticker opens the correct new-tab URL without toggling those details. Viewport restored. This is desktop responsive testing, not an Android emulator or physical device. Calculation engine, desktop collector, secrets and archive data are unchanged; no Python tests required for these UI-only edits. Production evidence and full application commit are recorded below after deployment.

Deploy only Attribution Worker `arcus-attribution` under account `5695cae2becf35e049eb5df3e2849ae2`, using the separate authentication profile. Main Watchlists account `42dd726446271f45425eab740741b864` is unchanged. Existing standalone password sessions and the server HMAC bridge remain compatible. No data migration or configuration/secret changes.

## Production receipt and verification

Application commit `fd15826d1612c1124beaea40280f236f0c47344f`, pushed before deployment. Worker version `d0a244c3-3bd7-4f4c-8f19-892f4df6018b`; deployment `4c980288-6578-4787-9aca-5fd99071e6f0`; UTC `2026-11-05T12:31:23.639016Z`; 100% traffic. Only app.mjs and style.css were uploaded as changed assets. This receipt is a later documentation-only commit.

Live Brave: SOXX portfolio versus QQQ benchmark for 2026-11-04 in USD completed using 114 reused securities/fund series, 99.86% / 99.84% measured coverage, no listed-share gaps and eight disclosed non-listed zero assumptions. APP rendered as a link to `/?tab=watchlist&symbol=APP`. Clicking it opened a new tab showing `APP Applovin Corp`, its selected Chart tab, price/chart and the same company information tabs as Watchlists. The analysis remained in the original tab. Existing Watchlists logic selected its chart range; the new link does not override it. Anonymous requests to the integrated root, app module and catalogue each returned 401. No private portfolio was used. Screenshot capture was unavailable in the Brave extension (debugger unattached); verification is based on the actual UI DOM and navigation, not an image or physical-device test.

## Exact rollback

Run in the Attribution checkout. The previous version is `8c1622a2-9b2f-497b-8ca9-4cbbc4f31657`, deployment `43bb18f2-af30-4547-aafd-ba91fc2dc92c`, deployed 2026-11-05T11:58:37.027479Z. This UI-only rollback needs no Watchlists rollback or data changes.

```powershell
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx --yes wrangler@4.128.0 rollback 8c1622a2-9b2f-497b-8ca9-4cbbc4f31657 --config wrangler.jsonc
npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json
```

If that version expires, use a separate clean checkout at application commit `753e549481307cf96c44bdea7dbbc823de769f6a` and run `npx --yes wrangler@4.128.0 deploy --config wrangler.jsonc` with those same environment variables. Do not remove existing secrets or bindings.

Preserved Watchlists rollback points: Treasury-original application `d51ae4d0a9757eb6ec2d0a969697f76fecface57` / Worker `98c4a615-05c3-4213-bd07-f69702de43c9`; graphs-only application `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` / Worker `42785cce-8059-4716-a5ef-882e5f47dc59`.
