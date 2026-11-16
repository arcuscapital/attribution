# Add new share beside Trade: Attribution side (2026-11-16)

## Request (owner)
"In portfolio analytics trade I must be able to trade a new stock ... there should be [a] button saying add new share
and there I can add a share and put in % weight ... make sure this works all the way to the email stage." And: "in
portfolio analytics live prices does not have to be selected in compare to trade, put in the % weight but the % weight
calculation needs to be done based on live prices" (done on the Arcus side: the Trade screen sizes every weight at
live prices, last close when the market is closed; see its `docs/add-new-share-release.md`).

## What changed here
- `site/trade.mjs`: with the Trade slider on, **"+ Add new share"** beside Trade and Order type opens a panel: ticker
  (or a name from the Arcus share list) and "% weight", Add. A share already in the comparison (held, or held by the
  benchmark) gets the weight in its own New field; any other share is looked up and listed in the panel with an
  editable weight and a × remove button; the button shows the count. New shares belong to the portfolio like typed
  weights (another portfolio starts clean) and go to Trade with the other rows (hand-off format unchanged).
- `site/app.mjs`: the lookup (`/api/lookup` on Arcus, same origin) and the ticker list (`/api/config` companies,
  fetched once when the panel first opens); new shares count in the New total and the GICS, theme (their Arcus theme
  when the share is on the Arcus list, else Unclassified) and Reg 28 / SA equity tables.
- `site/style.css`: the panel; in the dark theme the Terminal look of this page's tables (black, #232323 heading band,
  #505050 rules, amber tickers, white names, weight 400). Checked in Brave by computed style: every sampled value matched.
- Fixes found while testing live: the panel's list no longer takes the results table's heading style; a ticker typed
  while the previous one is being looked up is kept.

No collectors, queues or cron work. `trade.mjs` itself still sends nothing.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution.git |
| Branch | `claude/add-new-share`, from `claude/trade-slider` `2c9ff93` (live application `9a42971`, version `a12e3f61`) |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0 |
| Previous production | version `a12e3f61-ab1d-4814-95e1-c2053f0e2ab7`, deployment `9c3e4486-cbdf-4365-a88e-f0a7675f552f` |

| Commit | UTC | Version | Deployment | Note |
|---|---|---|---|---|
| `3ffa160f0a11a3265dc1a1b473b763894e568b40` | 2026-11-16T07:53:23Z | `1aa62077-0566-4708-a548-6ccb3f293b0c` | `e1209d6b-1a7f-4717-a2e5-923c22bcee2d` | Add new share |
| `18bfaad6e2156fe2945c76f73649f75c6585e21c` | 2026-11-16T08:00:36Z | `e8ab79a2-7661-4e02-87f9-497957228d8d` | `fc4dabe0-1c6d-4b4d-af79-88f860a68632` | list style |
| `81ac006ccdc3c7d013dc9ccf8736ae5f28d46589` | 2026-11-16T08:04:20Z | `f280838d-18ab-46e3-aeab-707c7d991eb2` | `8d6846e1-04b5-4ce2-8ad7-514729b3fa75` | keep a ticker typed during a lookup |
| **`cd7d468d7f92b58e32ca73f8141f31c4a77e5b9f`** | **2026-11-16T08:16:52Z** | **`6d5ce316-5093-483f-860b-cb2ccf7f68d2`** | **`6d594455-8b0d-458e-9ace-945a6ac5d205`** | Terminal look (current) |

Arcus Watchlists must be on `4227f27` or later (production `d1fb9ab`, version `ad1b75f4-1a81-407e-9dad-44f54eff7b14`,
deployed 2026-11-16T08:16:30Z): its Trade screen looks up new shares that are on neither list and sizes at live prices.
With an older Arcus the panel still works and Trade still opens; shares on neither list are skipped there with a reason.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback a12e3f61-ab1d-4814-95e1-c2053f0e2ab7 --config wrangler.jsonc --message 'Rollback add new share'
```
Roll back Attribution before Arcus; deploy Arcus before Attribution.

## Tests and limits
- `node --test tests/*.test.mjs`: 181/181 (176 before; `tests/add-share.test.mjs` is new, 5 tests).
- Production, owner session in Brave (desktop, dark): EasyBF vs QQQ, SBK.JO 1% added (Standard Bank Group Limited,
  ZAR), New total 101.00, Reg 28 Local equity 29.16 → 30.16 and Total equity 66.63 → 67.63; "MTN" set MTN.JO's own
  New field (held). EasyAI vs QQQ: ASML.AS 1.5% and SAP.DE 1% added, total 102.50, theme table Unclassified
  1.04 → 3.54. Trade reached the Arcus Trade screen with "Sized at live prices" and the Submit figures in the Arcus
  record. Rise: the button explains Rise has no Arcus trade portfolio (unit-tested).
- Independent test agent (owner's Brave, after deploy): PASS. EasyAI vs QQQ: 7203.T 1.5 → total 101.50, SBK.JO 2 →
  103.50, AMD 2 (benchmark only, own New field) → 105.50, NVDA 1 (held, replaces 3.53) → 102.97, nonsense rejected,
  7203.T edited to 3 → 104.47, SBK.JO removed → 102.47, theme Total 102.47 (Unclassified 1.04 → 4.04). Best vs QQQ:
  ABG.JO 2, BHP.AX 1.5, SHP.JO (held) 2, MSFT (QQQ) 1 → 102.48; GICS Financials +2.00, IT +1.00, Unknown +1.50.
  Trade At Market / VWAP reached Arcus with every trade at its typed weight on Submit. Rise: explains no trade
  portfolio. The hidden Rise vs Swix copy of the buttons shares the same entries (invisible; harmless).
- **Not tested:** phones or the Android emulator (desktop Brave only); EasyBF in Portfolio Analysis by the agent
  (done by me, above).
