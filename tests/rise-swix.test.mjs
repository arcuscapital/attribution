import test from 'node:test';import assert from 'node:assert/strict';
import {estimate,validateReport,liveReturn,historyReturn,completeQuotes,period,previous,reported,etnPriceReturn,sortRiseGroups,withShareReturns,collectQuotes,liveReturns} from '../site/rise-swix-core.mjs';
const report=()=>({schemaVersion:1,version:'test',currency:'ZAR',period:['2026-11-04','2026-11-05'],total:{values:[100,100,2,3,2,3]},groups:[{name:'Example',values:[100,100,2,3,2,3],children:[{id:'A',name:'Synthetic A',symbol:'TEST.JO',values:[60,20,2,3,1.2,.6]},{id:'B',name:'Synthetic B',symbol:'OTHER.JO',values:[40,80,2,3,.8,2.4]}]}]});
test('report reconciles and rejects modified sector, currency and duplicates',()=>{validateReport(report());for(const change of [r=>r.currency='USD',r=>r.groups[0].values[0]=90,r=>r.groups[0].children[1].id='A']){const r=report();change(r);assert.throws(()=>validateReport(r));}});
test('fixed weights reconcile holdings, sectors and both funds',()=>{const r=estimate(report(),{'TEST.JO':10,'OTHER.JO':-5});assert.deepEqual(r.total.values,[100,100,4,-2,4,-2]);assert.equal(r.groups[0].children[0].values[4],6);assert.equal(r.groups[0].children[1].values[4],-2);});
test('missing return cannot produce a partial fund value',()=>assert.throws(()=>estimate(report(),{'TEST.JO':10}),/Complete valuation/));
test('zero return remains zero; absent holding stays blank',()=>{const r=report();r.groups[0].children[0].values[1]=null;const out=estimate(r,{'TEST.JO':0,'OTHER.JO':0});assert.equal(out.groups[0].children[0].values[2],0);assert.equal(out.groups[0].children[0].values[3],null);});
test('JSE holiday baseline and exact report window',()=>{assert.equal(previous('2026-11-05'),'2026-11-03');assert.deepEqual(period('2026-11-05','2026-11-05'),{baseline:'2026-11-03',end:'2026-11-05'});assert.equal(reported(report(),'2026-11-05','2026-11-05'),true);assert.equal(reported(report(),'2026-11-03','2026-11-05'),false);});
test('live uses prior close until first trade then previous-close denominator',()=>{const now=Date.parse('2026-11-06T10:00Z'),base={p:110,pc:100,at:now,t:Date.parse('2026-11-06T09:59Z')};assert.ok(Math.abs(liveReturn(base,'2026-11-05',now)-10)<1e-10);assert.equal(liveReturn({...base,t:Date.parse('2026-11-05T15:00Z')},'2026-11-05',now),0);assert.throws(()=>liveReturn({...base,at:now-100000},'2026-11-05',now));assert.throws(()=>liveReturn({...base,t:Date.parse('2026-11-03T15:00Z')},'2026-11-05',now));});
test('adjusted returns require exact dates and ZAR listing identity',()=>{const r={meta:{symbol:'TEST.JO',currency:'ZAc'},timestamp:[Date.parse('2026-11-03')/1000,Date.parse('2026-11-05')/1000],indicators:{adjclose:[{adjclose:[100,110]}]}};assert.ok(Math.abs(historyReturn(r,'TEST.JO','2026-11-03','2026-11-05')-10)<1e-10);assert.throws(()=>historyReturn(r,'TEST.JO','2026-11-02','2026-11-05'));r.meta.currency='USD';assert.throws(()=>historyReturn(r,'TEST.JO','2026-11-03','2026-11-05'));});
test('all quote batches needed, cycle identities checked, shared symbols deduplicated',async()=>{const symbols=Array.from({length:126},(_,i)=>'T'+i+'.JO');let calls=0;const fn=async(b,cycleId)=>{calls++;return {ok:true,cycleId,collectedAt:123,patch:Object.fromEntries(b.map(s=>[s,{p:1}]))};};const quotes=await completeQuotes([...symbols,symbols[0]],fn,'a');assert.equal(Object.keys(quotes).length,126);assert.equal(quotes[symbols[0]].at,123);assert.equal(calls,4);await assert.rejects(completeQuotes(symbols,async()=>({ok:true,cycleId:'wrong',patch:{}}),'a'));await assert.rejects(completeQuotes(symbols,async(b,cycleId)=>({ok:true,cycleId,patch:{}}),'a'));});

