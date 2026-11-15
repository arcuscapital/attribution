# Trade slider, New weights and exposure tables (2026-11-15)

## Request (owner)
"In portfolio analytics under compare funds button add a slider saying Trade slider ... off by default ... it adds a new
column in avg % weight called new. The new weight has light grey text barely readable but a user can click inside it and
put in a new weight ... then that whole row from far left to far right is highlighted a dark grey ... The sum of new
weight is in the first row and must change as the user puts in new figures." Rise: GICS sector weights with a new
column. EasyBF: a Reg 28 table and an SA equity table by GICS, rebalanced to SA equity. Best: a GICS table like Rise.
GICS and Reg 28 columns right of CTR where they apply. A blue Trade button right of the download button that fills the
trade portfolio with the changed rows and goes to the regular trade flow (trading sign-in first if needed).
Later the same day: EasyAI and EasyGE (and IBKR, Marlow) get theme / sub-theme weights for portfolio and benchmark
instead of a GICS table; "only easy can be traded"; "don't change that order flow".

The logic: each fund is measured the way it is managed, and typed weights show the effect before anything is traded.
SA equity books (Rise, Best) by GICS sector; the balanced fund (EasyBF) by Reg 28 class plus its SA equity by sector;
the global thematic books (EasyAI, EasyGE, IBKR, Marlow) by Arcus theme and sub-theme.

## What changed
- `site/trade.mjs` (new): the slider's state, the New field, live sums, the exposure maths (`withNewSectors`,
  `reg28Tables`, `themeWeights`) and the Trade button. Loaded with a fallback: if a bridge does not serve it, the page
  works as before without the slider. The Marlow-only login never gets it.
- `site/index.html`: the switch directly under Compare funds (`role="switch"`, off on every load); sections for theme,
  Reg 28 and SA equity weights.
- `site/app.mjs`, `site/ranges.mjs`, `site/rise-swix.mjs`: New after Bmrk under "Avg % weight" in the ordinary table,
  the GICS-grouped table and Rise vs Swix; the first row and sector rows show the sum and follow every keystroke; a
  typed weight marks the whole row. Cash rows have no field. GICS sector (Best, EasyBF, Rise) and Reg 28 class
  (EasyBF) columns right of CTR. Phones show Security, Weight, New while the slider is on (holdings first), and the
  switch stays in the folded selection bar.
