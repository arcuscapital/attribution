# Sector SPDR futures rows and sector-first labels — 25 November 2026

Owner requests (25 Nov): explain the "No price, counted as 0% return" list on IWV vs XLV, and "for those sector ETFs … put the sector first so it's easy to read", as the Arcus Watchlist does. Go-ahead to deploy: "Yes, deploy both".

Repository https://github.com/arcuscapital/attribution.git, branch `claude/pa-sector-futures`, starting commit `683604e` (live code `04da1b4`, version 09cfad3d). Application commits `20c8612` (futures/CONTRA rows, cache keys) and **`55f94898ac33cd89e467f764e3dc14773930a893`** (sector-first labels).

Paired Watchlists release: branch `claude/iwv-identity-names` (`d95b682`), holdings version 255cf481, record `docs/iwv-identity-names-release-20261125.md` there. That release fixes the 42 IWV names; this one fixes the XLV rows and the labels.

## What changed

- `site/arcus-source.mjs` `asset()`: State Street sector SPDR index futures (CME code and month-year name, e.g. XLV `IXCZ6` "XAV HEALTH CARE DEC26"; also XLU, XLE, XLY, XLB, XLK, XLF, XLP) are **Derivative**, and State Street's "CONTRA <company>" rights rows (XLV Hologic, XLP Walgreens) are **Corporate action**. They no longer appear as unpriced listed shares. Returns are unchanged (0 %, as before).
- `site/app.mjs`: the eleven sector SPDRs read **"Health Care · XLV · State Street sector ETF"** in both pickers (full name on hover) and **"Health Care · XLV"** on the selected-fund card; they sit together in sector order after a group's other funds; a sector name finds its fund in the picker search. Other funds unchanged. Result tables keep the ticker (phone widths unchanged).
- Cache keys `futures-20261125` for `arcus-source.mjs`, `online.mjs` and `app.mjs` (index.html).
- No engine, auth, bridge, secret, KV or schedule change. The Arcus bridge passes the static files unchanged.

## Deployment (account 5695cae2becf35e049eb5df3e2849ae2)

| Time (UTC) | Version | Deployment | Commit | Replaces (rollback) |
|---|---|---|---|---|
| 2026-11-25T10:16:46Z | **c508e1f6-ea20-4184-a648-e75260ee967f** | 784feec9-344a-4d12-939a-c1c08aa6398c | 55f9489 | 09cfad3d-73d3-4c3f-b366-cdff0c3b9190 |

`deployments status` confirmed 09cfad3d was still live before deploying. Four assets uploaded (app.mjs, arcus-source.mjs, index.html, online.mjs). This checkout has `core.autocrlf=true`; nothing hash-checks these files.

## Tests and limits

- `node --test tests/*.test.mjs`: **251 / 251 passed** (250 before; new sector-label test; arcus-source test extended with the State Street rows and look-alikes that must stay listed: COTERRA/CTRA, DECKERS/DECK). `python -m unittest discover -s tests -p 'test_*.py'`: 21 / 21 OK. Two version-pinning tests updated to `futures-20261125`.
- Local pictures before deploy: synthetic copy of `tests/mobile-server.mjs` with sector funds, Playwright at 1366×900 and 412×915 @2.625 (light theme, sample data).
- **Live check in the owner's signed-in Brave** (Brave 158, 10:2xZ): page loads `app.mjs?v=futures-20261125`; benchmark reads "Health Care · XLV · State Street sector ETF +2.95%"; search "health" finds it under Indices 2; IWV vs XLV One Day 24 Nov: "No price" list 44 → **42** names, no XAV/CONTRA rows; coverage line 97.01 % / 99.46 % unchanged. The 42 remaining names are IWV identities fixed by the paired holdings release after its 23:00Z run.
- Desktop only. No Android emulator or physical device test.

## Rollback

```powershell
cd C:\Users\Skrom\ArcusPAFutures
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
npx wrangler@4.129.0 rollback 09cfad3d-73d3-4c3f-b366-cdff0c3b9190 --config wrangler.jsonc
npx wrangler@4.129.0 deployments status --config wrangler.jsonc
```

Rolling back only brings back the old labels and the two XLV "No price" rows; it does not affect the holdings release.