test('ETN fallback requires allowlisted identity and exact closing dates',()=>{
 const raw={code:'NEWSLV',chart:[['2026-10-30',782],['2026-11-05',810]].map(([d,p])=>JSON.stringify([Date.parse(d+'T15:00Z'),p])).join(',')};
 assert.ok(Math.abs(etnPriceReturn(raw,'NEWSLV.JO','2026-10-30','2026-11-05')-(810/782-1)*100)<1e-10);
 assert.throws(()=>etnPriceReturn(raw,'SBCOP.JO','2026-10-30','2026-11-05'));
 assert.throws(()=>etnPriceReturn(raw,'NEWSLV.JO','2026-10-29','2026-11-05'));
});

test('table sort keeps report order until a heading is chosen and never changes the report',()=>{
 const groups=sortFixture(),before=JSON.stringify(groups);
 const out=sortRiseGroups(groups,null);
 assert.deepEqual(out.map(g=>[g.group.name,g.index]),[['Materials',0],['Comm Services',1],['Financials',2]]);
 assert.deepEqual(out[1].children.map(c=>c.ticker),['VOD','MTN','TKG']);
 assert.equal(JSON.stringify(groups),before);
});
test('a value heading sorts sectors, then the holdings inside each sector, blanks last both ways',()=>{
 const groups=sortFixture();
 const down=sortRiseGroups(groups,{key:2,dir:-1});
 assert.deepEqual(down.map(g=>[g.group.name,g.index]),[['Financials',2],['Comm Services',1],['Materials',0]]);
 assert.deepEqual(down.find(g=>g.group.name==='Comm Services').children.map(c=>c.ticker),['MTN','TKG','VOD']);
 assert.deepEqual(down.find(g=>g.group.name==='Materials').children.map(c=>c.ticker),['AGL','SOL','']);
 const up=sortRiseGroups(groups,{key:2,dir:1});
 assert.deepEqual(up.map(g=>g.group.name),['Materials','Comm Services','Financials']);
 assert.deepEqual(up.find(g=>g.group.name==='Comm Services').children.map(c=>c.ticker),['VOD','TKG','MTN']);
 assert.deepEqual(up.find(g=>g.group.name==='Materials').children.map(c=>c.ticker),['SOL','AGL','']);
 assert.deepEqual(sortRiseGroups(groups,{key:3,dir:-1}).map(g=>g.group.name),['Comm Services','Materials','Financials']);
});
test('Name sorts sectors and holdings by name; Ticker sorts sectors by name and holdings by ticker',()=>{
 const groups=sortFixture();
 const byName=sortRiseGroups(groups,{key:'name',dir:1});
 assert.deepEqual(byName.map(g=>g.group.name),['Comm Services','Financials','Materials']);
 assert.deepEqual(byName[0].children.map(c=>c.name),['MTN Group','Telkom','Vodacom']);
 assert.deepEqual(sortRiseGroups(groups,{key:'name',dir:-1}).map(g=>g.group.name),['Materials','Financials','Comm Services']);
 const byTicker=sortRiseGroups(groups,{key:'ticker',dir:1});
 assert.deepEqual(byTicker.map(g=>g.group.name),['Comm Services','Financials','Materials']);
 assert.deepEqual(byTicker[2].children.map(c=>c.ticker||c.name),['AGL','SOL','ZAR cash']);
 const tickerDown=sortRiseGroups(groups,{key:'ticker',dir:-1});
 assert.deepEqual(tickerDown.map(g=>g.group.name),['Materials','Financials','Comm Services']);
 assert.deepEqual(tickerDown[2].children.map(c=>c.ticker),['VOD','TKG','MTN']);
});
test('equal values fall back to name, then report order',()=>{
 const groups=[{name:'B',values:[1,1,5,5,1,1],children:[]},{name:'A',values:[1,1,5,5,1,1],children:[]},{name:'A',values:[1,1,5,5,1,1],children:[]}];
 assert.deepEqual(sortRiseGroups(groups,{key:2,dir:-1}).map(g=>g.index),[1,2,0]);
 assert.deepEqual(sortRiseGroups(groups,{key:2,dir:1}).map(g=>g.index),[1,2,0]);
});
function sortFixture(){
 const h=(name,ticker,ret,bret)=>({id:name,name,ticker,values:[1,1,ret,bret,0.01,0.01]});
 return [
  {name:'Materials',values:[20,25,-1.5,0.4,-0.3,0.1],children:[h('Sasol','SOL',-3,0),h('Anglo American','AGL',2,1),{id:'cash',name:'ZAR cash',ticker:'',cash:true,values:[2,0,null,null,0,null]}]},
  {name:'Comm Services',values:[10,8,0.5,1.2,0.05,0.1],children:[h('Vodacom','VOD',-0.5,0.2),h('MTN Group','MTN',1.8,1.1),h('Telkom','TKG',0.3,null)]},
  {name:'Financials',values:[30,35,2.2,null,0.6,null],children:[]},
 ];
}
test('a side that does not hold a share shows the share return for reference; nothing else changes',()=>{
 const holding=(id,values,extra={})=>({id,name:'Synthetic '+id,ticker:id+' SJ',symbol:id+'.JO',values,...extra});
 const groups=[{name:'Example',values:[60,100,1,2,.6,2],children:[
  holding('SWIXONLY',[null,40,null,3,null,1.2]),
  holding('RISEONLY',[20,null,-1.5,null,-.3,null]),
  holding('BOTH',[40,60,2,2,.8,1.2]),
  holding('ZERO',[null,0,null,0,null,0]),
  holding('NORETURN',[null,5,null,null,null,null]),
  {id:'ZARCASH',name:'ZAR cash',ticker:'',cash:true,values:[1,null,0,null,0,null]}]}];
 const before=JSON.stringify(groups),out=withShareReturns(groups),[swix,rise,both,zero,none,cash]=out[0].children;
 assert.equal(JSON.stringify(groups),before);
 assert.deepEqual(swix.values,[null,40,3,3,null,1.2]);assert.deepEqual(swix.reference,[2]);
 assert.deepEqual(rise.values,[20,null,-1.5,-1.5,-.3,null]);assert.deepEqual(rise.reference,[3]);
 assert.deepEqual(zero.values,[null,0,0,0,null,0]);assert.deepEqual(zero.reference,[2]);
 for(const unchanged of [both,none,cash])assert.equal(unchanged.reference,undefined);
 assert.deepEqual(none.values,[null,5,null,null,null,null]);assert.deepEqual(cash.values,[1,null,0,null,0,null]);
 assert.deepEqual(out[0].values,groups[0].values);
});
test('a missing quote names every holding without one and still rejects the snapshot',async()=>{
 const symbols=['A.JO','B.JO','C.JO'];
 await assert.rejects(completeQuotes(symbols,async(b,cycleId)=>({ok:true,cycleId,collectedAt:1,patch:{'B.JO':{p:1}}}),'c'),e=>{assert.deepEqual(e.missing,['A.JO','C.JO']);assert.match(e.message,/2 of 3 holdings have no quote/);return true;});
});
test("live: a missing or stale quote counts as 0% and is reported; most quotes missing is an outage",async()=>{
 const now=Date.parse("2026-11-10T13:00:00Z"),fresh={p:110,pc:100,t:now-60000,at:now-1000};
 const symbols=["A.JO","B.JO","C.JO","D.JO"];
 const {patch,missing,count}=await collectQuotes(symbols,async(b,cycleId)=>({ok:true,cycleId,collectedAt:now-1000,patch:{"A.JO":{p:110,pc:100,t:now-60000},"B.JO":{p:50,pc:50,t:Date.parse("2026-11-05T14:00:00Z")},"C.JO":{p:99,pc:100,t:now-60000}}}),"z");
 assert.deepEqual(missing,["D.JO"]);assert.equal(count,4);
 const out=liveReturns(symbols,patch,"2026-11-09",now);
 assert.ok(Math.abs(out.returns["A.JO"]-10)<1e-9);assert.ok(Math.abs(out.returns["C.JO"]+1)<1e-9);
 assert.equal(out.returns["B.JO"],0);assert.equal(out.returns["D.JO"],0);assert.deepEqual(out.zero,["B.JO","D.JO"]);
 assert.throws(()=>liveReturns(symbols,{"A.JO":fresh},"2026-11-09",now),e=>{assert.deepEqual(e.missing,["B.JO","C.JO","D.JO"]);assert.match(e.message,/3 of 4 holdings/);return true;});
 await assert.rejects(collectQuotes(symbols,async(b,cycleId)=>({ok:false,cycleId,collectedAt:1,patch:{}}),"z"),/Incomplete price cycle/);
});
