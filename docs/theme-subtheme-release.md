# Theme and Sub-theme columns (2026-11-13)

## Request (owner)
"when compare instead of having multiple themes can you have the primary subtheme so it is easier to sort
… have two columns first comes theme which could be the main theme heading eg AI and sub theme would be
the most specific theme eg semi cap or power etc so it is easy to sort. The column width of both theme and
sub-theme should be max width = width of name column". Then: "you can git deploy test, make sure it looks
good with a very small mini agent".

## What changed (Attribution only)
- The single Theme column (every list a company appears in, e.g. "Watch / Ai / Chips / Bai / LOUP / AI
  Bottleneck / JPM …") is replaced by **Theme** and **Sub-theme**, one value each, after Difference.
- **Rule** (`primaryThemePath` in `site/arcus-source.mjs`), from the Arcus membership paths
  `[theme, sub-theme, detail]` the Arcus bridge already sends (no Arcus Watchlists change):
  - Theme = the company's first Arcus theme, Sub-theme = its second level (e.g. Ai › Semis, Ai › Equipment,
    Ai › Memory, Infrastructure › Cooling, Industrial › Construction). Every company in the universe has one
    sub-theme path across all its Arcus themes (checked: 855 companies, no conflicts).
  - Watchlist folders (Watch, Td, Ibkr2, Indices, Ark, ARKunderlying, Arkx, Bai, Dow, LOUP, Feb2025,
    Regimeshift2025, Watchingainow, Cloudbestbeats, Qualitysustainablegrow, Currency; the same list Arcus
    uses for "real themes") and ETF holdings lists (e.g. WCLD) are never the theme.
  - No Arcus theme: a research list (AI/Energy/Robotics Bottleneck, JPM lists) gives the theme; a company
    held only in folders shows Theme "Unclassified" with the folder entry's sub-theme (e.g. Palantir:
    Software; American Express: Payments). Universe check: 105 such companies; 23 (WCLD-only) have no theme
    data and show Unclassified / —.
  - Hover on either cell shows the full path (e.g. Ai › Semis › Accelerators).
- **Sorting:** Theme sorts by theme, then sub-theme, then name (sub-themes of a theme sit together);
  Sub-theme sorts by sub-theme, then theme, then name.
- **Widths:** both columns at most the Name column's width (188px, dark desktop), narrower when the text is
  shorter; longer text ends in an ellipsis. Light mode: 120–220px.
- `site/engine.mjs` carries `subTheme` and `themePath` on each row; module versions bumped to
  `themes-20261113` (app, worker, engine, online, arcus-source, stylesheet).

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/theme-subtheme`, from `claude/bloomberg-row-colours` at `6627f4b` (live application `7b81548`) |
| Previous production | version `a0ea3ee7-4f94-4204-a5d4-e568cc779fa8`, deployment `fbcc489e-e253-4762-8da4-00aa264a740b`, confirmed live before deploying |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0, dry run first |

| Commit | UTC | Version | Deployment |
|---|---|---|---|
| **`408b97b3d7aa3daad6d192693a2482a5cb0437a8`** | **2026-11-13T07:54:06.359663Z** | **`a4f23a00-f15a-474f-a20e-0d577d46bb2e`** | **`cf70645c-27e3-4abb-9c8c-65c311bbc5a5`** |

## Tests and limits
- `node --test tests/*.test.mjs`: 154/154 (new: theme rule for core themes, folders, ETF lists, research
  lists and empty input; Theme/Sub-theme columns, tie-break order, total row dashes).
- Production, owner session in Brave: ARKK vs BAI last month showed Theme 160px and Sub-theme 188px (Name
  188px), e.g. Tesla Ai / Autos, Micron Ai / Memory, Lam Research Chips / Equipment, with the full path on
  hover; 26 rows Unclassified / — (holdings with no Arcus theme data). The owner's saved selection was
  restored afterwards.
- Mini design agent (read-only, desktop Brave 1400x859), EasyAI vs BAI last month: one theme and one
  sub-theme per row (e.g. Ai / Semis, Chips / Equipment, Infrastructure / Cooling); Name 188px, Sub-theme 188px,
  Theme 160px; "Data Center Electrical & Thermal" ends in an ellipsis; sorting by Sub-theme put same
  sub-themes together; dark colours, alignment and header correct. It restored the saved selection (ARKK vs
  BAI, USD, 1D). The sort order is not saved, so it resets on reload.
- The theme choice follows Arcus's membership order, so a semiconductor listed first under Chips shows
  Chips rather than Ai; sorting by Sub-theme still groups them. Desktop Brave only; no phone or emulator.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback a0ea3ee7-4f94-4204-a5d4-e568cc779fa8 --config wrangler.jsonc --message 'Rollback Theme and Sub-theme columns'
```
That restores the single Theme column with the narrower Name column (`docs/comparison-template-release.md`).
