# IWV in Portfolio Analysis — 24 November 2026

Repository https://github.com/arcuscapital/attribution.git, branch `claude/pa-iwv`; starting commit `7f647ea67053ba01fa8e2d3a4cbb1bd278f57e75` (live code `726b204352be9fb0cb5b2c201b2a24fe4ae71d37`, version c39e8c66). Application commits `44a6881809c11b223971fbca76e5e0a48eec9f66` (picker) and `04da1b4ae43cbfa51ad60298c887c0a983029717` (app.mjs cache version `iwv-20261124`).

Paired Watchlists release: https://github.com/arcuscapital/arcus-watchlists.git, branches `claude/iwv-holdings` (main, `a1d5e5a30145881898f6272772ca14f63422f1a2` on `65a3a89`) and `claude/iwv-holdings-worker` (holdings, `5beda5b67367147bec41d38a58f265dcac11dca0` on `d36ecd6`); record `docs/iwv-holdings-release-20261124.md` there.

## What changed

- `site/app.mjs`: IWV (iShares Russell 3000) is in `INDEX2`, so the **benchmark** picker shows it under **Indices 2** beside VONE (Russell 1000), and in **Market benchmarks**, so the **portfolio** picker shows it beside VOO and IJR. IWM stays out.
- `site/index.html`: `app.mjs?v=iwv-20261124` so browsers load the new picker.
- `tests/indices2.test.mjs`: IWV now expected under Indices 2 (benchmark) and Market benchmarks (portfolio); IWM still excluded.
- IWV appears in the pickers only when Arcus lists it in the catalogue, which needs IWV's dated iShares weights in `arcus-etf-holdings` (first nightly run 2026-11-24 23:00Z). Until then nothing changes on screen.
- No engine, auth, bridge, secret, KV or schedule change. The Arcus HMAC bridge and standalone login are unchanged.

## Deployments (account 5695cae2becf35e049eb5df3e2849ae2)

| Time (UTC) | Version | Deployment | Commit |
|---|---|---|---|
| 2026-11-24T16:03:16Z | c2b8bb50-a514-4a58-8a0a-84eb9957f257 | 1fdc7c9d-e857-43cf-b73a-7d4668736887 | 44a6881 |
| 2026-11-24T16:04:36Z | **09cfad3d-73d3-4c3f-b366-cdff0c3b9190** | 0654f342-5e43-4a23-b5b3-a72015ab4a37 | 04da1b4 |

Deployed before the Arcus holdings and main Workers (the Indices 2 order). This checkout has `core.autocrlf=true`, so most `site/` files went up with CRLF endings as before; `index.html` and `online.mjs` had last gone up as LF and were re-uploaded with identical content. Nothing hash-checks these files.

## Tests and limits

`node --test tests/*.test.mjs`: **250 / 250 passed**. No DOM test exists for the picker. No live IWV comparison could be run yet (no IWV weights before the nightly run). Cost note: a multi-day IWV comparison requests one price history per constituent (about 2,600, 16 at a time), as VONE does with ~1,030; this is the reason Indices 2 left IWV out on 5 Nov, and the owner asked for it on 24 Nov. One-day comparisons reuse Arcus saved returns. No Android emulator or physical device testing is claimed.

## Rollback

Roll back Arcus main and holdings first (paired record), then optionally:

```powershell
cd C:\Users\Skrom\ArcusPAIWV
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx wrangler@4.129.0 rollback c39e8c66-1521-46d7-babc-b3fd8f18fc9f --config wrangler.jsonc
npx wrangler@4.129.0 deployments status --config wrangler.jsonc
```

Rolling back only Attribution is harmless: IWV would then sit under "Other ETFs" in both pickers if Arcus still lists it.

## First live IWV comparison (25 Nov 2026, ~07:44Z)

Run in the owner's signed-in Brave with the page's own `online.mjs` (`createOnlineSource().load`), exactly as the Compare button does: portfolio **QQQ**, benchmark **IWV**, 17–24 Nov 2026, USD, total return. IWV was still partly resolved (977 of 2,581 positions had no identity yet; the nightly holdings run finishes them).

| Run | Time | Price requests | Failures |
|---|---|---|---|
| First (cold prices) | **45.1 s** | 1,636 | 0 |
| Second (cached prices) | **12.1 s** | 1,636 | 0 (identical results: 26,176 levels) |

IWV snapshot: 2,584 weighted positions dated 2026-11-23. Cloudflare cost for both runs together (07:43:30–07:56Z): Arcus `arcus-watchlists` (bridge) 3,282 requests, 4,514 CPU-ms (p50 1.2 ms, p99 6.9 ms); `arcus-attribution` 3,213 requests, 11,475 CPU-ms (p50 3.4 ms, p99 6.6 ms), 1,639 Yahoo subrequests (first run only); `arcus-etf-holdings` 4 requests, 194 CPU-ms (largest 172 ms, the IWV packet). No errors. About 8k CPU-ms and 1,600 requests per account per IWV comparison. Once all IWV positions are identified, expect about 2,500 price requests, so roughly 70 s cold and 18 s warm (scaled, not measured). No phone or emulator test.
