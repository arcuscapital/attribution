import test from 'node:test';
import assert from 'node:assert/strict';
import {archiveSatrix,basketHistory,BASKET_PREFIX,makeSatrixSnapshot,parseSatrixETF,scheduledSatrix,SOURCE_HEALTH,verifySatrixClose} from '../cloudflare/satrix-baskets.mjs';
import {J303,buildIndexPath,buildSatrixPath,sessions} from '../site/j303-core.mjs';
import {liveDataset} from '../site/online.mjs';
import {fetchJseHistory} from '../cloudflare/j303-market.mjs';
const now=Date.parse('2026-11-19T10:00:00Z');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,a+' vs '+b);
const row=(d,i)=>'<tr>'+['S'+i,'Share '+i,'Sector',10,'2.00%',1000,d].map(c=>'<td>'+c+'</td>').join('')+'</tr>';
const mobile='<table class="composition-table visible-xs">'+Array.from({length:50},(_,i)=>'<tr><td>CODE</td><td>S'+i+'</td></tr><tr><td>WEIGHT</td><td>2.00%</td></tr>').join('')+'</table>';
const page='<table id="constituentDetails39"><tbody><tr><td>Wrong fund</td></tr></tbody></table><table id="constituentDetails54"><thead><tr>'+['CODE','SHARE NAME','INDUSTRY','SHARES <sup>*</sup>','WEIGHT','MARKET CAP','CLOSING'].map(c=>'<th>'+c+'</th>').join('')+'</tr></thead><tbody>'+Array.from({length:50},(_,i)=>row(100+i,i)).join('')+'</tbody></table>'+mobile+'<script>var constituentDetailsFundId = 54; var constituentDetailsFundName = "Satrix Capped All Share ETF"; var constituentDetailsFundCode = "STXCAP"; var constituentDetailsFundUpdatedDate = {"year":2026,"monthValue":11,"dayOfMonth":19};</script>';
const prices=async symbol=>{const n=Number(symbol.match(/\d+/)[0]);return {symbol,currency:'ZAR',points:[['2026-11-17',100+n],['2026-11-18',120+n]]};};
function memory(){
  const store=new Map();
  return {store,async put(k,v){store.set(k,v);},async get(k,t){
    const one=id=>store.has(id)?t==='json'?JSON.parse(store.get(id)):store.get(id):null;
    return Array.isArray(k)?new Map(k.map(i=>[i,one(i)])):one(k);
  },async list({prefix}){return {list_complete:true,keys:[...store.keys()].filter(k=>k.startsWith(prefix)).sort().map(name=>({name}))};}};
}
test('only the complete STXCAP ETF table is accepted, with a uniquely supported trading date',async()=>{
  const b=await makeSatrixSnapshot(page,{now,prices});assert.equal(b.asOf,'2026-11-17');assert.equal(b.publishedOn,'2026-11-19');assert.equal(b.matched.length,5);assert.equal(b.rows.length,50);
  const blocked=new Set(b.matched.slice(0,1)),intermittent=s=>blocked.has(s)?Promise.reject(Error('feed offline')):prices(s);
  assert.equal((await verifySatrixClose(b,intermittent,now)).matched.length,4);
  blocked.add(b.matched[1]);await assert.rejects(()=>verifySatrixClose(b,intermittent,now),/uniquely/);
  for(const bad of [page.replace('STXCAP','STXOTHER'),page.replace(row(100,0),''),page.replace('S49</td>','S48</td>'),page.replace('2.00%','12.00%'),page.replace('CLOSING','OPENING')])assert.throws(()=>parseSatrixETF(bad,now));
  await assert.rejects(()=>verifySatrixClose(b,async s=>{const p=await prices(s);p.points[1][1]=p.points[0][1];return p;},now),/uniquely/);
});
test('a correction replaces its close, earlier and later anchors survive, failed fetch retains the archive',async()=>{
  const kv=memory(),b=await makeSatrixSnapshot(page,{now,prices});
  await archiveSatrix(kv,{...b,asOf:'2026-11-19',digest:'later'});
  await archiveSatrix(kv,b);
  const corrected={...b,digest:'correction',observedAt:new Date(now+1000).toISOString()};
  await archiveSatrix(kv,corrected);await archiveSatrix(kv,b);
  assert.equal((await kv.get(BASKET_PREFIX+b.asOf,'json')).digest,'correction');
  assert.ok(await kv.get('j303:stxcap:revision:'+b.asOf+':'+b.digest));
  const all=await basketHistory(kv,'2026-11-18','2026-11-20');
  assert.deepEqual(all.map(x=>x.digest),['correction','later']);near(all[0].rows.reduce((s,x)=>s+x.weight,0),1);
  await scheduledSatrix({HOLDINGS_ARCHIVE:kv},now,async()=>new Response('',{status:503}));
  assert.equal((await kv.get(SOURCE_HEALTH,'json')).status,'retained-last-basket');assert.equal((await basketHistory(kv,'2026-11-20','2026-11-20'))[0].digest,'later');
  let onWeekend=0;
  await scheduledSatrix({HOLDINGS_ARCHIVE:kv},Date.parse('2026-11-21T06:00:00Z'),async()=>{onWeekend++;return new Response('',{status:503});});
  assert.equal(onWeekend,1);
});
test('legacy closes and levels survive the cutover; a later disclosure changes closing membership, subsequent drift and no prior return',()=>{
  const days=sessions('2026-12-14','2026-12-22'),symbols=Array.from({length:10},(_,i)=>'S'+i+'.JO');
  const model={schemaVersion:1,anchor:days[0],holdings:symbols.map(symbol=>({symbol,weight:.1}))};
  const packets=symbols.map((symbol,i)=>({symbol,points:days.map((d,j)=>[d,i===0?100+j*10:100])}));
  const b=(d,values)=>({asOf:d,publishedOn:'2026-12-23',rows:values.map(([i,weight])=>({symbol:symbols[i],weight}))});
  const first=b(days[1],[[0,.6],[1,.4]]),second=b(days[3],[[1,.25],[2,.75]]);
  const original=buildIndexPath(model,packets,days[1]),full=buildSatrixPath(model,packets,days.at(-1),[first,second],days[0]);
  assert.deepEqual(full.snapshots[0],original.snapshots[0]);assert.deepEqual(full.levels.slice(0,2),original.levels);
  near(full.snapshots[1].positions[0].weight,.6);
  const next=.6*(120/110)/(1+.6*(120/110-1));near(full.snapshots[2].positions[0].weight,next);
  assert.deepEqual(full.snapshots[3].positions.map(p=>p.id),['S1.JO','S2.JO']);near(full.snapshots[3].positions[0].weight,.25);
  // The synthetic quarterly review falls on this Friday; it cannot recap an issuer basket.
  assert.ok(full.events.every(e=>e.kind==='STXCAP disclosure'));
  near(full.levels.at(-1).value,full.levels[3].value);
  const without=buildSatrixPath(model,packets,days.at(-1),[first],days[0]);
  assert.deepEqual(without.levels.slice(0,4),full.levels.slice(0,4));assert.notEqual(without.levels.at(-1).value,full.levels.at(-1).value);
  assert.throws(()=>buildSatrixPath(model,packets.map((p,i)=>i===0?{...p,points:p.points.filter(([d])=>d!==days[2])}:p),days.at(-1),[first,second],days[0]),/closing price unavailable/);
});
test('Live displays floated ending weights and leaves opening attribution intact; before the session it displays the completed valuation',()=>{
  const prev='2026-11-18',date='2026-11-19';
  const snap={fund:J303,asOf:prev,basketDate:'2026-11-17',positions:[{id:'A.JO',weight:.6},{id:'B.JO',weight:.4}]};
  const base={valuationDates:['2026-11-17',prev],dailyHoldings:true,dailyHoldingsFunds:[J303],snapshots:[snap],
    levels:[...['A.JO','B.JO',J303].map(id=>({id,date:prev,value:100,basis:'price-return'})),{id:'USDZAR=X',date:prev,value:1,basis:'fx'}]};
  const pre=liveDataset(base,{}, {at:now});assert.equal(pre.live.date,prev);assert.equal(pre.live.closing,true);
  const d=liveDataset(base,{'A.JO':{p:110,l:10,lb:'regular',ld:date,qd:date}},{currencyOf:()=>'ZAR',at:now});
  near(d.snapshots[0].positions[0].weight,.6);near(d.snapshots.at(-1).positions[0].weight,.66/1.06);assert.deepEqual(d.snapshots.at(-1).carried,['B.JO']);
  near(d.levels.find(l=>l.id===J303&&l.date===date).value,106);
});
test('missing Yahoo close is filled only with dated corroboration and retains ex-date dividend',async()=>{
  const days=['2026-11-16','2026-11-17','2026-11-18'];
  const stamp=d=>Date.parse(d+'T12:00:00Z')/1000;
  const probe=async last=>fetchJseHistory('XYZ.JO',{start:days[0],end:days[2],now,fetcher:async url=>Response.json(url.includes('yahoo')?
    {chart:{result:[{meta:{symbol:'XYZ.JO',currency:'ZAc',regularMarketTime:stamp(days[2]),regularMarketPrice:9900},timestamp:days.map(stamp),events:{dividends:{one:{date:stamp(days[2]),amount:100}}},indicators:{quote:[{close:[10000,10000,null]}]}}]}}:
    {code:'XYZ',chart:days.map((d,i)=>'['+(stamp(d)*1000)+','+(i===2?last:10000)+']').join(',')})});
  const good=await probe(9900);assert.deepEqual(good.points.at(-1),[days[2],99]);near(good.totalReturnPoints.at(-1)[1],100);
  assert.deepEqual((await probe(99)).points.at(-1),[days[1],100]);
});
