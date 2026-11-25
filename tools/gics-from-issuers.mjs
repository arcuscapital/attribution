// Builds KV gics:v1 for Portfolio Analysis: keeps every Bloomberg sector already saved and adds GICS sectors for other
// shares from issuer holdings files (owner, 2026-11-25: IWV vs XLV showed many Unknown GICS). Bloomberg always wins.
// Prints Unknown GICS per fund before/after using this checkout's own site code, and flags look-alike ticker matches.
//
// Usage: node tools/gics-from-issuers.mjs <data-dir>
// <data-dir> holds (none of it goes in Git):
//   gics-v1-current.json  wrangler kv key get gics:v1 --namespace-id 98da8aed88f9416d84a9497daed06dc5 --remote (Attribution login)
//   funds.json            Arcus: wrangler d1 execute arcus-etf-holdings --remote --json --command "SELECT symbol,name,source,status,as_of,body FROM fund"
//   security.json         Arcus: same DB, "SELECT id,name,candidates,symbol,status FROM security"
//   archive.json          wrangler kv bulk get <list of holdings:<latest catalog version>:* keys> (PA saved holdings)
//   input/IWV_holdings.csv  iShares IWV holdings download (owner's file)
//   ixus/IXUS.csv, ixus/IWC.csv, ixus/MCHI.csv  iShares .../latest-holdings.csv for IXUS (244048), IWC (239716), MCHI (239619)
// Writes <data-dir>/gics-v1-new.json and <data-dir>/report.json. Upload with wrangler kv key put gics:v1 --path ... (no deploy).
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL, fileURLToPath} from 'node:url';
const DIR = process.argv[2];
if (!DIR) throw Error('Usage: node tools/gics-from-issuers.mjs <data-dir>');
const PA = fileURLToPath(new URL('../site/', import.meta.url)).replace(/\\/g, '/');
const {allocationSnapshot, isNonListed, resolveArchiveListings} = await import(pathToFileURL(PA + 'arcus-source.mjs'));
const {gicsSector, UNKNOWN_GICS, GICS_SECTORS} = await import(pathToFileURL(PA + 'rise-swix-core.mjs'));
const read = f => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));

const current = read('gics-v1-current.json');
const funds = read('funds.json')[0].results;
const security = read('security.json')[0].results;
const archive = Object.values(read('archive.json')).map(v => JSON.parse(v));

// ---- CSV parse (owner's IWV file, 24 Nov 2026) ----
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const csvRows = parseCsv(fs.readFileSync(path.join(DIR, 'input/IWV_holdings.csv'), 'utf8'));
const head = csvRows.findIndex(r => r[0] === 'Ticker' && r[2] === 'Sector');
const H = csvRows[head];
const col = n => H.indexOf(n);
const csv = csvRows.slice(head + 1).filter(r => r.length >= H.length && r[col('Asset Class')] === 'Equity')
  .map(r => ({ticker: r[col('Ticker')], name: r[col('Name')], sector: r[col('Sector')], weight: Number(r[col('Weight (%)')].replace(/,/g, '')), location: r[col('Location')], exchange: r[col('Exchange')]}));

// ---- issuer sector names -> GICS ----
const GICS = new Set(GICS_SECTORS);
const toGics = s => { const v = String(s || '').trim(); if (/^communication(s)?$/i.test(v)) return 'Communication Services'; return GICS.has(v) ? v : null; };

// ---- security index (holdings Worker identities) ----
const index = security.map(s => ({...s, candidates: JSON.parse(s.candidates || '[]')}));
const byId = new Map(index.map(s => [s.id, s]));

