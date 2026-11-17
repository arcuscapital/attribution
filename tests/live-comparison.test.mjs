// Portfolio Analysis Live for every portfolio and benchmark pair (owner, 2026-11-17).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compare } from '../site/engine.mjs';
import { liveDataset, liveMove, listingCurrency } from '../site/online.mjs';
const prev = '2026-11-16', today = '2026-11-17';
const q = (l, extra = {}) => ({ p: 100, pc: 100, l, lb: 'regular', ld: today, qd: today, at: 1794916394443, ...extra });
const near = (a, b, tol = 1e-12) => assert.ok(Math.abs(a - b) < tol, a + ' vs ' + b);
const options = { allowApproximateHoldings: true, allowPartialReturns: true, allowSnapshotResearch: true };

test('live move: regular or US pre-market move today; not traded yet is 0%; nothing else is invented', () => {
  near(liveMove(q(-2), today).ratio, 0.98);
  near(liveMove(q(0.5, { lb: 'pre', qd: prev }), today).ratio, 1.005);
  assert.deepEqual(liveMove(q(null, { lb: null, qd: prev }), today), { ratio: 1, unchanged: true });
  assert.equal(liveMove(q(null, { lb: null, qd: today }), today), null);
  assert.equal(liveMove(null, today), null);
  assert.equal(liveMove(q(1, { p: 0 }), today), null);
  assert.equal(liveMove(q(1, { ld: prev }), today), null, 'a quote for another session is not today');
});
test('listing currency: provider currency first, then the exchange suffix; plain US tickers are dollars', () => {
  assert.equal(listingCurrency('NPN.JO', 'ZAc'), 'ZAR');
  assert.equal(listingCurrency('VOD.L', 'GBp'), 'GBP');
  assert.equal(listingCurrency('2330.TW'), 'TWD');
  assert.equal(listingCurrency('AAPL'), 'USD');
  assert.equal(listingCurrency('ABC.XX'), null);
});

// EasyBest-style rand portfolio vs a US ETF, through the real engine.
function base(currency) {
  const snap = (fund, positions) => ({ fund, asOf: prev, source: 'Arcus', positions });
  const levels = [];
  const add = (id, values, cur = 'USD', basis = 'price-return') => ['2026-11-13', prev].forEach((date, i) => levels.push({ id, date, value: values[i], currency: cur, basis }));
  add('NPN.JO', [40, 41]); add('FSR.JO', [4, 4.1]); add('AAPL', [350, 356]); add('QQQ', [670, 680]);
  add('USDZAR=X', [17, 16.95], 'ZAR', 'fx');
  return { manifest: { schemaVersion: 1 }, returnBasis: 'price-return', valuationDates: ['2026-11-13', prev], priceNotes: ['Price return for both portfolio and benchmark. One completed trading session; dividends excluded.'],
    snapshots: [snap('PORTFOLIO:EASYSA', [{ id: 'NPN.JO', symbol: 'NPN.JO', name: 'Naspers', weight: 0.6, currency: 'ZAR' }, { id: 'FSR.JO', symbol: 'FSR.JO', name: 'FirstRand', weight: 0.32, currency: 'ZAR' },
      { id: 'ZAR-CASH', name: 'ZAR cash', weight: 0.08, asset: 'Cash' }]), snap('QQQ', [{ id: 'AAPL', symbol: 'AAPL', name: 'Apple', weight: 1 }])],
    levels, nonListedIds: ['ZAR-CASH'], currency };
}
const quotes = { 'NPN.JO': q(-2), 'FSR.JO': q(1), AAPL: q(0.5, { lb: 'pre', qd: prev }), QQQ: q(null, { lb: null, qd: prev }), 'USDZAR=X': q(-0.2) };
const currencyOf = s => listingCurrency(s, { 'NPN.JO': 'ZAc', 'FSR.JO': 'ZAc' }[s]);

