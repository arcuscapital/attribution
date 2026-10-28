import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createOnlineSource,arcusReturnLevels} from '../site/online.mjs';
import {compare} from '../site/engine.mjs';
import {normalizeArcusPacket} from '../site/arcus-source.mjs';

test('browser projects raw D1 packets, preserves duplicate weights and rejects stale seeds',()=>{
 const packet={kind:'etf',fund:'BAI',source:{fund:{asOf:'2026-10-27',positions:[{id:'abc',name:'ABC Inc',rawSymbol:'ABC',candidates:['ABC']}]},index:[{id:'abc',symbol:'ABC',status:'ready',data:{oneDOn:'2026-10-27',dailyReturns:{'2026-10-27':1}}}]},seed:{asOf:'2026-10-27',positions:[{ticker:'ABC',name:'ABC Inc',asset:'Equity',weight:60},{ticker:'ABC',name:'ABC Inc',asset:'Equity',weight:40}]},main:{returns:{ABC:{oneDOn:'2026-10-27',dailyReturns:{'2026-10-27':2}}},companies:[]}};
 const r=normalizeArcusPacket(packet);assert.deepEqual(r.snapshot.positions.map(p=>[p.id,p.weight]),[['ABC',.6],['ABC',.4]]);assert.equal(r.returns.ABC['2026-10-27'],2);
 const stale=normalizeArcusPacket({...packet,seed:{...packet.seed,asOf:'2026-10-26'}});assert.equal(stale.snapshot,null);assert.match(stale.warning,/dated archive/);
});
test('Arcus completed returns compound without filling missing dates or mixing return bases',()=>{
 const r=arcusReturnLevels({A:{'2026-10-26':10,'2026-10-27':-10},B:{'2026-10-27':2}},['2026-10-23','2026-10-26','2026-10-27'],'2026-10-26','2026-10-27');
 assert.deepEqual([...r.used],['A']);assert.ok(Math.abs(r.levels.at(-1).value-99)<1e-10);assert.equal(r.levels[0].date,'2026-10-23');
});
test('current Arcus snapshots and returns replace archive without any vendor request when coverage exists',async()=>{
 let requests=[];
 const source=createOnlineSource({fetcher:async path=>{
  requests.push(path);const fund=new URL(path,'https://test').searchParams.get('fund');
  assert(path.startsWith('./data/arcus-source?'),'Unexpected archive or vendor request');
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

test('Arcus portfolio projection retains signed source weights/cash/date and removes private account values',async()=>{
 const {portfolioSnapshot}=await import('../site/arcus-source.mjs');
 const p=portfolioSnapshot('PORTFOLIO:IBKR',{name:'IBKR',asOf:'2026-10-27',status:'ready',accountValue:{amount:12345},holdings:[{ticker:'ABC',sourceTicker:'ABC',name:'ABC',mappingStatus:'verified',weightPct:105,positionQty:99}],cashWeights:[{currency:'USD',asOf:'2026-10-27',weightPct:-5}]});
 assert.equal(p.asOf,'2026-10-27');assert.deepEqual(p.positions.map(p=>p.weight),[1.05,-.05]);assert.equal(p.source,'Arcus');
 assert(!JSON.stringify(p).includes('12345'));assert(!JSON.stringify(p).includes('positionQty'));
});
test('ETF mapping requires the same named verified listing; private preferred shares are not ordinary shares',async()=>{
 const {allocationSnapshot,completedReturns}=await import('../site/arcus-source.mjs');
 const a={asOf:'2026-10-26',positions:[{ticker:'ABC',name:'ABC Inc',weight:90,asset:'Equity'},{ticker:'PREF',name:'Private Series C Prvt',weight:10,asset:'Equity'}]};
 const members=[{id:'abc',name:'ABC Inc',rawSymbol:'ABC',candidates:['ABC']}],index=[{id:'abc',status:'ready',symbol:'ABC'}];
 const s=allocationSnapshot('BAI',a,members,index);assert.equal(s.positions[0].id,'ABC');assert.equal(s.positions[1].asset,'Private');assert.equal(s.positions[1].symbol,null);
 assert.equal(allocationSnapshot('BAI',a,[{...members[0],name:'Different business'}],index).positions[0].symbol,null);
 assert.deepEqual(completedReturns({oneDOn:'2026-10-27',dailyReturns:{'2026-10-26':0,'2026-10-27':2,'2026-10-28':10}},'2026-10-28'),{'2026-10-26':0,'2026-10-27':2});
});
test('a source spelling can reuse an exact named Arcus company, never a bare ticker or private preferred share',async()=>{
 const {resolveKnownListings}=await import('../site/arcus-source.mjs');
 const snapshot={positions:[{ticker:'APH',name:'AMPHENOL CORP-CL A',asset:'Equity'},{ticker:'OKTA',name:'OKTA CLASS A',asset:'Equity'},{ticker:'APH',name:'Different company',asset:'Equity'},{ticker:'APH',name:'Amphenol',asset:'Private'}]};
 resolveKnownListings(snapshot,[{ticker:'APH',name:'Amphenol'},{ticker:'OKTA',name:'Okta Inc'}]);
 assert.deepEqual(snapshot.positions.map(p=>p.symbol),['APH','OKTA',undefined,undefined]);
});
