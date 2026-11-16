import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createTradeMode, handoff} from '../site/trade.mjs';

// Add new share (owner request, 2026-11-16): beside Trade, a share the fund does not hold, with a % weight.
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
    find(cls) { return this.all(c => c.classList.contains(cls))[0]; }
  }
  globalThis.document = {createElement: tag => new El(tag), activeElement: null};
  return El;
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('a new share is kept with the typed weights of its portfolio, counted, removable, and starts clean elsewhere', () => {
  const mode = createTradeMode(), seen = [];
  mode.subscribe(why => seen.push(why));
  mode.setScope('PORTFOLIO:EASYAI');
  assert.equal(mode.addShare({id: 'asml.as', symbol: 'ASML.AS', ticker: 'ASML.AS', name: 'ASML Holding N.V.', currency: 'EUR'}, '2.5'), 'ASML.AS');
  assert.deepEqual(seen, ['add']);
  assert.equal(mode.count(), 1);assert.deepEqual(mode.entries(), [['ASML.AS', 2.5]]);
  assert.equal(mode.weight('ASML.AS', 0), 2.5);assert.equal(mode.newShare('ASML.AS').name, 'ASML Holding N.V.');
  assert.equal(mode.addShare({id: 'BAD ID!'}, '1'), null, 'not a ticker');
  assert.equal(mode.addShare({id: 'SAP.DE'}, '101'), null, 'not a weight');
  mode.type('ASML.AS', '3');assert.equal(mode.weight('ASML.AS', 0), 3, 'its weight can be changed');
  mode.removeShare('ASML.AS');
  assert.equal(mode.count(), 0);assert.deepEqual(mode.newShares(), []);
  mode.addShare({id: 'SAP.DE', name: 'SAP'}, '1');
  mode.setScope('PORTFOLIO:EASYGE');
  assert.deepEqual(mode.newShares(), [], 'another portfolio starts clean');
  mode.addShare({id: 'SAP.DE', name: 'SAP'}, '1');mode.clear();
  assert.deepEqual(mode.newShares(), []);
});

test('the Add new share button opens a panel: ticker and % weight, looked up by the page, listed with an editable weight', async () => {
  fakeDom();
  const mode = createTradeMode(), asked = [];
  mode.setScope('PORTFOLIO:EASYAI');mode.setOn(true);
  const findShare = async text => { asked.push(text);
    if (text === 'nvda') return {key: 'NVDA', existing: true, held: true, label: 'NVDA'};
    if (text === 'nope') return {error: 'NOPE was not found on Yahoo Finance.'};
    return {share: {id: 'ASML.AS', symbol: 'ASML.AS', ticker: 'ASML.AS', name: 'ASML Holding N.V.', currency: 'EUR', theme: 'Ai', subTheme: 'Semis'}}; };
  const wrap = mode.actions({fund: () => 'PORTFOLIO:EASYAI', fundName: () => 'EasyAI', trades: () => [], findShare, suggest: async () => [{ticker: 'ASML.AS', name: 'ASML Holding N.V.'}]});
  const add = wrap.find('trade-add-button'), panel = wrap.find('trade-add-panel');
  assert.equal(add.textContent, '+ Add new share');
  assert.equal(panel.hidden, true, 'closed until pressed');
  add.fire('click');
  assert.equal(panel.hidden, false);assert.equal(add.attrs['aria-expanded'], 'true');
  assert.match(panel.find('trade-add-help').textContent, /A share EasyAI does not hold/);
  await tick();
  assert.equal(panel.all(c => c.tag === 'option')[0].value, 'ASML.AS', 'ticker list from the page');
  const ticker = panel.find('trade-add-ticker'), weight = panel.find('trade-add-weight'), confirm = panel.find('trade-add-confirm'), status = panel.find('trade-add-status');
  ticker.value = 'asml.as';weight.value = '';confirm.fire('click');await tick();
  assert.match(status.textContent, /Enter a % weight/);assert.deepEqual(asked, [], 'nothing looked up without a weight');
  weight.value = '2';confirm.fire('click');await tick();await tick();
  assert.deepEqual(asked, ['asml.as']);
  assert.equal(status.textContent, 'ASML.AS · ASML Holding N.V. added at 2.00%.');
  assert.deepEqual(mode.entries(), [['ASML.AS', 2]]);assert.equal(add.textContent, '+ Add new share (1)');
  const rows = panel.find('trade-add-shares').all(c => c.tag === 'tr');
  assert.equal(rows.length, 1);assert.equal(rows[0].children[0].textContent, 'ASML.AS');
  const field = rows[0].find('trade-input');assert.equal(field.value, '2');
  field.value = '3.5';field.fire('input');assert.equal(mode.weight('ASML.AS', 0), 3.5, 'weight edited in the list');
  ticker.value = 'nvda';weight.value = '9';confirm.fire('click');await tick();await tick();
  assert.match(status.textContent, /NVDA is already held: its new weight 9\.00% is set in the table/);
  assert.equal(mode.weight('NVDA', 8), 9);
  ticker.value = 'nope';weight.value = '1';confirm.fire('click');await tick();await tick();
  assert.equal(status.textContent, 'NOPE was not found on Yahoo Finance.');
  rows[0].find('trade-add-remove').fire('click');
  assert.equal(mode.newShare('ASML.AS'), null);assert.equal(add.textContent, '+ Add new share');
  mode.setOn(false);assert.equal(panel.hidden, true, 'closes with the slider');
});

