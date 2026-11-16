# Share return basis release — 16 November 2026

Repositories: https://github.com/arcuscapital/attribution.git and https://github.com/arcuscapital/arcus-watchlists.git. Both use branch `codex/sa-total-returns-20261116`.

## Behaviour

One completed session and Live use price returns. Multiple sessions use Yahoo dividend-adjusted history for non-SA listings and gross cash-dividend reinvestment at the ex-date close for SA listings. Custom ranges count actual valuation sessions. Both comparison sides, charts, contributions and exports use the selected basis. Existing supplied issuer NAV remains a separate reference; no new NAV data is fabricated. The agreed NAV-as-total-return assumption is retained.

Long comparisons no longer compound Arcus's saved daily price returns. J303's weights remain driven by prices and its existing automatic quarterly reviews; its total-return reference uses the same opening weights. No model/holdings changes, new collectors, schedules, queues, authentication changes or credentials are introduced.

Yahoo and Sharenet same-date closes establish 100x unit repairs. Yahoo ordinary cash-dividend events are converted to the same unit as prices and included once. Price-only fallback data cannot silently become total-return data. Public issuer corrections are finite dated facts in `cloudflare/sa-income-corrections.json`; an identical copy is in Arcus `lib/sa-income-corrections.json`. Curro coverage ends at its last trading session. SRI's verified dividend-free late-2025 prefix and four issuer-declared 2026 rand amounts repair its truncated/incorrect Yahoo data. Future dividends continue through the normal Yahoo feed.

## Preserved starting states

| Component | Starting application commit | Starting Worker version | Deployment UTC |
| --- | --- | --- | --- |
| Attribution | b32baa1fccb8ea2196fd0905e791664f149d5d2f | 09e6bd92-73d3-4720-8373-626fc7167350 | 2026-11-16T13:37:47.671Z |
| Arcus Watchlists | c2d3cc642d4c1d885247a2543ffba692936f8dc6 | 5f7a7c1a-66f0-4436-88c7-ba82db9e39b2 | 2026-11-16T12:50:57.204Z |
| Arcus maintenance | 0664ecd316d7faa9dce2589da83495a223e0b5b5 | 788ba3cd-c311-48d3-93ce-9bff832b92d0 | 2026-10-27T09:49:55.749Z |
| Arcus notifications/portfolio histories | e8cb2f0fe63dc33643b8d2e4c33128729c011043 | 7ac98907-d858-446f-8945-df4e04bb94c4 | 2026-11-13T13:03:14.736Z |
| Arcus ETF constituent histories | 90d6041a0f846d4b32e88d34194de3a9e2a3ad38 | 4cf4f121-869c-4c89-bc06-b28ae62fce75 | 2026-11-13T14:36:32.919Z |

Branch bases (documentation-only children): Attribution `cd5a61bcb07098e6a44cc71d35d39d5b2784455f`; Arcus `8d5d906df5af03061add0b755a465f5c158f729f`. Treasury-original and graphs-only rollback points in the prior release documentation remain preserved.

## Validation before release

Attribution: 209 Node tests and 21 Python tests. Arcus: 1,181 Node tests and mirrored asset fingerprint check. Relevant tests distinguish raw/adjusted observations, reinvest dividends once, preserve price-driven weights, bound historical exceptions, retain split-adjusted prefixes, reject missing dividend-day prices, and cover auth and existing queue budgets. Real public histories were checked for all 126 J303 constituents, with 392 cash events and a complete one-year holdings return path. Eight listings required independently confirmed 100x repairs. Bloomberg corroboration remains pending at the owner's request; it is additional verification, not a claimed test result.

## Deployment and rollback

Deploy Attribution first, then the Arcus components. Browser imports use assets already accepted by the old bridge during rollout. Configurations, service bindings and secrets remain compatible. Existing history caches refresh through their existing jobs; they are not an atomic full-site historical migration.

For rollback, restore Arcus components before Attribution using Wrangler 4.128.0. In the Arcus repository, remove the Attribution XDG override and set `CLOUDFLARE_ACCOUNT_ID=42dd726446271f45425eab740741b864`:

```powershell
Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
$env:CLOUDFLARE_ACCOUNT_ID='42dd726446271f45425eab740741b864'
npx --yes wrangler@4.128.0 rollback 5f7a7c1a-66f0-4436-88c7-ba82db9e39b2 --config cloudflare/wrangler.jsonc --message 'Rollback share return release'
npx --yes wrangler@4.128.0 rollback 788ba3cd-c311-48d3-93ce-9bff832b92d0 --config cloudflare/wrangler.maintenance.jsonc --message 'Rollback share return release'
npx --yes wrangler@4.128.0 rollback 7ac98907-d858-446f-8945-df4e04bb94c4 --config cloudflare/wrangler.notifications.jsonc --message 'Rollback share return release'
npx --yes wrangler@4.128.0 rollback 4cf4f121-869c-4c89-bc06-b28ae62fce75 --config cloudflare/wrangler.holdings.jsonc --message 'Rollback share return release'
```

