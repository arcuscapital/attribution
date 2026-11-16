// Shared by the scheduled publisher and the browser. All values are PRICE returns.
import {tradingDay,previous,iso} from './rise-swix-core.mjs';
import {advanceUnits} from './holdings-drift.mjs';
export const J303='PORTFOLIO:J303', SWIX='PORTFOLIO:SWIX';
const DAY=86400000;
export function reviewDates(year,month){
  const first=new Date(Date.UTC(year,month-1,1)),friday=1+(5-first.getUTCDay()+7)%7;
  let reference=iso(Date.UTC(year,month-1,friday+7));
  let implementation=iso(Date.UTC(year,month-1,friday+14));
  // A holiday Friday uses the preceding exchange session, never a nonexistent close.
  if(!tradingDay(reference))reference=previous(reference);
  if(!tradingDay(implementation))implementation=previous(implementation);
  let effective=iso(Date.parse(implementation)+DAY);
  while(!tradingDay(effective))effective=iso(Date.parse(effective)+DAY);
  return {reference,implementation,effective};
}
export function reviewsBetween(start,end){
  const out=[];
  for(let y=Number(start.slice(0,4));y<=Number(end.slice(0,4));y++)for(const m of [3,6,9,12]){
    const r=reviewDates(y,m);if(r.implementation>=start&&r.implementation<=end)out.push(r);
  }
  return out;
}
export function capWeights(values,cap=.12){
  if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))throw Error('Invalid capping values');
  const total=values.reduce((a,b)=>a+b,0);
  if(!(total>0)||values.filter(v=>v>0).length*cap<1-1e-10)throw Error('Insufficient constituents for cap');
  const result=values.map(()=>0),open=new Set(values.map((v,i)=>v>0?i:-1).filter(i=>i>=0));
  let remaining=1;
  while(open.size){
    const subtotal=[...open].reduce((s,i)=>s+values[i],0);
    const over=[...open].filter(i=>remaining*values[i]/subtotal>cap+1e-12);
    if(!over.length){for(const i of open)result[i]=remaining*values[i]/subtotal;break;}
    for(const i of over){result[i]=cap;remaining-=cap;open.delete(i);}
  }
  return result;
}
export function sessions(start,end){const out=[];for(let t=Date.parse(start);t<=Date.parse(end);t+=DAY)if(tradingDay(iso(t)))out.push(iso(t));return out;}
export function validateModel(m){
  if(m?.schemaVersion!==1||!/^\d{4}-\d{2}-\d{2}$/.test(m.anchor)||!Array.isArray(m.holdings)||m.holdings.length<9||m.holdings.length>250)throw Error('Invalid J303 model');
  const symbols=new Set();let sum=0;
  for(const p of m.holdings){if(!/^[A-Z0-9-]+\.JO$/.test(p.symbol)||symbols.has(p.symbol)||!Number.isFinite(p.weight)||p.weight<0)throw Error('Invalid J303 constituent');symbols.add(p.symbol);sum+=p.weight;}
  if(Math.abs(sum-1)>.02)throw Error('J303 seed does not reconcile');
  return m;
}
// Last observed close is a valuation convention, with gaps disclosed. No missing
// quote deletes a member or reallocates its weight. Publication stops if stale.
export function priceLookup(packets){
  const maps=new Map(packets.map(p=>[p.symbol,new Map(p.points)]));
  const cache=new Map();
  return (symbol,date)=>{
    const key=symbol+'|'+date;if(cache.has(key))return cache.get(key);
    const map=maps.get(symbol);let d=date;
    for(let n=0;n<10;n++,d=previous(d)){const value=map?.get(d);if(value>0){const v={value,date:d,carried:d!==date};cache.set(key,v);return v;}}
    return null;
  };
}
export function buildIndexPath(model,packets,end,{fund=J303,capped=true,calibrate=true}={}){
  validateModel(model);
  const price=priceLookup(packets),days=sessions(model.anchor,end),holdings=model.holdings;
  if(!days.length)throw Error('No J303 sessions');
  const active=(p,d)=>(!p.from||p.from<=d)&&(!p.to||d<p.to);
  const value=(p,d)=>{const q=price(p.symbol,d);if(!q)throw Error(p.symbol+': no closing price near '+d);return q.value;};
  const base=new Map(),units=new Map(),events=[],snapshots=[],levels=[],carried=new Set();
  for(const p of holdings)if(active(p,days[0]))base.set(p.symbol,p.weight/value(p,model.anchor));
  function reset(day,reference,calibration){
    let effective=iso(Date.parse(day)+DAY);while(!tradingDay(effective))effective=iso(Date.parse(effective)+DAY);
    const members=holdings.filter(p=>active(p,effective));
    for(const p of members)if(!base.has(p.symbol))base.set(p.symbol,p.weight/value(p,reference));
    if(calibration){
      const at=calibration.asOf,anchors=calibration.weights||{},known=members.filter(p=>anchors[p.symbol]!=null);
      const anchorTotal=known.reduce((s,p)=>s+anchors[p.symbol],0);
      const rest=members.filter(p=>anchors[p.symbol]==null),restTotal=rest.reduce((s,p)=>s+base.get(p.symbol)*value(p,at),0);
      if(anchorTotal>=1||!restTotal)throw Error('Invalid J303 calibration');
      for(const p of members){const w=anchors[p.symbol]??(1-anchorTotal)*base.get(p.symbol)*value(p,at)/restTotal;base.set(p.symbol,w/value(p,at));}
    }
    const raw=members.map(p=>base.get(p.symbol)*value(p,reference));
    const total=raw.reduce((a,b)=>a+b,0),weights=capped?capWeights(raw):raw.map(x=>x/total);
    units.clear();members.forEach((p,i)=>units.set(p.symbol,weights[i]/value(p,reference)));
    events.push({implementation:day,reference,effective:iso(Date.parse(day)+DAY),kind:calibration?'calibrated-review':'quarterly-review',members:members.length,maxReferenceWeight:Math.max(...weights)});
  }
  const initial=holdings.filter(p=>active(p,days[0]));
  const w0=initial.map(p=>p.weight),sum0=w0.reduce((a,b)=>a+b,0);
  initial.forEach((p,i)=>units.set(p.symbol,w0[i]/sum0/value(p,days[0])));
  const reviewMap=new Map(reviewsBetween(model.anchor,end).map(r=>[r.implementation,r]));
  let wealth=100,prior=days[0];
  for(const day of days){
    if(day!==prior){
      const before={},after={};
      for(const p of holdings)if(units.has(p.symbol)){
        before[p.symbol]=value(p,prior);after[p.symbol]=value(p,day);
        if(price(p.symbol,day).carried)carried.add(p.symbol+' '+day+' uses '+price(p.symbol,day).date);
      }
      wealth*=1+advanceUnits(units,before,after).return;
    }
    levels.push({date:day,value:wealth});
    const review=reviewMap.get(day);
    if(review){const calibration=calibrate?(model.calibrations||[]).find(c=>c.effective===review.effective):null;reset(day,review.reference,calibration);events.at(-1).effective=review.effective;}
    // Dated removals/additions happen after the preceding session. Reallocation
    // preserves the index level; it is not itself a market return.
    const next=(()=>{let d=iso(Date.parse(day)+DAY);while(!tradingDay(d))d=iso(Date.parse(d)+DAY);return d;})();
    const changed=holdings.some(p=>units.has(p.symbol)!==active(p,next));
    if(changed){
      for(const p of holdings){if(!active(p,next))units.delete(p.symbol);else if(!units.has(p.symbol))units.set(p.symbol,p.weight/value(p,day));}
      events.push({implementation:day,effective:next,kind:'membership',members:units.size});
    }
    const total=holdings.reduce((s,p)=>s+(units.get(p.symbol)||0)*valueIfHeld(p),0);
    function valueIfHeld(p){return units.has(p.symbol)?value(p,day):0;}
    const positions=holdings.filter(p=>units.has(p.symbol)).map(p=>({...p,id:p.symbol,ticker:p.symbol.replace('.JO',''),weight:units.get(p.symbol)*value(p,day)/total,asset:'Equity',currency:'ZAR'}));
    snapshots.push({fund,asOf:day,source:'J303 automatic daily holdings',positions});prior=day;
  }
  return {snapshots,levels,events,carried:[...carried],last:days.at(-1),state:{asOf:days.at(-1),value:wealth,units:Object.fromEntries(units),base:Object.fromEntries(base),prices:Object.fromEntries(holdings.filter(p=>units.has(p.symbol)).map(p=>[p.symbol,value(p,days.at(-1))]))}};
}
