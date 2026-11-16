import {capWeights,reviewDates} from '../site/j303-core.mjs';
import {tradingDay,previous,iso} from '../site/rise-swix-core.mjs';
import {fetchJseHistory,preserveHistory} from './j303-market.mjs';
import {refreshPublicAnchors} from './j303-public.mjs';
import {advanceUnits} from '../site/holdings-drift.mjs';
export const MODEL_KEY='j303:model:v1',STATE_KEY='j303:state:v1',JOB_KEY='j303:job:v1';
export const priceKey=symbol=>'j303:price:v1:'+symbol;
export function nextSession(day){let d=iso(Date.parse(day)+86400000);while(!tradingDay(d))d=iso(Date.parse(d)+86400000);return d;}
export function advanceDay(state,model,quotes,date,anchors=null){
  if(date!==nextSession(state.asOf))throw Error('J303 publication must advance one session at a time');
  const units={...state.units},base={...state.base},prices={},review=reviewDates(Number(date.slice(0,4)),Number(date.slice(5,7)));
  const quarterly=[3,6,9,12].includes(Number(date.slice(5,7)));
  const before={};let pending=state.pending?structuredClone(state.pending):null;
  for(const [symbol,q] of Object.entries(units)){
    if(!(quotes[symbol]?.value>0)||quotes[symbol].date!==date)throw Error('J303 close missing: '+symbol+' '+date);
    const prior=quotes[symbol].priorValue??state.prices[symbol];
    if(!(prior>0))throw Error('J303 prior close missing');
    // A new split changes the vendor's entire price history. Restate the
    // effective units as well, including an already prepared capping plan.
    const factor=state.prices[symbol]/prior;units[symbol]=q*factor;
    if(base[symbol])base[symbol]*=factor;if(pending?.units[symbol])pending.units[symbol]*=factor;
    prices[symbol]=quotes[symbol].value;before[symbol]=prior;
  }
  const value=state.value*(1+advanceUnits(units,before,prices).return),next=nextSession(date);
  const members=model.holdings.filter(p=>(!p.from||p.from<=next)&&(!p.to||p.to>next));
  if(quarterly&&date===review.reference){
    const reviewMembers=model.holdings.filter(p=>(!p.from||p.from<=review.effective)&&(!p.to||p.to>review.effective));
    for(const p of reviewMembers)if(!base[p.symbol]){const v=quotes[p.symbol]?.value;if(!(v>0))throw Error('New review constituent price missing');base[p.symbol]=p.weight/v;}
    if(anchors){
      const sum=Object.values(anchors.weights).reduce((a,b)=>a+b,0);
      const remaining=reviewMembers.filter(p=>anchors.weights[p.symbol]==null);
      const subtotal=remaining.reduce((s,p)=>s+(base[p.symbol]||0)*quotes[p.symbol].anchorValue,0);
      if(!(subtotal>0&&sum<1))throw Error('Public calibration cannot reconcile');
      for(const p of reviewMembers){const v=quotes[p.symbol]?.anchorValue;if(!(v>0))throw Error('Public calibration price missing');base[p.symbol]=(anchors.weights[p.symbol]??((1-sum)*(base[p.symbol]||0)*v/subtotal))/v;}
    }
    const raw=reviewMembers.map(p=>{const v=quotes[p.symbol]?.value;if(!(v>0))throw Error('J303 capping close missing');return base[p.symbol]*v;});
    const weights=capWeights(raw);
    pending={implementation:review.implementation,effective:review.effective,reference:date,units:Object.fromEntries(reviewMembers.map((p,i)=>[p.symbol,weights[i]/quotes[p.symbol].value]))};
  }
  let applied=state.lastRebalance||null;
  if(pending&&pending.implementation===date){for(const key of Object.keys(units))delete units[key];Object.assign(units,pending.units);applied={reference:pending.reference,implementation:date,effective:pending.effective};pending=null;}
  for(const symbol of Object.keys(units))if(!members.some(p=>p.symbol===symbol))delete units[symbol];
  for(const p of members)if(!units[p.symbol]){if(!(quotes[p.symbol]?.value>0))throw Error('New constituent close missing');units[p.symbol]=p.weight/quotes[p.symbol].value;base[p.symbol]=units[p.symbol];}
  let total=0;for(const [s,u] of Object.entries(units)){prices[s]=quotes[s]?.value;if(!(prices[s]>0))throw Error('Closing valuation missing');total+=u*prices[s];}
  const positions=members.map(p=>({...p,id:p.symbol,ticker:p.symbol.slice(0,-3),weight:units[p.symbol]*prices[p.symbol]/total,currency:'ZAR',asset:'Equity'}));
  if(!Number.isFinite(value)||value<=0||Math.abs(positions.reduce((s,p)=>s+p.weight,0)-1)>1e-9)throw Error('Invalid J303 publication');
  return {asOf:date,value,units,base,prices,pending,lastRebalance:applied,positions,modelVersion:model.version};
}
// One listing per invocation, with final publication in a separate invocation,
// limits peak CPU. A complete session publishes only after EVERY close is present.
export async function scheduledJ303(env,now=Date.now(),fetcher=fetch){
  const kv=env.HOLDINGS_ARCHIVE,model=await kv.get(MODEL_KEY,'json');if(!model)return;
  // Weekly source check is separate from price work. A parser/source failure
  // retains the last valid model and never overwrites it with partial weights.
  const clock=new Date(now);
  if(clock.getUTCDay()===1&&clock.getUTCHours()===6&&clock.getUTCMinutes()===0){
    try{await refreshPublicAnchors(kv,model,now,fetcher);}catch{await kv.put('j303:source-health:v1',JSON.stringify({status:'retained-last-valid-source',checkedAt:new Date(now).toISOString()}));}return;
  }
  const state=await kv.get(STATE_KEY,'json');if(!state)return;
  const completed=previous(iso(now+7200000)),date=nextSession(state.asOf);if(date>completed)return;
  const review=reviewDates(Number(date.slice(0,4)),Number(date.slice(5,7)));
  let anchors=null;
  if([3,6,9,12].includes(Number(date.slice(5,7)))&&date===review.reference){
    const found=await kv.get('j303:public-anchors:v1','json'),last=(model.calibrations||[]).map(c=>c.asOf).sort().at(-1)||model.anchor;
    if(found?.asOf>last&&found.asOf<=date)anchors=found;
  }
  let job=await kv.get(JOB_KEY,'json');
  if(job?.date!==date||job?.modelVersion!==model.version||(job?.anchorAsOf??null)!==(anchors?.asOf??null))job={date,modelVersion:model.version,anchorAsOf:anchors?.asOf??null,cursor:0,quotes:{},failures:[]};
  const future=[3,6,9,12].includes(Number(date.slice(5,7)))&&date>=review.reference&&date<=review.implementation?review.effective:nextSession(date);
  const symbols=model.holdings.filter(p=>(!p.to||p.to>state.asOf)&&(!p.from||p.from<=future)).map(p=>p.symbol);
  if(job.cursor>=symbols.length&&job.failures.length){job.cursor=0;job.failures=[];}
  const fetching=job.cursor<symbols.length;
  for(const symbol of symbols.slice(job.cursor,job.cursor+1)){
    try{
      const saved=await kv.get(priceKey(symbol),'json');
      // Refresh a short overlap, retaining the verified archive. Re-downloading
      // the full historical series for every daily tick wastes the CPU budget.
      const start=previous(previous(previous(state.asOf)));
      const packet=preserveHistory(saved,await fetchJseHistory(symbol,{fetcher,now,start}));const value=new Map(packet.points).get(date);
      if(!(value>0))throw Error('Completed close absent');
      const priorValue=new Map(packet.points).get(state.asOf);if(state.units[symbol]&&!(priorValue>0))throw Error('Prior completed close absent');
      await kv.put(priceKey(symbol),JSON.stringify(packet));job.quotes[symbol]={date,value,priorValue,...(anchors?{anchorValue:packet.points.filter(([d])=>d<=anchors.asOf).at(-1)?.[1]}:{})};
    }catch{job.failures.push(symbol);}
    job.cursor++;
  }
  if(fetching){
    if(job.cursor>=symbols.length&&job.failures.length)await kv.put('j303:health:v1',JSON.stringify({status:'waiting-for-prices',asOf:state.asOf,pending:date,missing:job.failures,checkedAt:new Date(now).toISOString()}));
    await kv.put(JOB_KEY,JSON.stringify(job));return;
  }
  if(job.cursor>=symbols.length&&!job.failures.length){
    const next=advanceDay(state,model,job.quotes,date,anchors);
    if(anchors){
      model.calibrations.push({...anchors,effective:review.effective});model.version='j303-'+review.effective+'-'+anchors.asOf;
      next.modelVersion=model.version;
      await kv.put('j303:model-history:'+model.version,JSON.stringify(model));await kv.put(MODEL_KEY,JSON.stringify(model));
    }
    await kv.put('j303:snapshot:'+date,JSON.stringify({fund:'PORTFOLIO:J303',asOf:date,positions:next.positions,modelVersion:model.version}));
    await kv.put(STATE_KEY,JSON.stringify(next));
    await kv.put('j303:health:v1',JSON.stringify({status:'ok',asOf:date,checkedAt:new Date(now).toISOString(),lastRebalance:next.lastRebalance,modelVersion:model.version}));
  }else if(job.cursor>=symbols.length)await kv.put('j303:health:v1',JSON.stringify({status:'waiting-for-prices',asOf:state.asOf,pending:date,missing:job.failures,checkedAt:new Date(now).toISOString()}));
  await kv.put(JOB_KEY,JSON.stringify(job));
}
