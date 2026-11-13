import test from 'node:test';import assert from 'node:assert/strict';
import {returnSeries} from '../site/engine.mjs';
import {riseSeries,estimate} from '../site/rise-swix-core.mjs';
import {niceTicks,labelIndexes,intradaySeries} from '../site/ranges.mjs';

const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,a+' vs '+b);

test('chart series: a reference fund follows its own price, a portfolio its average weights; last point equals the headline',()=>{
 const lv=(id,values)=>values.map(([date,value])=>({id,date,value,currency:'USD',basis:'vendor-adjusted'}));
 const input={levels:[...lv('FUND',[['2026-11-02',100],['2026-11-03',102],['2026-11-04',101]]),
  ...lv('X',[['2026-11-02',50],['2026-11-03',55],['2026-11-04',60]]),...lv('Y',[['2026-11-02',20],['2026-11-04',18]])]};
 const result={baseline:'2026-11-02',end:'2026-11-04',currency:'USD',returnMethodA:'weighted-estimate',returnMethodB:'reference',fundReturnB:0.01,
  rows:[{id:'X',weightA:.6,weightB:.5,securityReturn:.2,ctrA:.12,ctrB:.1},{id:'Y',weightA:.3,weightB:.5,securityReturn:-.1,ctrA:-.03,ctrB:-.05},{id:'Z',weightA:.1,weightB:0,securityReturn:0,ctrA:0,ctrB:0,assumedZero:true},
  {id:'FUND',weightA:.05,weightB:0,securityReturn:.01,ctrA:null,ctrB:0}]}; // a day without a price: no contribution, left out like the headline
 const s=returnSeries(input,result,{portfolio:'PORTFOLIO:P',benchmark:'FUND'});
 assert.deepEqual(s.dates,['2026-11-02','2026-11-03','2026-11-04']);
 assert.deepEqual([s.a[0],s.b[0]],[0,0]);
 close(s.a[1],100*(.6*.1+.3*0));                       // Y has no 3 Nov price: carried at 0% to date
 close(s.a[2],100*(.6*.2+.3*-.1));                     // equals the weighted headline
 close(s.b[1],2);close(s.b[2],1);                      // the fund's own return to date
 assert.equal(returnSeries(input,{...result,end:'2026-11-03'},{portfolio:'PORTFOLIO:P',benchmark:'FUND'}),null); // one day: no chart
});

test('1D intraday series: starts at 0, follows each holding\'s bars, ends at the headline; missing bars move at the close',()=>{
 const clock={format:d=>d.toISOString().slice(11,16)};
 const bars=new Map([['AAA',{t:[100,400,700],c:[10,11,12]}],['FUND',{t:[400,700],c:[50,49]}]]);
 const s=intradaySeries([[{id:'AAA',weight:.5,daily:.2},{id:'BBB',weight:.5,daily:-.1}],[{id:'FUND',weight:1,daily:-.02}]],bars,clock);
 assert.deepEqual(s.dates,['Prev close','00:01','00:06','00:11','Close']);
 assert.equal(s.a[0],0); close(s.a.at(-1),100*(.5*.2+.5*-.1)); close(s.b.at(-1),-2);
 close(s.a[1],100*.5*(10*1.2/12-1)); close(s.a[3],100*.5*.2);   // AAA follows its bars; BBB has none until the close
 assert.equal(s.b[1],0); close(s.b[2],100*(50*.98/49-1));          // before its first bar the fund is at the previous close
 assert.deepEqual(s.coverage,[.5,1]);
 assert.equal(intradaySeries([[{id:'X',weight:1,daily:0}],[]],new Map([['X',{t:[1],c:[1]}]]),clock),null);
});
test('intraday prices: one session only, filtered to the listing\'s local date, cached',async()=>{
 const {dataResponse}=await import('../cloudflare/data.mjs');
 let calls=0;const day=Date.parse('2026-11-12')/1000;
 const fetcher=async url=>{calls++;assert.match(String(url),/interval=5m/);return Response.json({chart:{result:[{meta:{symbol:'AMD',currency:'USD',exchangeTimezoneName:'America/New_York',gmtoffset:-18000},
  timestamp:[day-3600*20,day+14.5*3600,day+15*3600,day+21*3600],indicators:{quote:[{close:[1,100,101,102]}]}}]}});};
 const store=new Map(),cache={match:async k=>store.get(k.url)?.clone(),put:async(k,v)=>{store.set(k.url,v);}};
 const one=await dataResponse(new Request('https://a.invalid/data/prices?symbol=AMD&start=2026-11-12&end=2026-11-12&interval=5m'),{}, {},fetcher,cache);
 const body=await one.json();assert.deepEqual(body.c,[100,101,102]);assert.equal(body.t.length,3);
 await dataResponse(new Request('https://a.invalid/data/prices?symbol=AMD&start=2026-11-12&end=2026-11-12&interval=5m'),{}, {},fetcher,cache);assert.equal(calls,1);
 assert.equal((await dataResponse(new Request('https://a.invalid/data/prices?symbol=AMD&start=2026-11-11&end=2026-11-12&interval=5m'),{}, {},fetcher,cache)).status,400);
});
test('Rise chart series: report weights times each holding return to date; last point equals the table total',()=>{
 const report={schemaVersion:1,version:'t',currency:'ZAR',period:['2026-11-04','2026-11-05'],total:{name:'Total',values:[100,100,0,0,0,0]},groups:[{name:'G',values:[100,100,0,0,0,0],children:[
  {id:'A',name:'A',symbol:'AAA.JO',values:[60,20,0,0,0,0]},{id:'B',name:'B',symbol:'BBB.JO',values:[30,80,0,0,0,0]},{id:'C',name:'Cash',cash:true,values:[10,null,0,null,0,null]}]}]};
 const days=['2026-11-06','2026-11-09','2026-11-10'];
 const levels={'AAA.JO':new Map([['2026-11-06',100],['2026-11-09',110],['2026-11-10',120]]),'BBB.JO':new Map([['2026-11-06',200],['2026-11-10',190]])};
 const s=riseSeries(report,levels,days);
 assert.deepEqual(s.a.map(v=>+v.toFixed(9)),[0,6,10.5]); // BBB carried flat on 9 Nov
 close(s.b[2],20*.2+80*-.05);
 const table=estimate(report,{'AAA.JO':20,'BBB.JO':-5});
 close(s.a[2],table.total.values[4]);close(s.b[2],table.total.values[5]);
 assert.deepEqual(riseSeries(report,levels,days,new Set(['AAA.JO'])).a.map(v=>+v.toFixed(9)),[0,0,-1.5]);
});

test('chart axes: round ticks cover the range; date labels stay apart and include the last day',()=>{
 const t=niceTicks(-4.97,6.24,6);assert.ok(t[0]<=-4.97&&t.at(-1)>=6.24);assert.ok(t.length>=4&&t.length<=9);
 assert.deepEqual(labelIndexes(5,800),[0,1,2,3,4]);
 const many=labelIndexes(250,800);assert.ok(many.length<=20);assert.equal(many.at(-1),249);
});
