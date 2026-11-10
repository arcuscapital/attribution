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
