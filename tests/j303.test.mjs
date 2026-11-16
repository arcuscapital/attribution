import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reviewDates,capWeights,sessions,buildIndexPath} from '../site/j303-core.mjs';
import {advanceDay,nextSession,scheduledJ303,MODEL_KEY,STATE_KEY,JOB_KEY} from '../cloudflare/j303-scheduled.mjs';
import {parsePublicAnchors} from '../cloudflare/j303-public.mjs';
import {fetchJseHistory,preserveHistory} from '../cloudflare/j303-market.mjs';
import {compare,returnSeries} from '../site/engine.mjs';
const close=(a,b,t=1e-10)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const model=(anchor='2026-12-10')=>({schemaVersion:1,version:'fixture',anchor,holdings:Array.from({length:10},(_,i)=>({symbol:'S'+i+'.JO',name:'Company '+i,weight:i===0?.2:.8/9,sector:'Test'})),calibrations:[]});
const packets=(m,end,fn=()=>100)=>m.holdings.map((p,i)=>({symbol:p.symbol,points:sessions(m.anchor,end).map(d=>[d,fn(i,d)])}));
test('quarterly dates continue into future years and handle the JSE holiday Friday',()=>{
 assert.deepEqual(reviewDates(2026,3),{reference:'2026-03-13',implementation:'2026-03-20',effective:'2026-03-23'});
 assert.equal(reviewDates(2025,3).implementation,'2025-03-20');assert.equal(reviewDates(2025,3).effective,'2025-03-24');
 assert.equal(reviewDates(2026,12).effective,'2026-12-21');assert.equal(reviewDates(2027,3).effective,'2027-03-23');
 assert.equal(reviewDates(2028,6).effective,'2028-06-19');
});
test('capping redistributes iteratively and preserves a full portfolio',()=>{
 const w=capWeights([80,15,1,1,1,1,1,1,1,1]);close(w.reduce((a,b)=>a+b,0),1);assert.ok(Math.max(...w)<=.1200000001);
 assert.throws(()=>capWeights([1,2,3]),/Insufficient/);assert.throws(()=>capWeights([NaN]),/Invalid/);
});
test('weights drift before and after review; cap uses reference close; rebalance creates no return',()=>{
 const m=model(),p=packets(m,'2026-12-22',(i,d)=>i===0&&d>='2026-12-14'?120:100),r=buildIndexPath(m,p,'2026-12-22');
 const at=d=>r.snapshots.find(s=>s.asOf===d).positions[0].weight;
 close(at('2026-12-10'),.2);close(at('2026-12-14'),.24/1.04);close(at('2026-12-18'),.144/1.024);
 assert.ok(at('2026-12-18')>.12,'drift between reference and implementation is preserved');
 close(r.levels.at(-1).value,104);assert.equal(r.events.length,1);
});
test('scheduled daily processing matches the historical engine across future rebalance',()=>{
 const m=model(),p=packets(m,'2026-12-22',(i,d)=>i===0&&d>='2026-12-14'?120:100),initial=buildIndexPath(m,p,m.anchor),expected=buildIndexPath(m,p,'2026-12-22');
 let state=initial.state;
 for(const date of sessions(nextSession(m.anchor),'2026-12-22'))state=advanceDay(state,m,Object.fromEntries(p.map(s=>[s.symbol,{date,value:new Map(s.points).get(date)}])),date);
 close(state.value,expected.state.value);for(const p of state.positions)close(p.weight,expected.snapshots.at(-1).positions.find(x=>x.symbol===p.symbol).weight);
 assert.equal(state.lastRebalance.effective,'2026-12-21');assert.equal(state.pending,null);
 assert.throws(()=>advanceDay(state,m,{},'2026-12-23'),/close missing/);
 assert.throws(()=>advanceDay(state,m,{},'2026-12-24'),/one session/);
});
test('reference-day plan includes new members on the effective date, not early',()=>{
 const m=model();m.holdings[9].from='2026-12-21';const p=packets(m,'2026-12-22'),first=buildIndexPath(m,p,m.anchor);let state=first.state;
 for(const date of sessions(nextSession(m.anchor),'2026-12-22')){
   state=advanceDay(state,m,Object.fromEntries(p.map(s=>[s.symbol,{date,value:100}])),date);
   if(date<'2026-12-18')assert.ok(!state.positions.some(x=>x.symbol==='S9.JO'));
 }
 assert.equal(state.positions.length,10);close(state.value,100);
});
test('a new constituent drifting during rebalance week matches scheduled reference-price treatment',()=>{
 const m=model();m.holdings[9].from='2026-12-21';
 const p=packets(m,'2026-12-22',(i,d)=>i===9&&d>='2026-12-14'?130:100);
 let state=buildIndexPath(m,p,m.anchor).state;
 for(const date of sessions(nextSession(m.anchor),'2026-12-22'))state=advanceDay(state,m,Object.fromEntries(p.map(s=>[s.symbol,{date,value:new Map(s.points).get(date)}])),date);
 const expected=buildIndexPath(m,p,'2026-12-22');
 for(const p of state.positions)close(p.weight,expected.snapshots.at(-1).positions.find(x=>x.symbol===p.symbol).weight);
 close(state.value,expected.state.value);
});
test('retrospective calibration applies only at its designated review close',()=>{
 const m=model(),p=packets(m,'2026-12-22');m.calibrations=[{effective:'2026-12-21',asOf:'2026-12-22',weights:{'S0.JO':.05}}];
 const r=buildIndexPath(m,p,'2026-12-22');close(r.snapshots.find(s=>s.asOf==='2026-12-17').positions[0].weight,.2);
 close(r.snapshots.find(s=>s.asOf==='2026-12-18').positions[0].weight,.05);
});
test('daily-linked engine reconciles drift and chart; default zero assumption cannot mask missing J303 data',()=>{
 const m=model('2026-11-09'),p=packets(m,'2026-11-12',(i,d)=>i===0?({'2026-11-09':100,'2026-11-10':120,'2026-11-11':110,'2026-11-12':130}[d]):100);
 const a=buildIndexPath(m,p,'2026-11-12'),b=buildIndexPath(m,p,'2026-11-12',{fund:'PORTFOLIO:SWIX'}),levels=[];
 for(const s of p)for(const [date,value] of s.points)levels.push({id:s.symbol,date,value,currency:'USD',basis:'price-return'});
 for(const [id,r] of [['PORTFOLIO:J303',a],['PORTFOLIO:SWIX',b]])for(const l of r.levels)levels.push({id,...l,currency:'USD',basis:'price-return'});
 const data={manifest:{schemaVersion:1},snapshots:[...a.snapshots,...b.snapshots],levels,dailyHoldings:true,valuationDates:a.levels.map(p=>p.date)},o={portfolio:'PORTFOLIO:J303',benchmark:'PORTFOLIO:SWIX',start:'2026-11-10',end:'2026-11-12',currency:'USD',assumeMissingZero:true,allowPartialReturns:true};
 const r=compare(data,o);assert.equal(r.status,'complete');close(r.returnA,.06);close(r.rows.reduce((s,p)=>s+p.ctrA,0),r.returnA);close(returnSeries(data,r,o).a.at(-1),6);
 const broken={...data,levels:levels.filter(l=>!(l.id==='S0.JO'&&l.date==='2026-11-11'))};assert.equal(compare(broken,o).status,'incomplete');
});
test('public disclosure parser rejects unknown members, partial tables and future dates',()=>{
 const m=model();const html='Top Holdings as at 30 Sep 2026</td></tr>'+m.holdings.map(p=>'<tr><td>'+p.symbol.slice(0,-3)+'</td><td>123</td><td>42</td><td>5.00%</td></tr>').join('')+'</table>';
 assert.equal(Object.keys(parsePublicAnchors(html,m,Date.parse('2026-11-16')).weights).length,10);
 assert.throws(()=>parsePublicAnchors(html.replace('S9','BAD'),m),/Unresolved/);assert.throws(()=>parsePublicAnchors(html.replace('2026','2099'),m),/date/);assert.throws(()=>parsePublicAnchors(html.replace('<td>5.00%</td>','<td></td>'),m),/Incomplete/);
});
test('market adapter excludes ordinary dividends and requires independent evidence for 100x unit repair',async()=>{
 const now=Date.parse('2026-11-16'),dates=['2026-11-11','2026-11-12','2026-11-13'];
 const raw={chart:{result:[{meta:{symbol:'S0.JO',currency:'ZAc'},timestamp:dates.map(d=>Date.parse(d)/1000),indicators:{quote:[{close:[100,1,110]}],adjclose:[{adjclose:[99,.99,109]}]}}]}};
 const fetcher=async url=>Response.json(url.includes('yahoo')?raw:{code:'S0',chart:dates.map((d,i)=>'['+Date.parse(d)+','+[100,100,110][i]+']').join(',')});
 const result=await fetchJseHistory('S0.JO',{fetcher,now});assert.deepEqual(result.points.map(p=>p[1]),[1,1,1.1]);assert.equal(result.unitCorrections,1);
});
test('scheduler publishes only a complete day and duplicate completed runs do no price work',async()=>{
 const m=model('2026-11-12'),p=packets(m,'2026-11-13'),initial=buildIndexPath(m,p,m.anchor).state,store=new Map([[MODEL_KEY,JSON.stringify(m)],[STATE_KEY,JSON.stringify(initial)]]);
 const kv={get:async(k,t)=>store.has(k)?t==='json'?JSON.parse(store.get(k)):store.get(k):null,put:async(k,v)=>store.set(k,v)};
 let calls=0;const fetcher=async url=>{calls++;const symbol=url.match(/chart\/([^?]+)/)?.[1];return Response.json({chart:{result:[{meta:{symbol,currency:'ZAc'},timestamp:[Date.parse('2026-11-12')/1000,Date.parse('2026-11-13')/1000],indicators:{quote:[{close:[10000,10000]}]}}]}});};
 const now=Date.parse('2026-11-14T08:00Z');await scheduledJ303({HOLDINGS_ARCHIVE:kv},now,fetcher);assert.equal(JSON.parse(store.get(STATE_KEY)).asOf,m.anchor);
 for(let i=0;i<4;i++)await scheduledJ303({HOLDINGS_ARCHIVE:kv},now+i*300000,fetcher);
 assert.equal(JSON.parse(store.get(STATE_KEY)).asOf,'2026-11-13');assert.equal(calls,10);await scheduledJ303({HOLDINGS_ARCHIVE:kv},now+1800000,fetcher);assert.equal(calls,10);
});
test('a newly reported split restates units without creating a capital loss',()=>{
 const m=model('2026-11-12'),initial=buildIndexPath(m,packets(m,m.anchor),m.anchor).state,date='2026-11-13';
 const quotes=Object.fromEntries(m.holdings.map((p,i)=>[p.symbol,{date,value:i===0?21:100,priorValue:i===0?20:100}]));
 const next=advanceDay(initial,m,quotes,date);close(next.value,101);close(next.units['S0.JO'],initial.units['S0.JO']*5);close(next.base['S0.JO'],initial.base['S0.JO']*5);
});
test('a shortened vendor response retains verified earlier history and adjusts it for splits',()=>{
 const old={symbol:'SRI.JO',currency:'ZAR',basis:'price-return',source:'Verified backup',points:[['2025-11-13',10],['2026-01-08',20],['2026-01-09',22],['2026-01-12',24]]};
 const next={...old,source:'Current vendor',points:[['2026-01-08',4],['2026-01-09',4.4],['2026-01-12',4.8],['2026-01-13',5]]};
 const merged=preserveHistory(old,next);assert.deepEqual(merged.points[0],['2025-11-13',2]);assert.equal(merged.points.length,5);assert.equal(merged.historyPrefix.source,'Verified backup');
 assert.equal(preserveHistory({...old,symbol:'OTHER.JO'},next),next);
 assert.equal(preserveHistory(old,{...next,points:[['2026-01-08',4],['2026-01-09',5],['2026-01-12',4.8]]}).points.length,3);
});
