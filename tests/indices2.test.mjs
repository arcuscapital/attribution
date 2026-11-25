import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createOnlineSource} from '../site/online.mjs';
test('Indices 2 is last in the benchmark picker; IWV (Russell 3000) joined 2026-11-24, IWM stays out',()=>{
 const app=fs.readFileSync('site/app.mjs','utf8');
 assert(app.includes('SOX ETF proxy'));
 const start=app.indexOf('const FUND_THEMES'),end=app.indexOf('function createFundPicker',start);
 const ctx=vm.createContext({});vm.runInContext(app.slice(start,end),ctx);
 for(const id of 'QQQ RSP XLU IVW SLYV XLE XLY XLB XLK XLI XLF XLP XLV MDY VONE IWV XLC SOXX IBIT'.split(' '))assert.equal(ctx.fundTheme({id},'benchmark'),'Indices 2');
 assert.notEqual(ctx.fundTheme({id:'IWM'},'benchmark'),'Indices 2');
 assert.equal(ctx.fundTheme({id:'IWV'},'portfolio'),'Market benchmarks','as a portfolio IWV sits with VOO and IJR');
 assert.equal(ctx.fundTheme({id:'QQQ'},'portfolio'),'Market benchmarks');
 assert(app.includes("'Other ETFs',...(id==='benchmark'?['Indices 2']:[])"));
});
test('sector SPDRs read sector first and sort together by sector; other funds keep ticker · name',()=>{
 const app=fs.readFileSync('site/app.mjs','utf8');
 const start=app.indexOf('const portfolioOrder'),end=app.indexOf('function restoreSelection',start);
 const ctx=vm.createContext({});vm.runInContext(app.slice(start,end)+';this.fundDisplayName=fundDisplayName;this.fundSortKey=fundSortKey;',ctx);
 assert.equal(ctx.fundDisplayName({id:'XLI',name:'State Street® Industrial Select Sector SPDR® ETF'}),'Industrials · XLI · State Street sector ETF');
 assert.equal(ctx.fundDisplayName({id:'XLV',name:'State Street® Health Care Select Sector SPDR® ETF'}),'Health Care · XLV · State Street sector ETF');
 assert.equal(ctx.fundDisplayName({id:'IWV',name:'iShares Russell 3000 ETF'}),'IWV · iShares Russell 3000 ETF');
 assert.equal(ctx.fundDisplayName({id:'PORTFOLIO:MARLOW',name:'Marlow'}),'Marlow');
 const order='IWV XLV QQQ XLC XLK IBIT XLU'.split(' ').sort((a,b)=>ctx.fundSortKey(a).localeCompare(ctx.fundSortKey(b)));
 assert.deepEqual(order,'IBIT IWV QQQ XLC XLV XLK XLU'.split(' '));
 assert(app.includes("${SECTOR_ETFS[f.id]||''}"),'searching a sector name finds its fund');
});
test('IBIT uses only its own reference price without holdings or constituent requests',async()=>{
 const calls=[],source=createOnlineSource({fetcher:async path=>{
  calls.push(path);if(path.includes('data/nav?'))return Response.json({status:'no-data',return:null});
  assert(path.includes('prices?'));const symbol=new URL(path,'https://test').searchParams.get('symbol');
  return Response.json({meta:{symbol,currency:'USD',exchangeTimezoneName:'UTC'},timestamp:['2026-10-07','2026-10-08'].map(d=>Date.parse(d)/1000),indicators:{quote:[{close:[100,102]}],adjclose:[{adjclose:[100,102]}]}});
 }});
 const manifest={holdingsSource:'arcus',valuationDates:['2026-10-07','2026-10-08'],funds:['IBIT'].map(id=>({id,name:id,referenceOnly:true}))};
 const result=await source.load(manifest,['IBIT'],'2026-10-08','2026-10-08','USD');
 assert.equal(calls.length,2);assert.deepEqual(result.snapshots.map(s=>s.positions.length),[1]);assert.equal(result.snapshots[0].positions[0].weight,1);assert(result.sourceWarnings.every(s=>s.includes('no constituent allocation')));
 await source.load(manifest,['IBIT'],'2026-10-08','2026-10-08','USD');assert.equal(calls.length,3);assert.equal(calls.filter(p=>p.includes('prices?')).length,1);assert.equal(calls.filter(p=>p.includes('data/nav?')).length,2);
});
test('new Arcus-only funds do not fetch a nonexistent archive when issuer allocation fails',async()=>{
 const calls=[],source=createOnlineSource({fetcher:async path=>{calls.push(path);return Response.json({kind:'etf',fund:'XLU',source:{fund:{asOf:'2026-10-07',positions:[{id:'ABC',name:'ABC Inc',rawSymbol:'ABC',candidates:['ABC']}]},index:[]},main:{}});}});
 await assert.rejects(source.load({holdingsSource:'arcus',funds:[{id:'XLU',arcusOnly:true}]},['XLU'],'2026-10-08','2026-10-08','USD'),/complete dated issuer weights/);
 assert.equal(calls.length,1);assert(calls[0].includes('arcus-source'));
});
