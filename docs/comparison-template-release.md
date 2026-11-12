# One comparison table template, Bloomberg PORT row colours (2026-11-12)

## Requests (owner)
1. With Bloomberg PORT photos (Rise Enhanced vs Swix All Share, GICS sectors expanded): "colour of fonts
   when you drop down is still wrong … companies always in orange only sectors white allocation always
   orange". Use a mini design agent to read the photos, deploy, then have an agent check the live site.
2. "look how you did rise swix … when you do others that dont have sector eg easyai easyge name should be
   company name as per rise swix in orange, ticker should be orange etc, avg weight orange, column width
   should be the same … it should be the same except rise swix has gics sectors that are white and drop
   down where others do not".
3. "make sure minidesign agent check rise swix and easyge easyai and other combinations are the same …
   check a range of options".
4. After seeing EasyGE vs BAI in the sector view: "i never asked for sectors name should be name of company
   ticker is company ticker . only rise swix have sectors in white, otherwise name of company in orange"
   (the same theme may repeat across companies).

## What changed (Attribution only)
- **Ordinary comparisons now use the Rise vs Swix layout** (`site/app.mjs`): Name and Ticker columns, then
  "Avg % weight", "Total return (%)" and "CTR (pp)", each over Port | Bmrk; Difference (Wgt | CTR) and
  Theme stay at the right end. The total is the first row (headline returns in the Total return cells,
  unrounded sums elsewhere, the missing count in the Total label). Figures have two decimals and no %
  sign, as in Rise vs Swix. A security has one return, shown on both sides, in italics on the side that
  does not hold it; a sector's return (Group by sector) is its contribution over its weight on that side.
  Exact zeros stay uncoloured. Phones keep the three-column view with tap-for-details.
- **Companies only outside Rise vs Swix:** the View control (Holdings / Sector) is hidden and a saved
  "Sector" choice is ignored, so every ordinary comparison lists companies. The sector view code is kept.
  Cause of request 4: the checking agent set View to Sector for one test case and the page saved that
  choice in the owner's browser.
- **Equal widths:** Name 360px and Ticker 100px in both tables (longer text ends in an ellipsis, full text
  on hover); the dark-mode total row hides its captions (they stay as hover titles), so figure columns
  stay 100px.
- **Dark mode colours follow Bloomberg PORT** (`site/style.css`), mapped by a mini design agent from the
  owner's photos onto the sampled palette: company names, tickers and their weights amber `#F9A836`;
  sector names and weights white; returns and CTR green `#4FEE74` / red `#F94A4D`; the ▸/▾ triangle light
  grey `#D7D7D7`; the last clicked Rise sector on a blue band `#2354B8` (estimated from the photos; the
  palette had no blue) with white text; Rise company names indented 48px. Same 24px rows, 18px Segoe UI
  400, 100px figure columns, a 280px minimum Name column and a 20px amber band under the headings in both
  tables. Ticker links have no underline in dark mode (underline on hover).
- `site/rise-swix.mjs`: remembers the last clicked sector (`rise-current`). Module and stylesheet versions
  bumped (`bloomberg-rows2-20261112`).

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/bloomberg-row-colours`, from Codex `codex/bloomberg-nav-20261112` at `bdb8706` (live application `55b9867`, which includes the return chart `e447b64`) |
| Previous production | version `0c2ca754-7a70-4b66-a812-307496252922`, deployment `de488412-7798-42a3-af6a-592bca06ae22` (Codex, 2026-11-12T09:41:25Z), confirmed live before each deploy |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0, dry run first |

| Commit | UTC | Version | Deployment | Change |
|---|---|---|---|---|
| `e6a606ad0ca189dfe7d9b7930dc63b58997f467b` | 2026-11-12T12:23:55.066296Z | `d58caabb-c2b4-4e3f-a3e6-d4843be69182` | `9e995f78-ada3-4b04-84d6-277b400b3d6e` | Template and colours |
| `621b661418bd29b798dd89f274380195f101a2be` | 2026-11-12T12:27:39.430953Z | `977b565e-7fe8-4e20-bcd1-48a583421c84` | `6d1b5de0-98fe-47f1-96df-87689262ee32` | One-line total row, uncoloured zeros, plain tickers |
| `1b3633e351c81f92fd6bbc10160dac9628452628` | 2026-11-12T12:38:36.688578Z | `8744cbc5-5ac5-4cd7-9677-dc864d67e430` | `5571454c-04c9-4759-bbea-2d7fc8ed57cc` | Equal Name/Ticker widths, total captions hidden |
| **`c5aa38da6e14b438252e297ae22c836b3aed8018`** | **2026-11-12T12:42:08.821137Z** | **`84d054ad-78d2-47b6-9931-c5fe2e9a17aa`** | **`2bb9a7f8-5caa-4922-903d-16808a716135`** | Companies only; View control hidden (current) |

## Tests and limits
- `node --test tests/*.test.mjs`: 153/153 at the final commit (152 before the companies-only test) (new: Rise vs Swix column layout, Port/Bmrk labels, sector
  returns, no negative zero, total row first with headline returns and missing counts, dark colour rules).
- Production, owner session in Brave (desktop): EasyGE vs QQQ last month showed the two heading rows, the
  total first (24px, black, grey) and company names, tickers and weights amber, returns red/green with
  italics on the non-holding side, headline -15.13 / -6.66 matching the summary; Rise vs Swix last month,
  Financials expanded: blue band, white sector text, companies amber, Ticker and figure columns 100px.
- Mini design agent (read-only, desktop Brave, 1463x898): Rise vs Swix 1D / last month / MTD with sectors
  expanded, and EasyGE vs QQQ, EasyAI vs BAI, IBKR vs SOXX, Marlow vs QQQ, EasyGE vs VOO last year. Colours,
  fonts, 24px rows and the amber band matched; it found unequal Name/Ticker widths and CTR columns widened
  by total-row captions, fixed in `1b3633e`.
- Final production check (version `84d054ad`), owner session in Brave: View control hidden, View
  forced to Holdings; EasyGE vs BAI last month 80 companies, EasyAI vs QQQ last 3 months 128, IBKR vs SOXX MTD
  60, Marlow vs QQQ WTD 127, each with amber name/ticker/weights and Name 360 / Ticker 100 / figures 100px;
  Rise vs Swix last month Name 360, Ticker and figures 100px, Real Estate on the blue band.
- Light mode keeps its own colours. Not tested: Android emulator, physical
  phone (the phone view itself is unchanged apart from figures without the % sign).

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 0c2ca754-7a70-4b66-a812-307496252922 --config wrangler.jsonc --message 'Rollback comparison template and PORT row colours'
```
That returns to Codex's Bloomberg NAV release (keeps the return chart, backup prices and 0% default).
Attribution only; the Arcus Watchlists Worker is untouched.
