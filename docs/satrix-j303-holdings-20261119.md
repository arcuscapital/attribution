# J303 holdings from the Satrix Capped All Share ETF

Released 19 November 2026 in Arcus Portfolio Analysis.

## Holdings and history

The closing basket for 17 November 2026 starts the Satrix period. Five independently sourced JSE closing prices identified that date on the ETF disclosure labelled 18 November. The ETF displayed 116 weights totalling 100.02% due to rounding. Arcus scales the disclosed weights to a total of 100%. The earlier J303 reconstruction is available for comparisons from 14 November 2025. [Satrix STXCAP product and holdings](https://satrix.co.za/products/product-details?id=66)

The Attribution Worker verifies both renderings of the ETF table, the fund identity, every ticker and weight, and the basket's market-value reconciliation. At least four of the five largest constituents must identify a unique completed JSE closing date. The private archive records the full validated rows, their digest, valuation date, publication date, and observation time. A corrected disclosure preserves the superseded revision.

A basket takes effect at its valuation close. The opening holdings earn that day's return. A replacement changes the closing weights and subsequent drift up to the next disclosure. Index levels stay continuous over the replacement. The issuer weights carry the fund's own capping and membership decisions. During a publication gap Arcus floats the previous verified basket. Unavailable required closing prices stop a completed valuation. Live displays constituents carried at their last close when individual live quotes are unavailable.

The existing two-minute Attribution trigger checks Satrix once per JSE trading day at 08:00 South African time. A missed trigger can run on a later half hour. A failed source check retains the latest verified entry and retries after two hours. A new disclosure posted after a successful daily check is picked up on the next trading-day check. Other ticks refresh two required price histories at a time. The warmer retries missing completed prices after an hour. A dated Sharenet close can fill an empty Yahoo bar when supported by a same-session Yahoo quote or matching nearby closes. The cached packet retains dividend history. Single sessions use price returns and multi-session comparisons use dividend-inclusive histories. The J303 holdings panel shows end-of-period weights and the contribution table uses opening weights.

## Git and Cloudflare

| Component | Repository and branch | Full application commit |
| --- | --- | --- |
| Attribution release | [Attribution](https://github.com/arcuscapital/attribution), `codex/satrix-j303-20261119` | `7f364c382903effc92ac2b7c76ccaf03c339f0bc` |
| Attribution starting point | [Attribution](https://github.com/arcuscapital/attribution), `claude/pa-live-easybest`, branch tip `066ecca694ef211d106f5f936d1827c05aa6dd9f` | `8318f9b252be5869cc61da7058ca21002475e8ab` |
| Watchlists production | [Arcus Watchlists](https://github.com/arcuscapital/arcus-watchlists), `claude/regime-alerts`, branch tip `0834f2a23765537642d32128e218069613217977` | `9af78b4a8a1700c22fd6cf5690da344bfae6910c` |

Attribution runs in account `5695cae2becf35e049eb5df3e2849ae2`. Watchlists runs in account `42dd726446271f45425eab740741b864`. The signed Watchlists bridge already serves the required assets and query parameters. This release deploys Attribution only.

| Worker | Deployment UTC | Version at 100% | Deployment ID |
| --- | --- | --- | --- |
| arcus-attribution, prior | 2026-11-17 12:04:44 | `19cea4e2-94ba-4832-8f25-78ae8424f3f0` | `a02aecd3-225c-461f-bb5b-65a12ae8766c` |
| arcus-attribution, initial Satrix commit `ef3ae544b5768a7deeb2ba484bac2f5595c4cad5` | 2026-11-19 05:30:34 | `c059cab8-92b4-452d-91e3-b6effcedffaf` | `c7f99370-500a-4dec-98e1-dd0ab4f34bfa` |
| arcus-attribution, verified history and per-period caching `61f8f0c26aca296af3d27d982ed63e63af971c33` | 2026-11-19 05:40:20 | `5d53373b-b8bd-450c-a0f9-070363c23a96` | `065e2e84-62c0-4216-9f95-6b17c93b8780` |
| arcus-attribution, final daily importer | 2026-11-19 05:51:39 | `71da240e-bb21-45b4-b004-6f6106aae3dd` | `879eeb96-82af-4d23-9d16-f77847125538` |
| arcus-watchlists, existing production | 2026-11-18 18:24:01 | `7f1e7e2c-a3b6-479d-8ca2-2dbffcc4c2d3` | `e516d696-39a8-4391-a31e-173b5adc493d` |

## Verification

- 224 Attribution JavaScript tests, 21 Python tests and 1,265 Watchlists regression tests passed, including all 12 signed-bridge tests. Coverage includes late and out-of-order disclosures, same-day revisions, source failures, low-quorum rejection, trading-day import timing and retry behavior, membership changes, release-day continuity, live drift and a dividend paid on a day with a missing Yahoo close. An end-to-end regression verifies that a delayed basket and its later correction each replace the projected weights only between that close and the next independently dated basket.
- The pre-release legacy model, state and saved SWIX report matched their production readbacks. Using the same archived prices, Claude's deployed engine and the new engine produced identical snapshots and levels for all 251 sessions through 16 November 2026, including 30,045 constituent valuations and the initial baseline. An independent weight calculation reproduced every J303 closing weight on the first issuer date and the following floated session.
- Brave Work showed the production SWIX/J303 comparison in ZAR. Tested a pre-cutover close, the first issuer close, the next floated close, a five-session custom period, year to date and a full year. Source and floated end weights matched all 116 displayed tickers at the UI's three-decimal-percent precision. The saved SWIX/J303 YTD selection was restored.
- The real pre-open Live view retained the previous closing weights. A replay using actual 18 November share-price changes through the Live calculation exactly reproduced all 116 completed closing weights and both fund returns. Actual market-open ticks and a physical phone were outside this verification window.
- At 08:00:42 SAST on 19 November the final production Worker automatically fetched and verified the 116-share ETF basket dated to the 17 November close. The published table still carried 18 November. Cloudflare recorded a successful scheduled event, 26 ms CPU, 4.77 seconds elapsed and zero exceptions. Signed-in comparisons succeeded. Logged-out data requests to Watchlists and Attribution, and an unsigned direct bridge request, returned HTTP 401. Brave showed the existing Watchlists deployment at 100%. Attribution deployment and scheduled-event receipts were verified through its separately authenticated account. The final scheduler-only deployment used the same UI and comparison assets verified in Brave.

## Rollback

The prior Watchlists deployment already has the compatible signed bridge. To restore the previous J303 source, run the following in the Attribution checkout. The earlier quarterly publisher resumes from its saved model and state. The `j303:stxcap:` archive remains available for a later reactivation. Previous Watchlists rollback landmarks are documented in the Watchlists repository.

```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.128.0 rollback 19cea4e2-94ba-4832-8f25-78ae8424f3f0 --config wrangler.jsonc --message 'Restore pre-Satrix J303 and Claude Portfolio Analysis Live'
```

Authentication, asset allowlists, the KV binding and the cron expression are compatible across these versions. If a later coordinated release changes both Workers, restore its compatible Watchlists version first, then Attribution.
