# Portfolio Analysis integration — 10 October 2026

## Repositories and preserved starting states

Arcus: https://github.com/arcuscapital/arcus-watchlists.git, branch `codex/portfolio-analysis-mobile`, created from `2da6f9e27b1c3a804cf4f4ef9f4a28654e23b686` (documentation-only child of the verified graphs-only application commit). Analysis: https://github.com/arcuscapital/attribution.git, branch `codex/arcus-mobile-integration`, created from `7ab5270f4cb296f3e17e31c856864d7f95039031`.

| Rollback state | Arcus application commit | Arcus Worker version | Compatible Analysis |
| --- | --- | --- | --- |
| Original Treasury version live at start of 10 October | `d51ae4d0a9757eb6ec2d0a969697f76fecface57` | `98c4a615-05c3-4213-bd07-f69702de43c9` | Starting standalone version below, or new backward-compatible version |
| Graphs only | `2828e1a8b3a6bebd4dc04d55a3b62e119f38f091` | `42785cce-8059-4716-a5ef-882e5f47dc59` | Starting standalone version below, or new backward-compatible version |
| Graphs plus Portfolio Analysis | `c81c7109a7e7e9755821e53bd68e928c0c7d39b4` | `42cdaffd-c7a8-422e-9651-fc748255f941` | Analysis `724b3d0a0feccc7172d148e2c6d168a500492f4c`, version `dd1fe002-93db-49ab-ac04-ade286b8c234`; matching `ANALYSIS_BRIDGE_KEY` required |

Starting Analysis Worker: `2bc70e76-bf62-4800-b63c-eef5a8da27c6`, deployment `40995dc9-aa79-477c-b902-f1726831d045`, 2026-10-07T12:30:18.696286Z. Its starting Git commit also contains later desktop-only changes; those do not affect the hosted baseline.

Treasury deployment: `f61fad2d-1256-4e39-80a9-7cb8980290f1`, 2026-10-08T13:00:12.665834Z. Graphs-only deployment: `0fcc48de-ce6b-4d43-b183-96a76ce9979f`, 2026-10-10T11:29:06.266585Z.

## Deployments in this task (UTC)

1. 2026-10-10T11:45:33.156735Z: provisioned only the new server-side bridge key on Analysis's existing code. Version `897c363f-68f9-4959-8c4c-d4baee1a1265`, deployment `e1741404-b50f-488a-a853-24f9592e8900`.
2. 2026-10-10T11:45:37.426027Z: same secret on Arcus's graphs-only code. Version `a5ee3541-f794-46eb-ae39-73978792d241`, deployment `f92c6ebb-4252-43b9-97f0-8e6613ef3f0e`. Existing authentication secrets were preserved.
3. 2026-10-10T11:45:59.521755Z: Analysis application `73cf6ac3d63966fee65a5299b9f032ca4278663d`; version `3f3816af-79f5-4999-bea0-e66eaf27f448`, deployment `86d00ed4-b289-4321-baf3-d9dee575fbf8`. 37 Node + 17 Python tests passed. Backward-compatible standalone password login.
4. 2026-10-10T11:46:26.264376Z: Arcus application `71117ae3fcf722c0432dec9fb4148ea904c6b95b`; version `bfbeca03-3b4f-480c-a156-ad319c49f8af`, deployment `6f1e3edb-4e31-4779-a3a8-93056ff5bcb4`. 838 Node tests passed; manifest check passed. Wrangler reported 5 ms startup (not a measured end-user page load).
5. 2026-10-10T11:52:26.67902Z: Analysis application `724b3d0a0feccc7172d148e2c6d168a500492f4c`; version `dd1fe002-93db-49ab-ac04-ade286b8c234`, deployment `6c6add56-0490-40d4-9cbc-c3df0f3d1553`. Mobile refinements after actual emulator review: shorter classification text, phone-first import button, visible disclosure arrows, cancellation cleanup. 37 Node tests passed again; calculation engine and Python unchanged. Wrangler reported 1 ms Worker startup.
6. 2026-10-10T12:17:51.291852Z: Arcus application `c81c7109a7e7e9755821e53bd68e928c0c7d39b4`; version `42cdaffd-c7a8-422e-9651-fc748255f941`, deployment `b51278ae-30f1-4ed2-9c05-028e5bfa8471`. Replaced the tiny plain-text unauthorised page with an accessible 401 page and sign-in button. 838 tests and asset manifest check passed again. No static assets changed; Wrangler reported 10 ms Worker startup, not end-user latency.

## Architecture and impact

Three-dot menu → Portfolio Analysis opens a full page at `/portfolio-analysis/` on the Arcus origin, inside the PWA's `/` scope. It does not use an iframe; both applications retain their frame protections. Existing Arcus authentication gates every page/module/session request. A method/path/time-bound HMAC assertion is sent only between the two Workers to obtain explicitly allowed static assets. It is never returned to the browser or placed in a URL. Cookies, credentials and arbitrary client headers are not forwarded. Redirects/upstream cookies are not accepted. Missing keys and invalid assertions fail closed.

Standalone Analysis password login still works independently. Integrated sign-out uses Arcus logout. Imported data remains in browser memory and is cleared when session validation fails. The phone must import its existing `arcus-attribution.json` archive; this does not provide automatic access to PC files or add cloud archive sync.

No trade route, trading permission, collector, queue, cron, database schema, price refresh or calculation formula changed. The Analysis UI/assets load only when opened. There are foreground Worker requests for its small assets and session checks; this is not zero additional Cloudflare usage. Calculations remain in the browser's existing dedicated Web Worker. No ongoing polling or background data collection was added.

