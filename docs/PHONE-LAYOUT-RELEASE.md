# Phone-first Portfolio Analysis layout — 11 October 2026

## Repositories and preserved starts
- Attribution: https://github.com/arcuscapital/attribution.git
  - Branch: claude/phone-analysis-layout
  - Starting commit: 62e8e209799da714cd0d1d1ae6c72d52b5af9c3b (documentation child of the
    production application commit 46cc98ec89048e043c3454a493e61ceb11069013)
  - Application commit: e7e0b3c014f4fa6388d944fde521b8966e585f1d
  - Previous production Worker: 752d1fdb-becb-49c9-843c-073da8cab621
- Arcus Watchlists: https://github.com/arcuscapital/arcus-watchlists.git — **no code change**.
  Production stays at application commit 2bd5331f6af30ebd0951763aad7ac6ae185b95ef,
  Worker version 6a5ce40e-dd05-4a9c-9a3f-394f66cb0135 (verified with `deployments status`
  before this work). The bridge allowlist already covers every file this release changes
  (`index.html`, `style.css`, `app.mjs`); no new assets or routes were added.

## What changed (site only: index.html, style.css, app.mjs)
Measured before the change on a 412×915 viewport: the Compare button sat at 928px, the
results started at 1446px with no automatic scroll, and the contributions table was 1024px
wide inside a 344px box (eight columns, two visible at a time).

On screens up to 600px wide:
- Arcus mode hides the marketing intro; the page opens on Portfolio, Benchmark, Date range
  (with the resolved period shown inline), Currency and Compare. From/Through appear only
  for "Custom dates". The saved-holdings status card and setup notes move below the results.
- After Compare the page scrolls to the coverage warning (or the headline figures) and the
  selection panel collapses into a sticky "ARKK vs BAI · One Day · 2026-10-09 · USD" bar
  with a Change button that re-opens the form in place.
- Headline figures render two-up with the difference beneath; the price-check note sits
  directly under them.
- The contributions table shows Security · Return · Diff (pp) (Sector · Active wt · Diff
  in sector view). Tapping a row opens the remaining weights and contributions, labelled
  with the selected fund names. A "Sort by" select and a direction button replace
  off-screen header taps; the Holdings/Sector switch now sits beside them.
- The last portfolio, benchmark, range preset, currency and view are remembered in
  localStorage (`arcus-analysis-selection`: identifiers only, no holdings or prices) and
  restored on the next open when they still exist in the catalog.
- "Last 3 Months (completed)" is labelled "Last 3 Months"; the note beneath still explains
  completed-price periods.

Desktop (wider than 600px) keeps the eight-column table, four-column form and expanded
panel. Column headers everywhere now name the selected funds instead of
Portfolio/Benchmark. A pre-existing defect where `message('')` painted an empty warning
box after loading saved holdings is fixed.

Unchanged: calculation engine, Web Worker, date-range logic, session guard, online data
adapter, bridge signing, data routes, archive import, CSV export columns, Python collector.
No new network requests, polling, collectors, queues, crons or storage of financial data.

## Tests and evidence
- `node --test tests/*.test.mjs`: 43 passed, 0 failed (before and after).
- `python -m unittest discover -s tests -p 'test_*.py'`: 20 passed.
- No automated DOM tests exist for `site/`; the layout was verified manually as below.
- Local synthetic server (`node tests/mobile-server.mjs`, fixture data only) in the
  desktop app's browser pane at 412×915: Compare at 550px from the top, document width
  412px with no horizontal overflow, table 344px wide in a 344px box, row expansion,
  sort select, direction toggle and sector view verified through the DOM. 1280px desktop
  check: eight headers, no collapse, four form columns.
- **Actual Android emulator**: existing `marlow17` AVD (Pixel 7 profile, Android 17,
  Chrome, 1080×2400, 411 CSS px) started with `-gpu swangle`, reaching the local synthetic
  server through `adb reverse tcp:8767`. Compare, row expansion and Change were driven by
  ADB touchscreen taps; custom dates, sector view and dark mode were switched through the
  DOM over the Chrome DevTools socket. Screens captured with `screencap`:
  `tmp/analysis-phone/*.png` in the Arcus checkout (not committed). No physical Pixel, no
  Pixel 9 and no production data were used in these captures.
