import { dateRange } from './ranges.mjs';
import { createSessionGuard } from './session.mjs';
const $ = (id) => document.getElementById(id);
const integrated = location.pathname.startsWith('/portfolio-analysis/');
let online = null, onlineMode = false;
let activeWorker = null, cancelCalculation = null, accessGeneration = 0;
const session = createSessionGuard({onLock() {
  accessGeneration++;
  online?.clear();
  activeWorker?.terminate(); activeWorker = null;
  cancelCalculation?.(); cancelCalculation = null;
  folder = dataset = manifest = result = null; onlineMode = false;
  for (const id of ['metrics','rows','columns','method','research-note','archive-info','contribution-chart','message','price-status']) $(id).replaceChildren();
  for (const id of ['portfolio','benchmark']) { $(id).replaceChildren(); $(id).disabled = true; }
  $('run').disabled = true;
  expandSelection();
  document.querySelector('main').hidden = true;
  $('session-lock').hidden = false;
}, onUnlock() { document.querySelector('main').hidden = false; $('session-lock').hidden = true; }});
if (integrated) {
  document.documentElement.classList.add('online-analysis');
  const setupPanel=document.querySelector('details.panel');
  const archiveActions=document.createElement('div');archiveActions.className='actions';
  archiveActions.append($('folder'),$('import'),document.querySelector('label[for="import"]'));
  setupPanel.append(archiveActions);
  $('connect-saved').textContent='Refresh saved holdings';
  $('controls').after($('archive-info'));
  $('back-arcus').hidden = false;
  try {
    const back = new URL(sessionStorage.getItem('arcus-analysis-return') || '/?tab=watchlist', location.origin);
    if (back.origin === location.origin && back.pathname === '/') $('back-arcus').href = back.pathname + back.search + back.hash;
  } catch {}
  $('back-arcus').addEventListener('click', e => {
    const previous = document.referrer && new URL(document.referrer);
    if (previous && previous.origin === location.origin && previous.pathname === '/') { e.preventDefault(); history.back(); }
  });
}
try {
  const mode = localStorage.getItem('bw-mode') || 'system';
  const light = mode === 'light' || (mode !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('light', light);
  document.querySelector('meta[name="theme-color"]').content = light ? '#ffffff' : '#151c17';
} catch {}
if (!window.showDirectoryPicker || /Android/i.test(navigator.userAgent)) {
  $('folder').hidden = true;
  document.querySelector('label[for="import"]').classList.add('primary');
}
document.querySelector('label[for="import"]').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('import').click(); } });
// Hide private content while away; revalidate before it is revealed on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelector('main').hidden = true;
  else void session.check();
});
window.addEventListener('pageshow', () => { document.querySelector('main').hidden = true; void session.check(); });
window.addEventListener('pagehide',()=>online?.clear());
window.addEventListener('focus', () => { void session.check(); });
void session.check();
document.querySelector('form[action="/logout"]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/logout', {method:'POST', credentials:'same-origin'});
    if (!response.ok) throw Error('Sign out failed');
    session.lock();
    location.replace('/');
  } catch {
    button.disabled = false;
    message('Could not sign out. Please try again.');
  }
});
let folder = null,
  dataset = null,
  manifest = null,
  result = null,
  lastOptions = null,
  sortKey = "activeCtr",
  sortDirection = -1;
