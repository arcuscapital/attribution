# Bloomberg-style comparison tables release (2026-11-12)

## Request
In dark mode, after Compare, the tables should look like the owner's Bloomberg PORT attribution screen:
the same text colours, weights and line spacing, with smaller page margins. The owner later noted the
first version's white looked too bold and asked for a one-to-one mapping.

## Sources for the values
- Pixel sampling of the owner's Terminal screenshot (lossless PNG, 1541 x 650): rows #141414, total row
  #000000, headings #232323, amber band #F9A836 (24 px), 1 px #505050 column dividers, no row lines, 26 px
  row pitch, gains #4FEE74, losses #F94A4D. Text: sector rows #FFFFFF; headings and the total row
  #D7D7D7. Strokes about 2 px at about 19.5 px glyph size.
- The Bloomberg News skin session (it matched the Terminal earlier): regular weight everywhere, no bold
  numbers, Bloomberg's own fonts are not available on the web.
- Two helper design agents: one measured the screenshot's typography, one reviewed each deployment.
- Font choice measured in the owner's Brave (110% zoom) against the screenshot's word widths and cap
  height: Segoe UI at 18 px within 3.5%; Arial about 17% too wide on capitals; Arial Narrow not installed.

## What changed (Attribution `site/style.css` only)
- Dark theme, both the Rise vs Swix table and the ordinary comparison table: Segoe UI, weight 400
  throughout, values above, 20 px amber band inside the heading cells, compact 100 px number columns,
  tables sized to their content, one-line names (ordinary table: company name beside the ticker, long
  names and themes end in "…").
- Desktop (601 px and wider): 24 px rows, about 26 screen px at the owner's 110% zoom. Phones keep their
  larger touch rows and earlier sizes.
- Page width: up to 1880 px with 20 px side margins at desktop widths (both themes).
- Light theme tables unchanged. No JavaScript, data, KV, D1, cron, queue or Watchlists change.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/bloomberg-tables`, from `claude/rise-swix-live-zero` at `8b2ce10` (live application `f72d3f3`) |
| Final application commit | `6734a8a3cfe1a1001c356281ec56f96cfa2c4708` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `572ad495-ee49-4452-97ed-06b8b871591e`, deployment `8bf6d18e-ba22-4d3c-9bd2-87838ee8210a`, application `f72d3f3` (confirmed live before the first deploy) |
| Wrangler | 4.129.0, `--config wrangler.jsonc` (dry run passed first) |

Deployments, each confirmed live before the next (all 100%):

| Commit | UTC | Version | Deployment | Change |
|---|---|---|---|---|
| `742d295` | 2026-11-12T07:48:06.501228Z | `85a0cd9e-d819-4050-8cde-ca750250001a` | `bcabc912-68ad-4010-b857-8b87502dbb44` | First Bloomberg look, margins |
| `a748258` | 2026-11-12T07:52:33.320259Z | `ad182d00-b7fd-474d-a2b6-c6614c51c28c` | `28417665-cbb0-498f-89fa-f8a46812b3a5` | Design review: columns, band, size |
| `ad42f5c` | 2026-11-12T07:55:33.751139Z | `baada3e1-6911-45e3-b44d-1ad2b164027f` | `8d6d44f9-abce-4e3c-8908-1915c49e306c` | Segoe UI 18 px, Terminal greys |
| `8b691d1` | 2026-11-12T07:57:54.570498Z | `697cf376-f35d-4b77-8ab3-4a3a90a057d1` | `0b486070-595f-44a6-afcf-a4aa99196fab` | Name column fits one-line names |
| **`6734a8a`** | **2026-11-12T08:00:54.631607Z** | **`3ceb112b-aa59-49f1-9740-2bbc9bb37bbf`** | **`3c8e390b-352e-44a1-a408-f8b62ea83dab`** | Headings aligned (current) |

## Tests and limits
- `node --test tests/*.test.mjs`: 141/141 passed before each deployment (CSS-only changes).
- Local harness with synthetic data in the Claude app's built-in browser pane (first version only):
  computed fonts, colours and 24 px rows in dark theme; light theme unchanged.
- Production, owner session in Brave at 110% zoom: Rise vs Swix Live, 140 rows, 24 px rows, Segoe UI
  18 px, headings and total #D7D7D7, total row on black, gains/losses as sampled, no name overflow, Name
  and Ticker headings on the Port/Bmrk line; IBKR vs BAI 79 rows at 24 px with 72 ticker links.
- The final design review judged spacing close to the Terminal and the weight regular, not bold.
- 1D Rise vs Swix currently fails for a separate reason: Yahoo's 11 November daily bar is empty for JSE
  shares (no close or volume) although the JSE traded. Not changed here.
- Not tested: Android emulator, physical phone. Glyph shapes differ from Bloomberg's proprietary fonts.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 572ad495-ee49-4452-97ed-06b8b871591e --config wrangler.jsonc --message 'Rollback Bloomberg-style tables'
```
That keeps the Rise vs Swix Live 0% rule (`docs/rise-swix-live-zero-release.md`). Attribution only.
