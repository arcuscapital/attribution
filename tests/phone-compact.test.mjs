import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {shortName, shortNames, shortSector, GICS_SECTORS} from '../site/rise-swix-core.mjs';
import {completedPrices} from '../site/price-data.mjs';

test('phone names: a word or two that still identifies the company', () => {
  const cases = [['Vodacom Group Ltd', 'VOD.JO', 'Vodacom'], ['Blue Label Telecoms', 'BLU.JO', 'Blue'], ['Aspen Pharmacare Holdings Ltd', 'APN.JO', 'Aspen'],
    ['Naspers Ltd - N Shares', 'NPN.JO', 'Naspers'], ['NASPERS LTD N', 'NPN.JO', 'Naspers'], ['Mr Price', 'MRP.JO', 'Mr Price'], ['Gold Fields', 'GFI.JO', 'Gold Fields'],
    ['The Foschini Group', 'TFG.JO', 'Foschini'], ['MTN Group Ltd', 'MTN.JO', 'MTN'], ['CIE FINANCIERE R', 'CFR.JO', 'Richemont'], ['British American Tobacco', 'BTI.JO', 'BAT'],
    ['Standard Bank Group', 'SBK.JO', 'Std Bank'], ['NVIDIA Corp', 'NVDA', 'NVIDIA'], ['GE Vernova Inc', 'GEV', 'GE Vernova'], ['Lam Research Corp', 'LRCX', 'Lam Research'],
    ['Amazon.com Inc', 'AMZN', 'Amazon'], ['ZAR cash', 'ZAR', 'ZAR cash'], ['AVI', 'AVI.JO', 'AVI']];
  for (const [name, ticker, short] of cases) assert.equal(shortName(name, ticker), short, name);
});

test('two holdings with the same short name get their ticker', () => {
  const names = shortNames([{id: 'INP.JO', name: 'Investec Plc', ticker: 'INP.JO'}, {id: 'INL.JO', name: 'Investec Bank Ltd', ticker: 'INL.JO'}, {id: 'NPN.JO', name: 'Naspers', ticker: 'NPN.JO'}]);
  assert.equal(names.get('INP.JO'), 'Investec INP');
  assert.equal(names.get('INL.JO'), 'Investec INL');
  assert.equal(names.get('NPN.JO'), 'Naspers');
});

test('phone sector labels: Tech, Comm Serv; unknown names pass through', () => {
  assert.equal(shortSector('Information Technology'), 'Tech');
  assert.equal(shortSector('Communication Services'), 'Comm Serv');
  assert.equal(shortSector('Unknown GICS'), 'Unknown');
  assert.equal(shortSector('Something else'), 'Something else');
  for (const s of GICS_SECTORS) assert.ok(shortSector(s).length <= 12, s);
});

test('USD/ZAR closes are dated in London time: a 23:00 UTC summer bar is the next day', () => {
  const at = iso => Date.parse(iso) / 1000;
  const raw = {meta: {symbol: 'USDZAR=X', currency: 'ZAR', exchangeTimezoneName: 'Europe/London'},
    timestamp: [at('2026-07-29T23:00:00Z'), at('2026-07-30T23:00:00Z'), at('2026-08-02T23:00:00Z'), at('2026-11-12T00:00:00Z')],
    indicators: {quote: [{close: [16.66, 16.5, 16.46, 17.2]}]}};
  const points = new Map(completedPrices(raw, {symbol: 'USDZAR=X', start: '2026-07-01', end: '2026-11-30'}, Date.parse('2026-11-19T10:00:00Z')).points);
  assert.deepEqual([...points.keys()], ['2026-07-30', '2026-07-31', '2026-08-03', '2026-11-12'], 'Friday 31 July is present');
  const source = fs.readFileSync('site/j303-source.mjs', 'utf8');
  assert.match(source, /completedPrices\(raw,\{symbol:'USDZAR=X'/, 'the J303 loader uses the exchange-dated helper');
  assert.doesNotMatch(source, /new Date\(t\*1000\)\.toISOString\(\)/, 'no UTC dating of FX bars');
});

test('J303 rows carry the full JSE ticker, like the Arcus portfolios', () => {
  const core = fs.readFileSync('site/j303-core.mjs', 'utf8');
  assert.equal((core.match(/ticker:p\.symbol,/g) || []).length, 2);
});

test('phone table: short Name then Port/Bmrk weights and returns, then CTR; no Ticker column', () => {
  const app = fs.readFileSync('site/app.mjs', 'utf8'), css = fs.readFileSync('site/style.css', 'utf8');
  assert.match(app, /\['name', 'weightA', 'weightB', 'returnA', 'returnB', 'ctrA', 'ctrB'\]\.includes\(key\)/);
  assert.match(app, /cell\.dataset\.short = shorts\.get\(r\.id\)/);
  assert.match(app, /list\.append\(text\('dt', 'Name'\)/, 'details keep the full name and ticker');
  const block = css.slice(css.indexOf('/* Phone comparison tables (owner, 2026-11-19)'));
  assert.ok(block.includes('margin-inline:-16px'), 'edge to edge');
  assert.ok(block.includes('width:34vw') && block.includes('width:16.5vw'), 'name plus four figures fill 100vw');
  assert.ok(block.includes('tbody td:nth-child(2){display:none}'), 'ticker column hidden in the grouped tables');
  assert.ok(block.includes('content:attr(data-short)'));
});
