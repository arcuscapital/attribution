# Arcus Attribution

Independent desktop research project. GitHub Pages hosts only the interface. Holdings, prices, archives and the database stay private. There are **no calls to Arcus, Cloudflare, its queues, live refresh loops or trading endpoints**.

## What works

* Dated issuer snapshots for 44 configured ETFs, retaining private/unmapped positions and cash. Eight further sources are recorded in `config/pending-sources.json` with their blockers.
* Google Apps Script collector with three small daily runs, immutable checksummed archives, retry-safe filenames and a status file.
* Standard-library Python updater, local SQLite history, snapshot revision handling, completed database backups and month-partitioned exports.
* Desktop web interface: folder/file import, fund/date/currency comparison, security/sector grouping, sortable contributions, Brinson–Fachler sector effects with Carino linking, and Excel-compatible CSV export.
* Explicit incomplete-history/missing-price results. The website uses the latest earlier holdings when exact opening holdings are absent; a new archive can use a later snapshot within seven calendar days as an explicitly labelled proxy. Strict engine mode remains available to tests and API callers. When holdings are complete but some prices are missing, a labelled partial report shows known contributions against observed fund reference returns and an unexplained residual. It never fabricates a zero return for an unknown holding.

## Accuracy and present limits

This is **holdings-based research attribution**, not Bloomberg transaction accounting. Daily snapshots do not reveal intraday trades, execution prices, fees or cash income. Portfolio/reference residuals remain visible.

The built-in price adapter collects adjusted-close histories from Yahoo as estimates, converting supported foreign listings with exact-date USD FX quotes. Foreign-market holidays and mismatched closes can leave gaps; there is no silent price forward-fill. Cash income, unlisted/private securities and unsupported listings require verified USD total-return levels supplied by the user. Importing a complete verified total-return series takes priority over vendor-adjusted prices. No analysis is claimed to reconcile to Bloomberg PORT until matching real reports are supplied and checked.

Issuer dates are preserved exactly. A dated file may be delayed or describe a different valuation cut-off. The pilot starts with the first collected snapshots; downloads cannot reconstruct missing earlier holdings. Initial live sources returned BAI 2026-10-05 and ARKK 2026-10-07. These dates are observation evidence, not proof of daily collection reliability.

## Layout

```
collector/     Google Apps Script, independent of the PC
desktop/       Local collector, database, updater and scheduled-task installer
site/          Static interface and pure calculation engine
config/        Issuer adapters and fund definitions
tests/         Financial reconciliation, missing-data and import/recovery tests
docs/          Setup, data contracts and operations
```

## Local setup

Requires Python 3.12+, Node.js 22+ for shared issuer adapters, and a browser supporting local file selection. No Python packages are required on this Windows installation. Systems without a timezone database need the standard `tzdata` package for Yahoo exchange timestamps.

Run `desktop/update.ps1`. Private files go to `%LOCALAPPDATA%/ArcusAttribution`, outside the repository and sync folders. `reports/arcus-attribution.json` is the convenient single-file import for the pilot. For larger histories use the `reports` folder with `manifest.json` and monthly files. The 20 MB convenience-export limit does not remove historical archives or database records.

Run `desktop/install-task.ps1` to install the current-user **Arcus Attribution Update** scheduled task at 09:30 SAST and user sign-in. It launches the Python updater directly without a console window or PowerShell-policy changes. It does not run as administrator, overlap itself or require storing a password. Windows does not run it while powered off. Google's collector covers that interval once authorised and verified.

Open https://arcuscapital.github.io/attribution/ for daily use. Double-clicking `site/index.html` as a `file://` URL is not supported: browsers restrict its JavaScript modules and calculation worker. For local development, serve that same site folder with the local server command below.

Controls include Portfolio, Benchmark, Currency, Classification (None / Sector), date presets and explicit dates. One Day uses the latest completed price date in the archive. Last Week/Month/3 Months/Year select completed calendar periods. Missing history is reported, not silently truncated to the dates available.