test('rand portfolio vs US ETF in rand: JSE moves are exact in rand, cash 0%, the ETF not traded yet is 0% plus the rand move', () => {
  const d = liveDataset(base('ZAR'), quotes, { currencyOf });
  assert.equal(d.live.date, today); assert.equal(d.live.prev, prev);
  assert.equal(d.live.live, 3); assert.equal(d.live.unchanged, 1); assert.deepEqual(d.live.missing, []);
  assert.deepEqual(d.valuationDates.slice(-2), [prev, today]);
  assert.match(d.priceNotes.at(-1), /^Live: today’s moves from live quotes/);
  const r = compare(d, { ...options, portfolio: 'PORTFOLIO:EASYSA', benchmark: 'QQQ', start: today, end: today, currency: 'ZAR' });
  assert.ok(['complete', 'partial'].includes(r.status), r.status + ' ' + (r.issues || []).join('; '));
  near(r.returnA, 0.6 * -0.02 + 0.32 * 0.01, 1e-9);
  near(r.returnB, 0.998 - 1, 1e-9); // QQQ unchanged in dollars; the rand strengthened 0.2% (USD/ZAR −0.2%)
  assert.ok(r.rows.find(x => x.id === 'AAPL'), 'benchmark holdings are attributed');
});
test('same pair in dollars: rand listings include today’s rand move against the dollar', () => {
  const d = liveDataset(base('USD'), quotes, { currencyOf });
  const r = compare(d, { ...options, portfolio: 'PORTFOLIO:EASYSA', benchmark: 'QQQ', start: today, end: today, currency: 'USD' });
  near(r.returnA, 0.6 * (0.98 / 0.998 - 1) + 0.32 * (1.01 / 0.998 - 1), 1e-9);
  near(r.returnB, 0, 1e-12);
});
test('a listing without a quote is reported missing, not filled', () => {
  const d = liveDataset(base('ZAR'), { ...quotes, 'FSR.JO': undefined }, { currencyOf });
  assert.deepEqual(d.live.missing, ['FSR.JO']);
  assert.equal(d.levels.some(l => l.id === 'FSR.JO' && l.date === today), false);
});
test('no session since the last close, or no quotes at all: a clear message instead of a made-up result', () => {
  assert.throws(() => liveDataset(base('ZAR'), { 'NPN.JO': q(1, { ld: prev }) }, { currencyOf }), /No session has opened since the last completed close \(2026-11-16\)/);
  assert.throws(() => liveDataset(base('ZAR'), {}, { currencyOf }), /Live quotes are unavailable right now/);
});
test('daily-holdings index (rand-only J303): moves with its closing weights, FX stays at 1, missing constituents unchanged', () => {
  const b = { manifest: { schemaVersion: 1 }, returnBasis: 'price-return', valuationDates: ['2026-11-13', prev], dailyHoldings: true, dailyHoldingsFunds: ['PORTFOLIO:J303'], calendarThrough: prev,
    snapshots: [{ fund: 'PORTFOLIO:J303', asOf: prev, positions: [{ id: 'NPN.JO', symbol: 'NPN.JO', weight: 0.5 }, { id: 'FSR.JO', symbol: 'FSR.JO', weight: 0.3 }, { id: 'SBK.JO', symbol: 'SBK.JO', weight: 0.2 }] }],
    levels: [['PORTFOLIO:J303', 100], ['NPN.JO', 40], ['FSR.JO', 4], ['SBK.JO', 200]].flatMap(([id, v]) => [{ id, date: prev, value: v, currency: 'USD', basis: 'price-return' }])
      .concat([{ id: 'USDZAR=X', date: prev, value: 1, currency: 'ZAR', basis: 'fx' }]) };
  const d = liveDataset(b, { 'NPN.JO': q(-2), 'FSR.JO': q(1), 'USDZAR=X': q(-0.2) }, { currencyOf: () => 'ZAR' });
  const at = id => d.levels.find(l => l.id === id && l.date === today)?.value;
  near(at('NPN.JO'), 40 * 0.98); near(at('USDZAR=X'), 1); assert.equal(d.calendarThrough, today);
  near(at('PORTFOLIO:J303'), 100 * (1 + 0.5 * -0.02 + 0.3 * 0.01));
  assert.deepEqual(d.live.missing, ['SBK.JO']);
});
test('page wiring: Live offered for every pair, data from Arcus live quotes, 35-second refresh in place, no new page files', () => {
  const read = f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const html = read('site/index.html'), app = read('site/app.mjs'), rise = read('site/rise-swix.mjs'), online = read('site/online.mjs');
  assert.match(html, /<option value="day">One Day<\/option><option value="live">Live<\/option>/);
  assert.doesNotMatch(rise, /live\.hidden=live\.disabled=!active/, 'Live is not hidden outside Rise vs Swix');
  assert.doesNotMatch(rise, /if\(\$\('range'\)\.value==='live'\)\$\('range'\)\.value='day'/);
  assert.match(online, /fetcher\('\/api\/live-prices\/shard',\{method:'POST'/);
  assert.match(app, /data = await loadRange\(prev, prev, true\);\n      options\.start = options\.end = data\.live\.date;/);
  assert.match(app, /if \(live\) scheduleLive\(\);/);
  assert.match(app, /setTimeout\(\(\)=>\{if\(!onlineMode\|\|\$\('range'\)\.value!=='live'\|\|riseSwix\?\.isActive\(\)\|\|document\.hidden/);
  assert.match(app, /if \(!refreshing\) \{ \$\("results"\)\.hidden = true;/, 'a refresh keeps the shown result');
  const bridge = fs.readFileSync('cloudflare/bridge.mjs', 'utf8');
  for (const file of [...app.matchAll(/import\('\.\/([a-z0-9-]+\.mjs)/g)].map(m => m[1])) assert.ok(bridge.includes("'" + file + "'"), file + ' is served by the bridge');
});
