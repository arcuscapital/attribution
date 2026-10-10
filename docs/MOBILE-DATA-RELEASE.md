# Mobile saved-holdings release — 10 October 2026

## Repositories and preserved starts
- Arcus: https://github.com/arcuscapital/arcus-watchlists.git
  - Branch: codex/analysis-mobile-data
  - Starting commit: 22cf435681f2c7640db9b33d968668b7d86ffe23
  - Application commit: 2bd5331f6af30ebd0951763aad7ac6ae185b95ef
  - Previous Worker: 7b4187aa-94fc-482c-af63-be8c21842606
- Attribution: https://github.com/arcuscapital/attribution.git
  - Branch: codex/mobile-saved-holdings
  - Starting commit: 76526c8fa92f74399f0022a13444280507dde7ca
  - Initial feature commit: 14e6598a0eab99cd544dcdaf4068d3e636da372d
  - Final application commit: 46cc98ec89048e043c3454a493e61ceb11069013
  - Previous Worker: dd1fe002-93db-49ab-ac04-ade286b8c234

## Deployments
All versions below received 100% traffic.
1. Attribution feature:
   - account 5695cae2becf35e049eb5df3e2849ae2; Worker arcus-attribution
   - UTC 2026-10-10T13:36:14.904819Z
   - version 96ee7b58-ab7b-4b2a-a447-243f3a1f3ffe
   - deployment b1096295-06c7-4db3-9a8b-01acb3cd5692
2. Arcus data bridge:
   - account 42dd726446271f45425eab740741b864; Worker arcus-watchlists
   - UTC 2026-10-10T13:36:39.67634Z
   - version 6a5ce40e-dd05-4a9c-9a3f-394f66cb0135
   - deployment 51561e48-5e80-4936-86e5-78f3f094abc5
3. Attribution compatibility follow-up (final):
   - UTC 2026-10-10T13:40:16.911527Z
   - version 752d1fdb-becb-49c9-843c-073da8cab621
   - deployment 92414da6-2bd3-4dc0-be0c-97bb09dfed30
   - Dynamic online-module loading preserves archive-import mode if an older Arcus bridge
     rejects the new module paths during rollback. The initial 25-second paired rollout
     required a page reload after the new Arcus bridge became live.

## Verification
- Arcus: 854 tests passed, zero failures; asset-manifest check passed.
- Attribution: 43 Node tests and 20 Python tests passed, zero failures.
- Tests include strict adjusted-price use, exclusion of the exchange-local current day,
  exact-date FX conversion, missing-price blanks, query-bound HMAC, unauthorised access,
  expiry, cancellation, publication ordering/failure, unchanged archive engine defaults,
  explicitly labelled snapshot research for historical periods, and max two concurrent prices.
- Live authenticated Arcus page automatically loaded 51 saved entries:
  47 ETFs plus EasyAI, EasyGE, IBKR and Marlow. No desktop file picker was required.
- Live ARKK versus BAI, One Day through 2026-10-09 completed. Coverage 96.85% / 81.64%;
  missing private/cash and foreign exact-date returns remained blank.
- Live EasyAI versus WCLD, same date, completed. Coverage 95.78% / 99.98%.
  Portfolio reference returns were not fabricated from a similarly named exchange ticker.
- Independently fetched NVDA adjusted closes: 230.47999572753906 (Oct 8),
  229.27999877929688 (Oct 9), return -0.5206512367610272%; UI -0.52%.
- Sampled production Attribution tail: 13 events, all outcome ok, CPU 1–2 ms.
  This is a small one-day workload sample, not a universal load guarantee.
- Supplementary 412px browser layout: all form controls 48px high; document width 397px
  inside 412px viewport; no page overflow. Wide result tables scroll internally.
  Local synthetic One Day and Last Month ETF/portfolio comparisons passed.
- Real auth Worker with synthetic local data: sign-out completed, reopening protected
  /portfolio-analysis/ showed the sign-in page; unit tests also cover expiry and lock races.
- Anonymous scripted live data requests were denied with HTTP 403 at the edge.
  Application-layer HTTP 401 assertions were verified in automated tests; do not describe
  the edge denials as live application-layer session-expiry tests.
- Actual Android 17 emulator (existing marlow17 Pixel 7 profile) remained running.
  Read-only screenshot/version capture worked. Automated navigation to the new test page
  was rejected by automatic approval review without a specific reason; Windows fallback
  failed to activate its window. The NEW flow did NOT pass Android touch/rotation/keyboard
  testing, and no physical Pixel or Pixel 9 result is claimed. Emulator was left open.

## Data, performance and limitations
Private allocations were published to Attribution's own KV, outside Git/static hosting.
The source archive was generated 7 October; each fund's actual allocation date is displayed.
The existing desktop update/export publishes fresh allocations when it next runs, using the
existing separate Wrangler OAuth setup. When the PC is off, the last published holdings work;
share prices are fetched independently from Yahoo only when comparing.
Returns are daily adjusted-close research returns, not live/intraday or audited NAV accounting.
The current exchange-local day is excluded conservatively. Missing prices/FX are not carried
forward, and no current market quote is substituted. Allocation weights may be approximate;
unknown returns stay blank and coverage is shown. Large holdings lists take longer on a first run.
No Arcus startup assets, Watchlist collectors, 6s/35s cycles, queues or crons were changed.
Incremental authenticated proxy requests occur only within Analysis; public price cache lives
on Attribution, and calculation/date handling runs in the browser. Usage is low, not zero.

## Rollback
1. In Arcus repo with its original account/OAuth:
   npx --yes wrangler@4.128.0 rollback 7b4187aa-94fc-482c-af63-be8c21842606 --config cloudflare/wrangler.jsonc
2. In Attribution repo with XDG_CONFIG_HOME pointing to its separate OAuth directory and
   CLOUDFLARE_ACCOUNT_ID=5695cae2becf35e049eb5df3e2849ae2:
   npx --yes wrangler@4.128.0 rollback dd1fe002-93db-49ab-ac04-ade286b8c234 --config wrangler.jsonc
3. Verify protected data access and archive-import mode. Restore source in separate worktrees
   from the starting commits above if rebuilding. Do not reset over ongoing user changes.
4. Preserve PASSWORD_PEPPER, PASSWORD_VERIFIER, SESSION_KEY and ANALYSIS_BRIDGE_KEY.
   There is no existing DB migration to reverse. The new private KV may remain unreferenced;
   do not make it public or delete it as part of rollback. Remove only mobilePublish from
   machine-local settings.json if stopping optional desktop publication; retain all other settings.
5. The original Treasury and graphs-only rollback states remain in docs/portfolio-analysis-release.md
   in Arcus. This release starts after Theme Heat, comparison readability and Back hierarchy.

Setup/build/test instructions: Attribution docs/MOBILE-DATA.md and existing AGENTS.md.
No private holdings, credentials, OAuth files, session cookies or price-debug logs are committed.

