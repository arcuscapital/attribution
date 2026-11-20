// Compare speed (owner, 2026-11-20): J303 constituent closes in batches, generic prices six at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dataResponse,J303_BATCH} from '../cloudflare/data.mjs';
import {j303Fetchers} from '../site/online.mjs';
import {RETURN_VERSION} from '../site/price-data.mjs';

const through='2026-11-13';
const packet=symbol=>({symbol,currency:'ZAR',basis:'price-return',points:[['2026-11-12',10],[through,11]],returnVersion:RETURN_VERSION,totalReturnFrom:'2026-11-12',totalReturnPoints:[['2026-11-12',10],[through,11]],checkedAt:new Date().toISOString()});
const kvWith=symbols=>{const store=new Map(symbols.map(s=>['j303:price:v1:'+s,JSON.stringify(packet(s))]));return {get:async(k,t)=>store.has(k)?t==='json'?JSON.parse(store.get(k)):store.get(k):null,put:async(k,v)=>store.set(k,v)};};
const batchUrl=list=>'https://a.invalid/data/j303?'+new URLSearchParams({symbols:list.map(([s,t])=>s+'~'+t).join(',')});

test('j303 batch route returns saved packets in request order without vendor calls', async () => {
  let calls=0;const fetcher=async()=>{calls++;throw Error('no network');};
  const env={HOLDINGS_ARCHIVE:kvWith(['NPN.JO','GFI.JO','SBK.JO'])};
  const res=await dataResponse(new Request(batchUrl([['SBK.JO',through],['NPN.JO',through],['GFI.JO',through]])),env,{},fetcher,null);
  assert.equal(res.status,200);
  assert.deepEqual((await res.json()).packets.map(p=>p.symbol),['SBK.JO','NPN.JO','GFI.JO']);
  assert.equal(calls,0);
});

test('j303 batch route rejects bad, duplicate, future and oversized lists', async () => {
  const env={HOLDINGS_ARCHIVE:kvWith(['NPN.JO'])},ask=async url=>(await dataResponse(new Request(url),env,{},async()=>{throw Error('no network');},null)).status;
  assert.equal(await ask(batchUrl([['NPN',through]])),400);
  assert.equal(await ask(batchUrl([['NPN.JO','13-11-2026']])),400);
  assert.equal(await ask(batchUrl([['NPN.JO',through],['NPN.JO',through]])),400);
  assert.equal(await ask(batchUrl([['NPN.JO','2099-01-02']])),400);
  assert.equal(await ask('https://a.invalid/data/j303?symbols=NPN.JO~'+through+'~x'),400);
  assert.equal(await ask(batchUrl(Array.from({length:J303_BATCH+1},(_,i)=>['S'+i+'.JO',through]))),400);
  assert.equal(await ask('https://a.invalid/data/j303?symbols='),400);
});

test('j303 batch route fails closed when a listing has no saved or vendor closes', async () => {
  const env={HOLDINGS_ARCHIVE:kvWith(['NPN.JO'])};
  const res=await dataResponse(new Request(batchUrl([['NPN.JO',through],['ZZZ.JO',through]])),env,{},async()=>new Response('down',{status:503}),null);
  assert.equal(res.status,503);
});

test('j303Fetchers batches 117 listings into four requests and keeps order', async () => {
  const symbols=Array.from({length:117},(_,i)=>'S'+i+'.JO'),paths=[];
  const get=async path=>{paths.push(path);const list=new URLSearchParams(path.split('?')[1]).get('symbols').split(',').map(x=>x.split('~')[0]);return {packets:list.map(packet)};};
  const progress=[];const {many}=j303Fetchers({get});
  const out=await many(symbols.map(s=>[s,through]),(d,t)=>progress.push(d+'/'+t));
  assert.equal(paths.length,Math.ceil(117/J303_BATCH));
  assert.deepEqual(out.map(p=>p.symbol),symbols);
  assert.equal(progress.at(-1),'117/117');
});