- Live production verification on the emulator against arcuscapital.co.za: see the
  deployment section below.

## Deployment
- Account 5695cae2becf35e049eb5df3e2849ae2 (shaunkrom18@gmail.com OAuth, separate
  `XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth`); Worker arcus-attribution
- UTC 2026-10-11T09:35:08.157539Z, 100% traffic
- Version 1dc0e8af-e761-49a5-8cad-99f3ffd5c8a4, tag `phone-20261011`
- Deployment 72b7a786-f035-4d25-ad27-946158aeb267
- Wrangler 4.128.0 uploaded exactly three changed assets (index.html, style.css, app.mjs);
  six unchanged; 13.14 KiB Worker; bindings unchanged (HOLDINGS_ARCHIVE, LOGIN_LIMITER, ASSETS).
  Wrangler reported 1 ms Worker startup, which is not an end-user page-load measurement.
- Arcus was not deployed; its bridge serves these files with private/no-store, so phones
  receive the new layout on the next open without a cache clear.

Deploy command used:

    XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth     CLOUDFLARE_ACCOUNT_ID=5695cae2becf35e049eb5df3e2849ae2     npx --yes wrangler@4.128.0 deploy --config wrangler.jsonc --tag phone-20261011

Earlier on 11 October the auth directory held no token, and a browser sign-in with the
arcuscapital.co.za Cloudflare user produced a token for account 42dd7264… only, which
Cloudflare rejected for this Worker (code 10000). That token was logged out before the
correct login was made; neither token is stored in Git.

### Post-deployment checks
- Anonymous `GET` of `/portfolio-analysis/` and `/portfolio-analysis/app.mjs` on
  arcuscapital.co.za, and of `/app.mjs` and `/arcus-bridge/app.mjs` on the workers.dev
  origin, all returned 401 after the deploy; the standalone root still shows its password form.
- Live authenticated verification, after the owner signed in on both test surfaces:
  - Desktop app browser pane emulating 412×915 on https://arcuscapital.co.za/portfolio-analysis/:
    module `app.mjs?v=phone-20261011`, 51 saved funds loaded automatically, Compare at
    367px from the top, intro hidden, document width 412px. ARKK versus BAI, One Day
    through 2026-10-09, USD: 2.31% versus 1.24%, difference 1.07%, coverage 96.85% /
    81.64%, 17 holdings with missing returns, 88 table rows. These equal the figures
    recorded for the same date in MOBILE-DATA-RELEASE.md, so the calculation path is
    unchanged. Price check "Checking prices 62 / 83" was visible in the button during the run.
  - **Actual Android emulator against production**: marlow17 (Android 17, Chrome,
    411 CSS px) signed in to Arcus by the owner. Compare tapped by ADB touchscreen input:
    page scrolled to the coverage warning, selection collapsed to the sticky bar, same
    2.31% / 1.24% / 1.07% figures and 88 rows. Tapping CRSP opened its detail (ARKK weight
    4.28%, BAI 0.00%, active 4.28%, contribution 0.25% / 0.00%); a touch swipe scrolled the
    table with scrollX 0, document 411px, table 344px in a 344px box; tapping Change reopened
    the form and focused Portfolio. Captures `live-emu-entry.png`, `live-emu-results.png`,
    `live-emu-row.png`, `live-emu-change.png` under `tmp/analysis-phone/` in the Arcus
    checkout (not committed; they show real holdings). No physical Pixel and no Pixel 9
    were used; dark mode, sector view and custom dates were verified on the local
    synthetic server only. The emulator was left running and signed in.

## Rollback
Attribution only; Arcus needs no change and must not be rolled back for this release.

    XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth \
    CLOUDFLARE_ACCOUNT_ID=5695cae2becf35e049eb5df3e2849ae2 \
    npx --yes wrangler@4.128.0 rollback 752d1fdb-becb-49c9-843c-073da8cab621 --config wrangler.jsonc

The bridge key, PASSWORD_PEPPER, PASSWORD_VERIFIER, SESSION_KEY and the KV namespace are
untouched. There is no data migration. A phone that already loaded the new page keeps the
`arcus-analysis-selection` preference; the previous version ignores it. The Treasury and
graphs-only Arcus rollback points in the Arcus repository are unaffected.
