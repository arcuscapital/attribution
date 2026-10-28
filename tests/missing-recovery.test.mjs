import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from '../site/engine.mjs';
import {valuationPrices} from '../site/price-data.mjs';
import {createOnlineSource} from '../site/online.mjs';
import {dataResponse} from '../cloudflare/data.mjs';
import {comparisonXlsx} from '../site/export.mjs';

test('Taiwan verified holiday carries only the previous open close; no guessed open-day or year values',()=>{
 const d={symbol:'3037.TW',currency:'TWD',timeZone:'Asia/Taipei',points:[['2026-10-23',100],['2026-10-27',110]]};
 assert.deepEqual(valuationPrices(d,['2026-10-26']).carried,[{date:'2026-10-26',priceDate:'2026-10-23'}]);
 assert.equal(valuationPrices({...d,points:[['2026-10-22',100]]},['2026-10-26']).carried.length,0);
 assert.equal(valuationPrices(d,['2026-10-28','2027-10-25']).carried.length,0);
 for(const extra of [{symbol:'3037.TWO'},{currency:'USD'},{timeZone:'UTC'}])assert.equal(valuationPrices({...d,...extra},['2026-10-26']).carried.length,0);
});

test('explicit zero assumptions retain measured coverage, label exports, and never overwrite known returns',()=>{
 const data={manifest:{schemaVersion:1},snapshots:['PORTFOLIO:A','ETF'].map(fund=>({fund,asOf:'2026-10-08',positions:[{id:'KNOWN',ticker:'KNOWN',name:'Known',weight:.8},{id:'MISSING',ticker:'MISSING',name:'Unknown',weight:.2}]})),levels:['SPY','ETF','KNOWN'].flatMap(id=>[{id,date:'2026-10-08',value:100,currency:'USD',basis:'vendor-adjusted'},{id,date:'2026-10-09',value:110,currency:'USD',basis:'vendor-adjusted'}])};
 const options={portfolio:'PORTFOLIO:A',benchmark:'ETF',start:'2026-10-09',end:'2026-10-09',currency:'USD',allowApproximateHoldings:true,allowPartialReturns:true};
 const original=compare(data,options), assumed=compare(data,{...options,assumeMissingZero:true});
 assert.equal(original.rows.find(r=>r.id==='MISSING').securityReturn,null);
 const row=assumed.rows.find(r=>r.id==='MISSING');
 assert.equal(row.securityReturn,0);assert.equal(row.ctrA,0);assert.equal(row.assumedZero,true);
 assert.equal(assumed.rows.find(r=>r.id==='KNOWN').securityReturn,original.rows.find(r=>r.id==='KNOWN').securityReturn);
 assert.deepEqual(assumed.coverage,original.coverage);assert.equal(assumed.status,'partial');assert.equal(assumed.missing.length,original.missing.length);
 const xml=new TextDecoder().decode(comparisonXlsx(assumed,options));
 assert.match(xml,/MISSING \[assumed 0%\]/);assert.match(xml,/not verified holidays/);
 assert.ok(Math.abs(assumed.returnA-.08)<1e-12);
});

test('manual retry bypasses server cache and replaces it only with valid fresh data',async()=>{
 let fetches=0,puts=0;
 const cache={match:async()=>Response.json({cached:true}),put:async()=>puts++};
 const raw={meta:{symbol:'ABC',currency:'USD'},timestamp:[1],indicators:{adjclose:[{adjclose:[100]}]}};
 const fetcher=async()=>{fetches++;return Response.json({chart:{result:[raw]}});};
 const path='https://test/data/prices?symbol=ABC&start=2026-10-01&end=2026-10-09';
 assert.equal((await (await dataResponse(new Request(path),{}, {},fetcher,cache)).json()).cached,true);
 assert.equal(fetches,0);
 assert.equal((await dataResponse(new Request(path+'&refresh=1'),{}, {},fetcher,cache)).status,200);
 assert.equal(fetches,1);assert.equal(puts,1);
});

test('retry refreshes only affected listings and their FX, not cash or other holdings',async()=>{
 const calls=[];
 const source=createOnlineSource({fetcher:async path=>{
  const q=new URL(path,'https://test').searchParams,symbol=q.get('symbol');
  if(q.has('fund'))return Response.json({fund:q.get('fund'),asOf:'2026-10-08',positions:[{id:'TW',symbol:'3037.TW',weight:.8},{id:'CASH',asset:'Cash',weight:.2}]});
  calls.push({symbol,refresh:q.get('refresh')});
  return Response.json({meta:{symbol,currency:symbol==='3037.TW'?'TWD':'USD',exchangeTimezoneName:'UTC'},timestamp:['2026-10-08','2026-10-09'].map(d=>Date.parse(d+'T00:00:00Z')/1000),indicators:symbol.endsWith('=X')?{quote:[{close:[.03,.031]}]}:{adjclose:[{adjclose:[100,110]}]}});
 }});
 const args=[{version:'1790000000000'},['A','B'],'2026-10-09','2026-10-09','USD'];
 await source.load(...args);calls.length=0;
 assert.equal(source.retryMissing([{fund:'A',id:'TW'},{fund:'A',id:'CASH'}]),2);
 await source.load(...args);
 assert.deepEqual(calls,[{symbol:'3037.TW',refresh:'1'},{symbol:'TWDUSD=X',refresh:'1'}]);
 assert.equal(source.retryMissing([{fund:'A',id:'CASH'}]),0);
});