test('j303Fetchers reuses its 15-minute cache, shared with single requests', async () => {
  const paths=[];
  const get=async path=>{paths.push(path);if(path.includes('symbols='))return {packets:new URLSearchParams(path.split('?')[1]).get('symbols').split(',').map(x=>packet(x.split('~')[0]))};return packet(new URLSearchParams(path.split('?')[1]).get('symbol'));};
  let clock=0;const {one,many}=j303Fetchers({get,now:()=>clock});
  await one('j303?'+new URLSearchParams({symbol:'NPN.JO',through}));
  await many([['NPN.JO',through],['GFI.JO',through]]);
  assert.equal(paths.length,2);assert.match(paths[1],/symbols=GFI\.JO/);assert.doesNotMatch(paths[1],/NPN/);
  await many([['NPN.JO',through],['GFI.JO',through]]);
  assert.equal(paths.length,2,'both cached');
  clock=900001;await many([['NPN.JO',through]]);
  assert.equal(paths.length,3,'expired after 15 minutes');
});

test('j303Fetchers falls back to single requests when a batch fails or mismatches', async () => {
  for(const reply of [()=>{throw Error('Invalid JSE listing');},()=>({packets:[packet('WRONG.JO'),packet('GFI.JO')]})]) {
    const paths=[];
    const get=async path=>{paths.push(path);if(path.includes('symbols='))return reply();return packet(new URLSearchParams(path.split('?')[1]).get('symbol'));};
    const out=await j303Fetchers({get}).many([['NPN.JO',through],['GFI.JO',through]]);
    assert.deepEqual(out.map(p=>p.symbol),['NPN.JO','GFI.JO']);
    assert.equal(paths.filter(p=>p.includes('symbol=')).length,2);
  }
});

test('j303Fetchers does not retry after the session is cleared', async () => {
  const get=async()=>{throw Error('aborted');};
  await assert.rejects(j303Fetchers({get,aborted:()=>true}).many([['NPN.JO',through]]),/aborted/);
});