## Tests

Automated: Arcus 838/838; Analysis JavaScript 37/37 and Python 17/17. New security tests cover missing/forged/expired assertions, exact method/path binding, timestamp tolerance, missing keys, allowlisting, no credential forwarding, redirect/error handling, standalone access controls, cookie expiry/logout and race-safe session locking. No fixture secrets are production credentials.

Live anonymous checks: integrated root/app.mjs/engine.mjs/session return 401 with private no-store and frame DENY. Standalone root still shows its password form; app.mjs/engine.mjs/session and unsigned bridge paths return 401.

Actual emulator: existing Pixel 7-profile AVD `marlow17`, Android 17 / SDK 37, Chrome 145.0.7632.218, 1080×2400, ~411 CSS-pixel portrait width. Tested by ADB touchscreen input and Android native pickers, not a resized desktop browser. Device settings altered for tests are restored afterwards. Synthetic data only, no trades.

A host-GPU rendering freeze was encountered after rotation; screenshots from that frozen state are not accepted as passing evidence. Read-only on-device debugging confirmed updated DOM/calculations while the emulator pixels were stale. The emulator was restarted with the official `-gpu swangle` backend, and portrait, rotation, calculation and controls were retested successfully.

### Final live Android verification

- Menu entry and automatic Arcus session reuse passed. No Analysis password was entered. Back returned to the originating Arcus screen, including Settings after testing dark mode; earlier Watchlist return also passed.
- Native Android file picker import and its on-screen keyboard/search passed. Cancel returned to Analysis with its current report retained. Analysis selectors use native pickers and dates use the Android calendar, rather than text fields covered by a keyboard.
- Both fund selectors, USD/ZAR, date presets/custom dates and Holdings/Sector selectors passed touch testing. Phone fields have 48 CSS-pixel minimum heights. Read-only on-device measurements found a 411px document within a 411px portrait viewport. Wide financial tables scroll inside their container; the document does not overflow horizontally.
- Synthetic TEST-A versus TEST-B, 5 October, USD: -2.00% versus 0.00%; difference -2.00%, sector allocation -1.00pp each. Custom 2–5 October, ZAR: 5.96% versus 7.10%, difference -1.14%. Sector disclosure, charts, table swipes and CSV export worked; Android Downloads contained `attribution-2026-10-02-2026-10-05.csv`. No trades executed and no private archive uploaded.
- Light and dark screens were inspected. Rotation to landscape reflowed cards/chart; returning to portrait preserved selections/results and remained responsive after changing the emulator graphics backend.
- Live Sign out returned to Arcus login. Back did not reopen a signed-in page; a direct Analysis request was denied. The final 401 screen was inspected on Android after deployment and presents a readable sign-in button. Anonymous modules/session paths remain denied. Time-based expiry, forged assertions, cookie expiry and in-flight logout races were exercised with controlled automated fixtures, not by claiming to wait out the production 180-day Arcus browser cookie.
- Emulator rotation preference and hardware-keyboard setting were restored; Arcus theme was restored to Phone settings. **The emulator remains running**, as requested. No physical Pixel was tested. Existing AVD is Pixel 7-profile Android 17, not Pixel 9. Astra High could not be independently verified through available tools; no model-switch claim is made.

Evidence is committed under `docs/evidence/portfolio-analysis/`: `menu.png`, `light-entry.png`, `dark-results.png`, `custom-zar.png`, `allocation.png`, `landscape.png`, `keyboard.png`, `session-expired.png`. All calculation screenshots use synthetic data. Authenticated screenshots cover the final Analysis application and Arcus integration; the last Arcus-only revision changes only the unauthorised page, separately captured after deployment.

## Rollback

First set Arcus's process account to `42dd726446271f45425eab740741b864`. To retain charts but remove the integration:

```sh
npx --yes wrangler@4.128.0 rollback 42785cce-8059-4716-a5ef-882e5f47dc59 --config cloudflare/wrangler.jsonc
```

For the original Treasury state instead, use `98c4a615-05c3-4213-bd07-f69702de43c9`. Verify `deployments status` and unauthenticated/signed-in pages afterwards. These versions have no analysis menu/bridge route.

Only after Arcus is rolled back, optionally roll back Analysis under account `5695cae2becf35e049eb5df3e2849ae2` using its separate Wrangler auth directory:

```sh
npx --yes wrangler@4.128.0 rollback 2bc70e76-bf62-4800-b63c-eef5a8da27c6 --config wrangler.jsonc
```

Its old standalone password mechanism remains compatible. Keep PASSWORD_PEPPER, PASSWORD_VERIFIER, SESSION_KEY, LOGIN_LIMITER and all existing Arcus secrets unchanged. The bridge key is ignored by old versions and may remain unused. Rolling Analysis back first would make the new Arcus entry return 503, so do not reverse the order. No data rollback/migration is required. If a historical Worker version expires from Cloudflare retention, deploy the recorded commit with matching assets after rebuilding/checking its manifest; review that commit's exact config before deploying.

To restore the integration after rollback, first deploy Analysis `724b3d0a0feccc7172d148e2c6d168a500492f4c` with a matching bridge key in both accounts, then Arcus `c81c7109a7e7e9755821e53bd68e928c0c7d39b4`. Never store the key in this document or Git.

Evidence path above refers to the Arcus repository: https://github.com/arcuscapital/arcus-watchlists/tree/codex/portfolio-analysis-mobile/docs/evidence/portfolio-analysis . This copy records the paired release; images are not duplicated here.