- Exposure tables: GICS sector weights gain "New % weight" for Best and Rise; EasyBF gets "Reg 28 weights" (limits 45 /
  75 / 10, a figure over its limit red) and "SA equity by GICS sector" (each sector over local equity); EasyAI, EasyGE,
  IBKR and Marlow get "Theme and sub-theme weights" in place of the GICS table. Reg 28 classes come from Arcus's own
  `easy-trades.js` (the Trade screen's rules), JSE sectors from the Rise vs Swix report; both are fetched only when a
  comparison needs them.
- Trade button (blue, white writing) and an order type (At Market / VWAP, required: an order cannot be made without
  one) right of Download Excel / Download CSV. It writes the changed rows to this tab's session storage and opens
  `/?tab=trade&acct=<fund>`; the Arcus Trade screen does the rest. Rise, IBKR, Marlow and ETFs get a plain message
  that they have no Arcus trade portfolio. The page sends nothing itself.
- EasyBF and Best in Portfolio Analysis: `site/online.mjs` prices JSE listings from cents with rand FX and does not
  reuse Arcus completed returns for `.JO` symbols; rand is their default currency.
- `cloudflare/bridge.mjs`: serves `trade.mjs`.
- Row colours from a small design agent (each text colour at least 4.5:1 on the row): dark `#3A3A3A`, light `#3F4955`,
  with an accent bar; faint placeholder `#5A5A5A` / `#9AA4B0`.

No collectors, queues or cron work.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution.git |
| Branch | `claude/trade-slider`, from `claude/analysis-collapse-charts` `1735331` (live application `fda5f94`) |
| Previous production | version `7df6a565-67b4-4679-bcd1-8e88741f16f4`, deployment `ca78e175-c769-4800-8820-379c3e2d04b3` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0 |

| Commit | UTC | Version | Deployment | Note |
|---|---|---|---|---|
| `292cfb9ac369a6bf28bf76100dff11fc0783a700` | 2026-11-15T16:08:21Z | `cd049c9f-b17b-4a7c-9cb3-5993c1a3eae1` | `209760ee-c98f-4e53-a631-e9964afbcb51` | slider did not load: this bridge did not serve `trade.mjs` (page fell back safely) |
| `80c643d87d8a85422f2031af5cef0c750640094c` | 2026-11-15T16:09:47Z | `aa444728-8b03-4e0b-befb-efb3bd780513` | `45ac6bad-12cd-44ac-acb4-6d789bd4bf2a` | bridge serves `trade.mjs`; both review agents ran on this |
| **`9a42971aa57462efce20753c36e9dc7fc5bdeed8`** | **2026-11-15T16:21:24Z** | **`a12e3f61-ab1d-4814-95e1-c2053f0e2ab7`** | **`9c3e4486-cbdf-4365-a88e-f0a7675f552f`** | steady buttons, phone order (current) |

Arcus Watchlists must be on `1ec80ba` or later (version `84f9f01f-624e-471e-bfe1-84d9de00a952`, deployed
2026-11-15T16:07:34Z; `docs/analysis-trade-slider-release.md` in that repository): its bridge serves `trade.mjs`, lists
EasyBF and Best, and its Trade screen reads the hand-off. Authentication and configuration are unchanged on both sides.

## Tests and limits
- `node --test tests/*.test.mjs`: 176/176 (165 before; `tests/trade-slider.test.mjs` is new).
  `python -m unittest discover -s tests -p 'test_*.py'`: 21/21.
- Local fixture renders (headless Chromium, synthetic data, 1680 px and 412 px, dark and light) for EasyAI, EasyBF, Best
  and Rise: no page errors, no sideways page scroll. These are **desktop viewport renders, not a phone**.
- Production, owner session in Brave (desktop, dark): Best vs QQQ 1D in rand priced its JSE shares with GICS sectors;
  Pan African +1.00 and MTN −1.00 moved Materials 31.84 → 32.84 and Communication Services 3.99 → 2.99, total 100.00;
  Trade reached Submit trades (details in the Arcus record). Final build: slider off on load, buttons do not move when
  the order-type message shows, EasyGE shows the theme table.
- Actual Android emulator (`marlow17`, Android 17, Chrome 145, 411 px, signed in): light theme EasyBF vs QQQ and dark
  theme EasyAI vs QQQ. A real tap switched the slider on in the folded bar; a real tap in a New field opened the numeric
  keypad; typing 8.5 for NewGold greyed its row, the total showed 100.63 and Reg 28 Gold 7.87 → 8.50; the row did not
  open. Trade led to the Unlock trading prompt (password not entered). The emulator ran the `80c643d` build; the
  phone-order change in `83039fe` was checked only in the 412 px fixture render. **Not tested:** a physical phone.

## Independent checks (two mini agents, after deploy, in the owner's Brave, build `80c643d`)
- Trade flow: PASS on every item. EasyBF vs QQQ: NewGold 7.87 → 8.37 and Pan African 3.36 → 2.86; Reg 28 Gold 7.87 →
  8.37, Local equity 29.20 → 28.70, Total equity 66.71 → 66.21; SA equity Materials 40.97 → 39.94. Trade (At Market) →
  "2 trades from Portfolio Analysis added", GLD.JO and PAN.JO shaded, Submit (2); Submit trades: GLD.JO buy 8,456
  shares, PAN.JO sell 210,361 shares, cash 4.38 → 4.38, "NOT SENT", "Email 2 trades" present and not pressed. Tapping a
  trade opened the usual order screen with its quantity. Dark and light rows readable. Its main finding, buttons moving
  when the order-type message appears, is fixed in `9a42971`.
- Portfolio logic: PASS on all five. Reg 28 classes recomputed from the table matched (Foreign equity 37.50, Local equity
  29.21 vs 29.20, Bonds 14.28, Property 6.77, Gold 7.87, Local cash 4.38); three typed weights gave Foreign 45.50
  (flagged red; 45.00 is not), Bonds 11.28, total 107.00; SA equity shares correct; Best and Rise GICS New columns moved
  only the edited sectors; theme tables for EasyAI, EasyGE, IBKR and Marlow reconcile to the holdings within 0.02.
  Notes, not errors: 33 QQQ holdings (15.67%) have no GICS sector or theme (they are not Arcus shares); a few held
  shares have no Arcus theme (SUSS MicroTec, Elite Material, Delta Electronics, Tema Oncology ETF, Kraken Robotics);
  totals can exceed 100 because cash is left as it is, by design.
- Both restored the saved selection (Rise vs Swix, 1D, ZAR) and the dark theme, removed test baskets and closed their tabs.

## Known limits
- Typed weights and the slider reset when the page is left (for example after pressing Trade and coming back).
- An invalid entry turns red with a tooltip only; it is ignored in every sum.
- A new weight on a share the fund does not hold becomes a buy only if Arcus can price it (Arcus or SWIX list).

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 7df6a565-67b4-4679-bcd1-8e88741f16f4 --config wrangler.jsonc --message 'Rollback trade slider'
```
That returns to `fda5f94` (collapsible graph and GICS weights). Roll back Attribution before Arcus; deploy Arcus before
Attribution. With Arcus left on `1ec80ba`, EasyBF and Best stay in the fund list but the older page does not price JSE
shares (0% assumed, labelled): roll Arcus back too (`9a8e1c8b-06c5-4d91-9ece-fa30fc5f704c`) to remove them.
