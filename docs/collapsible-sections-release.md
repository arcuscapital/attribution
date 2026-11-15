# Collapsible return % graph and GICS sector weights (2026-11-15)

## Request (owner)
"in portfolio analytics have a thing where I can select to drop down and show return % graph and gics sector weight. it
should be open by default for both but there must be a little drop down arrow so I can hide or unhide that content."

## What changed (Attribution only; Arcus unchanged, no new files in the bridge allowlist)
- `collapsible(host, label)` in `site/ranges.mjs` wraps a section in a slim toggle bar with an arrow (▾ open, turned ▸ closed,
  `aria-expanded`, "Hide/Show …" label). Both sections are open on every load; the choice is not stored. The wrapper follows the
  section's own `hidden` state, and a closed section is only hidden with CSS, so the chart redraws at full width when reopened.
- Applied to `#return-chart` ("Return % graph") and `#gics-weights` ("GICS sector weights") in the ordinary comparison
  (`site/app.mjs`), and to the same two blocks inside Rise vs Swix (`site/rise-swix.mjs`). `site/index.html` order is unchanged;
  cache-bust `?v=collapse-20261115` on app/ranges/rise-swix/style.
- `site/style.css`: light mode uses the page's border; dark mode follows the Bloomberg look (black row, grey Segoe UI, amber arrow).

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution.git |
| Branch | `claude/analysis-collapse-charts`, from `claude/sector-weights` `cbea8ef` (live application `75f70aa`) |
| Previous production | version `06694292-d1fa-412e-8e55-101c09bb3a23`, deployment `93147585-32c8-4630-a840-4be64193dc3f` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution`, Wrangler 4.129.0 |

| Commit | UTC | Version | Deployment |
|---|---|---|---|
| **`fda5f94358316c1a5c86389769c375ae4d2f11e2`** | **2026-11-15T09:05Z** | **`7df6a565-67b4-4679-bcd1-8e88741f16f4`** | **`ca78e175-c769-4800-8820-379c3e2d04b3`** |

## Tests and limits
- `node --test tests/*.test.mjs`: 165/165 (new `tests/collapsible.test.mjs`); `python -m unittest discover -s tests -p 'test_*.py'`: 21/21.
- Production, owner session in Brave (desktop): IBKR vs BAI last month, both toggles open on load; each closes to a 44 px bar and
  reopens (chart redrawn at 1283 px); Rise vs Swix last month shows the same two toggles inside the Rise panel, both open and closing.
  The owner's saved selection (GPT vs MTUM, 1D, USD, no grouping) was restored.
- Actual Android emulator (`marlow17`, Chrome, signed in): IBKR vs BAI last month at 411 px, no sideways scroll; a real tap on the
  GICS bar collapsed it (arrow turned, Method panel moved up) and a second tap reopened it. **Not tested:** a physical phone; dark
  mode on the emulator (desktop dark mode only).

## Independent check (mini review agent, after deploy, read-only in the owner's Brave)
PASS: both toggles open after a run, each hides only its own section and restores, in the ordinary comparison and in Rise vs Swix; IBKR vs BAI last month weights sum to 99.99 / 100.01 with an Unknown GICS row (21.66 / 19.70), chart end values -13.49 / -16.83 and difference 3.33 match the metric cards; Rise vs Swix weights sum to 100.00 / 99.99, Not Classified 10.44. Controls were restored and read back as GPT / MTUM / day / USD / none.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 06694292-d1fa-412e-8e55-101c09bb3a23 --config wrangler.jsonc --message 'Rollback collapsible sections'
```
That keeps the GICS sector weights table (`docs/sector-weights-release.md`). Deploy Attribution before Arcus; roll back Arcus before Attribution
(these two releases are independent, so either can be rolled back alone).