// Phone layout: one column, compact table and a collapsible selection panel.
const phone = matchMedia('(max-width: 600px)');
const SELECTION_KEY = 'arcus-analysis-selection';
const fundLabel = (id) => {
  const fund = manifest?.funds.find(f => f.id === id);
  return fund && id.startsWith('PORTFOLIO:') ? fund.name : id;
};
const rangeLabel = () => $('range').selectedOptions[0]?.textContent || 'Custom dates';
function saveSelection() {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify(Object.fromEntries(['portfolio','benchmark','currency','range','group'].map(id => [id, $(id).value])))); } catch {}
}
function savedSelection() {
  try { const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null'); return saved && typeof saved === 'object' ? saved : null; } catch { return null; }
}
const hasOption = (id, value) => [...$(id).options].some(o => o.value === value);
function restoreSelection(m) {
  const saved = savedSelection();
  if (!saved) return false;
  const ids = new Set(m.funds.map(f => f.id));
  if (!ids.has(saved.portfolio) || !ids.has(saved.benchmark) || saved.portfolio === saved.benchmark) return false;
  $('portfolio').value = saved.portfolio; $('benchmark').value = saved.benchmark;
  if (hasOption('currency', saved.currency)) $('currency').value = saved.currency;
  if (hasOption('group', saved.group)) $('group').value = saved.group;
  return true;
}
const preferredRange = () => { const saved = savedSelection()?.range; return saved && saved !== 'custom' && hasOption('range', saved) ? saved : 'day'; };
function syncDateFields() {
  $('controls').classList.toggle('preset', $('range').value !== 'custom');
  const start = $('start').value, end = $('end').value;
  $('range-dates').textContent = start && end ? (start === end ? start : start + ' → ' + end) : '';
}
function collapseSelection(options) {
  $('summary-funds').textContent = fundLabel(options.portfolio) + ' vs ' + fundLabel(options.benchmark);
  $('summary-period').textContent = rangeLabel() + ' · ' + (options.start === options.end ? options.end : options.start + ' → ' + options.end) + ' · ' + options.currency;
  $('selection').classList.add('collapsed');
  $('selection-summary').hidden = false;
}
function expandSelection() {
  $('selection').classList.remove('collapsed');
  $('selection-summary').hidden = true;
}
$('change-selection').addEventListener('click', () => {
  expandSelection();
  $('selection').scrollIntoView({behavior: 'smooth', block: 'start'});
  $('portfolio').focus({preventScroll: true});
});
const scrollTo = (id) => { if (phone.matches) requestAnimationFrame(() => $(id).scrollIntoView({behavior: 'smooth', block: 'start'})); };
// Read the price-check note directly under the headline figures.
$('metrics').after($('price-status'));
const text = (tag, value, cls) => {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  return n;
};
function message(value) {
  $("message").replaceChildren(...(value ? [text("div", value)] : []));
}
async function readFile(handle) {
  const file = await handle.getFile();
  if (file.size > 35_000_000)
    throw Error(
      "File is too large. Connect the reports folder to load only the selected months.",
    );
  return JSON.parse(await file.text());
}
function setup(m) {
  if (m?.schemaVersion !== 1 || !Array.isArray(m.funds) || m.funds.length < 2)
    throw Error("Invalid archive manifest. At least two funds are required.");
  manifest = m;
  result = null;
  $("results").hidden = true;
  $("empty").hidden = false;
  for (const id of ["portfolio", "benchmark"]) {
    $(id).replaceChildren(
      ...m.funds.map((f) => {
        const o = text("option", f.id.startsWith('PORTFOLIO:') ? `${f.name} · My portfolio` : `${f.id} · ${f.name}`);
        o.value = f.id;
        return o;
      }),
    );
    $(id).disabled = false;
  }
  $("benchmark").selectedIndex = 1;
  if (!restoreSelection(m) && m.funds.some(f => f.id === 'ARKK') && m.funds.some(f => f.id === 'BAI')) {
    $('portfolio').value = 'ARKK'; $('benchmark').value = 'BAI';
  }
  const available = m.funds.flatMap((f) => f.dates || []).sort();
  $("start").value = available.at(0) || "";
  $("end").value = available.at(-1) || "";
  for (const id of ["start", "end", "run", "range"]) $(id).disabled = false;
  $('range').value = m.valuationDates?.length ? preferredRange() : 'custom';
  applyRange();
  expandSelection();
  $("archive-status").textContent =
    (onlineMode ? "Holdings saved " : "Archive updated ") +
    new Date(m.generatedAt).toLocaleString() +
    (onlineMode ? ". Available with your PC off. Prices are checked when you compare." : ". Nothing is uploaded.") + (m.validationNotice ? ' ' + m.validationNotice : '');
  renderArchiveInfo();
  $('source-status').textContent = `${m.funds.length} funds in this archive.` + ((m.pendingSources || []).length ? ' Source limitations: '+m.pendingSources.map(f=>f.id+' ('+f.reason+')').join('; ')+'.' : '');
  $("message").replaceChildren();
}
function renderArchiveInfo() {
  $("archive-info").replaceChildren(
    ...manifest.funds.filter(f=>[$('portfolio').value,$('benchmark').value].includes(f.id)).map((f) => {
      const card = text("article", "", "archive-card");
      card.append(
        text("strong", f.id.startsWith('PORTFOLIO:') ? f.name : f.id),
        text(
          "p",
          `${f.positions} positions · latest holdings ${f.latest || "not collected"} · ${onlineMode ? 'saved allocation' : f.dates.length+' saved dates'}`,
        ),
      );
      return card;
    }),
  );
}
for(const id of ['portfolio','benchmark','currency','range','start','end']) $(id).addEventListener('change',()=>{
  result=null;$('results').hidden=true;$('price-status').textContent='';$('message').replaceChildren();
  saveSelection();
});
for(const id of ['portfolio','benchmark']) $(id).addEventListener('change', renderArchiveInfo);
function applyRange() {
  const dates = manifest?.valuationDates || [];
  const range = dateRange($('range').value, dates);
  if (range) { $('start').value = range.start; $('end').value = range.end; }
  $('range-note').textContent = dates.length
    ? `Periods end at the latest saved completed price date: ${dates.at(-1)}. Missing holdings are reported; dates are not silently shortened.`
    : 'Select explicit dates, or run the desktop updater to enable date presets.';
  if (!dates.length) $('range').value = 'custom';
  syncDateFields();
}
$('range').addEventListener('change', applyRange);
for (const id of ['start', 'end']) $(id).addEventListener('change', () => { $('range').value = 'custom'; syncDateFields(); });
$("folder").addEventListener("click", async () => {
  try {
    if (!window.showDirectoryPicker) {
      message(
        "This browser does not support folder access. Use Import data file instead.",
      );
      return;
    }
    const chosen = await window.showDirectoryPicker({ mode: "read" });
    const m = await readFile(await chosen.getFileHandle("manifest.json"));
    if (!await session.check()) return;
    onlineMode = false; online?.clear(); setup(m);
    folder = chosen;
    dataset = null;
  } catch (e) {
    if (e.name !== "AbortError")
      message(
        e.name === "NotFoundError"
          ? "Select the reports folder containing manifest.json."
          : e.message,
      );
  }
});
$("import").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 35_000_000)
      throw Error("Use reports folder mode for large archives.");
    const parsed = JSON.parse(await file.text());
    if (!await session.check()) return;
    if (!parsed.manifest?.valuationDates) {
      const funds = new Set((parsed.manifest?.funds || []).map(f => f.id));
      parsed.manifest.valuationDates = [...new Set((parsed.levels || []).filter(l => l.id === 'SPY' || funds.has(l.id)).map(l => l.date))].sort();
    }
    onlineMode = false; online?.clear(); setup(parsed.manifest);
    dataset = parsed;
    folder = null;
  } catch (e) {
    message(e.message);
  } finally {
    event.target.value = "";
  }
});
async function loadRange(start, end) {
  if (onlineMode) return online.load(manifest,[$('portfolio').value,$('benchmark').value],start,end,$('currency').value);
  if (dataset) return dataset;
  if (!folder) throw Error("Connect an archive first.");
  // Include a baseline month. Engine requires exact preceding valuation-day holdings.
  const baseline = new Date(start + "T12:00:00Z");
  baseline.setUTCDate(1);
  baseline.setUTCMonth(baseline.getUTCMonth() - 1);
  const months = manifest.months.filter(
    (m) => m >= baseline.toISOString().slice(0, 7) && m <= end.slice(0, 7),
  );
  // Include the actual proxy snapshot, even when the issuer only publishes monthly.
  for (const fund of manifest.funds.filter(f => [$('portfolio').value, $('benchmark').value].includes(f.id))) {
    const dates = [...fund.dates].sort();
    const before = dates.filter(d => d < start).at(-1);
    const after = dates.find(d => d >= start);
    for (const date of [before, after]) {
      if (date && manifest.months.includes(date.slice(0, 7)) && !months.includes(date.slice(0, 7))) months.push(date.slice(0, 7));
    }
  }
  const merged = { manifest, snapshots: [], levels: [] };
  for (const month of months) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw Error("Invalid month in archive");
    const part = await readFile(await folder.getFileHandle(month + ".json"));
    merged.snapshots.push(...part.snapshots);
    merged.levels.push(...part.levels);
  }
  return merged;
}
$("controls").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("run").disabled = true;
  $("run").textContent = "Calculating…";
  $("results").hidden = true;
  result = null;
  $('price-status').textContent='';
  const controls=[...$('controls').elements,$('connect-saved'),$('folder'),$('import')];
  const disabledBefore=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
  try {
    if (!await session.check()) return;
    const generation = accessGeneration;
    const options = Object.fromEntries(
      ["portfolio", "benchmark", "start", "end", "currency"].map((id) => [
        id,
        $(id).value,
      ]),
    );
    options.allowApproximateHoldings = true;
    options.allowPartialReturns = true;
    options.allowSnapshotResearch = onlineMode;
    lastOptions = options;
    saveSelection();
    const data = await loadRange(options.start, options.end);
    if (generation !== accessGeneration || !await session.check()) return;
    const response = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs?v=weighted-excel-20261014", import.meta.url), {
        type: "module",
      });
      activeWorker = worker;
      cancelCalculation = () => reject(Error('Your session ended. Sign in before calculating again.'));
      worker.onmessage = ({ data }) => {
        worker.terminate();
        activeWorker = null;
        cancelCalculation = null;
        data.ok ? resolve(data.result) : reject(Error(data.error));
      };
      worker.onerror = () => {
        worker.terminate();
        activeWorker = null; cancelCalculation = null;
        reject(Error("Calculation failed. Your data has not been changed."));
      };
      worker.postMessage({ dataset: data, options });
    });
    if (generation !== accessGeneration || !await session.check()) return;
    result = response;
    result.notes=[...(result.notes || []),...(data.priceNotes || [])];
    if(data.returnReasons)result.missing=(result.missing || []).map(p=>({...p,reason:data.returnReasons[p.fund+'|'+p.id]}));
    if (!["complete", "partial"].includes(result.status)) {
      $("empty").hidden = false;
      $("message").replaceChildren(
        text("strong", "Not enough complete data for this comparison."),
        text(
          "p",
          "No fund return has been fabricated. Collect the missing history or import verified return levels.",
        ),
      );
      const ul = document.createElement("ul");
      for (const issue of result.issues.slice(0, 12))
        ul.append(text("li", issue));
      $("message").append(ul);
      scrollTo('message');
      const missing = [
        ...new Map(
          (result.missing || []).map((x) => [x.fund + "|" + x.id, x]),
        ).values(),
      ];
      if (missing.length) {
        $("message").append(
          text(
            "p",
            "Missing returns: " +
              missing
                .slice(0, 15)
                .map((m) => `${m.fund}: ${m.name}${m.reason ? ' — '+m.reason : ''}`)
                .join("; ") +
              (missing.length > 15 ? ` and ${missing.length - 15} more.` : ""),
          ),
        );
      }
      return;
    }
    $("message").replaceChildren();
    if (result.status === "partial") {
      const missingNames = [...new Set(result.missing.map((m) => m.name))];
      message(
        `Research estimate. Missing figures stay blank. Return coverage (absolute source weight): ${fmt(result.coverage.portfolio)} / ${fmt(result.coverage.benchmark)}. ${missingNames.length} holdings have missing returns. ${result.contributionMethod === 'average-weight-period' ? 'Portfolio returns sum average weight × security return for available holdings.' : result.contributionMethod === 'arithmetic-daily' ? 'Contributions sum daily estimates; they are not compounded returns.' : 'Contributions use reference-return linking.'}`,
      );
    }
    $("empty").hidden = true;
    $("results").hidden = false;
    $("metrics").replaceChildren(
      ...[
        [options.portfolio, result.returnA, result.returnMethodA],
        [options.benchmark, result.returnB, result.returnMethodB],
        ["Difference", result.activeReturn, result.contributionMethod === 'average-weight-period' ? 'comparison' : null],
      ].map(([label, value, method]) => {
        const card = text("div", "", label === "Difference" ? "metric difference" : "metric");
        const body = text("div", "", "metric-text");
        body.append(
          text("span", label === "Difference" ? label : fundLabel(label)),
          text("small", options.currency + (method === 'weighted-estimate' ? ' · weighted return estimate' : method === 'reference' ? ' · reference return' : method === 'comparison' ? ' · return difference' : result.status === "partial" ? " · reference return" : " · holdings estimate")),
        );
        const figure = text("strong", fmt(value), value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative");
        if (label === "Difference") card.append(body, figure);
        else { const [labelNode, noteNode] = [...body.childNodes]; card.append(labelNode, figure, noteNode); }
        return card;
      }),
    );
    renderRows();
    renderMethod();
    if(onlineMode) $('price-status').textContent = 'Adjusted daily returns · '+options.start+' to '+options.end+' · '+options.currency+'. Checked '+new Date(data.priceCheckedAt).toLocaleTimeString()+'. No intraday quotes.';
    $('research-note').replaceChildren(
      text('strong','Research estimate — use for ideas, not exact accounting.'),
      text('p',onlineMode ? 'Saved allocation weights are applied across this period as a research estimate, not actual historical trades. Shares use adjusted closing prices and same-date FX. Across verified Tokyo market holidays, the last local adjusted close is carried to the valuation date before applying that date’s FX. Missing open-session prices, cash income and unresolved positions remain blank. No intraday quotes are used; vendor corrections can differ from Bloomberg.' : 'Where opening holdings are missing, the latest earlier snapshot is carried forward; for a new archive, a later snapshot within seven calendar days may be used. Dates are listed below. Later holdings introduce hindsight. Prices, FX cut-offs, trading and cash income may differ from Bloomberg.'),
      ...(result.holdingsWarnings || []).map(n => text('p',n)),
      ...(result.status === 'partial' ? [text('p',`Known holdings contributions: ${fmt(result.knownContributionA)} / ${fmt(result.knownContributionB)}. ${result.contributionMethod === 'average-weight-period' ? 'Your portfolio headline is the sum of available average weight × security return contributions. ETF headlines use observed fund returns; the contribution subtotal may differ.' : 'Missing returns stay blank; available headline figures are fund reference returns, not these subtotals.'} ${result.contributionMethod === 'arithmetic-daily' ? 'Both contribution columns use arithmetic daily sums because a complete reference series is unavailable.' : ''}`)] : []),
      ...(result.missing?.length ? [text('p','Missing returns: '+[...new Set(result.missing.map(p=>p.name+(p.reason ? ' — '+p.reason : '')))].join('; '))] : []),
    );
    if (phone.matches) collapseSelection(options);
    scrollTo($('message').childElementCount ? 'message' : 'results');
  } catch (error) {
    message(error.message);
    scrollTo('message');
  } finally {
    controls.forEach((el,i)=>el.disabled = !manifest || disabledBefore[i]);
    $("run").disabled = !manifest;
    $("run").textContent = "Compare funds";
  }
});
const fmt = (v) =>
  v === null || v === undefined ? "—" : (v * 100).toFixed(2) + "%";
