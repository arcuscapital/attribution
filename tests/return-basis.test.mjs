import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cashDividendLevels,periodBasis,holdingsReturnLevels} from '../site/price-data.mjs';
import {completedPrices} from '../site/price-data.mjs';
import {fetchJseHistory,preserveHistory} from '../cloudflare/j303-market.mjs';
import {createOnlineSource} from '../site/online.mjs';
import {compare} from '../site/engine.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const stamp=d=>Date.parse(d+'T12:00:00Z')/1000;
test('custom dates count trading sessions rather than calendar days',()=>{
 const days=['2026-11-12','2026-11-13','2026-11-16'];
 assert.equal(periodBasis(days,'2026-11-13','2026-11-15'),'price-return');
 assert.equal(periodBasis(days,'2026-11-12','2026-11-15'),'total-return');
});
test('SA dividends are applied once on ex-date; changing the requested end preserves all later returns',()=>{
 const pts=[['2026-09-08',324.81],['2026-09-09',311.22],['2026-09-10',315]];
 const levels=cashDividendLevels(pts,[{date:'2026-09-09',amount:9.02}]);
 close(levels[1][1]/levels[0][1]-1,(311.22+9.02)/324.81-1);
 close(levels[2][1]/levels[1][1]-1,315/311.22-1);
 assert.notEqual(levels[2][1]/100,315/324.81);
 assert.throws(()=>cashDividendLevels(pts,[{date:'2026-09-09',amount:NaN}]),/dividend/);
 assert.throws(()=>cashDividendLevels([pts[0],pts[2]],[{date:'2026-09-09',amount:9.02}]),/ex-date/);
});
test('delisted Curro has bounded issuer-confirmed income coverage, never future total returns',async()=>{
 const dates=['2025-04-08','2025-04-09','2026-01-06','2026-11-13'];
 const p=await fetchJseHistory('COH.JO',{start:dates[0],end:dates.at(-1),fetcher:async url=>url.includes('yahoo')?new Response('',{status:404}):Response.json({code:'COH',chart:dates.map((d,i)=>`[${stamp(d)*1000},${[1000,990,1461,1461][i]}]`).join(',')})});
 assert.equal(p.returnVersion,1);assert.equal(p.totalReturnThrough,'2026-01-06');
 close(p.totalReturnPoints[1][1]/100,(9.9+.166)/10);assert.equal(p.totalReturnPoints.at(-1)[0],'2026-01-06');
});
test('SRI restores only its verified dividend-free prefix and uses declared rand cash amounts',async()=>{
 const dates=['2026-01-08','2026-01-28','2026-01-29'],earlier=['2025-10-22','2025-11-13','2026-01-07'];
 const raw={meta:{symbol:'SRI.JO',currency:'ZAc'},timestamp:dates.map(stamp),events:{dividends:{x:{date:stamp(dates[1]),amount:34.614876}}},indicators:{quote:[{close:[1800,1780,1800]}]}};
 const p=await fetchJseHistory('SRI.JO',{start:'2025-10-01',end:dates.at(-1),fetcher:async url=>Response.json(url.includes('yahoo')?{chart:{result:[raw]}}:{code:'SRI',chart:[...earlier,...dates].map(d=>`[${stamp(d)*1000},1800]`).join(',')})});
 assert.equal(p.totalReturnFrom,'2025-11-13');assert.equal(p.dividends[0].amount,.3357347);
 close(p.totalReturnPoints.find(([d])=>d==='2026-01-28')[1]/100,(17.8+.3357347)/18);
});
test('SA market adapter ignores the incorrect adjusted series, preserves dividends and verifies cents/rands',async()=>{
 const dates=['2026-05-12','2026-05-13','2026-05-14'];let calls=0;
 const raw={meta:{symbol:'STXCAP.JO',currency:'ZAc'},timestamp:dates.map(stamp),events:{dividends:{a:{date:stamp(dates[1]),amount:87.23}}},indicators:{quote:[{close:[59.47,5881,5900]}],adjclose:[{adjclose:[58.5977,5881,5900]}]}};
 const fetcher=async url=>{calls++;return Response.json(url.includes('yahoo')?{chart:{result:[raw]}}:{code:'STXCAP',chart:dates.map((d,i)=>`[${stamp(d)*1000},${[5947,5881,5900][i]}]`).join(',')});};
 const out=await fetchJseHistory('STXCAP.JO',{fetcher,start:dates[0],end:dates[2]});
 assert.equal(calls,2);assert.equal(out.unitCorrections,1);close(out.points[0][1],59.47);
 close(out.totalReturnPoints[1][1]/100,(58.81+.8723)/59.47);
 assert.deepEqual(out.dividends,[{date:dates[1],amount:.8723000000000001}]);
});
test('price-only fallback cannot masquerade as total-return history',async()=>{
 const result={meta:{symbol:'ABC.JO',currency:'ZAR'},timestamp:[stamp('2026-11-13')],indicators:{quote:[{close:[10]}],adjclose:[{adjclose:[null]}]}};
 assert.throws(()=>completedPrices(result,{symbol:'ABC.JO',start:'2026-11-13',end:'2026-11-13'}),/total-return/);
 assert.equal(completedPrices(result,{symbol:'ABC.JO',start:'2026-11-13',end:'2026-11-13',basis:'price-return'}).points[0][1],10);
});
test('incremental history retains dividend income and restates old prices/events for a split',()=>{
 const old={symbol:'A.JO',currency:'ZAR',basis:'price-return',returnVersion:1,totalReturnFrom:'2026-01-01',points:[['2026-01-01',10],['2026-01-02',9],['2026-01-05',10],['2026-01-06',11]],dividends:[{date:'2026-01-02',amount:1}]};
 const next={...old,points:old.points.slice(1).map(([d,v])=>[d,v/5]),dividends:[{date:'2026-01-02',amount:.2}]};
 const merged=preserveHistory(old,next);close(merged.points[0][1],2);close(merged.totalReturnPoints[1][1],100);
 close(merged.totalReturnPoints.at(-1)[1]/100,11/9);
});
test('total-return reference uses opening price-drift weights without changing holdings',()=>{
 const snapshots=[{asOf:'2026-11-12',positions:[{id:'A',weight:.5},{id:'B',weight:.5}]},{asOf:'2026-11-13',positions:[{id:'A',weight:.6},{id:'B',weight:.4}]}];
 const before=structuredClone(snapshots),dates=['2026-11-12','2026-11-13','2026-11-16'];
 const lookup=(id,d)=>({value:(id==='A'?[100,110,121]:[100,100,100])[dates.indexOf(d)]});
 const result=holdingsReturnLevels(snapshots,dates,lookup);close(result.at(-1).value,105*1.06);assert.deepEqual(snapshots,before);
 assert.throws(()=>holdingsReturnLevels(snapshots,dates,()=>null),/unavailable/);
});
test('both sides use US adjusted history for multi-session periods, ignoring saved daily price returns',async()=>{
 const dates=['2026-11-10','2026-11-11','2026-11-12'],requested=[];
 const source=createOnlineSource({fetcher:async path=>{
   const url=new URL(path,'https://test'),id=url.searchParams.get('symbol'),fund=url.searchParams.get('fund');
   if(path.includes('arcus-source'))return Response.json({snapshot:{fund,asOf:dates[0],source:'Arcus',positions:[{id:'ABC',symbol:'ABC',ticker:'ABC',name:'ABC',weight:1}]},returns:{ABC:{[dates[1]]:50,[dates[2]]:50},A:{[dates[1]]:50,[dates[2]]:50},B:{[dates[1]]:50,[dates[2]]:50}}});
   if(path.includes('holdings'))return Response.json({fund,asOf:dates[0],positions:[{id:'ABC',symbol:'ABC',weight:1}]});
   if(path.includes('nav'))return Response.json({status:'no-data'});
   requested.push(id);return Response.json({meta:{symbol:id,currency:'USD',exchangeTimezoneName:'UTC'},timestamp:dates.map(stamp),indicators:{quote:[{close:[100,90,99]}],adjclose:[{adjclose:[90,90,99]}]}});
 }});
 const manifest={schemaVersion:1,version:'1',holdingsSource:'arcus',valuationDates:dates,funds:[{id:'A'},{id:'B'}]};
 const data=await source.load(manifest,['A','B'],dates[1],dates[2],'USD');
 assert.equal(data.returnBasis,'total-return');assert(data.levels.every(l=>l.basis==='total-return'));
 const options={portfolio:'A',benchmark:'B',start:dates[1],end:dates[2],currency:'USD',allowSnapshotResearch:true,allowApproximateHoldings:true};
 const result=compare(data,options);close(result.returnA,.1);close(result.returnB,.1);
 const count=requested.length,one=await source.load(manifest,['A','B'],dates[1],dates[1],'USD');
 assert.equal(one.returnBasis,'price-return');close(one.levels.find(l=>l.id==='ABC'&&l.date===dates[1]).value,150);
 assert.equal(requested.length,count,'verified daily price cache is reusable only for one session');
});