// Live PA snapshot for each fund with an Arcus allocation.
const snaps = new Map();
for (const f of funds) {
  let b; try { b = JSON.parse(f.body || 'null'); } catch { b = null; }
  if (!b?.allocation?.positions?.length) continue;
  try {
    // As the page does: reuse a listing the PA saved archive already verified (same ticker + name), e.g. ROBO DUERR AG -> DUE.DE.
    const rawIds = allocationSnapshot(f.symbol, b.allocation, b.positions || [], index).positions.map(p => p.id);
    const snap = resolveArchiveListings(allocationSnapshot(f.symbol, b.allocation, b.positions || [], index), archive.find(a => a.fund === f.symbol));
    // carry the member (identity) for each position so unresolved rows can be keyed by their candidate; rawIds keep
    // the fund:identity id a row has if the archive match ever stops applying (a newer archive, a renamed holding)
    snaps.set(f.symbol, {snap, rawIds, alloc: b.allocation, members: b.positions || []});
  } catch (e) { console.error('snapshot failed', f.symbol, e.message); }
}
// Funds only in the PA saved archive (no Arcus allocation): IJR, IBB, IYK, IYT, KRE, XBI, ...
const archiveOnly = archive.filter(a => !snaps.has(a.fund));

// ---- sources ----
const SECTOR_SPDR = {XLU: 'Utilities', XLE: 'Energy', XLY: 'Consumer Discretionary', XLB: 'Materials', XLK: 'Information Technology', XLI: 'Industrials', XLF: 'Financials', XLP: 'Consumer Staples', XLV: 'Health Care', XLC: 'Communication Services'};
const ISHARES = ['MTUM', 'XT', 'VLUE', 'ARTY', 'BAI', 'SOXX', 'ITA', 'TEK', 'IWV'];
const OTHER_GICS = ['MDY', 'GRNY', 'WELD', 'CANC', 'LAZR', 'DISK']; // State Street MDY; Fundstrat; Tema (GICS names)
const ARCHIVE_ISHARES = ['IJR', 'IBB', 'IYK', 'IYT']; // iShares files saved in the PA archive (Oct 2026)

const proposals = new Map(); // key -> [{sector, source, name}]
const propose = (key, sector, source, name) => {
  if (!key || !sector) return; key = String(key).trim().toUpperCase();
  const list = proposals.get(key) || []; list.push({sector, source, name}); proposals.set(key, list);
};
// Keys a position will match in PA: its verified listing; for a not-yet-verified listing, its exact PA row id
// (fund:identity, never shared with another company) plus, for US-only funds, the US ticker it will resolve to.
const US_ONLY = new Set(['IWV', 'MTUM', 'VLUE', 'SOXX', 'ITA', 'MDY', 'GRNY', 'WELD', 'CANC', 'XLU', 'XLE', 'XLY', 'XLB', 'XLK', 'XLI', 'XLF', 'XLP', 'XLV', 'XLC']);
function keysFor(fund, i) {
  const {snap, rawIds, alloc, members} = snaps.get(fund);
  const row = snap.positions[i], p = alloc.positions[i];
  if (row.symbol) return [row.symbol, ...(rawIds[i] !== row.id && !US_ONLY.has(fund) ? [rawIds[i]] : [])];
  // PA reads some company names as non-listed (OPTION CARE HEALTH = "option", CVR ENERGY = "CVR"); the issuer's own
  // Equity label keeps them, but rights, escrows and private lines stay out.
  const issuerEquity = p.asset === 'Equity' && !/\bCVR$|\bCVR\b.*\bRIGHTS?\b|\bCONTRA\b|\bPRVT\b|\bESCROW\b|\bVESTING\b|\bEARNOUT\b/i.test(p.name || '');
  if (isNonListed(row) && !(issuerEquity && US_ONLY.has(fund))) return [];
  const keys = US_ONLY.has(fund) ? [] : [row.id];
  if (US_ONLY.has(fund)) {
    // Both forms: PA looks up the issuer ticker as given ("UHAL B") until the listing is verified as UHAL-B.
    if (/^[A-Z]{1,5}([ .\/][A-Z])?$/.test(p.ticker || '')) keys.push(p.ticker.replace(/[ .\/]/, '-'), ...(/ /.test(p.ticker) ? [p.ticker] : []));
    const m = members.filter(m => (p.ticker ? m.rawSymbol === p.ticker : m.name === p.name));
    const cands = m.length === 1 ? (byId.get(m[0].id)?.candidates || m[0].candidates || []) : [];
    keys.push(...cands.filter(c => /^[A-Z]{1,5}(-[A-Z])?$/.test(c)));
  }
  return [...new Set(keys)];
}

