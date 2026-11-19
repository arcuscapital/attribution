import {J303,SWIX,buildIndexPath,buildSatrixPath,priceLookup} from './j303-core.mjs';
import {tradingDay,iso,previous} from './rise-swix-core.mjs';
import {periodBasis,basisLabel,holdingsReturnLevels} from './price-data.mjs';
export async function loadJ303({get,manifest,ids,start,end,currency,onProgress=()=>{},loadOther}){
  const packet=await get(ids.includes(J303)?'j303?'+new URLSearchParams({start,end}):'j303'),model=packet.model;
  if(start<model.availableFrom)throw Error('J303 history starts '+model.availableFrom+'.');
  const report=ids.includes(SWIX)?await get('rise-swix'):null;
  const swixRows=report?.groups.flatMap(g=>g.children.filter(p=>p.values[1]>0&&!p.cash).map(p=>({symbol:p.symbol,name:p.name,sector:g.name,weight:p.values[1]/100})))||[];
  const baseline=previous(start),baskets=packet.baskets||[],useJ303=ids.includes(J303);
  const legacyNeeded=useJ303&&(!baskets.length||baskets[0].asOf>baseline);
  const final=tradingDay(end)?end:previous(end);
  const required=new Map(),packets=[];
  const requireThrough=(symbol,day)=>{if(!required.has(symbol)||required.get(symbol)<day)required.set(symbol,day);};
  if(legacyNeeded){
    const last=baskets[0]?.asOf||final;
    for(const p of model.holdings)requireThrough(p.symbol,p.to&&p.to<=last?previous(p.to):last);
  }
  if(useJ303)for(const [i,b] of baskets.entries()){
    const last=baskets[i+1]?.asOf||final;
    for(const p of b.rows)requireThrough(p.symbol,last);
  }
  for(const p of swixRows)requireThrough(p.symbol,report.period.at(-1)>final?report.period.at(-1):final);
  const symbols=[...required.keys()];
  let cursor=0,done=0;
  await Promise.all([0,1,2,3].map(async()=>{while(cursor<symbols.length){const symbol=symbols[cursor++];packets.push(await get('j303?'+new URLSearchParams({symbol,through:required.get(symbol)})));onProgress(++done,symbols.length);}}));
  const paths=new Map(),price=priceLookup(packets);
  if(useJ303){
    const j303=buildSatrixPath(model,packets,end,baskets,baseline);
    for(const p of j303.snapshots.at(-1).positions)if(price(p.symbol,j303.last)?.date!==j303.last)throw Error(p.symbol+': latest completed closing price is unavailable. J303 has retained its last complete valuation.');
    paths.set(J303,j303);
  }
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
  const path=paths.get(J303)||paths.get(SWIX),dates=path.levels.map(p=>p.date).filter(d=>d>=baseline);
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
    for(const s of p.snapshots)if(s.asOf>=baseline)for(const row of s.positions)involved.add(row.symbol);
    const exactIncome=(symbol,date)=>{
      const q=returns(symbol,date);
      return fund===J303&&baskets.length&&date>=baskets[0].asOf&&q?.date!==date?null:q;
    };
    const reference=total?holdingsReturnLevels(p.snapshots,dates,exactIncome):p.levels;
    for(const q of reference)if(q.date>=baseline&&fx.has(q.date))data.levels.push({id:fund,date:q.date,value:q.value/fx.get(q.date),currency:'USD',basis:returnBasis});
  }
  const replaced=new Set([...involved,'USDZAR=X']);data.levels=data.levels.filter(l=>!replaced.has(l.id));
  for(const date of dates){
    if(!fx.has(date))throw Error('USD/ZAR closing rate missing on '+date);
    data.levels.push({id:'USDZAR=X',date,value:fx.get(date),currency:'ZAR',basis:'fx'});
    for(const symbol of involved){const q=returns(symbol,date);if(q)data.levels.push({id:symbol,date,value:q.value/fx.get(date),currency:'USD',basis:returnBasis});}
  }
  return {...data,returnBasis,dailyHoldings:true,dailyHoldingsFunds:[...paths.keys()],valuationDates:dates,calendarThrough:end,priceCheckedAt:new Date().toISOString(),arcusSource:true,
    priceNotes:[...(data.priceNotes||[]),basisLabel(returnBasis)+' for both portfolio and benchmark. The contribution table uses average opening weights. '+(total?'SA gross cash dividends are reinvested at the ex-date close.':'Ordinary dividends are excluded for this single session.'),
      ...(useJ303&&baskets.length?['J303 uses the Satrix Capped All Share ETF as its holdings proxy. Each verified basket replaces the weights at its valuation close. Between disclosures the holdings float with share prices. Latest basket in this period: '+baskets.at(-1).asOf+' (Satrix publication '+baskets.at(-1).publishedOn+').']:[]),
      ...(legacyNeeded?['Earlier J303 holdings reconstruct public disclosures, dated membership and quarterly capping. Historical calibrations used later published information.',...(model.provenanceNotes||[])]:[]),
      ...(path.last<end?['The requested end '+end+' is a non-trading date; the final JSE valuation is '+path.last+'.']:[]),
      ...(report?['SWIX uses its separately saved allocation dated '+report.period.at(-1)+', reverse/forward drifted with prices and compared on the same return basis.']:[]),
      ...(path.carried.length?['Last observed closes used on '+path.carried.length+' constituent/session valuations.']:[])],j303Events:path.events};
}
