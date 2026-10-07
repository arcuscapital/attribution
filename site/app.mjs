const $ = (id) => document.getElementById(id);
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
        const o = text("option", `${f.id} · ${f.name}`);
        o.value = f.id;
        return o;
      }),
    );
    $(id).disabled = false;
  }
  $("benchmark").selectedIndex = 1;
  const available = m.funds.flatMap((f) => f.dates || []).sort();
  $("start").value = available.at(0) || "";
  $("end").value = available.at(-1) || "";
  for (const id of ["start", "end", "run"]) $(id).disabled = false;
  $("archive-status").textContent =
    "Archive updated " +
    new Date(m.generatedAt).toLocaleString() +
    ". Nothing is uploaded.";
  $("archive-info").replaceChildren(
    ...m.funds.map((f) => {
      const card = text("article", "", "archive-card");
      card.append(
        text("strong", f.id),
        text(
          "p",
          `${f.positions} positions · latest holdings ${f.latest || "not collected"} · ${f.dates.length} saved dates`,
        ),
      );
      return card;
    }),
  );
  $("message").replaceChildren();
}
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
  baseline.setUTCMonth(baseline.getUTCMonth() - 1);
  const months = manifest.months.filter(
    (m) => m >= baseline.toISOString().slice(0, 7) && m <= end.slice(0, 7),
  );
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
    const options = Object.fromEntries(
      ["portfolio", "benchmark", "start", "end", "currency"].map((id) => [
        id,
        $(id).value,
      ]),
    );
    const data = await loadRange(options.start, options.end);
    const response = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs", import.meta.url), {
        type: "module",
      });
      worker.onmessage = ({ data }) => {
        worker.terminate();
        data.ok ? resolve(data.result) : reject(Error(data.error));
      };
      worker.onerror = () => {
        worker.terminate();
        reject(Error("Calculation failed. Your data has not been changed."));
      };
      worker.postMessage({ dataset: data, options });
    });
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
        `Partial analysis. Headline figures are fund reference returns. Minimum daily return coverage: ${fmt(result.coverage.portfolio)} / ${fmt(result.coverage.benchmark)}. Missing contributions stay blank. Missing returns: ${missingNames.join("; ")}.`,
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
  } catch (error) {
    message(error.message);
  } finally {
    $("run").disabled = false;
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
$("group").addEventListener("change", renderRows);
function csvCell(v) {
  let s = String(v ?? "");
  if (/^[=+@\-]/.test(s) && typeof v === "string") s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
$("download").addEventListener("click", () => {
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
