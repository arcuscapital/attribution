# Operations and recovery

## Data path

Issuer → Google private dated files → local archive import → SQLite → private monthly reports → browser calculation worker.

The website never downloads private data from GitHub and never makes a live Arcus call. The browser requires the user to select a local folder or export. There is no website login because no private files are hosted with the public interface.

## Expected daily behaviour

1. Google requests the configured issuer sources, including current CSV link discovery where required. It archives compact canonical CSV for the shared adapters, and original CSV for the established ARK/iShares adapters.
2. It validates issuer dates, headers, minimum positions and weights before archiving.
3. Identical source/date/content is saved once. Changed content for the same date is retained as a revision, not overwritten.
4. A failed fund does not prevent the other fund being archived. Status is written and the execution throws so Google's normal script failure reporting can expose it.
5. The desktop updater imports the archive if configured. It then collects current files as an independent fallback and updates supported daily prices.
6. Only previously selected completed daily observations enter the export. Strict engine mode requires opening holdings for each preceding valuation date. The website enables research mode: earlier snapshots are carried forward with explicit source dates, and a later snapshot within seven calendar days is permitted for a new archive. These assumptions are shown below the report.

## PC off for a week

If Google collection succeeded, Drive contains all published daily snapshots. When the PC returns, import is idempotent and catches up every saved file. Price history is requested from the beginning of this archive, avoiding mismatches when the price vendor retrospectively rescales adjusted data.

If the online collector also failed, preserve the gap in the archive. Re-download past issuer snapshots where available or use a Bloomberg export. Research mode may use a clearly labelled proxy at calculation time, but never writes that proxy as an observed historical snapshot. A database or storage provider cannot recover source history it never received.

## Analysis method

For each valuation day, apply the previous valuation day's weights to each security's selected-currency total return. Portfolio daily return is the sum of weight × return. Compound daily portfolio returns. Link a security's contribution using portfolio wealth before that day, so contributions sum exactly to the estimated period return. Average weights include zero on observed days when not held.

USD is the native return-series currency. ZAR return uses `(1 + USD return) × (FX end / FX start) − 1`. Do not add an FX percentage arithmetically. FX is included in selected-currency security/sector effects; a separate currency-attribution model is not implemented.

For sector effects, calculate daily Brinson–Fachler allocation, selection and interaction; use Carino coefficients to link active effects across days. Issuer rounded weights are retained, so a rounding residual can remain. Market-price ETF total return is not the same as NAV total return. Import verified fund/NAV series for exact reference selection.

No observed price calendar is a guarantee against all data outages. The updater includes SPY as a US reference calendar and comparisons cross-check both fund series. A range extending past available prices is rejected. Earlier inception/missing dates are not fabricated.

When all opening holdings exist but a security return is missing, the interface can show a **partial contribution report**. Headline numbers switch explicitly to observed fund reference returns. Known contributions link using reference-fund wealth, and any security missing a held-day return has a blank full-period contribution. The difference between reference return and known contributions remains unexplained; it includes more than just missing securities. Allocation/selection effects are withheld. A comparison is blocked only when no permitted holdings snapshot exists, or required fund price/calendar data is absent. Nearby substitutions are explicitly disclosed.

## Troubleshooting

The Windows updater hides Node parser and Wrangler helper windows. All updater
descendants belong to a Windows job with kill-on-close: normal exit, failure,
Task Scheduler cancellation and the existing 15-minute limit release that process
tree. No background service remains. Network downloads still use at most three
threads; HTTP responses, SQLite connections and the backup connection are closed.
`launcher-status.json` records completed runs; a forced stop may leave only its
start status, so also check Task Scheduler's last result. Helper output and errors
are captured, with no interactive helper prompts.

Implementation references: [Windows job objects](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
and [Python subprocess flags](https://docs.python.org/3/library/subprocess.html#windows-popen-helpers).

* `collector-status.json`: latest per-fund collection result. Compare its check time with the issuer dates. An unchanged source is not a new dated holding.
* Apps Script Executions: failed downloads, parsing changes, exhausted quotas or revoked consent.
* `%LOCALAPPDATA%/ArcusAttribution/updater.log`: desktop fetch and import errors.
* Windows Task Scheduler `Arcus Attribution Update`: last execution and result. Return code 2 means partial/missing data requiring attention, not silent success.
* `history.sqlite`: all accepted dated revisions and return levels. Never edit in a running sync directory.

## Rollback

Disable the named local task and the collector's three time triggers. The historical files remain intact. Revert a site commit and redeploy to roll back its interface. No Arcus deployment or database rollback is involved.

## Source references

* BAI issuer: https://www.ishares.com/us/products/339081/ishares-a-i-innovation-and-tech-active-etf
* ARKK issuer: https://www.ark-funds.com/funds/arkk
* Google trigger timing: https://developers.google.com/apps-script/guides/triggers/installable
* Google quotas: https://developers.google.com/apps-script/guides/services/quotas
* SQLite local use: https://sqlite.org/whentouse.html

## Validation on 7 October 2026

The supplied one-day Bloomberg export was replayed through the actual engine ten times: portfolio return, benchmark return, active return and individual known contributions agreed to rounding precision. This validates arithmetic against those supplied inputs; it does not establish independent issuer/Yahoo parity. The genuine archive produces different estimates because holdings dates, private assets, foreign trading holidays and price/NAV conventions differ. Keep those differences visible.

Google was authorised, three scheduled triggers were verified, and the expanded 44-fund collector completed successfully at 12:52 South African time. All 44 issuer files passed date, position-count and allocation checks. Eight of the 52 configured issuer sources remain pending; collection success is not a claim of complete price coverage.

The desktop collected the same 44 funds. Against BAI, each other fund was calculated ten times in USD and ten times in ZAR (860 comparisons); every run was deterministic and correctly labelled partial. Core calculation time was below 14 ms per comparison on this PC, excluding browser startup and file import. ARKK/BAI each had approximately 96.8% return coverage for 6 October. NITE has no mapped security returns yet; other funds with significant foreign-market coverage gaps are explicitly marked partial. VOO's issuer snapshot was dated 31 August, and the carry-forward warning must remain visible.

The Bloomberg-input arithmetic replay matched to rounding precision, while the independent ARKK/BAI known-contribution estimates were approximately -2.12%/+0.86%, versus Bloomberg's -2.63%/+0.87%. They identified the same three largest ARKK detractors, with a different order. This is useful research evidence, not exact return reconciliation.

The local site was tested with actual archive import, portfolio/benchmark selection, USD/ZAR, sector grouping and CSV download. The scheduled PC task was verified for 09:30 and sign-in. Automatic PC-off catch-up still requires the same Drive archive to be synced onto this PC and configured in local settings; browser Google login alone does not connect Drive for desktop. No account security settings were changed.
