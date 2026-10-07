/** Pure calculation engine. Decimal weights/returns; displayed contributions are percentage points. */
const EPS = 1e-10;
export function validateDataset(data) {
  if (
    data?.manifest?.schemaVersion !== 1 ||
    !Array.isArray(data.snapshots) ||
    !Array.isArray(data.levels)
  )
    throw Error("Unsupported data file. Select an Arcus Attribution export.");
  if (data.snapshots.length > 100000 || data.levels.length > 2000000)
    throw Error("Use folder mode and a shorter date range for this archive.");
  for (const s of data.snapshots) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.asOf) || !Array.isArray(s.positions))
      throw Error("Invalid holdings record");
    for (const p of s.positions)
      if (typeof p.id !== "string" || !Number.isFinite(p.weight))
        throw Error("Invalid position or weight");
  }
  for (const l of data.levels)
    if (!Number.isFinite(l.value) || l.value <= 0)
      throw Error("Invalid return level");
  return data;
}
function levelIndex(data) {
  const map = new Map();
  for (const l of data.levels) map.set(`${l.id}|${l.date}|${l.basis}`, l);
  return map;
}
function levelReturn(map, id, from, to, currency) {
  let ret = null,
    basis = null;
  for (const b of ["verified-total-return", "vendor-adjusted"]) {
    const a = map.get(`${id}|${from}|${b}`),
      z = map.get(`${id}|${to}|${b}`);
    if (a && z && a.currency === "USD" && z.currency === "USD") {
      ret = z.value / a.value - 1;
      basis = b;
      break;
    }
  }
  if (ret === null) return null;
  if (currency === "ZAR") {
    const a = map.get(`USDZAR=X|${from}|fx`),
      z = map.get(`USDZAR=X|${to}|fx`);
    if (!a || !z) return null;
    ret = ((1 + ret) * z.value) / a.value - 1;
  }
  return { value: ret, basis };
}
function daily(map, snap, from, to, currency) {
  const rows = new Map(),
    missing = [];
  let total = 0,
    covered = 0,
    weight = 0;
  for (const p of snap.positions) {
    if (Math.abs(p.weight) < EPS) continue;
    weight += p.weight;
    const r = levelReturn(map, p.id, from, to, currency);
    if (!r) {
      missing.push({ id: p.id, name: p.name, weight: p.weight, from, to });
      continue;
    }
    const row = rows.get(p.id) || {
      id: p.id,
      name: p.name,
      ticker: p.ticker || p.id,
      sector: p.sector || "Unclassified",
      weight: 0,
      return: r.value,
      contribution: 0,
      basis: r.basis,
    };
    row.weight += p.weight;
    row.contribution += p.weight * r.value;
    rows.set(p.id, row);
    covered += Math.abs(p.weight);
    total += p.weight * r.value;
  }
  // Preserve rounded weights, never silently assign the rounding residual to cash.
  return {
    rows: [...rows.values()],
    missing,
    total,
    covered,
    weight,
    complete: missing.length === 0 && Math.abs(weight - 1) <= 0.005,
  };
}
function groupDay(day) {
  const m = new Map();
  for (const r of day.rows) {
    const s = m.get(r.sector) || { weight: 0, c: 0 };
    s.weight += r.weight;
    s.c += r.contribution;
    m.set(r.sector, s);
  }
  return m;
}
function carino(a, b) {
  if (a <= -1 || b <= -1)
    throw Error("Return is outside the supported long-only attribution range");
  return Math.abs(a - b) < EPS
    ? 1 / (1 + a)
    : (Math.log1p(a) - Math.log1p(b)) / (a - b);
}
export function compare(input, options) {
  const data = validateDataset(input),
    { portfolio, benchmark, start, end, currency = "USD" } = options;
  if (portfolio === benchmark) throw Error("Choose two different funds.");
  if (!["USD", "ZAR"].includes(currency)) throw Error("Unsupported currency");
  if (!start || !end || start > end) throw Error("Choose a valid date range.");
  const prices = levelIndex(data);
  const a = data.snapshots.filter((s) => s.fund === portfolio),
    b = data.snapshots.filter((s) => s.fund === benchmark);
  const snapshots = new Map(
    [...a, ...b].map((s) => [s.fund + "|" + s.asOf, s]),
  );
  const proxyNotes = new Set();
  function opening(fund, date) {
    const exact = snapshots.get(fund + '|' + date);
    if (exact || !options.allowApproximateHoldings) return exact;
    const candidates = (fund === portfolio ? a : b).slice().sort((x,y) => x.asOf.localeCompare(y.asOf));
    // Prefer information available before the period; a later snapshot is an explicitly labelled startup proxy only.
    const before = candidates.filter(s => s.asOf < date).at(-1);
    const chosen = before || candidates[0];
    if (!chosen) return null;
    const age = Math.abs((Date.parse(chosen.asOf) - Date.parse(date)) / 86400000);
    if (!before && age > 7) return null;
    proxyNotes.add(`${fund}: used issuer holdings dated ${chosen.asOf} as a ${before ? 'carried-forward' : 'later-published'} proxy for opening ${date} (${age} calendar days apart). Trades and weight changes may differ.`);
    return chosen;
  }
  function withProxies(result) {
    result.approximateHoldings = proxyNotes.size > 0;
    result.holdingsWarnings = [...proxyNotes];
    result.notes = [...(result.notes || []), ...proxyNotes];
    return result;
  }
  // Fund price dates provide the observed US valuation calendar; no invented holiday calendar.
  const fundDates = (id) =>
    new Set(
      data.levels
        .filter((l) => l.id === id && l.basis !== "fx")
        .map((l) => l.date),
    );
  const da = fundDates(portfolio),
    db = fundDates(benchmark);
  const reference = fundDates("SPY");
  const calendar = [...new Set([...reference, ...da, ...db])].sort();
  const dates = calendar.filter((d) => d >= start && d <= end),
    first = dates[0];
  const prior = calendar.filter((d) => d < first).at(-1);
  const issues = [];
  const missing = [];
  if (!dates.length || !prior)
    return {
      status: "unavailable",
      issues: [
        "No completed return interval exists for this range. Collect an opening snapshot and subsequent prices first.",
      ],
      rows: [],
      missing: [],
    };
  if (calendar.at(-1) < end)
    issues.push(
      `Price history ends ${calendar.at(-1)}; requested end is ${end}. Choose the latest completed valuation date.`,
    );
  const history = [];
  let from = prior;
  for (const to of dates) {
    if (!levelReturn(prices, portfolio, from, to, currency) || !levelReturn(prices, benchmark, from, to, currency)) issues.push(`Fund price missing on ${to}.`);
    const sa = opening(portfolio, from),
      sb = opening(benchmark, from);
    if (!sa || !sb) {
      issues.push(
        `Opening holdings missing for ${!sa ? portfolio : ""}${!sa && !sb ? " and " : ""}${!sb ? benchmark : ""} on ${from}.`,
      );
      from = to;
      continue;
    }
    const x = daily(prices, sa, from, to, currency),
      y = daily(prices, sb, from, to, currency);
    if (!x.complete || !y.complete)
      issues.push(`Incomplete return coverage or weight total for ${to}.`);
    missing.push(
      ...x.missing.map((m) => ({ ...m, fund: portfolio })),
      ...y.missing.map((m) => ({ ...m, fund: benchmark })),
    );
    history.push({ from, to, a: x, b: y, snapshotA: sa, snapshotB: sb });
    from = to;
  }
  if (issues.length) {
    const onlyPriceGaps = issues.every((issue) =>
      issue.startsWith("Incomplete return coverage") || (options.allowPartialReturns && issue.startsWith("Fund price missing")),
    );
    if (
      onlyPriceGaps &&
      history.length === dates.length &&
      (options.allowPartialReturns || history.every(
        (d) =>
          Math.abs(d.a.weight - 1) <= 0.005 &&
          Math.abs(d.b.weight - 1) <= 0.005,
      ))
    ) {
      const partial = partialComparison(
        prices,
        history,
        options,
        prior,
        missing,
      );
      if (partial) return withProxies(partial);
    }
    return {
      status: "incomplete",
      issues: [...new Set(issues)],
      missing,
      rows: [],
      days: dates.length,
      availableDays: history.length,
      coverage: history.length
        ? {
            portfolio: Math.min(...history.map((d) => d.a.covered)),
            benchmark: Math.min(...history.map((d) => d.b.covered)),
          }
        : null,
    };
  }
  const rows = new Map();
  let pa = 1,
    pb = 1;
  const effects = [];
  for (const day of history) {
    for (const side of ["a", "b"])
      for (const r of day[side].rows) {
        const row = rows.get(r.id) || {
          id: r.id,
          ticker: r.ticker,
          name: r.name,
          sector: r.sector,
          weightA: 0,
          weightB: 0,
          ctrA: 0,
          ctrB: 0,
        };
        row[side === "a" ? "weightA" : "weightB"] += r.weight / history.length;
        row[side === "a" ? "ctrA" : "ctrB"] +=
          (side === "a" ? pa : pb) * r.contribution;
        rows.set(r.id, row);
      }
    const ga = groupDay(day.a),
      gb = groupDay(day.b),
      sectors = new Set([...ga.keys(), ...gb.keys()]);
    for (const sector of sectors) {
      const x = ga.get(sector) || { weight: 0, c: 0 },
        y = gb.get(sector) || { weight: 0, c: 0 };
      const ra = x.weight ? x.c / x.weight : 0,
        rb = y.weight ? y.c / y.weight : 0;
      effects.push({
        sector,
        allocation: (x.weight - y.weight) * (rb - day.b.total),
        selection: y.weight * (ra - rb),
        interaction: (x.weight - y.weight) * (ra - rb),
        k: carino(day.a.total, day.b.total),
      });
    }
    pa *= 1 + day.a.total;
    pb *= 1 + day.b.total;
  }
  const returnA = pa - 1,
    returnB = pb - 1,
    k = carino(returnA, returnB),
    grouped = new Map();
  for (const e of effects) {
    const g = grouped.get(e.sector) || {
      sector: e.sector,
      allocation: 0,
      selection: 0,
      interaction: 0,
    };
    for (const name of ["allocation", "selection", "interaction"])
      g[name] += (e[name] * e.k) / k;
    grouped.set(e.sector, g);
  }
  const fundA = levelReturn(prices, portfolio, prior, dates.at(-1), currency),
    fundB = levelReturn(prices, benchmark, prior, dates.at(-1), currency);
  const results = [...rows.values()].map((r) => ({
    ...r,
    activeWeight: r.weightA - r.weightB,
    activeCtr: r.ctrA - r.ctrB,
    securityReturn:
      levelReturn(prices, r.id, prior, dates.at(-1), currency)?.value ?? null,
  }));
  const weightRounding = history.some(
    (d) => Math.abs(d.a.weight - 1) > EPS || Math.abs(d.b.weight - 1) > EPS,
  );
  return withProxies({
    status: "complete",
    start: first,
    end: dates.at(-1),
    baseline: prior,
    currency,
    days: history.length,
    returnA,
    returnB,
    activeReturn: returnA - returnB,
    fundReturnA: fundA?.value ?? null,
    fundReturnB: fundB?.value ?? null,
    residualA: fundA ? fundA.value - returnA : null,
    residualB: fundB ? fundB.value - returnB : null,
    rows: results.sort((a, b) => b.activeCtr - a.activeCtr),
    sectors: [...grouped.values()],
    missing: [],
    issues: [],
    notes: [
      "Holdings-based estimate, not transaction attribution. Returns use supplied USD total-return levels or vendor-adjusted close.",
      "Cash income and private holdings require actual return levels. Missing returns are never treated as zero.",
      "Average weights are arithmetic averages of opening weights over included valuation days. Contributions are linked through cumulative wealth.",
      "Allocation, selection and interaction use daily Brinson–Fachler with Carino linking. FX is included in selected-currency returns, not shown as a separate effect.",
      "Fund comparison uses adjusted market-price returns unless verified fund return levels were imported. It is not automatically NAV.",
      ...(weightRounding
        ? [
            "Issuer weight rounding is preserved; a small unexplained attribution residual may remain.",
          ]
        : []),
    ],
  });
}

