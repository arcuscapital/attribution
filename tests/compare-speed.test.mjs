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