test('a ticker typed while the last one is being looked up is kept', async () => {
  fakeDom();
  const mode = createTradeMode();mode.setScope('PORTFOLIO:EASYAI');mode.setOn(true);
  let release;
  const wrap = mode.actions({fund: () => 'PORTFOLIO:EASYAI', fundName: () => 'EasyAI', trades: () => [],
    findShare: text => new Promise(resolve => { release = () => resolve({share: {id: text.toUpperCase(), ticker: text.toUpperCase(), name: text}}); })});
  wrap.find('trade-add-button').fire('click');
  const panel = wrap.find('trade-add-panel'), ticker = panel.find('trade-add-ticker'), weight = panel.find('trade-add-weight');
  ticker.value = 'ASML.AS';weight.value = '1.5';panel.find('trade-add-confirm').fire('click');
  ticker.value = 'SAP.DE';weight.value = '1';release();await tick();await tick();
  assert.deepEqual(mode.entries(), [['ASML.AS', 1.5]]);
  assert.equal(ticker.value, 'SAP.DE');assert.equal(weight.value, '1', 'the next share is still there to add');
});

test('funds without an Arcus trade portfolio, or outside Arcus, explain instead of opening the panel', () => {
  fakeDom();
  const mode = createTradeMode();mode.setOn(true);
  const rise = mode.actions({fund: () => 'PORTFOLIO:RISE', fundName: () => 'Rise', trades: () => []});
  rise.find('trade-add-button').fire('click');
  assert.equal(rise.find('trade-add-panel').hidden, true);
  assert.match(rise.find('trade-note').textContent, /Rise has no Arcus trade portfolio\. New shares can be added for EasyAI, EasyGE, EasyBF and Best/);
  const outside = mode.actions({fund: () => 'PORTFOLIO:EASYBF', fundName: () => 'EasyBF', trades: () => [], integrated: false});
  outside.find('trade-add-button').fire('click');
  assert.match(outside.find('trade-note').textContent, /Open Portfolio Analysis from Arcus/);
});

test('a new share goes to Trade like any other row: id and ticker, 0% now, the new weight', () => {
  const sent = handoff('easyai', 'PORTFOLIO:EASYAI', 'MARKET', [{id: 'ASML.AS', symbol: 'ASML.AS', ticker: 'ASML.AS', name: 'ASML Holding N.V.', current: 0, target: 2}], 1763300000000);
  assert.deepEqual(sent.trades, [{id: 'ASML.AS', symbol: 'ASML.AS', ticker: 'ASML.AS', name: 'ASML Holding N.V.', current: 0, target: 2}]);
  const app = fs.readFileSync('site/app.mjs', 'utf8'), source = fs.readFileSync('site/trade.mjs', 'utf8');
  assert.match(app, /: added \? \{id, symbol: added\.symbol, ticker: added\.ticker, name: added\.name, current: 0, target\}/, 'the hand-off includes new shares');
  assert.match(app, /findShare: findTradeShare, suggest: tradeSuggestions/);
  assert.match(app, /fetch\('\/api\/lookup\?symbol=' \+ encodeURIComponent\(symbol\)/, 'looked up through Arcus');
  assert.match(app, /\.concat\(addedShares\(\)\.map\(s => \(\{key: s\.id, current: 0\}\)\)\)/, 'counted in the New total');
  assert.ok(!/fetch\(/.test(source), 'the trade module itself sends nothing');
  const css = fs.readFileSync('site/style.css', 'utf8');
  assert.ok(css.includes('.trade-add-panel{position:absolute') && css.includes('html:not(.light) .trade-add-panel{'));
});
