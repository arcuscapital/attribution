# Mobile saved-holdings mode

## Purpose and data contract
Arcus → three-dot menu → Portfolio Analysis opens the existing Attribution application.
It loads a private online catalog and the selected allocations; the PC need not be on.
The independent desktop importer/calculator remains supported.

The initial publication contains 51 saved funds/accounts from the existing desktop research archive.
No themes are introduced. Allocation dates remain the actual source dates; dates are never rewritten.
The latest saved allocation is used across the requested historical period as an explicitly labelled
research approximation. It is not a transaction-based reconstruction or historical-weight attribution.
Shares use Yahoo vendor-adjusted closes at exact dates. Foreign shares require exact-date FX.
The current exchange-local date is excluded conservatively, even after its session closes.
Cash income, unmapped positions, missing prices and unsupported currencies stay blank.
Portfolio account IDs are never mistaken for listed securities (e.g. PORTFOLIO:IBKR versus IBKR).

## Private storage and publication
Workers KV binding HOLDINGS_ARCHIVE belongs to Attribution's existing account
5695cae2becf35e049eb5df3e2849ae2; namespace 98da8aed88f9416d84a9497daed06dc5.
This is private server storage, not static assets, public Git, or a public download.
Each publication uploads immutable versioned holding records before switching the catalog pointer.
Two recent generations are retained for open clients; failed publication preserves the previous catalog.
KV is eventually consistent: a newly published catalog/record may require a retry during propagation.
Only ticker/identity, name, sector, currency, asset type and weight are uploaded.
Account values, quantities, cost prices, report history and credentials are excluded.

desktop/arcus_attribution/publish.py is called after update/export if settings.json contains
mobilePublish. Machine-local fields: node (Node executable), wrangler (Wrangler JS entry point),
authHome (separate Attribution Wrangler OAuth directory). No secrets belong in that file's Git copy.
The existing updater publishes newer allocations when the PC next runs. While off, the last
published allocation remains available and prices are fetched independently on demand.
This does not create new schedules, collectors or queues, or retrieve older missed holdings.

## Requests, authentication and costs
Standalone password access is unchanged. /data/catalog, /data/holdings and /data/prices require
the existing standalone session. In Arcus, /portfolio-analysis/data/* is gated by Arcus's session
and signed server-to-server with ANALYSIS_BRIDGE_KEY. Method, pathname AND query are signed;
no reusable credentials/tokens enter frontend code or URLs. The static bridge allowlist adds only
online.mjs and price-data.mjs; data routes are a fixed allowlist. No trading route exists.
Browser-private responses use private/no-store. Session expiry/logout clears browser data and aborts
pending requests; page navigation aborts outstanding price requests. Authentication is checked before
and after calculations. Existing session-token revocation limitations are unchanged.

Only selected unique securities are downloaded, at most two at once, plus SPY for an observed
valuation calendar and required FX series. One symbol per Worker invocation, at most three years.
Only public market responses are cached internally for 15 minutes; cached prices still require auth.
Time-zone/date validation and calculations run in the browser, keeping Worker CPU bounded.
No prices are written to D1/KV. Catalog/selected snapshots cost small KV reads; publication is roughly
one write per fund plus a catalog write and old-generation deletes. These use the Attribution account.
Arcus adds authenticated proxy requests only while using this page; Watchlist code, startup and 6s/35s
collectors are untouched. This is low incremental usage, not zero usage. Large ETFs can require many
on-demand requests; two-at-a-time bounds concurrency rather than promising instant calculation.

## Portable testing and deployment
Node 22+ / Python 3.11+. Run:
- node --test tests/*.test.mjs
- python -m unittest discover -s tests -p 'test_*.py'
- node tests/mobile-server.mjs (localhost:8767 synthetic data only; fixture password in test source)

The local server exercises the real server auth and UI with synthetic data. Never deploy its fixture.
Preview /portfolio-analysis/ after signing into localhost to exercise automatic integrated loading.
Production deploy uses existing separate Wrangler OAuth:
XDG_CONFIG_HOME=C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth on this PC;
CLOUDFLARE_ACCOUNT_ID=5695cae2becf35e049eb5df3e2849ae2.
npx --yes wrangler@4.128.0 deploy --config wrangler.jsonc

Deploy Attribution first, Arcus second. Roll back Arcus first, then Attribution. Online modules load dynamically: an older Arcus bridge can still display the archive-import application during rollout/rollback, even though its allowlist blocks the new online modules.
Old versions ignore the new KV namespace and new private mobilePublish setting; leave existing
PASSWORD_*, SESSION_KEY and ANALYSIS_BRIDGE_KEY intact. No existing database migration occurs.
See MOBILE-DATA-RELEASE.md for exact paired commits, deployment IDs and test limits.

