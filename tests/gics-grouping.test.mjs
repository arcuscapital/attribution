import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {groupByGics, gicsSector, UNKNOWN_GICS} from '../site/rise-swix-core.mjs';
import {dataResponse} from '../cloudflare/data.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);

test('GICS sector lookup: id, symbol or ticker, case-insensitive, class-share dots and slashes; unknown otherwise', () => {
  const sectors = {'NVDA': 'Information Technology', '000660.KS': 'Information Technology', 'BRK-B': 'Financials'};
  assert.equal(gicsSector({id: 'nvda'}, sectors), 'Information Technology');
  assert.equal(gicsSector({id: 'FUND:XYZ', ticker: '000660.KS'}, sectors), 'Information Technology');
  assert.equal(gicsSector({id: 'BRK.B'}, sectors), 'Financials');
  assert.equal(gicsSector({id: 'BRK/B'}, sectors), 'Financials');
  assert.equal(gicsSector({id: 'CASH:USD', ticker: 'USD'}, sectors), UNKNOWN_GICS);
  assert.equal(gicsSector({}, undefined), UNKNOWN_GICS);
});

test('groupByGics: sector totals, contribution-over-weight returns, reference and 0% rows, Unknown GICS last', () => {
  const sectors = {NVDA: 'Information Technology', AMD: 'Information Technology', XOM: 'Energy'};
  const rows = [
    {id: 'NVDA', ticker: 'NVDA', name: 'NVIDIA', weightA: .30, weightB: .10, securityReturn: .10, ctrA: .03, ctrB: .01},
    {id: 'AMD', ticker: 'AMD', name: 'AMD', weightA: 0, weightB: .20, securityReturn: -.05, ctrA: 0, ctrB: -.01},
    {id: 'XOM', ticker: 'XOM', name: 'Exxon', weightA: .20, weightB: 0, securityReturn: .02, ctrA: .004, ctrB: 0},
    {id: 'CASH:USD', ticker: 'USD', name: 'USD cash', weightA: .05, weightB: 0, securityReturn: 0, ctrA: 0, ctrB: 0, assumedZero: true},
  ];
  const v = groupByGics(rows, sectors, {total: 'IBKR vs BAI', returnA: .034, returnB: 0});
  assert.deepEqual(v.groups.map(g => g.name), ['Energy', 'Information Technology', UNKNOWN_GICS]);
  const it = v.groups[1];
  close(it.values[0], 30); close(it.values[1], 30);                    // weights in percent
  close(it.values[2], 3 / 30 * 100); close(it.values[3], 0 / 30 * 100); // return = CTR / weight
  close(it.values[4], 3); close(it.values[5], 0);
  const amd = it.children.find(c => c.ticker === 'AMD');
  assert.equal(amd.values[0], null, 'no portfolio weight');
  assert.equal(amd.values[4], null, 'no portfolio contribution');
  close(amd.values[2], -5); assert.deepEqual(amd.reference, [2], 'portfolio return is for reference (italic)');
  assert.equal(v.groups[2].children[0].zeroed, true);
  assert.equal(v.total.name, 'IBKR vs BAI');
  close(v.total.values[0], 55); close(v.total.values[1], 30); close(v.total.values[2], 3.4); close(v.total.values[3], 0);
  close(v.total.values[4], 3.4); close(v.total.values[5], 0);
});

test('catalog carries the saved GICS sectors from KV', async () => {
  const kv = {get: async (key, type) => key === 'catalog' ? {funds: []} : key === 'gics:v1' ? {asOf: '2026-11-13', source: 'Bloomberg', sectors: {NVDA: 'Information Technology'}} : null};
  const res = await dataResponse(new Request('https://a.invalid/data/catalog'), {HOLDINGS_ARCHIVE: kv}, {}, fetch, null);
  const body = await res.json();
  assert.equal(body.gics.sectors.NVDA, 'Information Technology'); assert.equal(body.gics.asOf, '2026-11-13');
});

test('Grouping control sits between Date range and Currency, No grouping first; Rise vs Swix defaults to GICS', () => {
  const index = fs.readFileSync('site/index.html', 'utf8');
  const range = index.indexOf('id="field-range"'), grouping = index.indexOf('id="field-grouping"'), currency = index.indexOf('id="field-currency"');
  assert.ok(range < grouping && grouping < currency);
  assert.match(index, /<select id="grouping">\s*<option value="none">No grouping<\/option>\s*<option value="gics">GICS sector<\/option>/);
  const rise = fs.readFileSync('site/rise-swix.mjs', 'utf8');
  assert.match(rise, /priorGrouping=\$\('grouping'\)\?\.value\|\|'none';if\(\$\('grouping'\)\)\$\('grouping'\)\.value='gics';/);
  assert.match(rise, /if\(\$\('grouping'\)\)\$\('grouping'\)\.value=priorGrouping;/);
  assert.match(rise, /const flat=\$\('grouping'\)\?\.value==='none';/);
  const css = fs.readFileSync('site/style.css', 'utf8');
  assert.ok(!/#rise-swix(?!,#gics-table\))/.test(css.replace(/:is\(#rise-swix,#gics-table\)/g, '')), 'every Rise table rule also styles the GICS table');
});
