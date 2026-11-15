import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Return % graph and GICS sector weights toggles (owner request, 2026-11-15).
function fakeDom() {
  class El {
    constructor(tag) { this.tag = tag; this.children = []; this.parentElement = null; this.attrs = {}; this.hidden = false; this.listeners = {}; this._classes = new Set();
      this.classList = {add: c => this._classes.add(c), contains: c => this._classes.has(c), toggle: c => { if (this._classes.has(c)) { this._classes.delete(c); return false; } this._classes.add(c); return true; }}; }
    set className(v) { this._classes = new Set(v.split(/\s+/).filter(Boolean)); }
    get className() { return [...this._classes].join(' '); }
    setAttribute(k, v) { this.attrs[k] = String(v); }
    append(...n) { for (const c of n) { c.parentElement?.children.splice(c.parentElement.children.indexOf(c), 1); c.parentElement = this; this.children.push(c); } }
    before(n) { const p = this.parentElement, i = p.children.indexOf(this); p.children.splice(i, 0, n); n.parentElement = p; }
    addEventListener(t, f) { this.listeners[t] = f; }
  }
  const observers = [];
  globalThis.MutationObserver = class { constructor(f) { this.f = f; observers.push(this); } observe() {} };
  globalThis.document = {createElement: tag => new El(tag)};
  return {El, observers};
}

test('collapsible wraps a section with an arrow toggle, open by default, hidden state follows the section', async () => {
  const {El, observers} = fakeDom();
  const {collapsible} = await import('../site/ranges.mjs');
  const parent = new El('div'), host = new El('section'); parent.append(host);
  const wrap = collapsible(host, 'Return % graph');
  assert.ok(wrap.classList.contains('collapsible'));
  assert.equal(host.parentElement, wrap);
  const button = wrap.children[0];
  assert.equal(button.tag, 'button');
  assert.equal(button.attrs['aria-expanded'], 'true', 'open by default');
  assert.equal(wrap.classList.contains('collapsed'), false);
  assert.equal(button.children[0].textContent, '▾');
  assert.equal(button.children[1].textContent, 'Return % graph');
  button.listeners.click();
  assert.equal(wrap.classList.contains('collapsed'), true);
  assert.equal(button.attrs['aria-expanded'], 'false');
  assert.equal(button.attrs['aria-label'], 'Show Return % graph');
  button.listeners.click();
  assert.equal(wrap.classList.contains('collapsed'), false);
  assert.equal(button.attrs['aria-label'], 'Hide Return % graph');
  host.hidden = true; observers[0].f(); assert.equal(wrap.hidden, true, 'no toggle over an empty section');
  host.hidden = false; observers[0].f(); assert.equal(wrap.hidden, false);
  assert.equal(collapsible(host, 'again'), null, 'wrapping twice does nothing');
});

test('both views use the toggles, nothing is stored, and the page order is unchanged', () => {
  const app = fs.readFileSync('site/app.mjs', 'utf8'), rise = fs.readFileSync('site/rise-swix.mjs', 'utf8');
  const ranges = fs.readFileSync('site/ranges.mjs', 'utf8'), css = fs.readFileSync('site/style.css', 'utf8'), index = fs.readFileSync('site/index.html', 'utf8');
  assert.match(app, /collapsible\(\$\('return-chart'\), 'Return % graph'\);\s*collapsible\(\$\('gics-weights'\), 'GICS sector weights'\);/);
  assert.match(rise, /collapsible\(chart,'Return % graph'\);collapsible\(weights,'GICS sector weights'\);/);
  const body = ranges.slice(ranges.indexOf('export function collapsible('), ranges.indexOf('export function renderSectorWeights('));
  assert.doesNotMatch(body, /localStorage|sessionStorage/, 'open on every load');
  assert.match(css, /\.collapsible\.collapsed>:not\(\.collapsible-toggle\)\{display:none\}/);
  assert.match(css, /html:not\(\.light\) \.collapsible-toggle\{/);
  assert.ok(index.indexOf('id="return-chart"') < index.indexOf('id="gics-weights"') && index.indexOf('id="gics-weights"') < index.indexOf('id="method"'));
  for (const f of [app, rise, index]) assert.doesNotMatch(f, /ranges\.mjs\?v=weights-20261113|rise-swix\.mjs\?v=weights-20261113|app\.mjs\?v=weights-20261113/, 'cache version bumped');
});
