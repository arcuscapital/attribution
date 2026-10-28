import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineSource,arcusReturnLevels} from '../site/online.mjs';
import {compare} from '../site/engine.mjs';
test('Arcus completed returns compound without filling missing dates or mixing return bases',()=>{
 const r=arcusReturnLevels({A:{'2026-10-26':10,'2026-10-27':-10},B:{'2026-10-27':2}},['2026-10-23','2026-10-26','2026-10-27'],'2026-10-26','2026-10-27');
 assert.deepEqual([...r.used],['A']);assert.ok(Math.abs(r.levels.at(-1).value-99)<1e-10);assert.equal(r.levels[0].date,'2026-10-23');
});
test('current Arcus snapshots and returns replace archive without any vendor request when coverage exists',async()=>{
 let requests=[];
 const source=createOnlineSource({fetcher:async path=>{
  requests.push(path);const fund=new URL(path,'https://test').searchParams.get('fund');
  assert(path.startsWith('./data/arcus-holdings?'),'Unexpected archive or vendor request');
  return Response.json({snapshot:{fund,name:fund,asOf:fund.startsWith('PORTFOLIO:')?'2026-10-27':'2026-10-26',source:'Arcus',positions:[{id:'ABC',symbol:'ABC',ticker:'ABC',name:'ABC',weight:1}]},returns:{ABC:{'2026-10-27':3},BAI:{'2026-10-27':2}}});
 }});
 const manifest={schemaVersion:1,version:'1790000000000',holdingsSource:'arcus',valuationDates:['2026-10-26','2026-10-27']};
 assert.deepEqual(await source.calendar(manifest),manifest.valuationDates);
 const options={portfolio:'PORTFOLIO:IBKR',benchmark:'BAI',start:'2026-10-27',end:'2026-10-27',currency:'USD',allowApproximateHoldings:true,allowPartialReturns:true,allowSnapshotResearch:true};
 const data=await source.load(manifest,[options.portfolio,options.benchmark],options.start,options.end,'USD');
 const result=compare(data,options);
 assert.ok(Math.abs(result.returnA-.03)<1e-12);assert.ok(Math.abs(result.returnB-.02)<1e-12);
 assert.equal(requests.length,2);assert(result.holdingsWarnings.every(n=>!n.includes('2026-10-06')));
 assert.match(result.holdingsWarnings.join(' '),/current Arcus allocation dated 2026-10-27/);
 await source.load(manifest,[options.portfolio,options.benchmark],options.start,options.end,'USD');assert.equal(requests.length,4,'Holdings must refresh on every comparison');
});
