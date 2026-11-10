import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app = fs.readFileSync('site/app.mjs', 'utf8');
const source = app.slice(app.indexOf('const columns = ['), app.indexOf('// Phones show three columns;'));
class Element {
  constructor(tag, value = '') { this.tagName = tag.toUpperCase(); this.textContent = value; this.children = []; this.dataset = {}; this.attrs = {}; this.listeners = {}; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(key, value) { this.attrs[key] = value; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
}
function harness(rows = []) {
  const ids = new Map();
  const document = {createElement: tag => new Element(tag), getElementById: id => ids.get(id) || null};
  const ctx = vm.createContext({document, result: {rows},
    text: (tag, value = '', className = '') => Object.assign(new Element(tag, value), {className}),
    fmt: value => value == null ? '—' : (value * 100).toFixed(2) + '%', signClass: () => '',
  });
  vm.runInContext(source + '\nthis.columnsForTest = columns;', ctx);
  return {ctx, ids};
}

test('Theme follows Difference and uses real labels with explicit unclassified fallback', () => {
  const {ctx} = harness();
  assert.deepEqual(Array.from(ctx.columnsForTest.slice(-2), column => column[0]), ['activeCtr', 'theme']);
  assert.equal(ctx.tableCellValue({theme:'Semiconductors'}, 'theme'), 'Semiconductors');
  assert.equal(ctx.themeLabel({theme:['AI', 'Optics']}), 'AI / Optics');
  assert.equal(ctx.themeLabel({}), 'Unclassified');
  assert.equal(ctx.themeLabel({theme:'  '}), 'Unclassified');
});
test('sector grouping retains distinct themes while the security view and totals retain original rows', () => {
  const rows = [{ticker:'A',sector:'Technology',theme:'AI',weightA:.4,weightB:.5,activeWeight:-.1,ctrA:.01,ctrB:.02,activeCtr:-.01},
    {ticker:'B',sector:'Technology',theme:'Chips',weightA:.6,weightB:.5,activeWeight:.1,ctrA:.02,ctrB:null,activeCtr:null}];
  const {ctx}=harness(rows); let group='security'; ctx.$=()=>({value:group});
  vm.runInContext(app.slice(app.indexOf('function displayedRows('),app.indexOf('const columns = [')),ctx);
  assert.equal(ctx.displayedRows(),rows); group='sector';
  const [sector]=ctx.displayedRows(); assert.equal(sector.theme,'AI / Chips');
  assert.equal(sector.ctrB,null,'incomplete sector remains visibly unavailable');
  const sums=ctx.tableTotals(rows); assert.equal(sums.totals.ctrB,.02,'footer retains available underlying contributions');
  assert.equal(rows[0].theme,'AI'); assert.equal(rows[1].theme,'Chips');
});

test('totals retain full precision, exclude missing values, and never add security returns', () => {
  const rows = [{weightA:.3, weightB:.5, activeWeight:-.2, ctrA:.00006, ctrB:.005, activeCtr:-.00494, securityReturn:.5},
    {weightA:.7, weightB:.5, activeWeight:.2, ctrA:.00006, ctrB:null, activeCtr:null, securityReturn:-.3}];
  const {ctx} = harness(rows), {totals, missing} = ctx.tableTotals(rows);
  assert.equal(totals.weightA, 1); assert.equal(totals.weightB, 1); assert.equal(totals.activeWeight, 0);
  assert.equal(totals.ctrA, .00012); assert.equal(totals.ctrB, .005); assert.equal(missing.ctrB, 1);
  assert.equal(totals.securityReturn, undefined);
  const empty = ctx.tableTotals([{ctrA:null}, {ctrA:null}]);
  assert.equal(empty.totals.ctrA, null, 'all missing is unavailable, not zero');
});

test('footer labels available unrounded totals and explains missing/non-additive columns', () => {
  const {ctx} = harness([{ticker:'A', weightA:1, weightB:1, activeWeight:0, ctrA:.00012, ctrB:null, activeCtr:null, securityReturn:.1}]);
  const table = {createTFoot() { return this.tFoot = new Element('tfoot'); }};
  ctx.renderTableTotals(table, ctx.columnsForTest);
  const cells = table.tFoot.children[0].children;
  assert.equal(cells[0].textContent, 'Total'); assert.equal(cells[0].scope, 'row');
  assert.match(cells[0].children[0].textContent, /unrounded/);
  assert.equal(cells[3].textContent, '—'); assert.match(cells[3].title, /cannot be added/);
  assert.equal(cells[5].textContent, '0.01%');
  assert.equal(cells[6].textContent, '—'); assert.equal(cells[6].children[0].textContent, '1 missing');
  assert.equal(cells[8].textContent, '—', 'a total has no Theme classification');
});

test('horizontal scroll controls expose hidden columns and disable at their respective ends', () => {
  const {ctx, ids} = harness();
  const scroll = Object.assign(new Element('div'), {scrollWidth:1500, clientWidth:500, scrollLeft:0,
    before(nav) { ids.set(nav.id, nav); },
    scrollBy({left}) { this.scrollLeft = Math.max(0, Math.min(this.scrollWidth - this.clientWidth, this.scrollLeft + left)); this.listeners.scroll(); },
  });
  const table = {closest: () => scroll};
  ctx.wireTableScroll(table);
  const nav = ids.get('table-scroll-nav'), [status, left, right] = nav.children;
  assert.match(status.textContent, /More columns.*Theme/);
  assert.equal(left.disabled, true); assert.equal(right.disabled, false); assert.equal(scroll.tabIndex, 0);
  assert.equal(scroll.attrs.role, 'region');
  right.onclick(); right.onclick(); right.onclick();
  assert.equal(right.disabled, true); assert.equal(left.disabled, false); assert.match(status.textContent, /End of columns/);
  left.onclick(); assert.equal(right.disabled, false);
  scroll.scrollWidth = 500; ctx.wireTableScroll(table);
  assert.equal(left.hidden, true); assert.equal(right.hidden, true); assert.match(status.textContent, /headings stay visible/);
  assert.equal(ids.size, 1, 'sorting and re-rendering reuse the controls');
});

test('table viewport keeps opaque headers visible and allows outer scroll at the row boundary', () => {
  const css = fs.readFileSync('site/style.css', 'utf8');
  assert.match(css, /#results \.scroll\{[^}]*max-height:68dvh[^}]*overscroll-behavior-y:auto/);
  assert.match(css, /#results \.scroll thead th\{[^}]*position:sticky;top:0[^}]*background:var\(--table-head\)/);
  assert.match(css, /#results \.scroll tfoot th/);
});
