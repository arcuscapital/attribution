import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parseWeight, handoff, withNewSectors, reg28Tables, themeWeights, createTradeMode, tradeAccount, tradeTables, HANDOFF_KEY} from '../site/trade.mjs';
import {minorUnit, reusableArcusReturn} from '../site/online.mjs';
import {groupByGics} from '../site/rise-swix-core.mjs';

// Trade slider (owner request, 2026-11-15).
function fakeDom() {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.parentElement = null; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.textContent = ''; this.value = ''; this._classes = new Set();
      this.classList = {add: c => this._classes.add(c), contains: c => this._classes.has(c), toggle: (c, on) => { const want = on === undefined ? !this._classes.has(c) : !!on; if (want) this._classes.add(c); else this._classes.delete(c); return want; }}; }
    set className(v) { this._classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
    get className() { return [...this._classes].join(' '); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    removeAttribute(k) { delete this.attrs[k]; }
    append(...n) { for (const c of n) { c.parentElement = this; this.children.push(c); } }
    replaceChildren(...n) { this.children = []; this.append(...n); }
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
    closest(tag) { let n = this; while (n && n.tag !== tag) n = n.parentElement; return n; }
    fire(type, event = {}) { for (const f of this.listeners[type] || []) f({stopPropagation() {}, preventDefault() {}, ...event}); }
    all(test, out = []) { for (const c of this.children) { if (test(c)) out.push(c); c.all(test, out); } return out; }
    get text() { return this.children.length ? this.children.map(c => c.text).join('|') : this.textContent; }
  }
  globalThis.document = {createElement: tag => new El(tag), activeElement: null};
  return El;
}

test('a typed weight is a number from 0 to 100 with two decimals; anything else is refused', () => {
  assert.equal(parseWeight(''), null);
  assert.equal(parseWeight('  '), null);
  assert.equal(parseWeight('5'), 5);
  assert.equal(parseWeight('5,25'), 5.25);
  assert.equal(parseWeight('4.256'), 4.26);
  assert.equal(parseWeight('7%'), 7);
  assert.equal(parseWeight('0'), 0);
  assert.equal(parseWeight('100'), 100);
  for (const bad of ['101', '-1', 'abc', '1e2', '.', '5..2', '1 000']) assert.ok(Number.isNaN(parseWeight(bad)), bad);
});

test('only the four EasyETFs funds have a trade portfolio; Rise and Best get a GICS table, EasyBF Reg 28, the global books themes', () => {
  assert.equal(tradeAccount('PORTFOLIO:EASYBF'), 'easybf');
  assert.equal(tradeAccount('PORTFOLIO:EASYSA'), 'easysa');
  assert.equal(tradeAccount('PORTFOLIO:EASYAI'), 'easyai');
  assert.equal(tradeAccount('PORTFOLIO:EASYGE'), 'easyge');
  for (const none of ['PORTFOLIO:RISE', 'PORTFOLIO:MARLOW', 'PORTFOLIO:IBKR', 'ARKK', undefined]) assert.equal(tradeAccount(none), null);
  assert.equal(tradeTables('PORTFOLIO:RISE'), 'gics');
  assert.equal(tradeTables('PORTFOLIO:EASYSA'), 'gics');
  assert.equal(tradeTables('PORTFOLIO:EASYBF'), 'reg28');
  for (const themed of ['PORTFOLIO:EASYAI', 'PORTFOLIO:EASYGE', 'PORTFOLIO:IBKR', 'PORTFOLIO:MARLOW']) assert.equal(tradeTables(themed), 'theme', 'the global books are measured by theme');
  for (const none of ['QQQ', 'ARKK', undefined]) assert.equal(tradeTables(none), null);
});

test('entries: typing marks a holding, clearing unmarks it, another portfolio starts clean, the slider is off by default', () => {
  const mode = createTradeMode(), seen = [];
  mode.subscribe(why => seen.push(why));
  assert.equal(mode.on, false);
  mode.setScope('PORTFOLIO:EASYBF');
  assert.equal(mode.type('ANG.JO', '4.5'), 4.5);
  assert.ok(mode.has('ANG.JO'));
  assert.equal(mode.weight('ANG.JO', 3), 4.5);
  assert.equal(mode.weight('NPN.JO', 6.25), 6.25, 'an untouched holding keeps its weight');
  assert.equal(mode.weight('NEW.JO', null), 0);
  assert.ok(Number.isNaN(mode.type('NPN.JO', 'abc')));
  assert.equal(mode.has('NPN.JO'), false, 'a refused entry is not a trade');
  assert.equal(mode.text('NPN.JO'), 'abc', 'but the text stays in the field');
  mode.type('ANG.JO', '');
  assert.equal(mode.count(), 0);
  mode.type('ANG.JO', '2');
  mode.setScope('PORTFOLIO:EASYBF');
  assert.equal(mode.count(), 1, 'the same portfolio keeps its entries');
  mode.setScope('PORTFOLIO:EASYSA');
  assert.equal(mode.count(), 0);
  mode.setOn(true); mode.setOn(true);
  assert.deepEqual(seen.filter(w => w === 'mode'), ['mode']);
  mode.setOrderType('VWAP'); assert.equal(mode.orderType, 'VWAP');
  mode.setOrderType('LIMIT'); assert.equal(mode.orderType, '', 'only At Market or VWAP');
});

