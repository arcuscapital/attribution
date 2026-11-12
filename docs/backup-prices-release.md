# Backup prices and 0% default for missing returns (2026-11-12)

## Finding
1D Rise vs Swix (11 November 2026) failed: "124 of 126 holdings have no adjusted prices". Yahoo's daily
bar for 11 November is empty for JSE shares (no close, no volume; still empty at 10:09 SAST on 12
November), although the JSE traded: Sharenet has 11 November closes, and its 9 and 10 November closes
match Yahoo's exactly (MTN 22419 and 22894 cents).

## Owner's rules
- If an item is missing, report it as an error and count its return as 0% so the rest of the
  calculation goes ahead (default, all instances).
- Find a backup source in case Yahoo fails.

## What changed (Attribution only)
- **Backup source:** Sharenet public closing prices (price only) for any JSE listing. The data route
  accepts any `XXX.JO` symbol with `source=sharenet` (previously only NEWSLV and SBCOP), uses one year of
  history when the period starts within a year (about 10 KB) and ten years otherwise, and caches each
  listing for 15 minutes. Identity (Sharenet code) and exact dates are checked.
- **Rise vs Swix 1D and other periods:** Yahoo adjusted prices first; if a required date is missing, the
  Sharenet closes for both endpoints; if neither has a price, the share counts as 0%, its return cells
  show in red and a red line names it. The status line and footer say how many shares used the backup.
- **Rise vs Swix Live:** Yahoo live quotes first; a share without a usable quote, or every share if the
  quote service fails (failed batches no longer stop the refresh, sign-in loss still does), gets
  Sharenet's point for today (its latest, possibly delayed price) against the previous close; then 0%.
- **Safety rule kept:** more than half the holdings without any price is an outage; the previous result
  is kept and the shares are listed.
- **Ordinary comparisons:** "Assume 0% for missing returns" is now ticked by default (it can still be
  unticked); listed holdings counted at 0% are named in a red line under the message. Cash, private and
  other non-listed positions keep their existing labelled 0% treatment.
- Module URLs versioned `backup-prices-20261112`. No KV, D1, cron, queue or Watchlists change; Sharenet
  is asked only when Yahoo has no usable price.

## Release
| Item | Value |
|---|---|
| Repository | https://github.com/arcuscapital/attribution |
| Branch | `claude/rise-swix-backup-prices`, from `claude/bloomberg-tables` at `e0ee14d` (live application `6734a8a`) |
| Application commit | `458f6ab2563f6e2f8441141e8583ff41a8550991` |
| Account / Worker | `5695cae2becf35e049eb5df3e2849ae2` / `arcus-attribution` |
| Previous production | version `3ceb112b-aa59-49f1-9740-2bbc9bb37bbf`, deployment `3c8e390b-352e-44a1-a408-f8b62ea83dab`, application `6734a8a` (confirmed live immediately before deploying) |
| Deployment | 2026-11-12T08:19:11.430579Z, deployment `3c9daff9-75ed-4b2a-9840-b821e19a1372`, version `ce2b9207-3081-42a4-9a94-af71f97295a1`, tag `458f6ab`, 100% |
| Wrangler | 4.129.0, `--config wrangler.jsonc` (dry run passed first) |

## Tests and limits
- `node --test tests/*.test.mjs`: 144/144 passed (new: Sharenet route for any JSE listing and range
  choice, exact-date Sharenet returns, coverage rule, tolerant quote batches, 0% default source check).
- `python -m unittest discover -s tests -p 'test_*.py'`: passed (Python 3.14.10).
- Production, owner session in Brave: 1D Rise vs Swix for 11 November renders all 140 rows (Rise -0.63%,
  Swix -1.05%) with 124 shares on Sharenet backup prices, none at 0%, MTN +0.42% (22894 to 22990); Live
  shows "Complete snapshot · 1 share on Sharenet backup prices" (SRI SJ, previously 0%); IBKR vs BAI 1D:
  0% assumption ticked by default, 79 rows, 72 ticker links, no listed gaps, 7 non-listed positions at
  the labelled 0%. A broader agent check across dates, portfolios and benchmarks follows separately.
- Limits: Sharenet closes are price only (a dividend on its ex-date is not counted for that share);
  Sharenet's intraday point may be delayed; the first 1D load with a Yahoo gap took about 30 s (124
  backup requests), later loads use the 15-minute cache.
- Not tested: Android emulator, physical phone.

## Rollback
```powershell
$env:XDG_CONFIG_HOME='C:/Users/Skrom/AppData/Local/ArcusAttribution/cloudflare-auth'
$env:CLOUDFLARE_ACCOUNT_ID='5695cae2becf35e049eb5df3e2849ae2'
npx --yes wrangler@4.129.0 rollback 3ceb112b-aa59-49f1-9740-2bbc9bb37bbf --config wrangler.jsonc --message 'Rollback backup prices and 0% default'
```
That keeps the Bloomberg-style tables (`docs/bloomberg-tables-release.md`); 1D for 11 November fails again
while Yahoo's bar is empty. Attribution only; Watchlists unchanged.
