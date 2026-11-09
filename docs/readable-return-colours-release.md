# Readable gain and loss colours release (2026-11-09)

## Finding
The owner found green returns in Rise vs Swix harder to read than the white weights beside them (for
example Utilities: Bmrk weight 0.01 next to Bmrk return 2.54). Measured on production in the owner's
Brave: both cells have the same font, size and weight (600 on sector rows, 700 on the total row, 400 on
share rows). Only the colour differed. WCAG 2.x contrast:

| Text (dark theme) | Sector row `#151C17` | Share row `#1B241E` | Total row `#2C3B30` |
|---|---:|---:|---:|
| White figures `#F1F5F9` | 15.84 | 14.55 | 10.80 |
| Old green `#35D17C` | 8.73 | 8.02 | 5.95 |
| Old red `#F2606A` | 5.50 | 5.05 | 3.75 |

Two independent helper-agent reviews (dark, then light at the owner's request) agreed, and their figures
were recomputed before use. Light theme: navy figures 16.22:1 on white, old green `#0E7A3D` 5.43:1 and
old red `#C0343C` 5.53:1 (4.69 and 4.78 on the total row). The italic reference returns added earlier
today were dimmed to 62%, which took them below 4.5:1 in both themes.

## What changed (Attribution `site/style.css` only)
| Colour | Dark theme | Light theme |
|---|---|---|
| Gain | `#6CF0AF`: 12.16 sector, 11.17 share, 8.29 total | `#096030`: 7.70 white, 7.17 sector, 6.65 total |
| Loss | `#FFA3A9`: 9.14 sector, 8.40 share, 6.23 total | `#A3262D`: 7.31 white, 6.81 sector, 6.32 total |

- Applies to the comparison tables (`.positive` / `.negative`), Rise vs Swix and the fund picker returns
  (`.fund-return.gain` / `.loss`). Font weights are unchanged (heavier coloured figures would not change
  contrast and would unbalance the table).
- Italic reference returns are no longer dimmed; italic and the tooltip still mark them.
- The red missing-prices line keeps `#F2606A` in dark theme; light theme uses `#A3262D`.
- No JavaScript, data, KV, D1, cron, queue or Watchlists change. `style.css` is served `no-store`.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/readable-return-colours` (from `claude/rise-swix-missing-prices` at `726363e`) |
| Application commit | `e2a73fd381d7f985f745e933de2150cf5d853f91` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `ef277e6e-cc79-4b08-963f-099cf67c4074`, deployment `d33dc7e8-035d-4cfb-9fef-2832e007a803`, application `58122aa` (confirmed live immediately before deploying) |
| Deployment | 2026-11-09T10:11:07.100292Z, deployment `cec78c01-6e8d-40e9-b8cb-b74aa8368935`, version `2cfe053c-82eb-4ad3-bcbb-0603b0734e4e`, tag `e2a73fd`, 100% (one asset uploaded) |
| Wrangler | 4.129.0, `--config wrangler.jsonc` (dry run passed first) |

## Tests and limits
- `node --test tests/*.test.mjs`: 100/100 passed (CSS-only change).
- Local harness (`localhost`, synthetic data): computed colours checked in both themes for gains, losses,
  italic reference returns (full opacity) and the missing-prices line; light-theme screenshot inspected.
- Production, owner session in Brave (dark theme): Rise vs Swix Live complete snapshot; Utilities weight
  and return both weight 600, return now `rgb(108,240,175)`; total row green and red, fund picker return
  and IBKR vs BAI (78 rows, 71 ticker links) use the new colours. Light theme checked by adding the
  `light` class in that tab only (not saved): gains `rgb(9,96,48)`, losses `rgb(163,38,45)`, fund picker
  return light green; the tab was returned to dark.
- Contrast ratios are computed from colour values; readability on a specific display was judged from
  screenshots only. Not tested: Android emulator, physical phone, the Marlow-only login.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback ef277e6e-cc79-4b08-963f-099cf67c4074 --config wrangler.jsonc --message 'Rollback readable gain and loss colours'
```
That keeps the Rise vs Swix share returns and missing-price list (see
`docs/rise-swix-missing-prices-release.md`) and earlier releases. Attribution only; Watchlists unchanged.
