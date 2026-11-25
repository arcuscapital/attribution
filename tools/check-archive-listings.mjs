// Checks the PA saved-archive listings the page actually uses against Yahoo's company names (owner, 2026-11-25:
// the archive gave IGPT NEXTDC the US ticker NXT = Nextpower, Nemetschek NEM = Newmont, Airbus AIR = AAR, Kosdaq
// shares .KS, TSX Venture shares .TO). Run after any new archive publish (desktop/arcus_attribution/publish.py,
// whose mapped_symbol() reads a bare ticker with no exchange as a US listing).
//
// Usage: node tools/check-archive-listings.mjs <data-dir>   (same inputs as tools/gics-from-issuers.mjs)
// Prints every used listing whose Yahoo name does not match the holding's name; most are renames, read each one.
// Correct a wrong one by rewriting that position's symbol (and id when id === symbol) in holdings:<version>:<fund>.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const DIR = process.argv[2];
if (!DIR) throw Error('Usage: node tools/check-archive-listings.mjs <data-dir>');
const PA = fileURLToPath(new URL('../site/', import.meta.url)).replace(/\\/g, '/');
const {allocationSnapshot, isNonListed, resolveArchiveListings} = await import(pathToFileURL(PA + 'arcus-source.mjs'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
const funds = read('funds.json')[0].results;
const index = read('security.json')[0].results.map(s => ({...s, candidates: JSON.parse(s.candidates || '[]')}));
const archive = Object.values(read('archive.json')).map(v => JSON.parse(v));
const src = fs.readFileSync(PA + 'arcus-source.mjs', 'utf8');
const nameMatches = new Function(src.slice(src.indexOf('const clean ='), src.indexOf('const portfolios=')) + '; return nameMatches;')();

const used = []; // {fund, symbol, name, how}
const live = new Set();
for (const f of funds) {
  let b; try { b = JSON.parse(f.body || 'null'); } catch { b = null; }
  if (!b?.allocation?.positions?.length) continue;
  const a = archive.find(x => x.fund === f.symbol); if (!a) { live.add(f.symbol); continue; }
  try {
    const raw = allocationSnapshot(f.symbol, b.allocation, b.positions || [], index);
    const res = resolveArchiveListings(allocationSnapshot(f.symbol, b.allocation, b.positions || [], index), a);
    live.add(f.symbol);
    res.positions.forEach((p, i) => { if (p.symbol && !raw.positions[i].symbol) used.push({fund: f.symbol, symbol: p.symbol, name: p.name, how: 'archive fills live row'}); });
  } catch (e) { console.error('snapshot', f.symbol, e.message); }
}
for (const a of archive.filter(a => !live.has(a.fund)))
  for (const p of a.positions) if (p.symbol && !isNonListed(p)) used.push({fund: a.fund, symbol: p.symbol, name: p.name, how: 'archive-only fund'});
const syms = [...new Set(used.map(u => u.symbol))];
console.log('archive listings in use:', used.length, 'unique symbols:', syms.length, 'archive-only funds:', archive.filter(a => !live.has(a.fund)).map(a => a.fund).join(' '));

const cacheFile = path.join(DIR, 'yahoo-names.json');
const cache = fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : {};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';
async function meta(sym) {
  for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/' + encodeURIComponent(sym) + '?range=5d&interval=1d', {headers: {'User-Agent': UA}});
      if (r.status === 404) return {missing: true};
      if (r.status === 429) { await new Promise(s => setTimeout(s, 3000 * (t + 1))); continue; }
      const j = await r.json(); const m = j?.chart?.result?.[0]?.meta;
      if (!m) return {missing: true, error: j?.chart?.error?.code};
      return {longName: m.longName || null, shortName: m.shortName || null, exchange: m.fullExchangeName || m.exchangeName, currency: m.currency, type: m.instrumentType};
    } catch (e) { await new Promise(s => setTimeout(s, 1500)); }
  }
  return {error: 'fetch failed'};
}
const todo = syms.filter(s => !cache[s]);
let n = 0;
async function worker() { while (todo.length) { const s = todo.shift(); cache[s] = await meta(s); if (++n % 100 === 0) { console.log('fetched', n); fs.writeFileSync(cacheFile, JSON.stringify(cache)); } } }
await Promise.all([1, 2, 3, 4].map(worker));
fs.writeFileSync(cacheFile, JSON.stringify(cache));

const bad = [];
for (const u of used) {
  const m = cache[u.symbol] || {};
  const ok = !m.missing && !m.error && [m.longName, m.shortName].some(x => x && (nameMatches(u.name, x) || nameMatches(x, u.name)));
  if (!ok) bad.push({...u, yahoo: m.missing ? 'NOT ON YAHOO' : m.error ? 'ERROR ' + m.error : `${m.longName || m.shortName} (${m.exchange}, ${m.currency}, ${m.type})`});
}
fs.writeFileSync(path.join(DIR, 'archive-bad.json'), JSON.stringify(bad, null, 1));
console.log('not confirmed by name:', bad.length);
for (const b of bad) console.log([b.fund, b.symbol, b.name, '=>', b.yahoo, '|', b.how].join(' '));