test('compare wiring: getMany used by the J303 loader, generic prices six at a time, module versions bumped', async () => {
  const [online,source,app]=await Promise.all(['site/online.mjs','site/j303-source.mjs','site/app.mjs'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
  assert.match(online,/get:one,getMany:many/);
  assert.match(online,/Promise\.all\(\[0,1,2,3,4,5\]\.map/);
  assert.match(online,/j303-source\.mjs\?v=speed-20261120/);
  assert.match(app,/online\.mjs\?v=speed-20261120/);
  assert.match(source,/if\(getMany\)return getMany\(/);
});

test('a Live price refresh keeps the GICS table sort and open sectors; a new Compare resets them', async () => {
  const app = await readFile(new URL('../site/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /const refreshing = liveRefreshing && !\$\('results'\)\.hidden; liveRefreshing = false;\s*keepGicsState = refreshing;/);
  assert.match(app, /if \(gicsShown !== result\) \{ if \(!keepGicsState\) view\.grid\.reset\(\); gicsShown = result; \}/);
  const ranges = await readFile(new URL('../site/ranges.mjs', import.meta.url), 'utf8');
  assert.match(ranges, /reset\(\) \{ opened\.clear\(\); current = null; sort = null; \}/, 'reset is what clears sort and open sectors');
});

// Saved JSE histories reused by the prices route (compare speed, 2026-11-20).
import {savedJseHistory} from '../cloudflare/j303-market.mjs';
import {previous,iso} from '../site/rise-swix-core.mjs';
import {cashDividendLevels} from '../site/price-data.mjs';
const sessions=(last,n)=>{const out=[last];while(out.length<n)out.unshift(previous(out[0]));return out;};
const history=(symbol,days,checkedAt)=>{const points=days.map((d,i)=>[d,100+i]),dividends=[{date:days[3],amount:2}];
  return {symbol,currency:'ZAR',basis:'price-return',points,dividends,returnVersion:RETURN_VERSION,totalReturnFrom:days[0],totalReturnPoints:cashDividendLevels(points,dividends),checkedAt,unitCorrections:0};};
const kvOf=packets=>({get:async(k,t)=>{const p=packets[k.replace('j303:price:v1:','')];return p?(t==='json'?structuredClone(p):JSON.stringify(p)):null;}});

test('savedJseHistory slices a covering saved history and rebases its total-return levels', async () => {
  const now=Date.parse('2026-11-14T10:00:00Z'),days=sessions('2026-11-13',10);
  const kv=kvOf({'NPN.JO':history('NPN.JO',days,new Date(now-3600000).toISOString())});
  const got=await savedJseHistory(kv,{symbol:'NPN.JO',start:days[2],end:'2026-11-13'},now);
  assert.deepEqual(got.points.map(p=>p[0]),days.slice(2));
  assert.equal(got.totalReturnPoints[0][1],100);
  assert.deepEqual(got.totalReturnPoints,cashDividendLevels(got.points,got.dividends),'same levels a fresh download would give');
  assert.deepEqual(got.dividends.map(d=>d.date),[days[3]]);
  // Returns between any two days are unchanged by the slice.
  const full=kv.get('j303:price:v1:NPN.JO','json').then(p=>new Map(p.totalReturnPoints));const f=await full,s=new Map(got.totalReturnPoints);
  assert.ok(Math.abs(s.get(days[9])/s.get(days[4])-f.get(days[9])/f.get(days[4]))<1e-12);
});

test('savedJseHistory refuses stale, short, gapped or foreign packets', async () => {
  const now=Date.parse('2026-11-14T10:00:00Z'),days=sessions('2026-11-13',10),fresh=new Date(now-3600000).toISOString();
  const ask=(p,q={})=>savedJseHistory(kvOf({'NPN.JO':p}),{symbol:'NPN.JO',start:days[2],end:'2026-11-13',...q},now);
  assert.equal(await ask(history('NPN.JO',days,new Date(now-2*86400000).toISOString())),null,'latest session needs a check within a day');
  assert.ok(await ask(history('NPN.JO',days,new Date(now-9*86400000).toISOString()),{end:days[5]}),'older periods do not need a recent check');
  assert.equal(await ask(history('NPN.JO',days.slice(0,-1),fresh)),null,'missing the last completed session');
  assert.equal(await ask(history('NPN.JO',days,fresh),{start:previous(days[0])}),null,'starts after the requested start');
  assert.equal(await ask({...history('NPN.JO',days,fresh),returnVersion:0}),null);
  assert.equal(await ask({...history('NPN.JO',days,fresh),totalReturnPoints:undefined}),null);
  assert.equal(await savedJseHistory(kvOf({}),{symbol:'NPN.JO',start:days[2],end:'2026-11-13'},now),null);
  assert.equal(await savedJseHistory(kvOf({'SPY':history('SPY',days,fresh)}),{symbol:'SPY',start:days[2],end:'2026-11-13'},now),null);
});

test('prices route serves JSE closes from the saved history without Yahoo; Retry (refresh=1) downloads', async () => {
  const completed=previous(iso(Date.now()+7200000)),days=sessions(completed,12);
  const env={HOLDINGS_ARCHIVE:kvOf({'NPN.JO':history('NPN.JO',days,new Date().toISOString())})};
  let calls=0;const fetcher=async()=>{calls++;return new Response('down',{status:503});};
  const url='https://a.invalid/data/prices?'+new URLSearchParams({symbol:'NPN.JO',start:days[1],end:completed});
  const res=await dataResponse(new Request(url),env,{},fetcher,null);
  assert.equal(res.status,200);assert.equal(calls,0);
  const body=await res.json();
  assert.equal(body.meta.symbol,'NPN.JO');assert.equal(body.timestamp.length,11);assert.equal(body.indicators.adjclose[0].adjclose[0],100);
  const retry=await dataResponse(new Request(url+'&refresh=1'),env,{},fetcher,null);
  assert.ok(calls>0,'refresh bypasses the saved history');assert.equal(retry.status,502);
});
