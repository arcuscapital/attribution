import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare,returnSeries} from '../site/engine.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
const dates=['2026-11-10','2026-11-11','2026-11-12'];
function fixture(){
 const index='PORTFOLIO:J303',account='PORTFOLIO:BEST';
 const snapshots=[.5,.8].map((weight,i)=>({fund:index,asOf:dates[i],positions:[{id:'A',weight},{id:'B',weight:1-weight}]}));
 snapshots.push({fund:account,asOf:dates[0],source:'Arcus',positions:[{id:'A',weight:.8},{id:'CASH',weight:.2,asset:'Cash'}]});
 const levels=Object.entries({A:[100,120,144],B:[100,100,100],[index]:[100,110,127.6]}).flatMap(([id,values])=>values.map((value,i)=>({id,date:dates[i],value,currency:'USD',basis:'total-return'})));
 return {data:{manifest:{schemaVersion:1},snapshots,levels,valuationDates:dates,returnBasis:'total-return',dailyHoldings:true,dailyHoldingsFunds:[index],nonListedIds:['CASH']},
 options:{portfolio:index,benchmark:account,start:dates[1],end:dates[2],currency:'USD',allowApproximateHoldings:true,assumeMissingZero:true,allowPartialReturns:true}};
}
test('a drifting index keeps daily linking beside a saved allocation with explicitly assumed cash',()=>{
 const {data,options}=fixture(),before=structuredClone(data),r=compare(data,options);
 assert.equal(r.status,'partial');assert.equal(r.returnBasis,'total-return');assert.equal(r.contributionMethod,'mixed-holdings');
 close(r.returnA,.276);close(r.returnB,.352);close(r.activeReturn,-.076);
 close(r.rows.reduce((s,p)=>s+p.ctrA,0),r.returnA);close(r.rows.reduce((s,p)=>s+p.ctrB,0),r.returnB);
 assert.equal(r.rows.find(p=>p.id==='CASH').assumedZero,true);close(r.coverage.portfolio,1);close(r.coverage.benchmark,.8);
 assert.deepEqual(r.missing,[]);assert(r.notes.some(n=>n.includes('USER ASSUMPTION')));
 const graph=returnSeries(data,r,options);close(graph.a.at(-1),27.6);close(graph.b.at(-1),35.2);
 assert.deepEqual(data,before);
 const inverse=compare(data,{...options,portfolio:options.benchmark,benchmark:options.portfolio});
 close(inverse.returnA,r.returnB);close(inverse.returnB,r.returnA);close(inverse.activeReturn,-r.activeReturn);
});
test('an allocation cash assumption cannot hide a missing index observation',()=>{
 const {data,options}=fixture();data.levels=data.levels.filter(l=>!(l.id==='B'&&l.date===dates[2]));
 const r=compare(data,options);assert.equal(r.status,'incomplete');assert(r.missing.some(p=>p.fund===options.portfolio&&p.id==='B'));
});