/** Known contributions can be shown against observed fund returns without inventing missing prices.
 * They use reference-fund wealth for linking, and retain an explicit unexplained residual.
 * Explicit research mode may use nearby dated holdings proxies; unknown returns remain blank.
 */
function partialComparison(prices, history, options, baseline, missing) {
  const { portfolio, benchmark, currency = "USD" } = options;
  const rows = new Map();
  let wealthA = 1,
    wealthB = 1;
  const referenceA = history.every(d => levelReturn(prices, portfolio, d.from, d.to, currency));
  const referenceB = history.every(d => levelReturn(prices, benchmark, d.from, d.to, currency));
  if ((!referenceA || !referenceB) && !options.allowPartialReturns) return null;
  // Use one common linking basis for both sides, so their difference stays comparable.
  const linked = referenceA && referenceB;
  for (const day of history) {
    const fundA = levelReturn(prices, portfolio, day.from, day.to, currency);
    const fundB = levelReturn(prices, benchmark, day.from, day.to, currency);
    for (const side of ["A", "B"]) {
      const snap = day["snapshot" + side],
        wealth = linked ? (side === "A" ? wealthA : wealthB) : 1;
      for (const p of snap.positions) {
        if (Math.abs(p.weight) < EPS) continue;
        const row = rows.get(p.id) || {
          id: p.id,
          ticker: p.ticker || p.id,
          name: p.name,
          sector: p.sector || "Unclassified",
          weightA: 0,
          weightB: 0,
          ctrA: 0,
          ctrB: 0,
        };
        row["weight" + side] += p.weight / history.length;
        const ret = levelReturn(prices, p.id, day.from, day.to, currency);
        if (!ret) row["ctr" + side] = null;
        else if (row["ctr" + side] !== null)
          row["ctr" + side] += wealth * p.weight * ret.value;
        rows.set(p.id, row);
      }
    }
    if (referenceA) wealthA *= 1 + fundA.value;
    if (referenceB) wealthB *= 1 + fundB.value;
  }
  const end = history.at(-1).to;
  const results = [...rows.values()].map((r) => ({
    ...r,
    activeWeight: r.weightA - r.weightB,
    activeCtr: r.ctrA === null || r.ctrB === null ? null : r.ctrA - r.ctrB,
    securityReturn:
      levelReturn(prices, r.id, baseline, end, currency)?.value ?? null,
  }));
  const explainedA = results.reduce((s, r) => s + (r.ctrA ?? 0), 0),
    explainedB = results.reduce((s, r) => s + (r.ctrB ?? 0), 0);
  return {
    status: "partial",
    start: history[0].to,
    end,
    baseline,
    currency,
    days: history.length,
    returnA: referenceA ? wealthA - 1 : null,
    returnB: referenceB ? wealthB - 1 : null,
    activeReturn: linked ? wealthA - wealthB : null,
    fundReturnA: referenceA ? wealthA - 1 : null,
    fundReturnB: referenceB ? wealthB - 1 : null,
    residualA: linked ? wealthA - 1 - explainedA : null,
    residualB: linked ? wealthB - 1 - explainedB : null,
    contributionMethod: linked ? 'reference-linked' : 'arithmetic-daily',
    knownContributionA: explainedA,
    knownContributionB: explainedB,
    coverage: {
      portfolio: Math.min(...history.map((d) => d.a.covered)),
      benchmark: Math.min(...history.map((d) => d.b.covered)),
    },
    rows: results,
    sectors: [],
    missing,
    issues: [],
    notes: [
      "PARTIAL ANALYSIS. Available headline returns are observed fund reference returns; unavailable figures stay blank. Known contributions are not a complete portfolio return.",
      linked ? "Known contributions are linked with observed reference-fund wealth." : "Without complete reference returns on both sides, contributions on BOTH sides are arithmetic sums of daily opening-weight × return. They are not compounded period returns; no reconciliation residual is claimed.",
      "A missing held-day return makes that security’s period contribution unavailable, not zero. Source weights are preserved, including cash, short positions and incomplete allocations; they are never scaled to 100%.",
      "The unexplained residual includes unavailable contributions, expenses, trading effects, cash income and valuation differences. It must not be attributed entirely to the missing securities.",
      "Sector allocation/selection effects are withheld until all held securities have complete return data.",
      "Reference returns use verified imported levels when available, otherwise vendor-adjusted ETF market prices. Market-price return is not NAV return.",
      "Foreign adjusted prices use same-date FX; market-close differences and local holidays can leave gaps. Average weights include every observed opening snapshot.",
    ],
  };
}
