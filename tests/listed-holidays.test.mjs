import {test} from 'node:test';
import assert from 'node:assert/strict';
import {valuationPrices} from '../site/price-data.mjs';
import {createOnlineSource,missingReturnReason} from '../site/online.mjs';
import {compare} from '../site/engine.mjs';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const japan=(points,extra={})=>({symbol:'4004.T',currency:'JPY',timeZone:'Asia/Tokyo',points,...extra});

test('Tokyo holiday uses immediately preceding open-session close without mutating input',()=>{
 const data=japan([['2026-10-09',100],['2026-10-13',90]]),before=JSON.stringify(data);
 const aligned=valuationPrices(data,['2026-10-12','2026-10-13']);
 assert.deepEqual(aligned.points,[['2026-10-09',100],['2026-10-12',100],['2026-10-13',90]]);
 assert.deepEqual(aligned.carried,[{date:'2026-10-12',priceDate:'2026-10-09'}]);
 assert.equal(JSON.stringify(data),before);
});
test('missing open-session quotes and pre-listing history are never bridged',()=>{
 for(const points of [[['2026-10-08',100],['2026-10-13',90]],[['2026-10-13',90]],[]]) {
  const aligned=valuationPrices(japan(points),['2026-10-09','2026-10-12']);
  assert.deepEqual(aligned.points,points);assert.deepEqual(aligned.carried,[]);
 }
});
test('verified multi-day Tokyo closure works; unverified markets/years and FX stay exact-date-only',()=>{
 const points=[['2026-09-18',100],['2026-09-24',110]],dates=['2026-09-21','2026-09-22','2026-09-23'];
 assert.equal(valuationPrices(japan(points),dates).carried.length,3);
 for(const extra of [{symbol:'4004.HK'},{currency:'USD'},{timeZone:'UTC'},{symbol:'JPYUSD=X'}])
  assert.deepEqual(valuationPrices(japan(points,extra),dates).carried,[]);
 assert.equal(valuationPrices(japan([['2027-10-08',100]]),['2027-10-11']).carried.length,1);
 assert.equal(valuationPrices(japan([['2025-10-10',100]]),['2025-10-13']).carried.length,0);
 assert.equal(valuationPrices(japan([['2025-12-31',100]]),['2026-01-01']).carried.length,0);
});
test('failed prices do not reclassify listed or unresolved identities as private',()=>{
 assert.match(missingReturnReason({symbol:'4062.T',asset:'Equity'}),/^Listed security/);
 assert.match(missingReturnReason({asset:'Private'}),/^Private\/unlisted/);
 assert.match(missingReturnReason({asset:'Cash'}),/^Cash/);
 for(const asset of ['Unmapped','Private/Unmapped','Equity',''])
  assert.match(missingReturnReason({asset}),/^Listing unresolved/);
});

async function loadFixture({missingFx=false,missingOpen=false}={}) {
 const snapshots={
  'PORTFOLIO:TEST':{fund:'PORTFOLIO:TEST',asOf:'2026-10-09',positions:[{id:'4062.T',symbol:'4062.T',name:'Ibiden',asset:'Equity',weight:1}]},
  ETF:{fund:'ETF',asOf:'2026-10-09',positions:[{id:'4004.T',symbol:'4004.T',name:'Resonac',asset:'Equity',weight:1}]},
 };
 const requests=[];
 const source=createOnlineSource({fetcher:async path=>{
  const u=new URL(path,'https://fixture.test');
  if(u.searchParams.has('fund'))return Response.json(snapshots[u.searchParams.get('fund')]);
  const symbol=u.searchParams.get('symbol');requests.push(symbol);
  const jp=symbol.endsWith('.T'),fx=symbol==='JPYUSD=X';
  let dates=jp?['2026-10-09','2026-10-13']:['2026-10-09','2026-10-12','2026-10-13'];
  let values=jp?[100,symbol==='4062.T'?90:80]:fx?[.01,.012,.011]:[100,100,99];
  if(missingFx&&fx){dates=dates.filter((_,i)=>i!==1);values=values.filter((_,i)=>i!==1);}
  if(missingOpen&&jp){dates=dates.slice(1);values=values.slice(1);}
  return Response.json({meta:{symbol,currency:jp?'JPY':'USD',exchangeTimezoneName:jp?'Asia/Tokyo':'UTC'},
   timestamp:dates.map(d=>Date.parse(d+'T00:00:00Z')/1000),
   indicators:fx?{quote:[{close:values}]}:{adjclose:[{adjclose:values}]}});
 }});
 const data=await source.load({schemaVersion:1,version:'1790000000000'},['PORTFOLIO:TEST','ETF'],'2026-10-12','2026-10-13','USD');
 return {data,requests,options:{portfolio:'PORTFOLIO:TEST',benchmark:'ETF',start:'2026-10-13',end:'2026-10-13',currency:'USD',allowApproximateHoldings:true,allowPartialReturns:true}};
}
test('listed Japanese holdings flow through FX, security returns, products and headline on reopening',async()=>{
 const {data,requests,options}=await loadFixture();
 assert.equal(requests.filter(s=>s==='JPYUSD=X').length,1);
 close(data.levels.find(l=>l.id==='4062.T'&&l.date==='2026-10-12').value,1.2);
 const r=compare(data,options);
 close(r.rows.find(r=>r.id==='4062.T').securityReturn,.99/1.2-1);
 close(r.rows.find(r=>r.id==='4004.T').securityReturn,.88/1.2-1);
 close(r.returnA,.99/1.2-1);close(r.returnB,-.01);close(r.coverage.portfolio,1);
 assert.equal(data.priceNotes.length,2);assert.match(data.priceNotes[0],/2026-10-12 uses 2026-10-09/);
 // The holiday has zero LOCAL move but still changes value in USD with FX.
 close(compare(data,{...options,start:'2026-10-12',end:'2026-10-12'}).returnA,.2);
 close(compare(data,{...options,start:'2026-10-12'}).returnA,-.01);
});
test('holiday carry does not manufacture a return when FX or last open-session close is missing',async()=>{
 for(const settings of [{missingFx:true},{missingOpen:true}]) {
  const {data,options}=await loadFixture(settings);
  assert.equal(compare(data,options).returnA,null);
  assert.equal(data.levels.some(l=>l.id==='4062.T'&&l.date==='2026-10-12'),false);
 }
});
