// Separate ZAR research model. Never changes the ordinary attribution engine.
export const RISE='PORTFOLIO:RISE', SWIX='PORTFOLIO:SWIX';
export const isRisePair=(a,b)=>a===RISE&&b===SWIX;
const DAY=86400000;
export const iso=t=>new Date(t).toISOString().slice(0,10);
export function tradingDay(day){
 const d=new Date(day+'T12:00Z'),y=d.getUTCFullYear();
 if(!Number.isFinite(+d)||[0,6].includes(d.getUTCDay()))return false;
 const holidays=new Set();
 for(const md of ['01-01','03-21','04-27','05-01','06-16','08-09','09-24','12-16','12-25','12-26']){
  const date=y+'-'+md;holidays.add(date);if(new Date(date).getUTCDay()===0)holidays.add(iso(Date.parse(date)+DAY));
 }
 const a=y%19,b=Math.floor(y/100),c=y%100,d4=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d4-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),n=h+l-7*m+114;
 const easter=Date.UTC(y,Math.floor(n/31)-1,n%31+1);holidays.add(iso(easter-2*DAY));holidays.add(iso(easter+DAY));
 for(const special of ['2023-12-15','2024-05-29','2026-11-04'])holidays.add(special);
 return !holidays.has(day);
}
export function previous(day){let t=Date.parse(day)-DAY;do{if(tradingDay(iso(t)))return iso(t);t-=DAY;}while(Number.isFinite(t));throw Error('Invalid date');}
export function sessionDate(now=Date.now()){const d=iso(now+7200000);return tradingDay(d)?d:previous(d);}
export function completedCalendar(now=Date.now()){
 const end=previous(iso(now+7200000)),start=Date.parse((Number(end.slice(0,4))-3)+'-01-01'),out=[];
 for(let t=start;t<=Date.parse(end);t+=DAY)if(tradingDay(iso(t)))out.push(iso(t));return out;
}
export function validateReport(report){
 if(report?.schemaVersion!==1||report.currency!=='ZAR'||!report.version||!Array.isArray(report.groups)||!report.groups.length)throw Error('Invalid Rise/Swix report');
 const ids=new Set();
 for(const g of report.groups){
  if(!g.name||!Array.isArray(g.children)||g.values?.length!==6)throw Error('Invalid report sector');
  for(const p of g.children){
   if(!p.id||ids.has(p.id)||p.values?.length!==6||p.values.some(v=>v!==null&&!Number.isFinite(v)))throw Error('Invalid report holding');
   ids.add(p.id);
   if(!p.cash&&!/^[A-Z0-9-]+\.JO$/.test(p.symbol||''))throw Error('Unresolved South African listing');
  }
  for(const c of [0,1,4,5])if(Math.abs(g.children.reduce((n,p)=>n+(p.values[c]??0),0)-(g.values[c]??0))>1e-7)throw Error('Report sector does not reconcile');
 }
 for(const c of [0,1,4,5])if(Math.abs(report.groups.reduce((n,g)=>n+(g.values[c]??0),0)-report.total.values[c])>1e-7)throw Error('Report total does not reconcile');
 return report;
}
export function period(start,end){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(end||'')||start>end||Date.parse(end)-Date.parse(start)>1096*DAY)throw Error('Choose valid dates within three years');
 const through=tradingDay(end)?end:previous(end);
 if(through<start)throw Error('No JSE trading session in this range');
 return {baseline:previous(start),end:through};
}
// Display order for the Rise vs Swix table. sort is null (report order) or {key,dir}: key 'name', 'ticker'
// or a value column 0-5, dir 1 ascending or -1 descending. Sectors sort by the column first, then the
// holdings inside each sector by the same column. Ticker sorts sectors by name. Blanks stay last in
// both directions; ties fall back to name A to Z, then report order. Returns each sector's report index.
// GICS grouping for ordinary comparisons (owner, 2026-11-13): result rows grouped by Bloomberg GICS sector in
// the Rise vs Swix table shape. Values are percent: [weight Port, weight Bmrk, return Port, return Bmrk, CTR Port,
// CTR Bmrk]. A side that does not hold a share has no weight or contribution and shows the share's own return
// for reference (italic). Holdings without a GICS sector (cash, funds, private, unlisted) go to Unknown GICS.
export const UNKNOWN_GICS='Unknown GICS';
const gicsKey=v=>String(v||'').trim().toUpperCase();
export function gicsSector(row,sectors={}){
 for(const k of [row.id,row.symbol,row.ticker].map(gicsKey).filter(Boolean)){const v=sectors[k]||sectors[k.replace(/[/.](?=[A-Z]$)/,'-')];if(v)return v;}
 return UNKNOWN_GICS;
}
export function groupByGics(rows,sectors={},{total='Total',returnA=null,returnB=null}={}){
 const pc=v=>Number.isFinite(v)?v*100:null,held=w=>Number.isFinite(w)&&Math.abs(w)>1e-12,groups=new Map();
 for(const r of rows||[]){
  const name=gicsSector(r,sectors),ret=pc(r.securityReturn),a=held(r.weightA),b=held(r.weightB);
  if(!groups.has(name))groups.set(name,{name,children:[]});
  groups.get(name).children.push({name:r.name||r.ticker||r.id,ticker:r.ticker||'',values:[a?pc(r.weightA):null,b?pc(r.weightB):null,ret,ret,a?pc(r.ctrA):null,b?pc(r.ctrB):null],
   reference:[...(!a&&ret!==null?[2]:[]),...(!b&&ret!==null?[3]:[])],zeroed:!!r.assumedZero});
 }
 const sum=(list,i)=>{const v=list.map(c=>c.values[i]).filter(Number.isFinite);return v.length?v.reduce((s,x)=>s+x,0):null;};
 const out=[...groups.values()].map(g=>{const wA=sum(g.children,0),wB=sum(g.children,1),cA=sum(g.children,4),cB=sum(g.children,5);
  return {...g,values:[wA,wB,wA&&cA!==null?cA/wA*100:null,wB&&cB!==null?cB/wB*100:null,cA,cB]};})
  .sort((x,y)=>(x.name===UNKNOWN_GICS)-(y.name===UNKNOWN_GICS)||x.name.localeCompare(y.name));
 const all=out.flatMap(g=>g.children);
 return {total:{name:total,values:[sum(all,0),sum(all,1),pc(returnA),pc(returnB),sum(all,4),sum(all,5)]},groups:out};
}
export function sortRiseGroups(groups,sort){
 const text=(a,b)=>String(a??'').localeCompare(String(b??''),'en',{sensitivity:'base',numeric:true});
 const blank=v=>v===null||v===undefined||!Number.isFinite(v);
 const compare=holding=>(a,b)=>{
  const x=a.item,y=b.item;let r=0;
  if(sort.key==='name'||(sort.key==='ticker'&&!holding))r=sort.dir*text(x.name,y.name);
  else if(sort.key==='ticker')r=sort.dir*text(x.ticker||x.name,y.ticker||y.name);
  else{const p=x.values[sort.key],q=y.values[sort.key];r=blank(p)?(blank(q)?0:1):blank(q)?-1:sort.dir*(p-q);}
  return r||text(x.name,y.name)||a.order-b.order;
 };
 const order=(items,holding)=>{const list=items.map((item,order)=>({item,order}));if(sort)list.sort(compare(holding));return list;};
 return order(groups,false).map(({item,order:index})=>({group:item,index,children:order(item.children,true).map(c=>c.item)}));
}
// Bloomberg leaves a share's return blank on the side that does not hold it. When both sides hold a share
// its return is identical on both, so the blank side shows the share's own return for reference. Those
// columns are listed in reference; weights, contributions, sector and total figures are unchanged.
export function withShareReturns(groups){
 return groups.map(g=>({...g,children:g.children.map(p=>{
  if(p.cash)return p;const values=[...p.values],reference=[];
  for(const [own,other,weight] of [[2,3,0],[3,2,1]])if(values[own]===null&&values[weight]===null&&Number.isFinite(values[other])){values[own]=values[other];reference.push(own);}
  return reference.length?{...p,values,reference}:p;
 })}));
}
export function reported(report,start,end){
 return end===report.period[1]&&start>=report.period[0]&&start<=report.period[1];
}
// Yahoo adjusted closes by JSE date, after listing and ZAR currency checks.
export function adjustedLevels(raw,symbol){
 if(raw?.meta?.symbol?.toUpperCase()!==symbol||!['ZAR','ZAc'].includes(raw.meta.currency))throw Error('Listing or ZAR quote currency not verified');
 const values=raw.indicators?.adjclose?.[0]?.adjclose,days=new Map();
 for(let i=0;i<(raw.timestamp||[]).length;i++){const v=values?.[i];if(v>0&&Number.isFinite(v))days.set(iso(raw.timestamp[i]*1000+7200000),v);}
 return days;
}
export function historyReturn(raw,symbol,baseline,end){
 const days=adjustedLevels(raw,symbol);
 const first=days.get(baseline),last=days.get(end);
 if(!first||!last)throw Error('Exact adjusted-price endpoints unavailable');
 return (last/first-1)*100;
}
// These two ZAR ETNs have live quotes but no usable daily Yahoo history.
// Keep the public closing-price fallback explicit; never call it adjusted history.
export const ETN_PRICE_ONLY=new Set(['NEWSLV.JO','SBCOP.JO']);
export function etnPriceReturn(raw,symbol,baseline,end){
 if(!ETN_PRICE_ONLY.has(symbol)||raw?.code!==symbol.slice(0,-3)||typeof raw.chart!=='string'||raw.chart.length>200000)throw Error('ETN price identity unavailable');
 const days=new Map();
 for(const point of JSON.parse('['+raw.chart+']'))if(Array.isArray(point)&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&point[1]>0)days.set(iso(point[0]+7200000),point[1]);
 if(!days.has(baseline)||!days.has(end))throw Error('Exact ETN closing-price endpoints unavailable');
 return (days.get(end)/days.get(baseline)-1)*100;
}
// Sharenet public closing prices (price only) for a JSE listing: the backup when Yahoo has no usable
// price. Same identity and exact-date checks as the ETN path. During a session Sharenet's point for
// today is its latest (possibly delayed) price.
export function jseCloseLevels(raw,symbol){
 if(!/^[A-Z0-9]{2,10}\.JO$/.test(symbol)||raw?.code!==symbol.slice(0,-3)||typeof raw.chart!=='string'||raw.chart.length>200000)throw Error('Closing-price identity unavailable');
 const days=new Map();
 for(const point of JSON.parse('['+raw.chart+']'))if(Array.isArray(point)&&Number.isFinite(point[0])&&Number.isFinite(point[1])&&point[1]>0)days.set(iso(point[0]+7200000),point[1]);
 return days;
}
export function jseCloseReturn(raw,symbol,baseline,end){
 const days=jseCloseLevels(raw,symbol);
 if(!days.has(baseline)||!days.has(end))throw Error('Exact closing-price endpoints unavailable');
 return (days.get(end)/days.get(baseline)-1)*100;
}
export function liveReturn(q,baseline,now=Date.now()){
 if(!q||!(q.p>0)||!Number.isFinite(q.t)||!Number.isFinite(q.at)||q.at>now+60000||now-q.at>90000||q.t>now+60000||iso(q.t+7200000)<baseline)throw Error('Missing or stale live quote');
 // The previous regular close may belong to the prior day until today's first trade.
 // In that case this observed closing price itself is the opening basis.
 const day=iso(q.t+7200000),base=day===baseline?q.p:q.pc;
 if(!(base>0))throw Error('Previous close unavailable');
 const x=q.x&&q.x.on===sessionDate(now)&&q.x.at<=now+60000&&q.x.at>=q.t?q.x:null;
 return ((x?.price||q.p)/base-1)*100;
}
export function estimate(report,returns){
 const missing=[];
 const groups=report.groups.map(g=>{
  const children=g.children.map(p=>{
   const r=p.cash?0:returns[p.symbol];
   if(!Number.isFinite(r)&&p.values.slice(0,2).some(w=>w!==null&&w!==0))missing.push(p.symbol);
   return {...p,values:[p.values[0],p.values[1],...p.values.slice(0,2).map(w=>w===null?null:Number.isFinite(r)?r:null),...p.values.slice(0,2).map(w=>w===null?null:Number.isFinite(r)?w*r/100:null)]};
  });
  const weights=[0,1].map(c=>g.values[c]),ctr=[4,5].map(c=>children.some(p=>p.values[c]===null&&p.values[c-4]!==null)?null:children.reduce((n,p)=>n+(p.values[c]??0),0));
  return {...g,children,values:[...weights,...weights.map((w,i)=>w&&ctr[i]!==null?ctr[i]/w*100:null),...ctr.map((v,i)=>weights[i]===null?null:v)]};
 });
 if(missing.length)throw Error('Complete valuation unavailable: '+[...new Set(missing)].join(', '));
 const ctr=[4,5].map(c=>groups.reduce((n,g)=>n+(g.values[c]??0),0));
 return {groups,total:{...report.total,values:[report.total.values[0],report.total.values[1],...ctr,...ctr]}};
}
// All batches resolve before a caller may commit a valuation. No row-level patches. By default a failed
// or mismatched batch rejects the cycle. tolerant: a failed batch only leaves its symbols missing (so a
// backup source can price them), but sign-in loss and cancellation still reject. Symbols a batch did
// not return are listed in missing.
export async function collectQuotes(symbols,fetchBatch,cycle,{tolerant=false}={}){
 const unique=[...new Set(symbols)],batches=[];
 for(let i=0;i<unique.length;i+=32)batches.push(unique.slice(i,i+32));
 const settled=await Promise.allSettled(batches.map(b=>fetchBatch(b,cycle)));
 const patch={};let failed=0;
 for(const s of settled){
  if(s.status==='rejected'){if(!tolerant||s.reason?.message==='Sign in again.'||s.reason?.name==='AbortError')throw s.reason;failed++;continue;}
  const r=s.value;if(!r?.ok||r.cycleId!==cycle||!Number.isFinite(r.collectedAt)){if(!tolerant)throw Error('Incomplete price cycle');failed++;continue;}
  for(const [symbol,q] of Object.entries(r.patch||{}))patch[symbol]={...q,at:r.collectedAt};
 }
 return {patch,missing:unique.filter(s=>!patch[s]),count:unique.length,failed};
}
// Live Rise vs Swix: returns from the live quotes. A holding without a usable quote (missing or stale)
// is listed in zero with a 0% placeholder, for the caller to try the backup source first.
export function liveReturns(symbols,patch,baseline,now=Date.now()){
 const unique=[...new Set(symbols)],returns={},zero=[];
 for(const symbol of unique){try{returns[symbol]=liveReturn(patch[symbol],baseline,now);}catch{returns[symbol]=0;zero.push(symbol);}}
 return {returns,zero};
}
// A holding with no price from any source counts as 0% and is reported, so the rest of the valuation
// goes ahead. More than half the holdings without a price is an outage: never show a mostly-zero table.
export function checkCoverage(zero,count,live=false){
 if(zero.length*2>count)throw Object.assign(Error((live?'Live prices':'Prices')+' unavailable: '+zero.length+' of '+count+' holdings have no usable price from Yahoo or Sharenet.'),{missing:zero});
}
export async function completeQuotes(symbols,fetchBatch,cycle){
 const {patch,missing,count}=await collectQuotes(symbols,fetchBatch,cycle);
 if(missing.length)throw Object.assign(Error('No complete live snapshot: '+missing.length+' of '+count+' holdings have no quote. No holdings have been dropped.'),{missing});
 return patch;
}
// Daily cumulative returns (percent) for the chart under the Rise vs Swix table: each holding's return
// from the starting close (last known level carried over days without a price), times the report's
// average weights; cash and holdings without prices count as 0%. The last point equals the table's
// total contribution. dates includes the starting close.
export function riseSeries(report,levels,dates,zero=new Set()){
 const holdings=report.groups.flatMap(g=>g.children).filter(p=>!p.cash),base=dates[0],carry=new Map(),a=[],b=[];
 for(const d of dates){
  let pa=0,pb=0;
  for(const p of holdings){
   const m=levels[p.symbol],start=m?.get(base);if(!(start>0)||zero.has(p.symbol))continue;
   let level=m.get(d);if(level>0)carry.set(p.symbol,level);else level=carry.get(p.symbol)??start;
   const r=level/start-1;pa+=(p.values[0]??0)*r;pb+=(p.values[1]??0)*r;
  }
  a.push(pa);b.push(pb);
 }
 return {dates,a,b};
}
