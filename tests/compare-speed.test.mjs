// Compare speed (owner, 2026-11-20): J303 constituent closes in batches, generic prices six at a time.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dataResponse,J303_BATCH} from '../cloudflare/data.mjs';
import {j303Fetchers,PRICE_CONCURRENCY,createOnlineSource} from '../site/online.mjs';
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

test('compare wiring: getMany used by the J303 loader, generic prices PRICE_CONCURRENCY at a time, module versions bumped', async () => {
  const [online,source,app]=await Promise.all(['site/online.mjs','site/j303-source.mjs','site/app.mjs'].map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
  assert.match(online,/get:one,getMany:many/);
  assert.ok(online.includes('await Promise.all([...Array(PRICE_CONCURRENCY)].map('));
  assert.equal(PRICE_CONCURRENCY,16);
  assert.match(online,/j303-source\.mjs\?v=speed-20261120b/);
  assert.match(app,/online\.mjs\?v=guard-20261125/);
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

// The other side loads beside the J303 closes on the expected basis (compare speed, 2026-11-20).
import {expectedBasis} from '../site/j303-source.mjs';
test('expectedBasis: one JSE session is a price return, two or more a total return', () => {
  assert.equal(expectedBasis('2026-11-19','2026-11-19'),'price-return');
  assert.equal(expectedBasis('2026-11-14','2026-11-16'),'price-return','Saturday to Monday is one session');
  assert.equal(expectedBasis('2026-11-13','2026-11-16'),'total-return','Friday and Monday');
  assert.equal(expectedBasis('2026-10-20','2026-11-19'),'total-return');
});
test('J303 loader starts the other side early and reuses it only on the same basis', async () => {
  const source = await readFile(new URL('../site/j303-source.mjs', import.meta.url), 'utf8');
  assert.match(source, /const early=guess\?loadOther\(others,guess\)\.then\(data=>\(\{data\}\),error=>\(\{error\}\)\):null;/);
  assert.match(source, /early&&returnBasis===guess\?await early:null/);
  assert.match(source, /early_&&!early_\.error\?early_\.data:await loadOther\(others,returnBasis\)/);
  const app = await readFile(new URL('../site/app.mjs', import.meta.url), 'utf8');
  assert.match(app, /await refreshArcusReturns\(arcusFunds\);/);
});

// One three-year history per listing and end date, cut to each request (compare speed, 2026-11-20).
import {sliceHistory,HISTORY_DAYS} from '../cloudflare/data.mjs';
import {valuationPrices} from '../site/price-data.mjs';
const yahoo=(symbol,days)=>{const ts=days.map(d=>Date.parse(d+'T14:30:00Z')/1000);
  return {chart:{result:[{meta:{symbol,currency:'USD',exchangeTimezoneName:'America/New_York'},timestamp:ts,
    events:{dividends:{[ts[2]]:{amount:.5,date:ts[2]},[ts[ts.length-2]]:{amount:.6,date:ts[ts.length-2]}}},
    indicators:{quote:[{close:days.map((_,i)=>100+i)}],adjclose:[{adjclose:days.map((_,i)=>99+i)}]}}]}};};
test('sliceHistory returns exactly the bars and events of the requested window', () => {
  const days=sessions('2026-11-13',30),raw=yahoo('AAPL',days).chart.result[0];
  const history={meta:raw.meta,timestamp:raw.timestamp,events:raw.events,indicators:{quote:[{close:raw.indicators.quote[0].close}],adjclose:[{adjclose:raw.indicators.adjclose[0].adjclose}]}};
  const p2=Date.parse(days[29])/1000+2*86400,got=sliceHistory(history,days[10],p2);
  assert.deepEqual(got.timestamp,raw.timestamp.slice(10));
  assert.deepEqual(got.indicators.adjclose[0].adjclose,raw.indicators.adjclose[0].adjclose.slice(10));
  assert.deepEqual(got.indicators.quote[0].close,raw.indicators.quote[0].close.slice(10));
  assert.deepEqual(Object.values(got.events.dividends).map(d=>d.amount),[.6],'only the dividend inside the window');
  assert.deepEqual(sliceHistory(history,days[10],Date.parse(days[20])/1000).timestamp,raw.timestamp.slice(10,20),'period2 still caps the end');
});
test('sliceHistory keeps a UK-summer FX bar stamped 23:00 UTC the evening before the start (J303 Last Month baseline)', () => {
  const ts=['2026-09-28T23:00:00Z','2026-09-29T23:00:00Z','2026-09-30T23:00:00Z'].map(d=>Date.parse(d)/1000);
  const fx={meta:{symbol:'USDZAR=X',exchangeTimezoneName:'Europe/London'},timestamp:ts,events:{},indicators:{quote:[{close:[17.1,17.2,17.3]}]}};
  const got=sliceHistory(fx,'2026-09-30',Date.parse('2026-10-03')/1000);
  assert.deepEqual(got.indicators,{quote:[{close:[17.2,17.3]}]},'the 09-30 London-dated bar is kept');
  assert.deepEqual(got.events,{});
  const tokyo={meta:{symbol:'7203.T',exchangeTimezoneName:'Asia/Tokyo'},timestamp:[Date.parse('2026-10-05T00:00:00Z')/1000],events:{},indicators:{quote:[{close:[1]}],adjclose:[{adjclose:[1]}]}};
  assert.equal(sliceHistory(tokyo,'2026-10-05',Date.parse('2026-10-07')/1000).timestamp.length,1,'09:00 Tokyo on the start date is kept');
});
test('prices route: periods ending on the same date share one download; refresh downloads again', async () => {
  const end=previous(iso(Date.now()+7200000)),days=sessions(end,40),calls=[];
  const store=new Map(),cache={match:async k=>store.get(k.url)?.clone(),put:async(k,r)=>{store.set(k.url,r);}};
  const fetcher=async url=>{calls.push(url);return Response.json(yahoo('AAPL',days));};
  const ask=async(start,extra='')=>(await dataResponse(new Request('https://a.invalid/data/prices?'+new URLSearchParams({symbol:'AAPL',start,end})+extra),{},{},fetcher,cache)).json();
  const a=await ask(days[30]),b=await ask(days[5]);
  assert.equal(calls.length,1,'second period reused the history');
  assert.match(calls[0],new RegExp('period1='+Math.floor((Date.parse(end)-HISTORY_DAYS*86400000)/1000)));
  assert.equal(a.timestamp.length,10);assert.equal(b.timestamp.length,35);
  assert.deepEqual(b.indicators.adjclose[0].adjclose.slice(-10),a.indicators.adjclose[0].adjclose);
  await ask(days[30],'&refresh=1');assert.equal(calls.length,2);
});
test('a failed price request is retried once; sign-in errors are not retried', async () => {
  let n=0;const fetcher=async path=>{const u=new URL(path,'https://t/');const symbol=u.searchParams.get('symbol');
    if(u.pathname.endsWith('/nav'))return Response.json({status:'no-data'});
    if(symbol==='US'&&n++===0)return Response.json({error:'Price source is temporarily unavailable'},{status:502});
    return Response.json({meta:{symbol,currency:'USD',exchangeTimezoneName:'UTC'},timestamp:[Date.parse('2026-10-07T12:00Z')/1000,Date.parse('2026-10-08T12:00Z')/1000],indicators:{quote:[{close:[100,110]}],adjclose:[{adjclose:[100,110]}]}});};
  const snaps={A:{fund:'A',asOf:'2026-10-01',positions:[{id:'US',symbol:'US',weight:1}]},B:{fund:'B',asOf:'2026-10-01',positions:[{id:'US',symbol:'US',weight:1}]}};
  const source=createOnlineSource({fetcher:async path=>{const fund=new URL(path,'https://t/').searchParams.get('fund');return fund&&!path.includes('/nav')?Response.json(snaps[fund]):fetcher(path);}});
  const data=await source.load({schemaVersion:1,version:'1'},['A','B'],'2026-10-08','2026-10-08','USD');
  assert.equal(n,2,'one failure then one retry');assert.equal(data.levels.find(l=>l.id==='US'&&l.date==='2026-10-08').value,110);
  const online=await readFile(new URL('../site/online.mjs',import.meta.url),'utf8');
  assert.match(online,/\/Sign in\/\.test\(e\?\.message\)\)throw e;/);
});
test('JSE closed days (4 November 2026 election) carry the last close; ordinary gaps stay blank', () => {
  const r=valuationPrices({symbol:'NPN.JO',currency:'ZAR',timeZone:'Africa/Johannesburg',points:[['2026-11-03',10],['2026-11-05',11]]},['2026-11-03','2026-11-04','2026-11-05']);
  assert.deepEqual(r.carried,[{date:'2026-11-04',priceDate:'2026-11-03'}]);
  assert.equal(new Map(r.points).get('2026-11-04'),10);
  assert.deepEqual(valuationPrices({symbol:'NPN.JO',currency:'ZAR',timeZone:'Africa/Johannesburg',points:[['2026-11-03',10],['2026-11-06',11]]},['2026-11-05']).carried,[]);
  assert.deepEqual(valuationPrices({symbol:'NPN.JO',currency:'ZAR',timeZone:'Africa/Johannesburg',points:[['2026-04-02',10],['2026-04-07',11]]},['2026-04-03','2026-04-06']).carried.map(c=>c.date),['2026-04-03','2026-04-06'],'Good Friday and Family Day');
  assert.deepEqual(valuationPrices({symbol:'AAPL',currency:'USD',timeZone:'America/New_York',points:[['2026-11-03',10]]},['2026-11-04']).carried,[]);
});
test('JSE carry notes are grouped by shared dates (one note, not one per share)', async () => {
  const online=await readFile(new URL('../site/online.mjs',import.meta.url),'utf8');
  assert.match(online,/for\(const \[dates,list\] of jseCarried\)priceNotes\.push\(list\.length\+' JSE listing'/);
  assert.match(online,/else if\(aligned\.carried\.length\)priceNotes\.push\(id\+': local adjusted close carried across verified '\+closureMarket\(data\)/,'Tokyo and Taiwan keep one note per listing');
});
