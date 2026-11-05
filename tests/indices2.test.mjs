import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createOnlineSource} from '../site/online.mjs';
test('Indices 2 is last in the benchmark picker and omits IWM/IWV',()=>{
 const app=fs.readFileSync('site/app.mjs','utf8');
 const start=app.indexOf('const FUND_THEMES'),end=app.indexOf('function createFundPicker',start);
 const ctx=vm.createContext({});vm.runInContext(app.slice(start,end),ctx);
 for(const id of 'QQQ RSP XLU IVW SLYV XLE XLY XLB XLK XLI XLF XLP XLV MDY VONE XLC SOXX IBIT'.split(' '))assert.equal(ctx.fundTheme({id},'benchmark'),'Indices 2');
 assert.notEqual(ctx.fundTheme({id:'IWM'},'benchmark'),'Indices 2');assert.notEqual(ctx.fundTheme({id:'IWV'},'benchmark'),'Indices 2');
 assert.equal(ctx.fundTheme({id:'QQQ'},'portfolio'),'Market benchmarks');
 assert(app.includes("'Other ETFs',...(id==='benchmark'?['Indices 2']:[])"));
});
test('IBIT uses only its own reference price without holdings or constituent requests',async()=>{
 const calls=[],source=createOnlineSource({fetcher:async path=>{
  calls.push(path);assert(path.includes('prices?'));const symbol=new URL(path,'https://test').searchParams.get('symbol');
  return Response.json({meta:{symbol,currency:'USD',exchangeTimezoneName:'UTC'},timestamp:['2026-10-07','2026-10-08'].map(d=>Date.parse(d)/1000),indicators:{adjclose:[{adjclose:[100,102]}]}});
 }});
 const manifest={holdingsSource:'arcus',valuationDates:['2026-10-07','2026-10-08'],funds:['IBIT'].map(id=>({id,name:id,referenceOnly:true}))};
 const result=await source.load(manifest,['IBIT'],'2026-10-08','2026-10-08','USD');
 assert.equal(calls.length,1);assert.deepEqual(result.snapshots.map(s=>s.positions.length),[1]);assert.equal(result.snapshots[0].positions[0].weight,1);assert(result.sourceWarnings.every(s=>s.includes('no constituent allocation')));
 await source.load(manifest,['IBIT'],'2026-10-08','2026-10-08','USD');assert.equal(calls.length,1);
});
test('new Arcus-only funds do not fetch a nonexistent archive when issuer allocation fails',async()=>{
 const calls=[],source=createOnlineSource({fetcher:async path=>{calls.push(path);return Response.json({kind:'etf',fund:'XLU',source:{fund:{asOf:'2026-10-07',positions:[{id:'ABC',name:'ABC Inc',rawSymbol:'ABC',candidates:['ABC']}]},index:[]},main:{}});}});
 await assert.rejects(source.load({holdingsSource:'arcus',funds:[{id:'XLU',arcusOnly:true}]},['XLU'],'2026-10-08','2026-10-08','USD'),/complete dated issuer weights/);
 assert.equal(calls.length,1);assert(calls[0].includes('arcus-source'));
});
