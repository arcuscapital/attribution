import {test} from 'node:test';
import assert from 'node:assert/strict';
import {compare} from '../site/engine.mjs';
const close = (a,b) => assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function fixture({weights=[.6,.4],next=weights,missing=[],currency='USD',fundReturn=true}={}) {
  const positions=w=>w.map((weight,i)=>({id:['X','Y'][i],ticker:['X','Y'][i],name:['First','Second'][i],sector:'Technology',weight}));
  const snapshots=['2026-10-01','2026-10-02'].flatMap((asOf,i)=>[
    {fund:'PORTFOLIO:IBKR',asOf,positions:positions(i?next:weights)},
    {fund:'ETF',asOf,positions:positions([.5,.5])},
  ]);
  const levels=Object.entries({X:[100,110,99],Y:[100,100,110],ETF:[100,105,105],SPY:[100,105,105],'USDZAR=X':[17,17.17,17.34]})
    .flatMap(([id,values])=>values.map((value,i)=>({id,value,date:['2026-10-01','2026-10-02','2026-10-05'][i],currency:id==='USDZAR=X'?'ZAR':'USD',basis:id==='USDZAR=X'?'fx':'vendor-adjusted'})))
    .filter(l=>!missing.includes(l.id) && (fundReturn || l.id!=='ETF'));
  return {data:{manifest:{schemaVersion:1},snapshots,levels},options:{portfolio:'PORTFOLIO:IBKR',benchmark:'ETF',start:'2026-10-02',end:'2026-10-05',currency,allowPartialReturns:true}};
}
test('account with no reference series has a sumproduct return and difference',()=>{
  const {data,options}=fixture();const r=compare(data,options);
  close(r.returnA,.034);close(r.returnB,.05);close(r.activeReturn,-.016);
  assert.equal(r.fundReturnA,null);assert.equal(r.returnMethodA,'weighted-estimate');
  close(r.rows.reduce((s,row)=>s+row.weightA*row.securityReturn,0),r.returnA);
  close(r.rows.reduce((s,row)=>s+row.ctrA,0),r.returnA);
});
test('changing and removed weights use the period average, not daily compounding',()=>{
  const {data,options}=fixture({next:[0,1]});const before=JSON.stringify(data),r=compare(data,options);
  close(r.rows.find(row=>row.id==='X').weightA,.3);
  close(r.returnA,.3*(-.01)+.7*.1);assert.equal(r.contributionMethod,'average-weight-period');
  assert.deepEqual(r.sectors,[]);assert.equal(JSON.stringify(data),before);
});
test('partial coverage shows only the available estimate and preserves missing cells',()=>{
  const {data,options}=fixture({missing:['Y']});options.end=options.start;
  const r=compare(data,options);close(r.returnA,.06);close(r.returnB,.05);
  close(r.coverage.portfolio,.6);assert.equal(r.status,'partial');
  assert.equal(r.rows.find(row=>row.id==='Y').ctrA,null);
});
test('all held returns missing stays blank; an actual zero return is numeric zero',()=>{
  const {data,options}=fixture({missing:['X','Y']});const r=compare(data,options);
  assert.equal(r.returnA,null);assert.equal(r.activeReturn,null);
  const f=fixture();f.options.end=f.options.start;
  f.data.levels.find(l=>l.id==='X'&&l.date==='2026-10-02').value=100;
  close(compare(f.data,f.options).returnA,0);
});
test('short and leveraged weights are retained without scaling to 100%',()=>{
  const {data,options}=fixture({weights:[1.4,-.2]});const r=compare(data,options);
  close(r.returnA,1.4*(-.01)-.2*.1);close(r.rows.find(row=>row.id==='X').weightA,1.4);
  close(r.rows.find(row=>row.id==='Y').weightA,-.2);
});
test('portfolio on either side uses weighted returns; ETF stays observed',()=>{
  const {data,options}=fixture();[options.portfolio,options.benchmark]=[options.benchmark,options.portfolio];
  const r=compare(data,options);close(r.returnA,.05);close(r.returnB,.034);close(r.activeReturn,.016);
  assert.equal(r.returnMethodB,'weighted-estimate');assert.equal(r.returnMethodA,'reference');
});
test('two portfolios use independent sumproducts and ignore any account reference levels',()=>{
  const {data,options}=fixture();options.benchmark='PORTFOLIO:EASYGE';
  data.snapshots.filter(s=>s.fund==='ETF').forEach(s=>s.fund=options.benchmark);
  data.levels.filter(l=>l.id==='ETF').forEach(l=>l.id=options.benchmark);
  const r=compare(data,options);close(r.returnA,.034);close(r.returnB,.045);
  close(r.fundReturnB,.05);close(r.activeReturn,-.011);
});
test('ZAR sumproduct uses each security FX-adjusted period return',()=>{
  const {data,options}=fixture({currency:'ZAR'});const r=compare(data,options);
  close(r.returnA,.6*(.99*1.02-1)+.4*(1.1*1.02-1));close(r.returnB,1.05*1.02-1);
});
test('missing held-day prices remain unavailable even if both endpoints exist',()=>{
  const {data,options}=fixture();data.levels=data.levels.filter(l=>!(l.id==='X'&&l.date==='2026-10-02'));
  const r=compare(data,options);assert.equal(r.rows.find(row=>row.id==='X').ctrA,null);close(r.returnA,.04);
});
test('missing opening snapshot or requested date cannot be replaced with a shorter estimate',()=>{
  const {data,options}=fixture();data.snapshots=data.snapshots.filter(s=>!(s.fund===options.portfolio&&s.asOf==='2026-10-02'));
  assert.equal(compare(data,options).status,'incomplete');
  const f=fixture();f.options.end='2026-10-06';assert.equal(compare(f.data,f.options).status,'incomplete');
});
test('unavailable ETF reference stays blank without suppressing the portfolio estimate',()=>{
  const {data,options}=fixture({fundReturn:false});const r=compare(data,options);
  close(r.returnA,.034);assert.equal(r.returnB,null);assert.equal(r.activeReturn,null);
});