test('the New field shows the current weight faintly, marks its row when typed in, and the total follows', () => {
  const El = fakeDom(), mode = createTradeMode(), sums = mode.sums();
  const items = [{key: 'A', current: 10}, {key: 'B', current: 5.5}, {key: 'CASH:ZAR', current: 84.5}];
  const total = sums.cell(items);
  assert.equal(total.textContent, '100.00');
  const tr = new El('tr'), td = mode.newCell({key: 'A', current: 10, label: 'Alpha'}); tr.append(td);
  const input = td.children[0];
  assert.equal(input.tag, 'input');
  assert.equal(input.placeholder, '10.00', 'current weight as the faint placeholder');
  assert.equal(input.value, '', 'nothing typed yet');
  assert.equal(input.attrs['aria-label'], 'New weight for Alpha, percent');
  input.value = '12.5'; input.fire('input');
  assert.ok(tr.classList.contains('trade-edited'), 'the whole row is marked');
  assert.equal(total.textContent, '102.50', 'the sum changes as figures are typed');
  input.value = '200'; input.fire('input');
  assert.equal(tr.classList.contains('trade-edited'), false);
  assert.equal(input.attrs['aria-invalid'], 'true');
  assert.equal(total.textContent, '100.00');
  input.value = ''; input.fire('input');
  assert.equal(input.attrs['aria-invalid'], undefined);
  const cash = mode.newCell({key: 'CASH:ZAR', current: 84.5, locked: true});
  assert.equal(cash.children.length, 0, 'cash has no field');
  assert.equal(cash.textContent, '84.50');
  const clicks = []; input.fire('click', {stopPropagation: () => clicks.push(1)});
  assert.equal(clicks.length, 1, 'a tap in the field does not open the phone row');
});

test('GICS sector weights gain a New column that adds up the typed weights', () => {
  const value = {list: [{name: 'Financials', a: 30, b: 28}, {name: 'Materials', a: 20, b: 25}], total: {name: 'Total', a: 50, b: 53}};
  const items = [{key: 'FSR', current: 30, sector: 'Financials'}, {key: 'ANG', current: 20, sector: 'Materials'}, {key: 'XYZ', current: 0, sector: 'Energy'}];
  const typed = new Map([['FSR', 25], ['XYZ', 2]]);
  const out = withNewSectors(value, items, i => typed.has(i.key) ? typed.get(i.key) : i.current);
  assert.deepEqual(out.list.map(x => [x.name, x.n]), [['Financials', 25], ['Materials', 20], ['Energy', 2]]);
  assert.equal(out.total.n, 47);
  assert.equal(out.total.a, 50, 'current columns are untouched');
});

