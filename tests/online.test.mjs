import {test} from 'node:test';
import assert from 'node:assert/strict';
import {completedPrices} from '../site/price-data.mjs';
import {priceQuery,dataResponse} from '../cloudflare/data.mjs';
import {createOnlineSource} from '../site/online.mjs';
import {bridgeAsset} from '../cloudflare/bridge.mjs';
import worker,{sign} from '../cloudflare/worker.mjs';
const day=d=>Date.parse(d+'T16:00:00Z')/1000;
test('equities require adjusted closes, exclude current day, reject identity mismatch',()=>{
 const q={symbol:'ABC',start:'2026-10-07',end:'2026-10-10'};
 const r={meta:{symbol:'ABC',currency:'USD',exchangeTimezoneName:'America/New_York'},timestamp:['2026-10-07','2026-10-08','2026-10-09'].map(day),indicators:{quote:[{close:[900,900,900]}],adjclose:[{adjclose:[100,102,999]}]}};
 assert.deepEqual(completedPrices(r,q,Date.parse('2026-10-09T23:00:00Z')).points,[['2026-10-07',100],['2026-10-08',102]]);
 assert.throws(()=>completedPrices({...r,indicators:{quote:[{close:[100]}]}},q),/Adjusted/);
 assert.throws(()=>completedPrices(r,{...q,symbol:'OTHER'}),/identity/);
});
test('price endpoint validates bounded dates and caches only after success',async()=>{
 assert.throws(()=>priceQuery(new URLSearchParams({symbol:'https://evil',start:'2026-01-01',end:'2026-10-09'})));
 assert.throws(()=>priceQuery(new URLSearchParams({symbol:'ABC',start:'2000-01-01',end:'2026-10-09'})));
 let puts=0;
 const response=await dataResponse(new Request('https://test/data/prices?symbol=ABC&start=2026-10-01&end=2026-10-09'),{}, {},async()=>new Response('',{status:429}),{match:async()=>null,put:async()=>puts++});
 assert.equal(response.status,502);assert.equal(puts,0);assert.equal(response.headers.get('cache-control'),'private, no-store');
});
test('private data requires login or fresh query-bound bridge signature',async()=>{
 const env={PASSWORD_PEPPER:'fixture',PASSWORD_VERIFIER:'fixture',SESSION_KEY:'fixture',LOGIN_LIMITER:{},ANALYSIS_BRIDGE_KEY:'test-key',HOLDINGS_ARCHIVE:{get:async()=>({schemaVersion:1,funds:[]})}};
 for(const path of ['/data/catalog','/data/holdings?fund=ARKK&version=1790000000000','/data/prices?symbol=ABC'])assert.equal((await worker.fetch(new Request('https://test'+path),env)).status,401);
 const seconds=String(Math.floor(Date.now()/1000)),path='/arcus-bridge/data/holdings?fund=ARKK&version=1790000000000';
 const signature=await sign(env.ANALYSIS_BRIDGE_KEY,'arcus-attribution:v1\nGET\n'+path+'\n'+seconds);
 const headers={'X-Arcus-Time':seconds,'X-Arcus-Signature':signature};
 assert.equal(await bridgeAsset(new Request('https://test'+path,{headers}),env),'data/holdings');
 assert.equal(await bridgeAsset(new Request('https://test'+path.replace('ARKK','BAI'),{headers}),env),null);
 assert.equal(await bridgeAsset(new Request('https://test'+path,{headers:{...headers,'X-Arcus-Time':String(+seconds-60)}}),env),null);
});
test('phone source keeps exact USD adjusted dates and FX, leaves unknowns and missing dates blank, uses two requests maximum',async()=>{
 let active=0,max=0,count=0;
 const snaps={A:{fund:'A',asOf:'2026-10-01',positions:[{id:'US',symbol:'US',weight:.5},{id:'JP',symbol:'JP',weight:.4},{id:'PRIVATE',weight:.1}]},B:{fund:'B',asOf:'2026-10-02',positions:[{id:'US',symbol:'US',weight:1}]}};
 const source=createOnlineSource({fetcher:async path=>{
   active++;max=Math.max(max,active);count++;
   await new Promise(resolve=>setTimeout(resolve,1));
   const url=new URL(path,'https://test/');
   const fund=url.searchParams.get('fund'),symbol=url.searchParams.get('symbol');
   let body;
   if(fund)body=snaps[fund];
   else {const fx=symbol==='JPYUSD=X';body={meta:{symbol,currency:symbol==='JP'?'JPY':'USD',exchangeTimezoneName:'UTC'},
 timestamp:(fx?['2026-10-08']:['2026-10-07','2026-10-08']).map(day),
 indicators:fx?{quote:[{close:[.01]}]}:{adjclose:[{adjclose:[100,110]}]}};}
   active--;return Response.json(body);
 }});
 const m={schemaVersion:1,version:'1790000000000'};
 const data=await source.load(m,['A','B'],'2026-10-08','2026-10-08','USD');
 assert.ok(max<=2);assert.equal(data.snapshots[0].asOf,'2026-10-01');
 assert.equal(data.levels.find(l=>l.id==='US'&&l.date==='2026-10-08').value,110);
 assert.deepEqual(data.levels.filter(l=>l.id==='JP').map(l=>[l.date,l.value]),[['2026-10-08',1.1]]);
 assert.equal(data.levels.some(l=>l.id==='PRIVATE'),false);
 const before=count;await source.load(m,['A','B'],'2026-10-08','2026-10-08','USD');assert.equal(count,before);
 source.clear();await source.load(m,['A','B'],'2026-10-08','2026-10-08','USD');assert.ok(count>before);
});
test('session expiry stops data loading and does not continue fetching prices',async()=>{
 let source,requests=0;
 source=createOnlineSource({onUnauthorized:()=>source.clear(),fetcher:async()=>{requests++;return new Response('',{status:401});}});
 await assert.rejects(()=>source.load({version:'1790000000000'},['A','B'],'2026-10-08','2026-10-08','USD'));
 assert.ok(requests<=2);
});

