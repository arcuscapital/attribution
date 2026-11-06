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
export function reported(report,start,end){
 return end===report.period[1]&&start>=report.period[0]&&start<=report.period[1];
}
export function historyReturn(raw,symbol,baseline,end){
 if(raw?.meta?.symbol?.toUpperCase()!==symbol||!['ZAR','ZAc'].includes(raw.meta.currency))throw Error('Listing or ZAR quote currency not verified');
 const values=raw.indicators?.adjclose?.[0]?.adjclose,days=new Map();
 for(let i=0;i<(raw.timestamp||[]).length;i++){const v=values?.[i];if(v>0&&Number.isFinite(v))days.set(iso(raw.timestamp[i]*1000+7200000),v);}
 const first=days.get(baseline),last=days.get(end);
 if(!first||!last)throw Error('Exact adjusted-price endpoints unavailable');
 return (last/first-1)*100;
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
// All batches resolve before a caller may commit a valuation. No row-level patches.
export async function completeQuotes(symbols,fetchBatch,cycle){
 const unique=[...new Set(symbols)],batches=[];
 for(let i=0;i<unique.length;i+=64)batches.push(unique.slice(i,i+64));
 const results=await Promise.all(batches.map(b=>fetchBatch(b,cycle)));
 const patch={};for(const r of results){if(!r.ok||r.cycleId!==cycle||!Number.isFinite(r.collectedAt))throw Error('Incomplete price cycle');for(const [symbol,q] of Object.entries(r.patch||{}))patch[symbol]={...q,at:r.collectedAt};}
 if(unique.some(s=>!patch[s]))throw Error('One or more holdings has no quote. Keeping the previous complete valuation.');return patch;
}