// 1. Owner's IWV CSV, matched to the IWV allocation by ticker + name.
{
  const {alloc} = snaps.get('IWV');
  const at = new Map(); alloc.positions.forEach((p, i) => at.set(p.ticker + '|' + p.name, i));
  let matched = 0, unmatched = [];
  for (const r of csv) {
    const g = toGics(r.sector); if (!g) continue;
    const i = at.get(r.ticker + '|' + r.name);
    const keys = i != null ? keysFor('IWV', i) : (r.location === 'United States' && /^[A-Z]{1,5}( [A-Z])?$/.test(r.ticker) && !/CVR|Prvt/.test(r.name) ? [r.ticker.replace(' ', '-')] : []);
    if (keys.length) { matched++; for (const k of keys) propose(k, g, 'IWV csv 2026-11-24', r.name); } else unmatched.push(r.ticker + ' ' + r.name);
  }
  console.log('IWV csv equities', csv.length, 'keyed', matched, 'not keyed', unmatched.length, unmatched.slice(0, 15).join('; '));
}
// 2. Issuer sectors stored in Arcus allocations.
for (const fund of [...ISHARES, ...OTHER_GICS, ...Object.keys(SECTOR_SPDR)]) {
  const s = snaps.get(fund); if (!s) { console.log('no allocation for', fund); continue; }
  s.alloc.positions.forEach((p, i) => {
    const row = s.snap.positions[i]; if (isNonListed(row)) return;
    const g = SECTOR_SPDR[fund] || toGics(p.sector); if (!g) return;
    for (const k of keysFor(fund, i)) propose(k, g, fund + ' ' + (SECTOR_SPDR[fund] ? 'sector SPDR' : 'issuer') + ' ' + s.alloc.asOf, p.name);
  });
}
// 3. iShares files kept in the PA archive.
for (const a of archive.filter(a => ARCHIVE_ISHARES.includes(a.fund))) {
  for (const p of a.positions) { if (isNonListed(p) || !p.symbol) continue; propose(p.symbol, toGics(p.sector), a.fund + ' archive ' + a.asOf, p.name); }
}