function displayedRows() {
  if ($("group").value === "security") return result.rows;
  const groups = new Map();
  for (const r of result.rows) {
    const g = groups.get(r.sector) || {
      id: r.sector,
      ticker: r.sector,
      name: "Sector aggregate",
      sector: r.sector,
      weightA: 0,
      weightB: 0,
      ctrA: 0,
      ctrB: 0,
      activeWeight: 0,
      activeCtr: 0,
      securityReturn: null,
    };
    for (const key of [
      "weightA",
      "weightB",
      "ctrA",
      "ctrB",
      "activeWeight",
      "activeCtr",
    ])
      g[key] = g[key] === null || r[key] === null ? null : g[key] + r[key];
    groups.set(r.sector, g);
  }
  return [...groups.values()];
}
const columns = [
  ["ticker", "Security / sector"],
  ["weightA", "Avg weight · Portfolio"],
  ["weightB", "Avg weight · Benchmark"],
  ["activeWeight", "Active weight"],
  ["securityReturn", "Security return"],
  ["ctrA", "Contribution · Portfolio"],
  ["ctrB", "Contribution · Benchmark"],
  ["activeCtr", "Difference (pp)"],
];
// Phones show three columns; the remaining figures open under the tapped row.
const phoneColumns = () => $("group").value === "sector"
  ? [["ticker", "Sector"], ["activeWeight", "Active wt"], ["activeCtr", "Diff (pp)"]]
  : [["ticker", "Security"], ["securityReturn", "Return"], ["activeCtr", "Diff (pp)"]];
