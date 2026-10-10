import { test } from "node:test";
import assert from "node:assert/strict";
import { compare } from "../site/engine.mjs";
function fixture() {
  const positions = [
    { id: "X", ticker: "X", name: "First", sector: "Technology", weight: 0.6 },
    { id: "Y", ticker: "Y", name: "Second", sector: "Health", weight: 0.4 },
  ];
  const snapshots = ["2026-10-01", "2026-10-02"].flatMap((asOf) =>
    ["A", "B"].map((fund) => ({
      fund,
      asOf,
      positions: positions.map((p, i) => ({
        ...p,
        weight: fund === "B" ? 0.5 : p.weight,
      })),
    })),
  );
  const levels = [];
  for (const [id, values] of Object.entries({
    X: [100, 110, 99],
    Y: [100, 100, 110],
    A: [100, 106, 103.88],
    B: [100, 105, 105],
    "USDZAR=X": [17, 17.17, 17.34],
  }))
    ["2026-10-01", "2026-10-02", "2026-10-05"].forEach((date, i) =>
      levels.push({
        id,
        date,
        value: values[i],
        currency: id === "USDZAR=X" ? "ZAR" : "USD",
        basis: id === "USDZAR=X" ? "fx" : "verified-total-return",
      }),
    );
  return { manifest: { schemaVersion: 1 }, snapshots, levels };
}
const options = {
  portfolio: "A",
  benchmark: "B",
  start: "2026-10-02",
  end: "2026-10-05",
  currency: "USD",
};
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
test('research mode uses a nearby later snapshot without changing source dates', () => {
  const d = fixture();
  d.snapshots = d.snapshots.filter(s => s.asOf === '2026-10-02');
  const before = JSON.stringify(d);
  const r = compare(d, {...options,start:'2026-10-02',end:'2026-10-02',allowApproximateHoldings:true});
  assert.equal(r.status,'complete'); assert.equal(r.approximateHoldings,true);
  assert.ok(r.holdingsWarnings.some(n => n.includes('later-published')));
  close(r.returnA,.06); assert.equal(JSON.stringify(d),before);
});
test('research mode prefers prior holdings and refuses distant hindsight', () => {
  const d=fixture(); d.snapshots=d.snapshots.filter(s => s.asOf==='2026-10-01');
  const r=compare(d,{...options,allowApproximateHoldings:true});
  assert.equal(r.status,'complete'); assert.ok(r.holdingsWarnings.some(n => n.includes('carried-forward')));
  d.snapshots.forEach(s => s.asOf='2026-11-01');
  assert.equal(compare(d,{...options,allowApproximateHoldings:true}).status,'incomplete');
});
test('research mode preserves missing price disclosure and known contributions', () => {
  const d=fixture(); d.snapshots=d.snapshots.filter(s => s.asOf==='2026-10-02');
  d.levels=d.levels.filter(l => l.id!=='Y');
  const r=compare(d,{...options,start:'2026-10-02',end:'2026-10-02',allowApproximateHoldings:true});
  assert.equal(r.status,'partial'); assert.equal(r.approximateHoldings,true);
  assert.equal(r.rows.find(x => x.id==='Y').ctrA,null);
  close(r.knownContributionA,.06);
});
test("multi-day linked contributions reconcile to compounded return", () => {
  const r = compare(fixture(), options);
  assert.equal(r.status, "complete");
  close(r.returnA, 0.0388);
  close(r.returnB, 0.05);
  close(
    r.rows.reduce((a, r) => a + r.ctrA, 0),
    r.returnA,
  );
  close(
    r.rows.reduce((a, r) => a + r.activeCtr, 0),
    r.activeReturn,
  );
  close(
    r.sectors.reduce(
      (a, r) => a + r.allocation + r.selection + r.interaction,
      0,
    ),
    r.activeReturn,
  );
});
test("missing private holding return blocks full result, never zero", () => {
  const d = fixture();
  d.snapshots[0].positions[0].id = "PRIVATE";
  const r = compare(d, options);
  assert.equal(r.status, "partial");
  close(r.returnA, 0.0388);
  assert.equal(r.rows.find((r) => r.id === "PRIVATE").ctrA, null);
  assert.ok(r.missing.some((m) => m.id === "PRIVATE"));
});
test("missing daily holdings are not silently forward-filled", () => {
  const d = fixture();
  d.snapshots = d.snapshots.filter(
    (s) => !(s.fund === "A" && s.asOf === "2026-10-02"),
  );
  const r = compare(d, options);
  assert.equal(r.status, "incomplete");
  assert.ok(r.issues.some((x) => x.includes("Opening holdings missing")));
});
test("weights change and removed securities retain their contribution", () => {
  const d = fixture();
  d.snapshots.find((s) => s.fund === "A" && s.asOf === "2026-10-02").positions =
    [{ id: "Y", ticker: "Y", name: "Second", sector: "Health", weight: 1 }];
  const r = compare(d, options);
  assert.equal(r.status, "complete");
  close(r.returnA, 0.166);
  close(r.rows.find((r) => r.id === "X").weightA, 0.3);
});
test("FX converts returns multiplicatively and does not double count", () => {
  const r = compare(fixture(), { ...options, currency: "ZAR" });
  assert.equal(r.status, "complete");
  close(r.returnA, 1.0388 * 1.02 - 1);
});
test("one-day attribution and equal portfolio returns are stable", () => {
  const d = fixture();
  d.snapshots.forEach((s) => s.positions.forEach((p) => (p.weight = 0.5)));
  const r = compare(d, { ...options, end: "2026-10-02" });
  assert.equal(r.status, "complete");
  close(r.activeReturn, 0);
  close(
    r.sectors.reduce(
      (a, r) => a + r.allocation + r.selection + r.interaction,
      0,
    ),
    0,
  );
});
test("mixed return bases cannot be joined into a fabricated return", () => {
  const d = fixture();
  d.levels.find((l) => l.id === "X" && l.date === "2026-10-02").basis =
    "vendor-adjusted";
  assert.equal(compare(d, options).status, "partial");
});
test("future date range and empty archives stay unavailable", () => {
  assert.equal(
    compare(fixture(), { ...options, start: "2027-01-01", end: "2027-01-04" })
      .status,
    "unavailable",
  );
});
test("malformed numeric inputs rejected", () => {
  const d = fixture();
  d.snapshots[0].positions[0].weight = NaN;
  assert.throws(() => compare(d, options));
});
test("10 repeated refreshes produce deterministic results without mutation", () => {
  const d = fixture(),
    before = JSON.stringify(d),
    expected = compare(d, options);
  for (let i = 0; i < 10; i++) assert.deepEqual(compare(d, options), expected);
  assert.equal(JSON.stringify(d), before);
});
export { fixture };