// 4. iShares Core MSCI Total International Stock (IXUS) file, 23 Nov 2026: GICS for non-US shares the PA funds hold.
//    Matched only to PA rows that are still Unknown: by Yahoo symbol built from ticker+exchange, then by company name.
const SUFFIX = {'Tokyo Stock Exchange':'T','Hong Kong Exchanges And Clearing Ltd':'HK','Toronto Stock Exchange':'TO','TSX Venture Exchange':'V','Taiwan Stock Exchange':'TW','Gretai Securities Market':'TWO','London Stock Exchange':'L','Asx - All Markets':'AX','Shanghai Stock Exchange':'SS','Shenzhen Stock Exchange':'SZ','Korea Exchange (Stock Market)':'KS','Korea Exchange (Kosdaq)':'KQ','Nasdaq Omx Nordic':'ST','Omx Nordic Exchange Copenhagen A/S':'CO','Nasdaq Omx Helsinki Ltd.':'HE','Xetra':'DE','Deutsche Boerse Xetra':'DE','Nyse Euronext - Euronext Paris':'PA','Euronext Amsterdam':'AS','Nyse Euronext - Euronext Brussels':'BR','Nyse Euronext - Euronext Lisbon':'LS','SIX Swiss Exchange':'SW','Borsa Italiana':'MI','Tel Aviv Stock Exchange':'TA','Johannesburg Stock Exchange':'JO','Singapore Exchange':'SI','Bolsa De Madrid':'MC','Oslo Bors Asa':'OL','Wiener Boerse Ag':'VI','Irish Stock Exchange - All Market':'IR','Bursa Malaysia':'KL','Stock Exchange Of Thailand':'BK','Indonesia Stock Exchange':'JK','Bolsa Mexicana De Valores':'MX','National Stock Exchange Of India':'NS','Bse Ltd':'BO','Saudi Stock Exchange':'SR','XBSP':'SA','Warsaw Stock Exchange/Equities/Main Market':'WA','Istanbul Stock Exchange':'IS','New Zealand Exchange Ltd':'NZ','NASDAQ':'','NYSE':''};
const nmSrc = fs.readFileSync(PA + 'arcus-source.mjs', 'utf8');
const nmBody = nmSrc.slice(nmSrc.indexOf('const clean ='), nmSrc.indexOf("const portfolios="));
const nameMatches = new Function(nmBody + '; return nameMatches;')();
// Extra iShares files: IXUS (non-US, 23 Nov), IWC Micro-Cap (US small, 24 Nov), MCHI China incl. A-shares (23 Nov).
const ixus = [];
for (const file of ['IXUS.csv', 'IWC.csv', 'MCHI.csv']) {
  const ixRows = parseCsv(fs.readFileSync(path.join(DIR, 'ixus', file), 'utf8'));
  const ixHead = ixRows.findIndex(r => r[0] === 'Ticker' && r.includes('Sector')), IH = ixRows[ixHead], ic = n => IH.indexOf(n);
  for (const r of ixRows.slice(ixHead + 1)) {
    if (r.length < IH.length || r[ic('Asset Class')] !== 'Equity') continue;
    const ex = r[ic('Exchange')], suf = SUFFIX[ex]; let t = r[ic('Ticker')].trim().replace(/\.$/, '');
    if (suf === 'HK' && /^\d+$/.test(t)) t = t.padStart(4, '0');
    const sym = suf == null ? null : (t.replace(/[ .\/]/g, '-') + (suf ? '.' + suf : '')).toUpperCase();
    const sector = toGics(r[ic('Sector')]);
    if (sector) ixus.push({ticker: r[ic('Ticker')], name: r[ic('Name')], sector, exchange: ex, sym, file});
  }
}
console.log('extra iShares rows', ixus.length);
const ixBySym = new Map(); for (const r of ixus) if (r.sym) ixBySym.set(r.sym, r);
const knownNow = k => proposals.has(k) || current.sectors[k] || current.sectors[k.replace(/[/.](?=[A-Z]$)/, '-')];
const ixLog = {symbol: [], symbolNameMismatch: [], name: [], nameAmbiguous: []};
for (const fund of [...snaps.keys(), ...archiveOnly.map(a => a.fund)]) {
  const rows = snaps.get(fund)?.snap.positions || archive.find(a => a.fund === fund)?.positions || [];
  for (const [ri, r] of rows.entries()) {
    if (isNonListed(r)) continue;
    const rawId = snaps.get(fund)?.rawIds?.[ri], extra = rawId && rawId !== r.id && !US_ONLY.has(fund) ? rawId : null;
    // A bare symbol taken from the PA saved archive for a foreign share can be another company's US ticker
    // (IGPT NEXTDC -> NXT Nextpower, Nemetschek -> NEM Newmont, Dassault -> DSY): key only the row's own id then.
    if (extra && !String(r.symbol).includes('.')) {
      if (knownNow(String(extra).toUpperCase())) continue;
      const byName = ixus.filter(x => nameMatches(r.name, x.name)), secs = new Set(byName.map(x => x.sector));
      if (secs.size === 1) { propose(extra, byName[0].sector, byName[0].file.replace('.csv', '') + ' name', r.name); ixLog.name.push(`${fund} ${extra} ${r.name} (archive listing ${r.symbol} not keyed) = ${byName[0].name} -> ${byName[0].sector}`); }
      continue;
    }
    if (!r.symbol && (!String(r.id).includes(':') || US_ONLY.has(fund))) continue;
    const key = String(r.symbol || r.id).toUpperCase();
    if (knownNow(key)) continue;
    if (!r.symbol) {
      // Not-yet-verified listing: only its exact row id is keyed, and only when its bare ticker would otherwise find
      // nothing or a company in a different sector (NEXTDC NXT would read as Nextpower, Airbus AIR as AAR).
      const viaTicker = (() => { const t = String(r.ticker || '').trim().toUpperCase(); const p = proposals.get(t); return current.sectors[t] || current.sectors[t.replace(/[/.](?=[A-Z]$)/, '-')] || (p && p[0].sector) || null; })();
      const byName = ixus.filter(x => nameMatches(r.name, x.name)), secs = new Set(byName.map(x => x.sector));
      if (secs.size === 1 && byName[0].sector !== viaTicker) { propose(key, byName[0].sector, byName[0].file.replace('.csv', '') + ' name', r.name); ixLog.name.push(`${fund} ${key} ${r.name} = ${byName.map(x => x.name + ' ' + x.sym).join(' / ')} -> ${byName[0].sector}${viaTicker ? ' (ticker alone gave ' + viaTicker + ')' : ''}`); }
      continue;
    }
    if (gicsSector(r, current.sectors) !== UNKNOWN_GICS) continue;
    const hit = r.symbol ? ixBySym.get(key) : null;
    if (hit) {
      if (nameMatches(r.name, hit.name) || nameMatches(hit.name, r.name) || r.name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '') === hit.name.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, '')) { for (const k of [key, extra]) propose(k, hit.sector, hit.file.replace('.csv', '') + ' symbol', r.name); ixLog.symbol.push(`${fund} ${key} ${r.name} = ${hit.name} -> ${hit.sector}`); }
      else ixLog.symbolNameMismatch.push(`${fund} ${key} ${r.name} vs ${hit.name} (${hit.sector})`);
      continue;
    }
    const byName = ixus.filter(x => nameMatches(r.name, x.name));
    const secs = new Set(byName.map(x => x.sector));
    if (secs.size === 1) { for (const k of [key, extra]) propose(k, byName[0].sector, byName[0].file.replace('.csv', '') + ' name', r.name); ixLog.name.push(`${fund} ${key} ${r.name} = ${byName.map(x => x.name + ' ' + x.sym).join(' / ')} -> ${byName[0].sector}`); }
    else if (secs.size > 1) ixLog.nameAmbiguous.push(`${fund} ${key} ${r.name}: ${byName.map(x => x.name + '=' + x.sector).join(', ')}`);
  }
}
for (const [k, v] of Object.entries(ixLog)) { console.log('IXUS', k, v.length); for (const l of [...new Set(v.map(s => s.replace(/^\S+ /, '')))]) console.log('   ', l); }

