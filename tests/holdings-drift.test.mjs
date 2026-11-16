import {test} from 'node:test';
import assert from 'node:assert/strict';
import {driftHoldings,advanceUnits} from '../site/holdings-drift.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12);
test('a static disclosed portfolio drifts without reference to market, currency or index rules',()=>{
 const opening=[{id:'AAPL',weight:.6,name:'Example'},{id:'MSFT',weight:.4}];
 const first=driftHoldings(opening,{AAPL:.1,MSFT:0});close(first.return,.06);close(first.positions[0].weight,.66/1.06);
 const second=driftHoldings(first.positions,{AAPL:-.1,MSFT:.2});close((1+first.return)*(1+second.return)-1,.074);
 close(second.positions.reduce((s,p)=>s+p.weight,0),1);assert.equal(opening[0].weight,.6);assert.equal(first.positions[0].name,'Example');
});
test('a new filing resets the allocation only when its adapter supplies the replacement snapshot',()=>{
 const old=driftHoldings([{id:'A',weight:.6},{id:'B',weight:.4}],{A:.2,B:0});
 const next=driftHoldings([{id:'A',weight:.2},{id:'B',weight:.8}],{A:.1,B:0});close(next.return,.02);assert.notEqual(next.positions[0].weight,old.positions[0].weight);
});
test('unit and weight forms agree and never treat missing returns as zero',()=>{
 const r=advanceUnits({A:3,B:2},{A:20,B:20},{A:22,B:20});close(r.return,.06);close(r.positions[0].weight,.66/1.06);
 assert.throws(()=>driftHoldings([{id:'A',weight:1}],{}),/Missing/);assert.throws(()=>driftHoldings([{id:'A',weight:.5}],{A:0}),/summing/);
 assert.throws(()=>advanceUnits({A:1},{A:100},{A:NaN}),/Invalid/);
});