test("partial report preserves all opening weights and reconciles known contributions plus residual", () => {
  const d = fixture();
  for (const s of d.snapshots.filter((s) => s.fund === "A"))
    s.positions[0].id = "PRIVATE";
  const r = compare(d, options);
  assert.equal(r.status, "partial");
  close(
    r.rows.reduce((sum, row) => sum + row.weightA, 0),
    1,
  );
  close(
    r.rows.reduce((sum, row) => sum + (row.ctrA ?? 0), 0) + r.residualA,
    r.fundReturnA,
  );
  assert.equal(r.rows.find((row) => row.id === "PRIVATE").ctrA, null);
  assert.equal(r.sectors.length, 0);
});

test("missing both fund dates cannot hide a session present in the reference calendar", () => {
  const d = fixture();
  d.levels.push({
    id: "SPY",
    date: "2026-10-02",
    value: 100,
    currency: "USD",
    basis: "vendor-adjusted",
  });
  d.levels = d.levels.filter(
    (l) => !(l.date === "2026-10-02" && ["A", "B"].includes(l.id)),
  );
  assert.equal(compare(d, options).status, "incomplete");
});

test('research comparison keeps contributions when portfolio has no reference series',()=>{
 const d=fixture();d.levels=d.levels.filter(l=>l.id!=='A');
 d.levels=d.levels.filter(l=>l.id!=='Y');
 const r=compare(d,{...options,allowPartialReturns:true});
 assert.equal(r.status,'partial');assert.equal(r.returnA,null);close(r.returnB,.05);
 assert.equal(r.activeReturn,null);assert.equal(r.residualB,null);
 assert.equal(r.contributionMethod,'arithmetic-daily');
 close(r.rows.find(x=>x.id==='X').ctrA,0);assert.equal(r.rows.find(x=>x.id==='Y').ctrA,null);
});
test('partial source allocations are not silently rescaled',()=>{
 const d=fixture();d.snapshots.forEach(s=>s.positions[0].weight=.2);
 const r=compare(d,{...options,allowPartialReturns:true});
 assert.equal(r.status,'partial');close(r.rows.find(x=>x.id==='X').weightA,.2);
});

test('IBKR portfolio cannot inherit the IBKR listed stock return',()=>{
 const d=fixture();
 d.snapshots.filter(s=>s.fund==='A').forEach(s=>s.fund='PORTFOLIO:IBKR');
 d.levels.filter(l=>l.id==='A').forEach(l=>l.id='IBKR');
 const r=compare(d,{...options,portfolio:'PORTFOLIO:IBKR',allowPartialReturns:true});
 assert.equal(r.status,'partial');assert.equal(r.returnA,null);
 assert.equal(r.fundReturnA,null);assert.ok(Number.isFinite(r.knownContributionA));
});

test('explicit saved-allocation research permits historical periods without fabricating holding dates',()=>{
 const d=fixture();d.snapshots=d.snapshots.filter(s=>s.asOf==='2026-10-01');
 d.snapshots.forEach(s=>s.asOf='2026-11-01');
 const original=JSON.stringify(d);
 const r=compare(d,{...options,allowApproximateHoldings:true,allowSnapshotResearch:true});
 assert.equal(r.status,'complete');assert.equal(r.approximateHoldings,true);
 assert.ok(r.holdingsWarnings.every(w=>w.includes('2026-11-01')&&w.includes('later-published')));
 assert.equal(JSON.stringify(d),original);
 close(r.rows.find(row=>row.id==='X').securityReturn,-.01);
});