// ---- merge: Bloomberg (existing) always wins; issuer disagreements reported ----
const sectors = {...current.sectors};
const added = {}, conflictsWithBloomberg = [], issuerDisagree = [];
const rank = s => s.startsWith('IWV csv') ? 0 : s.startsWith('IWV') ? 1 : /archive/.test(s) ? 3 : /^(IXUS|IWC|MCHI)/.test(s) ? 4 : 2;
for (const [key, list] of proposals) {
  const set = new Set(list.map(x => x.sector));
  const best = [...list].sort((a, b) => rank(a.source) - rank(b.source))[0];
  if (current.sectors[key] || current.sectors[key.replace(/[/.](?=[A-Z]$)/, '-')]) {
    const have = current.sectors[key] || current.sectors[key.replace(/[/.](?=[A-Z]$)/, '-')];
    if (!set.has(have) || set.size > 1) conflictsWithBloomberg.push({key, bloomberg: have, issuers: list.map(x => x.source.split(' ')[0] + '=' + x.sector).join(', ')});
    continue;
  }
  if (set.size > 1) issuerDisagree.push({key, chosen: best.sector, all: list.map(x => x.source.split(' ')[0] + '=' + x.sector).join(', ')});
  sectors[key] = best.sector; added[key] = best.sector;
}
console.log('existing', Object.keys(current.sectors).length, 'added', Object.keys(added).length, 'total', Object.keys(sectors).length);
console.log('Bloomberg vs issuer differences (Bloomberg kept):', conflictsWithBloomberg.length);
for (const c of conflictsWithBloomberg.slice(0, 40)) console.log('  ', c.key, 'Bloomberg', c.bloomberg, '|', c.issuers);
console.log('issuer disagreements:', issuerDisagree.length);
for (const c of issuerDisagree) console.log('  ', c.key, '->', c.chosen, '|', c.all);