// A stand-in with the Trade screen's reg28() shape: rows {key,label,limit,old,breachOld}, holdings {symbol,bucket}.
const fakeRules = {reg28(portfolio) {
  const foreign = new Set(['EASYAI', 'STXNDQ']), bonds = new Set(['STXGOV']), sum = {foreignEquity: 0, foreignCash: 0, localEquity: 0, bonds: 0, localCash: 0};
  const holdings = portfolio.holdings.map(h => { const bucket = foreign.has(h.sourceTicker) ? 'foreignEquity' : bonds.has(h.sourceTicker) ? 'bonds' : 'localEquity'; sum[bucket] += h.weightPct; return {symbol: h.sourceTicker, bucket}; });
  for (const c of portfolio.cashWeights) sum[c.currency === 'ZAR' ? 'localCash' : 'foreignCash'] += c.weightPct;
  const totalForeign = sum.foreignEquity + sum.foreignCash, totalEquity = sum.foreignEquity + sum.localEquity, total = Object.values(sum).reduce((a, b) => a + b, 0);
  const row = (key, label, old, limit = null) => ({key, label, limit, old, breachOld: limit !== null && Math.round(old * 100) / 100 > limit});
  return {holdings, rows: [row('foreignEquity', 'Foreign equity', sum.foreignEquity), row('foreignCash', 'Foreign cash', sum.foreignCash), row('totalForeign', 'Total foreign', totalForeign, 45),
    row('localEquity', 'Local equity', sum.localEquity), row('totalEquity', 'Total equity', totalEquity, 75), row('bonds', 'Bonds', sum.bonds), row('localCash', 'Local cash', sum.localCash), row('total', 'Total', total)]};
}};
test('EasyBF: Reg 28 follows the new weights, and SA equity sectors are shares of SA equity (10% of the fund in a 35% SA equity book is 28.57%)', () => {
  const items = [
    {key: 'EASYAI.JO', current: 40, ticker: 'EASYAI', symbol: 'EASYAI.JO', name: 'EasyAI', currency: 'ZAR', sector: 'Unknown GICS'},
    {key: 'CPI.JO', current: 10, ticker: 'CPI', symbol: 'CPI.JO', name: 'Capitec', currency: 'ZAR', sector: 'Information Technology'},
    {key: 'FSR.JO', current: 25, ticker: 'FSR', symbol: 'FSR.JO', name: 'FirstRand', currency: 'ZAR', sector: 'Financials'},
    {key: 'STXGOV.JO', current: 20, ticker: 'STXGOV', symbol: 'STXGOV.JO', name: 'Satrix GOVI', currency: 'ZAR', sector: 'Unknown GICS'},
    {key: 'CASH:ZAR', current: 5, ticker: 'ZAR', symbol: null, name: 'ZAR cash', currency: 'ZAR', cash: true, sector: 'Unknown GICS'},
  ];
  const typed = new Map([['EASYAI.JO', 46], ['FSR.JO', 15]]);
  const t = reg28Tables(fakeRules, items, i => typed.has(i.key) ? typed.get(i.key) : i.current);
  const row = key => t.rows.find(r => r.key === key);
  assert.deepEqual([row('totalForeign').a, row('totalForeign').n], [40, 46]);
  assert.equal(row('totalForeign').breachA, false);
  assert.equal(row('totalForeign').breachN, true, 'over 45% with the new weights');
  assert.equal(row('totalForeign').limit, 45);
  assert.deepEqual([row('totalEquity').a, row('totalEquity').n], [75, 71]);
  assert.deepEqual([row('localCash').a, row('localCash').n], [5, 5], 'cash is left as it is');
  assert.deepEqual([row('total').a, row('total').n], [100, 96], 'Total shows whether the new weights still add up');
  assert.equal(t.equity.shareA, 35); assert.equal(t.equity.shareN, 25);
  const tech = t.equity.list.find(x => x.name === 'Information Technology'), fin = t.equity.list.find(x => x.name === 'Financials');
  assert.equal(tech.a.toFixed(2), '28.57'); assert.equal(tech.n.toFixed(2), '40.00');
  assert.equal(fin.a.toFixed(2), '71.43'); assert.equal(fin.n.toFixed(2), '60.00');
  assert.equal(t.equity.list.some(x => x.name === 'Unknown GICS'), false, 'funds and bonds are not SA equity');
  assert.deepEqual([t.equity.total.a, t.equity.total.n], [100, 100]);
  assert.equal(t.equity.list.reduce((s, x) => s + x.a, 0).toFixed(6), '100.000000');
});

