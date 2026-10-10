# Arcus mobile integration

This is the existing https://github.com/arcuscapital/attribution.git application, not a replacement. Its pure calculation engine, dated-holdings estimates, missing-return handling, Python desktop updater and Google collector are unchanged.

## Hosting and access

Standalone: `https://arcus-attribution.arcus-attribution.workers.dev/`, Worker `arcus-attribution`, account `5695cae2becf35e049eb5df3e2849ae2`. The existing PASSWORD_PEPPER, PASSWORD_VERIFIER, SESSION_KEY and LOGIN_LIMITER remain required. Standalone password sessions expire after 24 hours.

Integrated: `https://arcuscapital.co.za/portfolio-analysis/`. Arcus verifies its existing HttpOnly session on every page, asset and session-check request. It proxies only seven explicit static asset names to the fixed Attribution origin. No financial data is proxied. No cross-origin iframe or third-party cookie is required. Existing X-Frame-Options DENY and frame-ancestors 'none' remain intact.

Both Workers hold an independent random 256-bit `ANALYSIS_BRIDGE_KEY` secret. A server-only HMAC assertion binds version/audience, exact method/path and a timestamp. Verification allows 30 seconds and 5 seconds forward clock skew. Assertions are not browser tokens; there is no browser SSO cookie on the analysis origin. Browser cookies/Authorization are never forwarded, redirects are not followed and upstream cookies are discarded. The finite replay window applies only to these static assets. Missing/invalid signatures cannot access archives, APIs, sessions or login routes. No public archive is introduced.

Requests/results use private no-store. The browser revalidates on entry, focus, return from the background, import, before/after calculation and export. It conceals data while away and clears in-memory data if validation fails. Logout clears the relevant existing cookie (Arcus when integrated, Attribution when standalone). Arcus retains its existing credential-derived session and 180-day browser cookie policy; this integration does not redesign global Arcus authentication or promise server revocation of a stolen original Arcus cookie.

## Data and mobile behaviour

The phone imports `arcus-attribution.json` using its Android file picker. Reports remain in browser memory; no private file is uploaded or persisted by this UI. A PC can still connect its local reports folder. The phone cannot automatically read a PC folder. Secure cross-device archive sync is a separate project, not silently introduced here.

The interface follows Arcus light/dark preference when integrated. Back returns to the existing Arcus page. Portrait forms use full-width fund/date-range selectors and 48px inputs. Wide financial tables scroll inside their own container with a sticky identifier column. A compact chart visualises the largest existing contribution differences; the attribution formula is unchanged. Sector allocation remains under Method. No trade actions exist.

## Portable setup, tests and deployment

Node 22+, Python 3.11+ and Git. Python updater dependencies: see README. Run `node --test tests/*.test.mjs` and `python -m unittest discover -s tests -p 'test_*.py'`. `node tests/make-browser-fixture.mjs` creates a synthetic import in the OS temporary directory; never deploy it under site/.

Set the deployment process's `CLOUDFLARE_ACCOUNT_ID=5695cae2becf35e049eb5df3e2849ae2`. Use a separate `XDG_CONFIG_HOME` for its Wrangler login. On the user's PC this is `C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth`; on another PC/cloud runner choose a separate private directory and authorize this account. Never copy OAuth secrets into Git. Deploy: `npx --yes wrangler@4.128.0 deploy --config wrangler.jsonc`. Verify: `npx --yes wrangler@4.128.0 deployments status --config wrangler.jsonc --json`.

Static `python -m http.server` can preview markup but cannot exercise authenticated sessions. For functional tests use a local auth-aware Worker harness with fixture secrets or the protected deployment. Never disable production auth for a preview.

## Rollback compatibility

Starting commit: `7ab5270f4cb296f3e17e31c856864d7f95039031`; starting Worker version: `2bc70e76-bf62-4800-b63c-eef5a8da27c6` (2026-10-07T12:30:18.696286Z). The starting commit includes later desktop-only changes; the hosted baseline predates those desktop changes.

Deploy Attribution first (standalone login remains compatible), then Arcus with the same bridge key. Roll back Arcus to graphs-only or Treasury first, then optionally `wrangler rollback 2bc70e76-bf62-4800-b63c-eef5a8da27c6 --config wrangler.jsonc` in this account. The old version ignores the bridge key and retains password protection. Never remove PASSWORD_* or SESSION_KEY during rollout/rollback. No schema/data migration or collector change is involved. See the paired Arcus release record for all three states and actual new deployment IDs.