const signClass = (key, value) => ["ctrA", "ctrB", "activeCtr", "securityReturn", "activeWeight"].includes(key)
  ? (value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative") : "";
function columnLabel(key, name) {
  if (!lastOptions) return name;
  return name.replace("· Portfolio", "· " + fundLabel(lastOptions.portfolio)).replace("· Benchmark", "· " + fundLabel(lastOptions.benchmark));
}
function syncSortControls() {
  $("sort").value = sortKey;
  $("sort-direction").textContent = sortKey === "ticker"
    ? (sortDirection === 1 ? "↓ A to Z" : "↑ Z to A")
    : (sortDirection === -1 ? "↓ Largest first" : "↑ Smallest first");
}
function renderRows() {
  if (!["complete", "partial"].includes(result?.status)) return;
  const compact = phone.matches;
  const visible = compact ? phoneColumns() : columns;
  if (!$("sort").options.length) $("sort").replaceChildren(...columns.map(([key, name]) => { const o = text("option", key === "ticker" ? "Name" : name); o.value = key; return o; }));
  syncSortControls();
  $("table-hint").textContent = compact
    ? "Percentage points. Tap a row for weights and contributions; sort with the controls above."
    : "Contributions in percentage points. Tap a column to sort. Swipe the table for more columns.";
  const tr = document.createElement("tr");
  for (const [key, name] of visible) {
    const th = text(
      "th",
      columnLabel(key, name) + (sortKey === key ? (sortDirection === 1 ? " ↑" : " ↓") : ""),
    );
    th.tabIndex = 0;
    th.addEventListener("click", () => {
      sortDirection = sortKey === key ? -sortDirection : -1;
      sortKey = key;
      renderRows();
    });
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter") th.click();
    });
    tr.append(th);
  }
  $("columns").replaceChildren(tr);
  const rows = [...displayedRows()].sort(
    (a, b) =>
      sortDirection *
      (typeof a[sortKey] === "string"
        ? a[sortKey].localeCompare(b[sortKey])
        : (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)),
  );
  renderContributionChart(rows);
  $("rows").replaceChildren(
    ...rows.flatMap((r) => {
      const row = document.createElement("tr");
      for (const [key] of visible) {
        const cell = text("td", key === "ticker" ? r.ticker : fmt(r[key]));
        if (key === "ticker" && r.name !== r.ticker) cell.append(text("small", r.name));
        if (compact || ["ctrA", "ctrB", "activeCtr"].includes(key)) cell.className = signClass(key, r[key]);
        row.append(cell);
      }
      if (!compact) return [row];
      const detail = document.createElement("tr");
      detail.className = "detail";
      detail.hidden = true;
      const cell = document.createElement("td");
      cell.colSpan = visible.length;
      const list = document.createElement("dl");
      for (const [key, name] of columns) {
        if (key === "ticker" || visible.some(([k]) => k === key)) continue;
        list.append(text("dt", columnLabel(key, name)), text("dd", fmt(r[key]), signClass(key, r[key])));
      }
      cell.append(list);
      detail.append(cell);
      row.className = "expandable";
      row.tabIndex = 0;
      row.setAttribute("aria-expanded", "false");
      row.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        row.setAttribute("aria-expanded", String(!detail.hidden));
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
      return [row, detail];
    }),
  );
}
$("sort").addEventListener("change", () => {
  sortKey = $("sort").value;
  sortDirection = sortKey === "ticker" ? 1 : -1;
  if (result) renderRows();
});
$("sort-direction").addEventListener("click", () => {
  sortDirection = -sortDirection;
  if (result) renderRows();
});
phone.addEventListener("change", () => { if (result && ["complete", "partial"].includes(result.status)) renderRows(); if (!phone.matches) expandSelection(); });
function renderContributionChart(rows) {
  const top = rows.filter(r => Number.isFinite(r.activeCtr)).sort((a,b) => Math.abs(b.activeCtr)-Math.abs(a.activeCtr)).slice(0,6);
  const root = $('contribution-chart');
  root.replaceChildren(text('h2', 'Biggest contribution differences'), text('p', 'Portfolio minus benchmark · percentage points'));
  const max = Math.max(...top.map(r => Math.abs(r.activeCtr)), 0.000001);
  for (const row of top) {
    const item = text('div','','contribution-row');
    item.append(text('span',row.ticker), text('strong',(row.activeCtr >= 0 ? '+' : '')+(row.activeCtr*100).toFixed(2)+' pp',row.activeCtr >= 0 ? 'positive' : 'negative'));
    const bar = document.createElement('meter');
    bar.min = 0; bar.max = max; bar.value = Math.abs(row.activeCtr);
    bar.className = row.activeCtr >= 0 ? 'positive' : 'negative';
    bar.setAttribute('aria-label', row.ticker + ' contribution difference magnitude');
    item.append(bar); root.append(item);
  }
  if (!top.length) root.append(text('p','No complete contribution differences for this selection.'));
}
function renderMethod() {
  const node = $("method");
  node.replaceChildren(
    text(
      "p",
      `${result.days} valuation days. Opening baseline: ${result.baseline}. Results through ${result.end}.`,
    ),
  );
  const ul = document.createElement("ul");
  for (const n of result.notes) ul.append(text("li", n));
  node.append(
    ul,
    text(
      "p",
      `Fund reference returns: ${fmt(result.fundReturnA)} / ${fmt(result.fundReturnB)}. Unexplained difference versus holdings estimate: ${fmt(result.residualA)} / ${fmt(result.residualB)}.`,
    ),
  );
  const table = document.createElement("table"),
    head = document.createElement("tr");
  for (const v of [
    "Sector",
    "Allocation (pp)",
    "Selection (pp)",
    "Interaction (pp)",
  ])
    head.append(text("th", v));
  table.append(head);
  for (const s of result.sectors) {
    const row = document.createElement("tr");
    for (const v of [
      s.sector,
      fmt(s.allocation),
      fmt(s.selection),
      fmt(s.interaction),
    ])
      row.append(text("td", v));
    table.append(row);
  }
  const scroll = text("div", "", "scroll");
  scroll.append(table);
  node.append(scroll);
}
$("group").addEventListener("change", () => { saveSelection(); if (result && ['complete', 'partial'].includes(result.status)) renderRows(); });
$("download").addEventListener("click", async () => {
  $('download').disabled = true;
  try {
    if (!await session.check()) return;
    if (!["complete", "partial"].includes(result?.status)) return;
    const current = result, generation = accessGeneration;
    const selection = {portfolio:fundLabel(lastOptions.portfolio), benchmark:fundLabel(lastOptions.benchmark),
      rows:displayedRows(), view:$('group').value === 'security' ? 'Holdings' : 'Sector'};
    const {comparisonXlsx} = await import('./export.mjs?v=weighted-excel-2-20261014');
    if (!await session.check() || generation !== accessGeneration || current !== result) return;
    const blob = new Blob([comparisonXlsx(current, selection)],
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url;
    link.download = `arcus-comparison-${current.start}-${current.end}.xlsx`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { message('Excel download unavailable. '+error.message); }
  finally { $('download').disabled = false; }
});

// An older Arcus bridge may not yet allow the online modules during rollout/rollback.
try {
  const {createOnlineSource}=await import('./online.mjs?v=listed-holidays-20261014');
  online = createOnlineSource({onUnauthorized:()=>session.lock(),onProgress:(done,total)=>{if(onlineMode) $('run').textContent='Checking prices '+done+' / '+total;}});
} catch {
  $('connect-saved').disabled=true;
  message('Saved online holdings are temporarily unavailable. You can still import an archive file.');
}
async function connectSaved() {
  const generation=accessGeneration;
  try {
    if(!await session.check())return;
    $('connect-saved').disabled=true;
    message('Loading saved ETFs and portfolios…');
    const m=await online.catalog();
    if(generation!==accessGeneration)return;
    onlineMode=true;dataset=folder=null; setup(m);
    $('archive-title').textContent='Saved ETFs & portfolios';
    $('empty').hidden=true;
    $('range-note').textContent='Checking the latest completed US trading date…';
    const calendar=await online.calendar();
    if(generation!==accessGeneration || !onlineMode)return;
    manifest.valuationDates=calendar;
    $('range').value=preferredRange();applyRange();
    $('range-note').textContent='Daily closing-price analysis through '+calendar.at(-1)+'. Today’s intraday session is excluded. Saved allocations may be older.';
    message('');
  } catch(error){if(generation===accessGeneration)message(error.message+' You can refresh saved holdings or use an archive file.');}
  finally {$('connect-saved').disabled=false;}
}
$('connect-saved').addEventListener('click',connectSaved);
if(integrated && online)void connectSaved();
