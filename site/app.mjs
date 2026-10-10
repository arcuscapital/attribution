import { dateRange } from './ranges.mjs';
import { createSessionGuard } from './session.mjs';
const $ = (id) => document.getElementById(id);
const integrated = location.pathname.startsWith('/portfolio-analysis/');
let activeWorker = null, cancelCalculation = null, accessGeneration = 0;
const session = createSessionGuard({onLock() {
  accessGeneration++;
  activeWorker?.terminate(); activeWorker = null;
  cancelCalculation?.(); cancelCalculation = null;
  folder = dataset = manifest = result = null;
  for (const id of ['metrics','rows','columns','method','research-note','archive-info','contribution-chart','message']) $(id).replaceChildren();
  for (const id of ['portfolio','benchmark']) { $(id).replaceChildren(); $(id).disabled = true; }
  $('run').disabled = true;
  document.querySelector('main').hidden = true;
  $('session-lock').hidden = false;
}, onUnlock() { document.querySelector('main').hidden = false; $('session-lock').hidden = true; }});
if (integrated) {
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
  sortKey = "activeCtr",
  sortDirection = -1;
const text = (tag, value, cls) => {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  return n;
};
function message(value) {
  $("message").replaceChildren(text("div", value));
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
  if (m.funds.some(f => f.id === 'ARKK') && m.funds.some(f => f.id === 'BAI')) {
    $('portfolio').value = 'ARKK'; $('benchmark').value = 'BAI';
  }
  const available = m.funds.flatMap((f) => f.dates || []).sort();
  $("start").value = available.at(0) || "";
  $("end").value = available.at(-1) || "";
  for (const id of ["start", "end", "run", "range"]) $(id).disabled = false;
  $('range').value = m.valuationDates?.length ? 'day' : 'custom';
  applyRange();
  $("archive-status").textContent =
    "Archive updated " +
    new Date(m.generatedAt).toLocaleString() +
    ". Nothing is uploaded." + (m.validationNotice ? ' ' + m.validationNotice : '');
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
          `${f.positions} positions · latest holdings ${f.latest || "not collected"} · ${f.dates.length} saved dates`,
        ),
      );
      return card;
    }),
  );
}
for(const id of ['portfolio','benchmark']) $(id).addEventListener('change', renderArchiveInfo);
function applyRange() {
  const dates = manifest?.valuationDates || [];
  const range = dateRange($('range').value, dates);
  if (range) { $('start').value = range.start; $('end').value = range.end; }
  $('range-note').textContent = dates.length
    ? `Periods end at the latest saved completed price date: ${dates.at(-1)}. Missing holdings are reported; dates are not silently shortened.`
    : 'Select explicit dates, or run the desktop updater to enable date presets.';
  if (!dates.length) $('range').value = 'custom';
}
$('range').addEventListener('change', applyRange);
for (const id of ['start', 'end']) $(id).addEventListener('change', () => { $('range').value = 'custom'; });
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
    setup(m);
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
    setup(parsed.manifest);
    dataset = parsed;
    folder = null;
  } catch (e) {
    message(e.message);
  } finally {
    event.target.value = "";
  }
});
async function loadRange(start, end) {
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
    const data = await loadRange(options.start, options.end);
    const response = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs?v=research-20261007", import.meta.url), {
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
                .map((m) => `${m.fund}: ${m.name}`)
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
        `Research estimate. Missing figures stay blank. Return coverage (absolute source weight): ${fmt(result.coverage.portfolio)} / ${fmt(result.coverage.benchmark)}. ${missingNames.length} holdings have missing returns. ${result.contributionMethod === 'arithmetic-daily' ? 'Contributions sum daily estimates; they are not compounded returns.' : 'Contributions use reference-return linking.'}`,
      );
    }
    $("empty").hidden = true;
    $("results").hidden = false;
    $("metrics").replaceChildren(
      ...[
        [options.portfolio, result.returnA],
        [options.benchmark, result.returnB],
        ["Difference", result.activeReturn],
      ].map(([label, value]) => {
        const card = text("div", "", "metric");
        card.append(
          text(
            "span",
            label +
              " · " +
              options.currency +
              (result.status === "partial"
                ? " · reference return"
                : " · holdings estimate"),
          ),
          text("strong", fmt(value), value >= 0 ? "positive" : "negative"),
        );
        return card;
      }),
    );
    renderRows();
    renderMethod();
    $('research-note').replaceChildren(
      text('strong','Research estimate — use for ideas, not exact accounting.'),
      text('p','Where opening holdings are missing, the latest earlier snapshot is carried forward; for a new archive, a later snapshot within seven calendar days may be used. Dates are listed below. Later holdings introduce hindsight. Prices, FX cut-offs, trading and cash income may differ from Bloomberg.'),
      ...(result.holdingsWarnings || []).map(n => text('p',n)),
      ...(result.status === 'partial' ? [text('p',`Known holdings contributions: ${fmt(result.knownContributionA)} / ${fmt(result.knownContributionB)}. Missing returns stay blank; available headline figures are fund reference returns, not these subtotals. ${result.contributionMethod === 'arithmetic-daily' ? 'Both contribution columns use arithmetic daily sums because a complete reference series is unavailable.' : ''}`)] : []),
      ...(result.missing?.length ? [text('p','Missing returns: '+[...new Set(result.missing.map(p=>p.name))].join('; '))] : []),
    );
  } catch (error) {
    message(error.message);
  } finally {
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
function renderRows() {
  if (!["complete", "partial"].includes(result?.status)) return;
  const tr = document.createElement("tr");
  for (const [key, name] of columns) {
    const th = text(
      "th",
      name + (sortKey === key ? (sortDirection === 1 ? " ↑" : " ↓") : ""),
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
    ...rows.map((r) => {
      const row = document.createElement("tr");
      for (const [key] of columns) {
        const cell = text("td", key === "ticker" ? r.ticker : fmt(r[key]));
        if (key === "ticker") cell.append(text("small", r.name));
        if (["ctrA", "ctrB", "activeCtr"].includes(key))
          cell.className =
            r[key] === null ? "muted" : r[key] >= 0 ? "positive" : "negative";
        row.append(cell);
      }
      return row;
    }),
  );
}
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
$("group").addEventListener("change", () => { if (result && ['complete', 'partial'].includes(result.status)) renderRows(); });
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+@\-]/.test(s) && typeof v === "string") s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
$("download").addEventListener("click", async () => {
  if (!await session.check()) return;
  if (!["complete", "partial"].includes(result?.status)) return;
  const output = [
    [
      result.status === "partial"
        ? "Arcus PARTIAL contribution analysis; missing contributions are blank"
        : "Arcus holdings-based attribution estimate",
    ],
    ["Start", result.start, "End", result.end, "Currency", result.currency],
    ["Portfolio", $("portfolio").value, "Benchmark", $("benchmark").value],
    ["Values below are percent / percentage points"],
    ['Holdings method', result.approximateHoldings ? 'Approximate dated holdings proxies' : 'Opening dated holdings'],
    ...(result.holdingsWarnings || []).map(n => ['Holdings warning',n]),
    ...(result.notes || []).map(n => ['Method / disclaimer', n]),
    columns.map((c) => c[1]),
    ...displayedRows().map((r) =>
      columns.map(([key]) =>
        key === "ticker" ? r.ticker : r[key] === null ? "" : r[key] * 100,
      ),
    ),
  ];
  const blob = new Blob(
    ["\uFEFF" + output.map((r) => r.map(csvCell).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `attribution-${result.start}-${result.end}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