Then in the Attribution repository:

```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.128.0 rollback 09e6bd92-73d3-4720-8373-626fc7167350 --config wrangler.jsonc --message 'Rollback share return release'
```

Cached market packets retain their original price fields for compatibility. Rebuilding old derived history values, if desired, requires the existing refresh process after code rollback; no destructive database rollback is needed.

Application commits, final deployment IDs and live verification are recorded below after deployment in a documentation-only follow-up commit.


## Final deployed release and live verification

The application commits below are deployed at 100% traffic. This receipt is committed afterwards as documentation only and is not itself a new Worker deployment. Both repositories retain branch `codex/sa-total-returns-20261116`.

Attribution account: `5695cae2becf35e049eb5df3e2849ae2`. All Arcus components: `42dd726446271f45425eab740741b864`.

| Component | Full application commit | Worker version | Deployment ID | Deployment UTC |
| --- | --- | --- | --- | --- |
| Attribution | 80751adf8f0b8b0fe747bcb7d53562a4e91c70d0 | 086cc39c-a0e9-428d-957d-b9a3faf00b21 | 3c30571f-f27d-4d75-9ce0-1a6fead9e133 | 2026-11-16T17:46:03.193646Z |
| Arcus Watchlists | eb89e12d0edfcb5424e4b794bb2e6e32c82b13fc | a765d8c0-68f7-48e2-8caa-dd4b74e8d647 | 1a9ef008-d077-499e-b2ca-427e39737c7b | 2026-11-16T17:42:18.153244Z |
| Arcus maintenance | d36ecd6ec0e304123771bc68f15802ede3176b10 | 129d29fd-44e8-4334-87b4-abc0d98f8bba | bcb74031-0b83-4223-b963-53e770d572af | 2026-11-16T17:27:12.991834Z |
| Arcus notifications | d36ecd6ec0e304123771bc68f15802ede3176b10 | 531cf9da-8093-44b5-8165-62e57c4d5953 | 385973d4-29c5-42b4-8a4b-5f274c4a88e0 | 2026-11-16T17:27:45.833988Z |
| Arcus holdings | d36ecd6ec0e304123771bc68f15802ede3176b10 | a5fdf21a-f997-46f8-a3a2-3b9e19b21252 | ef8c8b4a-68fa-4d49-8e20-5b5bea4462a0 | 2026-11-16T17:28:29.291169Z |

Live verification used Brave and the authenticated production Portfolio Analysis page. It covered the latest completed session, YTD, a full custom year, one dividend ex-date, two sessions spanning that ex-date, and a Friday-to-Sunday range. Index/comparator holdings were checked as well as returns. Out-of-range historical requests were refused explicitly. SA portfolio/index, Rise/SWIX and USD ETF/portfolio comparisons exercised both price and total-return paths. Charts and contributions reconciled; cash and private positions retained their labelled assumptions. No private allocations or account returns are stored in this release receipt.

The live SA portfolio/index check exposed an existing mixed-method problem: a saved allocation's cash prevented the daily index path from completing. The final engine evaluates each side using its established method, preserves the daily index calculation and its strict missing-price checks, and combines the comparable results. Two regression tests verify reconciliation, chart endpoints, orientation, cash coverage and refusal to hide missing index prices. Final Attribution Node suite: 209 passed. Python: 21 passed. Arcus: 1,181 passed, plus 8 focused asset checks after the final label edit. All production bundles deployed successfully; mirrored assets and fingerprints passed. Browser console checks for the analysis page were clear. Anonymous requests to protected data/modules were denied with HTTP 403; the authentication unit suite also passed.

Cloudflare's Brave dashboard showed zero Worker errors, zero CPU/memory-limit events and a 1.25 ms median CPU time for the final Watchlists deployment at the observation point. This is a bounded observation, not a future availability guarantee. CLI tail captured 786 Arcus events (783 ok, 3 cancelled) and 198 Attribution events (all ok), with zero exceptions and zero error-level logs. Attribution HTTP responses in the sample were successful. The broader Arcus sample included two handled HTTP 500 responses for NY1.JO earnings and peers, plus six missing-logo 404s; those ancillary endpoints were not changed by this work. They are not being claimed as resolved.

Known limits: Bloomberg corroboration is pending. The public-data audit and live checks do not establish official index equivalence or complete corporate-action coverage. J303 and SWIX retain their documented historical reconstruction assumptions. Existing stock/watchlist and portfolio caches migrate through their existing refresh jobs, not an atomic full-site backfill; the 27 saved SA watchlist rows still had their earlier cache format when inspected. Portfolio Analysis used the new histories during verification, with 126 J303 market packets warmed. Existing supplied NAV remains a separate reference and no new NAV history was fabricated. No new scheduled collectors, bindings, secrets or queues were introduced. The rollback commands above remain valid.
