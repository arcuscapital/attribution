import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveKnownListings,isNonListed,normalizeArcusPacket} from '../site/arcus-source.mjs';
test('verified listing themes are reused without classifying a different company or private holding',()=>{
 const data={positions:[{ticker:'ABC',name:'Alpha Inc'},{ticker:'ABC',name:'Different Inc'},{symbol:'ABC',ticker:'ABC',name:'Alpha Inc'},{ticker:'ABC',name:'Alpha Inc Prvt',asset:'Private'}]};
 resolveKnownListings(data,[{ticker:'ABC',name:'Alpha Corporation',memberships:[['AI','Software'],['AI','Infrastructure'],['Technology','Software']]}]);
 assert.deepEqual(data.positions[0].theme,['AI','Technology']);assert.deepEqual(data.positions[2].theme,['AI','Technology']);assert.equal(data.positions[1].theme,undefined);assert.equal(data.positions[3].theme,undefined);
});
test('public-source cash currencies remain cash, not missing equities',()=>{
 for(const name of ['South Korean Won','Taiwan Dollar','New Taiwan Dollar','Swedish Krona','Great British Pound','Australian Dollar','Hong Kong Dollar','OTHER ASSETS AND LIABILITIES']) assert(isNonListed({name}),name);
 assert(!isNonListed({name:'Dollar General Corporation'}));
});
test('a failed latest-source verification remains visible with the retained dated allocation',()=>{
 const result=normalizeArcusPacket({kind:'etf',fund:'TEST',allocationCheck:{warning:'Latest source unavailable; saved weights may be stale.'},source:{fund:{asOf:'2026-11-06',positions:[{name:'Alpha',rawSymbol:'ABC'}],allocation:{asOf:'2026-11-06',positions:[{name:'Alpha',ticker:'ABC',weight:100}]}}}});
 assert.match(result.warning,/may be stale/);assert.equal(result.snapshot.asOf,'2026-11-06');
});

test('name-only source holdings reuse their own verified security listing without guessing or bypassing explicit candidates',async()=>{
 const {allocationSnapshot}=await import('../site/arcus-source.mjs');
 const allocation={asOf:'2026-11-05',positions:[{name:'Samsung Electronics Co Ltd',weight:100}]};
 const members=[{id:'name:samsung',name:'Samsung Electronics Co Ltd',candidates:[]}];
 const index=[{id:'name:samsung',symbol:'005930.KS',status:'ready'}];
 assert.equal(allocationSnapshot('ETF',allocation,members,index).positions[0].symbol,'005930.KS');
 assert.equal(allocationSnapshot('ETF',allocation,members,[{...index[0],status:'pending'}]).positions[0].symbol,null);
 assert.equal(allocationSnapshot('ETF',allocation,[{...members[0],candidates:['DIFFERENT']}],index).positions[0].symbol,null);
 assert.equal(allocationSnapshot('ETF',allocation,[...members,{...members[0],id:'other'}],index).positions[0].symbol,null);
 for(const name of ['Net Current Assets','BNY Dreyfus Treasury Oblgtns Csh Mgt Ins'])assert(isNonListed({name}),name);
});