// ---- measure Unknown GICS per fund, before and after ----
const rowsFor = fund => snaps.get(fund)?.snap.positions || archive.find(a => a.fund === fund)?.positions || [];
const allFunds = [...snaps.keys(), ...archiveOnly.map(a => a.fund)];
const keyName = new Map(); for (const [k, list] of proposals) keyName.set(k, list[0].name);
const report = [], collisions = [];
for (const fund of allFunds) {
  const rows = rowsFor(fund); if (!rows.length) continue;
  let total = 0, nonListed = 0, before = 0, after = 0; const left = [];
  for (const r of rows) {
    const w = (r.weight || 0) * 100; total += w;
    if (isNonListed(r)) { nonListed += w; continue; }
    if (gicsSector(r, current.sectors) === UNKNOWN_GICS) before += w;
    const s = gicsSector(r, sectors);
    if (s === UNKNOWN_GICS) { after += w; left.push(r); }
    else {
      // matched only through the ticker fallback to a key from a different company?
      const viaId = [r.id, r.symbol].map(v => String(v || '').trim().toUpperCase()).filter(Boolean).some(k => sectors[k] || sectors[k.replace(/[/.](?=[A-Z]$)/, '-')]);
      if (!viaId) { const k = String(r.ticker || '').trim().toUpperCase(); collisions.push({fund, id: r.id, ticker: r.ticker, name: r.name, sector: s, keyName: keyName.get(k) || '(Bloomberg list)'}); }
    }
  }
  left.sort((a, b) => b.weight - a.weight);
  report.push({fund, source: snaps.has(fund) ? 'Arcus ' + snaps.get(fund).alloc.asOf : 'PA archive ' + archive.find(a => a.fund === fund).asOf, total, nonListed, before, after, left: left.slice(0, 8).map(r => `${r.ticker}${r.symbol && r.symbol !== r.ticker ? '(' + r.symbol + ')' : ''} ${r.name} ${(r.weight * 100).toFixed(2)}%`)});
}
report.sort((a, b) => b.after - a.after);
console.log('\nfund | source | listed Unknown GICS before -> after (% of fund) | non-listed % | biggest left');
for (const r of report) console.log(`${r.fund} | ${r.source} | ${r.before.toFixed(1)} -> ${r.after.toFixed(1)} | ${r.nonListed.toFixed(1)} | ${r.left.slice(0, 5).join('; ')}`);
const firstWord = s => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').split(/\s+/)[0];
const realCollisions = collisions.filter(c => c.keyName !== '(Bloomberg list)' && !(nameMatches(c.name, c.keyName) || nameMatches(c.keyName, c.name) || firstWord(c.name) === firstWord(c.keyName)));
console.log('\nticker-fallback matches:', collisions.length, '| to a NEW key from a different-looking company:', realCollisions.length);
for (const c of realCollisions) console.log('  ', c.fund, c.id, c.ticker, c.name, '->', c.sector, '| key from', c.keyName);
console.log('all fallback rows whose key name is unknown (Bloomberg list):'); for (const c of collisions.filter(c => c.keyName === '(Bloomberg list)')) console.log('   B', c.fund, c.id, c.ticker, c.name, '->', c.sector);

fs.writeFileSync(path.join(DIR, 'report.json'), JSON.stringify({report, collisions, conflictsWithBloomberg, issuerDisagree, added}, null, 1));
const out = {asOf: new Date().toISOString().slice(0, 10), source: String(current.source || '').split('; plus issuer')[0] + '; plus issuer GICS sectors for shares not on the Bloomberg list: owner\'s iShares IWV file (24 Nov 2026), iShares/State Street/Tema/Fundstrat holdings stored by Arcus, sector SPDR membership, iShares IXUS/IWC/MCHI files', count: Object.keys(sectors).length, sectors};
fs.writeFileSync(path.join(DIR, 'gics-v1-new.json'), JSON.stringify(out));
console.log('wrote gics-v1-new.json', out.count);