test('the Trade button passes only the marked rows, with the order type and both weights', () => {
  const sent = handoff('easybf', 'PORTFOLIO:EASYBF', 'VWAP', [{id: 'FSR.JO', symbol: 'FSR.JO', ticker: 'FSR', name: 'FirstRand', current: 24.99996, target: 15}], 1763200000000);
  assert.deepEqual(sent, {v: 1, account: 'easybf', fund: 'PORTFOLIO:EASYBF', execution: 'VWAP', createdAt: 1763200000000,
    trades: [{id: 'FSR.JO', symbol: 'FSR.JO', ticker: 'FSR', name: 'FirstRand', current: 25, target: 15}]});
  assert.equal(HANDOFF_KEY, 'arcus-analysis-trades');
  const source = fs.readFileSync('site/trade.mjs', 'utf8');
  assert.ok(source.includes("location.assign('/?tab=trade&acct='+account)"), 'opens the ordinary Trade screen');
  assert.ok(!/fetch\(/.test(source), 'the page itself sends nothing');
});

test('grouped rows keep their id for the New field, and JSE listings are priced in rand from cents', () => {
  const value = groupByGics([{id: 'FSR.JO', ticker: 'FSR', name: 'FirstRand', weightA: .25, weightB: 0, ctrA: .001, ctrB: null, securityReturn: .004}], {'FSR.JO': 'Financials'});
  assert.equal(value.groups[0].children[0].id, 'FSR.JO');
  assert.deepEqual(minorUnit('ZAc'), {currency: 'ZAR', scale: .01});
  assert.deepEqual(minorUnit('GBp'), {currency: 'GBP', scale: .01});
  assert.deepEqual(minorUnit('EUR'), {currency: 'EUR', scale: 1});
  assert.equal(reusableArcusReturn('NVDA'), true);
  assert.equal(reusableArcusReturn('FSR.JO'), false);
});

test('the page has the switch under Compare funds (off, hidden until its module loads), the two EasyBF tables and the styles', () => {
  const html = fs.readFileSync('site/index.html', 'utf8'), css = fs.readFileSync('site/style.css', 'utf8'), app = fs.readFileSync('site/app.mjs', 'utf8');
  const run = html.indexOf('id="run"'), toggle = html.indexOf('id="trade-toggle"');
  assert.ok(run > 0 && toggle > run && toggle < html.indexOf('</form>', run), 'directly after the Compare funds button');
  assert.match(html, /<label class="trade-toggle" id="trade-toggle" hidden\s*><input id="trade-mode" type="checkbox" role="switch" \/>/);
  assert.ok(!/id="trade-mode"[^>]*checked/.test(html), 'off by default');
  assert.ok(html.includes('>Trade slider</span>'));
  assert.ok(html.indexOf('id="reg28-weights"') > html.indexOf('id="gics-weights"') && html.indexOf('id="sa-equity-weights"') > html.indexOf('id="reg28-weights"'));
  assert.ok(css.includes('button.trade-button{color:#fff;background:#1967d2'), 'blue button, white writing');
  assert.ok(css.includes('--trade-row:#3A3A3A') && css.includes('--trade-row:#3F4955'), 'dark grey row in both themes');
  assert.ok(app.includes("$('trade-mode').checked = false"), 'off on every load');
  assert.ok(app.includes("if ($('back-arcus')?.tagName !== 'SPAN') try {"), 'never for the Marlow-only login');
  for (const file of ['app.mjs', 'ranges.mjs', 'rise-swix.mjs', 'trade.mjs']) {
    const text = fs.readFileSync('site/' + file, 'utf8');
    for (const [, name, version] of text.matchAll(/'\.\/(rise-swix-core|ranges|rise-swix|trade|online)\.mjs\?v=([a-z0-9-]+)'/g)) assert.equal(version, name==='online'?'guard-20261125':name==='trade'?'trade-20261115':'phone-20261119', file + ' imports ' + name);
  }
});

test('theme and sub-theme weights for both sides, with the new weights; Unclassified and Cash last', () => {
  const t = themeWeights([
    {theme: 'Ai', subTheme: 'Semis', a: 20, b: 10, n: 25}, {theme: 'Ai', subTheme: 'Semis', a: 5, b: 0, n: 5}, {theme: 'Ai', subTheme: 'Software', a: 10, b: 30, n: 4},
    {theme: 'Robotics', subTheme: '', a: 40, b: 0, n: 40}, {theme: 'Unclassified', subTheme: '', a: 60, b: 50, n: 60}, {theme: 'Cash', subTheme: '', a: 5, b: 1, n: 5},
  ]);
  assert.deepEqual(t.list.map(x => [x.name, x.a, x.b, x.n, !!x.sub]), [
    ['Robotics', 40, 0, 40, false],
    ['Ai', 35, 40, 34, false], ['Semis', 25, 10, 30, true], ['Software', 10, 30, 4, true],
    ['Unclassified', 60, 50, 60, false], ['Cash', 5, 1, 5, false]]);
  assert.deepEqual(t.total, {name: 'Total', a: 140, b: 91, n: 139});
  assert.ok(t.list[0].strong && !t.list[2].strong);
});

test('both bridges serve the trade module: Attribution allows it and the page imports nothing else new', () => {
  const bridge = fs.readFileSync('cloudflare/bridge.mjs', 'utf8'), allowed = new Set([...bridge.match(/const ASSETS = new Set\(\[([^\]]+)\]\)/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]));
  assert.ok(allowed.has('trade.mjs'));
  for (const file of fs.readdirSync('site').filter(name => name.endsWith('.mjs')))
    for (const [, name] of fs.readFileSync('site/' + file, 'utf8').matchAll(/['"]\.\/([a-z-]+\.mjs)(?:\?v=[a-z0-9-]+)?['"]/g)) assert.ok(allowed.has(name), file + ' imports ' + name + ', which the bridge must serve');
});
