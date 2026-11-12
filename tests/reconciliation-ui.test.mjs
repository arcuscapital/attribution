import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('site/app.mjs', 'utf8');
function harness() {
  const text = (tag, value = '', className = '') => ({tag, textContent:value, className, children:[], attrs:{},
    append(...children) { this.children.push(...children); }, setAttribute(name, value) { this.attrs[name] = value; }});
  const ctx = vm.createContext({text, $:()=>null, fmt:value => value == null ? '—' : (value * 100).toFixed(2) + '%', fundLabel:id => id.replace('PORTFOLIO:', '')});
  vm.runInContext(app.slice(app.indexOf('function reconciliationSide('), app.indexOf('// Use resolved listing identities')), ctx);
  return ctx;
}
const options = {portfolio:'PORTFOLIO:TEST', benchmark:'TEST-ETF', currency:'USD'};
const fixture = () => ({rows:[], fundReturnA:null, fundReturnB:.08, knownContributionA:.07, knownContributionB:.035,
  residualA:null, residualB:.045, returnMethodA:'weighted-estimate', returnMethodB:'reference',
  coverage:{portfolio:.95, benchmark:.88}, missing:[{fund:'TEST-ETF',id:'A'},{fund:'TEST-ETF',id:'A'},{fund:'TEST-ETF',id:'B'}]});
const strings = node => [node.textContent, ...node.children.flatMap(strings)];

test('1D displays dated NAV separately and leaves the market and contribution calculations intact',()=>{
  const ctx=harness(),opts={...options,start:'2026-11-09',end:'2026-11-09'},r={...fixture(),fundReturnBasisB:'arcus-completed-session',issuerNav:{'TEST-ETF':{status:'ok',date:'2026-11-09',currency:'USD',return:.0494,issuer:'Example issuer',sourceUrl:'https://issuer.example/nav'}}};
  const copy=strings(ctx.renderReconciliation(r,opts));
  for(const value of ['1D NAV return','4.94%','8.00%','+3.50 pp','NAV less contributions','+1.44 pp','Market return less NAV','+3.06 pp','Issuer NAV source'])assert.ok(copy.includes(value),value);
  assert.equal(r.fundReturnB,.08);assert.equal(r.knownContributionB,.035);
});
test('missing or misdated NAV says No data; longer periods and user portfolios do not show issuer NAV',()=>{
  const ctx=harness(),opts={...options,start:'2026-11-09',end:'2026-11-09'};
  for(const packet of [undefined,{status:'ok',date:'2026-11-06',currency:'USD',return:.05},{status:'ok',date:'2026-11-09',currency:'ZAR',return:.05}]){
    const r={...fixture(),issuerNav:{'TEST-ETF':packet}};
    const copy=strings(ctx.renderReconciliation(r,opts));assert.ok(copy.includes('No data'));assert.equal(copy.filter(x=>x==='1D NAV return').length,1);
    assert.ok(!strings(ctx.renderReconciliation(r,{...opts,start:'2026-11-01'})).includes('1D NAV return'));
  }
});

test('fund-specific reconciliation keeps independent reference and contribution values apart', () => {
  const ctx = harness(), result = fixture(), a = ctx.reconciliationSide(result, options, 'A'), b = ctx.reconciliationSide(result, options, 'B');
  assert.equal(a.basis, 'Weighted portfolio estimate'); assert.equal(a.reference, null); assert.equal(a.contribution, .07); assert.equal(a.residual, null);
  assert.equal(b.basis, 'Observed fund reference'); assert.equal(b.reference, .08); assert.equal(b.contribution, .035); assert.equal(b.residual, .045);
  assert.equal(b.coverage, .88); assert.equal(b.missing, 2, 'count distinct holdings, not missing daily observations');
  const node = ctx.renderReconciliation(result, options), copy = strings(node);
  assert.equal(node.attrs['aria-label'], 'Return reconciliation');
  assert.ok(copy.includes('Portfolio · TEST')); assert.ok(copy.includes('Benchmark · TEST-ETF'));
  assert.ok(copy.includes('8.00%')); assert.ok(copy.includes('+3.50 pp')); assert.ok(copy.includes('+4.50 pp'));
  assert.ok(copy.some(value => value.includes('No independent reference return')));
  assert.equal(result.knownContributionB, .035, 'rendering never resizes contributions to match the reference');
});