To stop the local schedule: disable the named task in Windows Task Scheduler. Other scheduled tasks are untouched.

## Google collection

Run `node desktop/build-collector.mjs`. Create a standalone Google Apps Script project, paste the generated `private/Google-Collector.gs`, save, authorise and run `setup`. This bundles the maintained runtime, fund configuration and shared parsers; do not paste `Code.gs` alone for the expanded universe. The script creates a private **Arcus Attribution Archive** folder and three scheduled runs, within Google's 07:00–08:00, 13:00–14:00 and 23:00–00:00 South African time windows. These are approximate windows, not exact-time guarantees. Re-running setup does not duplicate its triggers. No deployment as a public web app is needed.

Google's DriveApp requires broad Drive scope even though this source code only accesses its own archive folder. The owner must approve it. Do not grant public folder access or publish holdings in GitHub.

To bridge the cloud archive to the desktop, sync the private archive with Google Drive for desktop, or download it into a local folder. Set `archiveFolder` in `%LOCALAPPDATA%/ArcusAttribution/settings.json`. Each update imports all unseen checksummed snapshots before collecting today's file. A missing configured archive is reported; it is never treated as successful recovery.

The desktop reads the archive, never writes to its synced copy. The active SQLite database must remain outside a synced folder. Copy completed `history-backup.sqlite` backups to Drive if desired.

## Add verified returns

CSV header: `id,date,value,currency,basis,source`

Use the position `id` from a report/export, ISO dates, positive total-return index values, `USD` and `verified-total-return`. Levels must use one consistent scale across history. Include the opening baseline. For `USDZAR=X`, use ZAR per USD and basis `fx`. A zero daily return means an unchanged positive index level, not a zero index value.

Set `PYTHONPATH` to the `desktop` directory and run:

`python -m arcus_attribution.app import-levels --folder PATH_TO_CSV`

Do not label market prices as verified dividend-inclusive returns. FX conversion must precede import for non-USD securities. Current sector mappings can be supplied privately as `sectors.json`, in the shape `{ "asOf":"YYYY-MM-DD", "sectors": { "SYMBOL":"Sector" } }`. The export records that current classifications are a fallback, not historical classifications.

## Test and deploy

* `node --test tests/*.test.mjs`
* `python -m unittest discover -s tests -p 'test_*.py'`
* `python -m http.server 8765 --bind 127.0.0.1 --directory site`

GitHub Actions publishes **only `site/`** after tests on `main`. No data or credentials belong in this repository. Local settings, SQLite files and archive data are ignored. Google script changes require rebuilding the bundle and an explicit update in its editor; a Pages deployment does not change the collector.

## Not yet proven by a one-day setup

* Repeated issuer publication/collection over several trading days.
* Actual PC-off recovery until the Google schedule and desktop archive connection are both verified.
* Historical performance parity with a matched Bloomberg PORT export.

See `docs/OPERATIONS.md` for recovery and interpretation.

## Research estimates and source coverage

The UI prioritises useful approximate holdings analysis. Every report includes a visible disclaimer and the dates of any substitute holdings. Carrying older snapshots forward assumes no intervening trades. Using a snapshot published after a return day introduces hindsight; that startup fallback is limited to seven calendar days. Missing security returns remain blank, not invented. The partial-report headline is the observed ETF reference return; known holdings contributions are separate subtotals.

Weights missing on minor Invesco/Vanguard lines are estimated from the reported market value and the median fund-net-assets denominator implied by the issuer's other weighted positions. This is research estimation, not audited accounting. All such positions are retained. Other incomplete sources stay pending.

Daily price downloads are deduplicated by security and use at most three parallel requests on the PC. The Google run has a four-minute work budget and resumes its remaining fund cursor on the next scheduled run. No work goes through Arcus or Cloudflare.
