# Operations and recovery

## Data path

Issuer → Google private dated files → local archive import → SQLite → private monthly reports → browser calculation worker.

The website never downloads private data from GitHub and never makes a live Arcus call. The browser requires the user to select a local folder or export. There is no website login because no private files are hosted with the public interface.

## Expected daily behaviour

1. Google requests two small issuer CSV files per collector run.
2. It validates issuer dates, headers, minimum positions and weights before archiving.
3. Identical source/date/content is saved once. Changed content for the same date is retained as a revision, not overwritten.
4. A failed fund does not prevent the other fund being archived. Status is written and the execution throws so Google's normal script failure reporting can expose it.
5. The desktop updater imports the archive if configured. It then collects current files as an independent fallback and updates supported daily prices.
6. Only previously selected completed daily observations enter the export. The financial engine requires opening holdings for each preceding valuation date. It does not silently carry a week-old portfolio through a missing week.

## PC off for a week

If Google collection succeeded, Drive contains all published daily snapshots. When the PC returns, import is idempotent and catches up every saved file. Price history is requested from the beginning of this archive, avoiding mismatches when the price vendor retrospectively rescales adjusted data.

If the online collector also failed, preserve the gap. Re-download past issuer snapshots where available or use a Bloomberg export. Never copy today's weights backwards. A database or storage provider cannot recover source history it never received.

## Analysis method

For each valuation day, apply the previous valuation day's weights to each security's selected-currency total return. Portfolio daily return is the sum of weight × return. Compound daily portfolio returns. Link a security's contribution using portfolio wealth before that day, so contributions sum exactly to the estimated period return. Average weights include zero on observed days when not held.

USD is the native return-series currency. ZAR return uses `(1 + USD return) × (FX end / FX start) − 1`. Do not add an FX percentage arithmetically. FX is included in selected-currency security/sector effects; a separate currency-attribution model is not implemented.

For sector effects, calculate daily Brinson–Fachler allocation, selection and interaction; use Carino coefficients to link active effects across days. Issuer rounded weights are retained, so a rounding residual can remain. Market-price ETF total return is not the same as NAV total return. Import verified fund/NAV series for exact reference selection.

No observed price calendar is a guarantee against all data outages. The updater includes SPY as a US reference calendar and comparisons cross-check both fund series. A range extending past available prices is rejected. Earlier inception/missing dates are not fabricated.

## Troubleshooting

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
