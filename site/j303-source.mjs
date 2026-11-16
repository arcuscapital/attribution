import {J303,SWIX,buildIndexPath,priceLookup} from './j303-core.mjs';
import {tradingDay,iso} from './rise-swix-core.mjs';
import {periodBasis,basisLabel,holdingsReturnLevels} from './price-data.mjs';
export async function loadJ303({get,manifest,ids,start,end,currency,onProgress=()=>{},loadOther}){
  const packet=await get('j303'),model=packet.model;
  if(start<model.availableFrom)throw Error('J303 history starts '+model.availableFrom+'.');
  const report=ids.includes(SWIX)?await get('rise-swix'):null;
  const swixRows=report?.groups.flatMap(g=>g.children.filter(p=>p.values[1]>0&&!p.cash).map(p=>({symbol:p.symbol,name:p.name,sector:g.name,weight:p.values[1]/100})))||[];
  const symbols=[...new Set([...model.holdings.map(p=>p.symbol),...swixRows.map(p=>p.symbol)])],packets=[];
  let cursor=0,done=0;
  await Promise.all([0,1,2,3].map(async()=>{while(cursor<symbols.length){const symbol=symbols[cursor++];packets.push(await get('j303?symbol='+encodeURIComponent(symbol)));onProgress(++done,symbols.length);}}));
  const path=buildIndexPath(model,packets,end),paths=new Map([[J303,path]]),price=priceLookup(packets);
  for(const p of path.snapshots.at(-1).positions)if(price(p.symbol,path.last)?.date!==path.last)throw Error(p.symbol+': latest completed closing price is unavailable. J303 has retained its last complete valuation.');
  if(report){
    // Reverse-drift the saved comparator without fitting it to J303. Any small
    // J303 weight proxies taken from this report are recorded in model provenance.
    const anchor=report.period.at(-1),rows=swixRows.map(p=>{
      const at=price(p.symbol,anchor);if(!at)throw Error(p.symbol+': SWIX anchor price missing');
      let first=packets.find(x=>x.symbol===p.symbol).points[0]?.[0];
      first=iso(Date.parse(first)+86400000);while(!tradingDay(first))first=iso(Date.parse(first)+86400000);
      const initial=price(p.symbol,model.anchor);
      return {...p,weight:initial?p.weight*initial.value/at.value:p.weight,...(!initial?{from:first}:{} )};
    });
    const sum=rows.reduce((s,p)=>s+p.weight,0);rows.forEach(p=>p.weight/=sum);
    paths.set(SWIX,buildIndexPath({...model,holdings:rows,calibrations:[]},packets,end,{fund:SWIX,capped:false,calibrate:false}));
  }
  const baseline=path.levels.map(p=>p.date).filter(d=>d<start).at(-1),dates=path.levels.map(p=>p.date).filter(d=>d>=baseline);
  const returnBasis=periodBasis(dates,start,end),total=returnBasis==='total-return';
  const returns=total?priceLookup(packets.map(p=>({...p,points:p.totalReturnPoints||[]}))):price;
  const others=ids.filter(id=>!paths.has(id)),data=others.length?await loadOther(others,returnBasis):{manifest,snapshots:[],levels:[],priceNotes:[],priceFailures:[]};
  let fx=new Map();
  // Engine has a common USD internal numeraire. Use one FX series and its
  // inverse consistently, so a ZAR comparison cancels FX exactly.
  if(currency==='USD'||others.length){
    const raw=await get('prices?'+new URLSearchParams({symbol:'USDZAR=X',start:baseline,end}));
    fx=new Map((raw.timestamp||[]).map((t,i)=>[new Date(t*1000).toISOString().slice(0,10),raw.indicators?.quote?.[0]?.close?.[i]]).filter(([,v])=>v>0));
  }else fx=new Map(dates.map(d=>[d,1]));
  const involved=new Set();
  for(const [fund,p] of paths){
    data.snapshots.push(...p.snapshots.filter(s=>s.asOf>=baseline));
    for(const s of p.snapshots)for(const row of s.positions)involved.add(row.symbol);
    const reference=total?holdingsReturnLevels(p.snapshots,dates,returns):p.levels;
    for(const q of reference)if(q.date>=baseline&&fx.has(q.date))data.levels.push({id:fund,date:q.date,value:q.value/fx.get(q.date),currency:'USD',basis:returnBasis});
  }
  const replaced=new Set([...involved,'USDZAR=X']);data.levels=data.levels.filter(l=>!replaced.has(l.id));
  for(const date of dates){
    if(!fx.has(date))throw Error('USD/ZAR closing rate missing on '+date);
    data.levels.push({id:'USDZAR=X',date,value:fx.get(date),currency:'ZAR',basis:'fx'});
    for(const symbol of involved){const q=returns(symbol,date);if(q)data.levels.push({id:symbol,date,value:q.value/fx.get(date),currency:'USD',basis:returnBasis});}
  }
  return {...data,returnBasis,dailyHoldings:true,dailyHoldingsFunds:[...paths.keys()],valuationDates:dates,calendarThrough:end,priceCheckedAt:new Date().toISOString(),arcusSource:true,
    priceNotes:[...(data.priceNotes||[]),basisLabel(returnBasis)+' for both portfolio and benchmark. J303 weights drift with prices and rebalance automatically each quarter with 12% capping. Weights shown are average opening weights; contributions compound daily. '+(total?'SA gross cash dividends are reinvested at the ex-date close.':'Ordinary dividends are excluded for this single session.'),
      'J303 history reconstructs public fund disclosures and dated membership changes. Historical calibrations use later published information; future reviews carry the latest inferred float units until new source data is available.',
      ...(model.provenanceNotes||[]),
      ...(path.last<end?['The requested end '+end+' is a non-trading date; the final JSE valuation is '+path.last+'.']:[]),
      ...(report?['SWIX uses its separately saved allocation dated '+report.period.at(-1)+', reverse/forward drifted with prices and compared on the same return basis.']:[]),
      ...(path.carried.length?['Last observed closes used on '+path.carried.length+' constituent/session valuations.']:[])],j303Events:path.events};
}
