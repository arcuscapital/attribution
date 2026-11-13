import {test} from 'node:test';
import assert from 'node:assert/strict';
import {resolveKnownListings,isNonListed,normalizeArcusPacket,primaryThemePath,assetKind} from '../site/arcus-source.mjs';
test('verified listing themes are reused without classifying a different company or private holding',()=>{
 const data={positions:[{ticker:'ABC',name:'Alpha Inc'},{ticker:'ABC',name:'Different Inc'},{symbol:'ABC',ticker:'ABC',name:'Alpha Inc'},{ticker:'ABC',name:'Alpha Inc Prvt',asset:'Private'}]};
 resolveKnownListings(data,[{ticker:'ABC',name:'Alpha Corporation',memberships:[['AI','Software'],['AI','Infrastructure'],['Technology','Software']]}]);
 assert.equal(data.positions[0].theme,'AI');assert.equal(data.positions[0].subTheme,'Software');assert.equal(data.positions[2].theme,'AI');assert.equal(data.positions[1].theme,undefined);assert.equal(data.positions[3].theme,undefined);
});
test('one main theme and one sub-theme per company from its Arcus path; folders and overlays are not themes',()=>{
 const nvda=[['Watch','Semis','Accelerators'],['Feb2025','Semis','Accelerators'],['Ai','Semis','Accelerators'],['Chips','Semis','Accelerators'],['Bai','Semis','Accelerators'],['AI Bottleneck','Custom Silicon',''],['JPM CPU Ecosystem','','']];
 assert.deepEqual(primaryThemePath(nvda),{theme:'Ai',subTheme:'Semis',path:'Ai › Semis › Accelerators'});
 assert.deepEqual(primaryThemePath([['Ai','Equipment','Deposition'],['Qualitysustainablegrow','Equipment','Deposition'],['AI Bottleneck','Lithography & Fab Tools','']]),{theme:'Ai',subTheme:'Equipment',path:'Ai › Equipment › Deposition'});
 assert.deepEqual(primaryThemePath([['Watch','Cooling','Datacentre'],['Infrastructure','Cooling','Datacentre'],['Industrial','Cooling','Datacentre'],['LOUP','Cooling','Datacentre']]),{theme:'Infrastructure',subTheme:'Cooling',path:'Infrastructure › Cooling › Datacentre'});
 assert.deepEqual(primaryThemePath([['AI Bottleneck','Photonics / CPO',''],['JPM AI Photonics & Optics','','']]),{theme:'AI Bottleneck',subTheme:'Photonics / CPO',path:'AI Bottleneck › Photonics / CPO'},'research overlay only when there is no Arcus theme');
 assert.deepEqual(primaryThemePath([['JPM US Drones','','']]),{theme:'JPM US Drones',subTheme:'',path:'JPM US Drones'});
 assert.deepEqual(primaryThemePath([['Watch','Software','Data']]),{theme:'Unclassified',subTheme:'Software',path:'Software › Data'},'a watchlist folder is never the theme');
 assert.deepEqual(primaryThemePath([['Feb2025','Software','Defence'],['Bai','Software','Defence'],['WCLD','','']]),{theme:'Unclassified',subTheme:'Software',path:'Software › Defence'},'an ETF holdings list is not a theme');
 assert.deepEqual(primaryThemePath([['Dow','Payments','Cards'],['JPM US Drones','','']]),{theme:'JPM US Drones',subTheme:'Payments',path:'JPM US Drones › Payments › Cards'});
 assert.equal(primaryThemePath([]),null); assert.equal(primaryThemePath(undefined),null);
});
test('cash row kinds: cash lines and money-market funds count as cash, equities do not',()=>{
 assert.equal(assetKind({asset:'Cash',name:'USD cash'}),'Cash'); assert.equal(assetKind({asset:'Equity',name:'USD CASH'}),'Cash');
 assert.equal(assetKind({asset:'Money Market',name:'BLK CSH FND TREASURY SL AGENCY'}),'Money Market');
 assert.equal(assetKind({asset:'Equity',name:'CASH COLLATERAL'}),'Money Market'); assert.equal(assetKind({asset:'Equity',name:'NVIDIA Corp'}),'Equity');
 assert.equal(assetKind(undefined),'Equity');
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