test('complete legacy results derive unrounded row subtotals and measured coverage without assumptions', () => {
  const ctx = harness(), data = {fundReturnA:.03, rows:[{weightA:.6,ctrA:.012},{weightA:.3,ctrA:.009},{weightA:.1,ctrA:0,assumedZero:true}],missing:[]};
  const side = ctx.reconciliationSide(data, options, 'A');
  assert.ok(Math.abs(side.contribution - .021) < 1e-12); assert.ok(Math.abs(side.residual - .009) < 1e-12);
  assert.ok(Math.abs(side.coverage - .9) < 1e-12);
});

test('explicit missing totals/residuals stay unavailable and genuine zero remains zero', () => {
  const ctx = harness(), missing = {...fixture(), knownContributionB:null, residualB:null, fundReturnB:0};
  const side = ctx.reconciliationSide(missing, options, 'B');
  assert.equal(side.reference, 0); assert.equal(side.contribution, null); assert.equal(side.residual, null);
  const copy = strings(ctx.renderReconciliation(missing, options));
  assert.ok(copy.includes('0.00%')); assert.ok(copy.includes('—'));
});

test('market references disclose that their valuation basis is not NAV', () => {
  for (const basis of ['vendor-adjusted', 'arcus-completed-session']) {
    const ctx = harness(), result = {...fixture(), fundReturnBasisB:basis};
    const side = ctx.reconciliationSide(result, options, 'B');
    assert.equal(side.referenceLabel, 'Observed fund market return');
    assert.equal(side.basis, 'Observed fund market return');
    assert.equal(side.marketReference, true);
    const cards = ctx.renderReconciliation(result, options).children.at(-1).children;
    assert.ok(strings(cards[1]).includes('Market-price return is not NAV return.'));
    assert.ok(!strings(cards[0]).includes('Market-price return is not NAV return.'), 'the market note belongs only to the market reference fund');
    assert.equal(side.reference, .08); assert.equal(side.contribution, .035); assert.equal(side.residual, .045);
  }
});

test('verified, mixed and unknown reference sources retain their own labels without a market claim', () => {
  for (const [basis, label] of [
    ['verified-total-return', 'Imported verified total return'],
    ['mixed', 'Observed fund reference (mixed sources)'],
    [undefined, 'Observed fund reference'],
    ['future-source', 'Observed fund reference'],
  ]) {
    const ctx = harness(), result = {...fixture(), fundReturnBasisB:basis};
    const side = ctx.reconciliationSide(result, options, 'B');
    assert.equal(side.referenceLabel, label); assert.equal(side.marketReference, false);
    const copy = strings(ctx.renderReconciliation(result, options));
    assert.ok(copy.includes(label)); assert.ok(!copy.includes('Market-price return is not NAV return.'));
  }
});

test('account references and unavailable fund references do not make a market-price claim', () => {
  const ctx = harness(), result = {...fixture(), fundReturnA:.07, fundReturnBasisA:'vendor-adjusted', fundReturnB:null, fundReturnBasisB:'vendor-adjusted'};
  const side = ctx.reconciliationSide(result, options, 'A');
  assert.equal(side.referenceLabel, 'Observed account reference'); assert.equal(side.marketReference, false);
  assert.equal(side.basis, 'Weighted portfolio estimate');
  const copy = strings(ctx.renderReconciliation(result, options));
  assert.ok(copy.includes('Observed account reference'));
  assert.ok(!copy.includes('Market-price return is not NAV return.'));
  assert.ok(copy.some(value => value.includes('No independent reference return')));
});

test('reconciliation is always alongside metrics and session locking also clears table totals', () => {
  const metrics = app.slice(app.indexOf('$("metrics").replaceChildren('), app.indexOf('    renderRows();', app.indexOf('$("metrics").replaceChildren(')));
  assert.match(metrics, /renderReconciliation\(result, options\)/);
  const lock = app.slice(app.indexOf('onLock()'), app.indexOf('onUnlock()'));
  assert.match(lock, /'metrics'/); assert.match(lock, /\.tFoot\?\.replaceChildren\(\)/); assert.match(lock, /\$\('results'\)\.hidden = true/);
});
