import {iso,previous,tradingDay} from '../site/rise-swix-core.mjs';
import {fetchJseHistory,refreshArchivePrice} from './j303-market.mjs';

export const SATRIX_URL='https://satrix.co.za/products/product-details?id=66';
export const FIRST_CLOSE='2026-11-17';
export const BASKET_PREFIX='j303:stxcap:close:';
export const SOURCE_HEALTH='j303:stxcap:source-health';
const DAY=86400000;
const plain=html=>html.replace(/<[^>]*>/g,' ').replace(/&amp;/gi,'&').replace(/(?:&nbsp;|&#160;)/gi,' ').replace(/&#39;|&apos;/gi,"'").replace(/&quot;/gi,'"').replace(/\s+/g,' ').trim();
const number=s=>/^\d+(?:\.\d+)?$/.test(s.replace(/,/g,''))?Number(s.replace(/,/g,'')):NaN;

export function parseSatrixETF(html,now){
  if(typeof html!=='string'||html.length>2500000)throw Error('Unexpected Satrix response');
  const tables=[...html.matchAll(/<table\b[^>]*\bid=["']constituentDetails54["'][^>]*>([\s\S]*?)<\/table>/gi)];
  if(tables.length!==1)throw Error('STXCAP holdings table missing or duplicated');
  const table=tables[0][1],after=html.slice(tables[0].index+tables[0][0].length);
  const meta=after.match(/<script\b[^>]*>(?:(?!<\/script>)[\s\S])*?\bvar constituentDetailsFundId\s*=\s*54\s*;([\s\S]*?)<\/script>/i)?.[1]||'';
  if(!/constituentDetailsFundCode\s*=\s*['"]STXCAP['"]/.test(meta)||!/constituentDetailsFundName\s*=\s*['"]Satrix Capped All Share ETF['"]/.test(meta))throw Error('STXCAP fund identity unavailable');
  const dateObject=meta.match(/constituentDetailsFundUpdatedDate\s*=\s*([^;]+)/)?.[1]||'';
  const part=k=>Number(dateObject.match(new RegExp("['\"]"+k+"['\"]\\s*:\\s*(\\d+)"))?.[1]);
  const y=part('year'),m=part('monthValue'),d=part('dayOfMonth');
  const publishedOn=[y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
  if(!Number.isFinite(Date.parse(publishedOn))||iso(Date.UTC(y,m-1,d))!==publishedOn||publishedOn>iso(now+7200000))throw Error('Invalid STXCAP publication date');
  const headings=[...table.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map(x=>plain(x[1]));
  if(headings.join('|')!=='CODE|SHARE NAME|INDUSTRY|SHARES *|WEIGHT|MARKET CAP|CLOSING')throw Error('STXCAP table layout changed');
  const body=table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i)?.[1]||'';
  const rows=[],codes=new Set();
  for(const tr of body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...tr[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(x=>plain(x[1]));
    const [code,name,industry,quantity,percent,value,closing]=cells;
    if(cells.length!==7||!/^[A-Z0-9-]{1,12}$/.test(code)||codes.has(code)||!name||!industry||!percent.endsWith('%'))throw Error('Invalid STXCAP constituent');
    const weightPct=number(percent.slice(0,-1)),close=number(closing),marketValue=number(value),shares=number(quantity);
    if(![close,marketValue,shares].every(x=>Number.isFinite(x)&&x>=0)||close<=0||!Number.isFinite(weightPct)||weightPct<0||weightPct>40)throw Error('Invalid STXCAP constituent values');
    codes.add(code);rows.push({symbol:code+'.JO',name,industry,weightPct,close,marketValue,shares});
  }
  const totalPct=rows.reduce((s,p)=>s+p.weightPct,0),value=rows.reduce((s,p)=>s+p.marketValue,0);
  if(rows.length<50||rows.length>250||Math.abs(totalPct-100)>.65||!value||rows.some(p=>Math.abs(p.weightPct-100*p.marketValue/value)>.018))throw Error('Incomplete or unreconciled STXCAP basket');
  // Both renderings come from the issuer. A dropped small desktop row can
  // still round to a plausible total, so reconcile every code and weight.
  const mobile=after.match(/^\s*<table\b[^>]*\bvisible-xs\b[^>]*>([\s\S]*?)<\/table>/i)?.[1]||'';
  const fields=[...mobile.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>(CODE|WEIGHT)<\/td>\s*<td\b[^>]*>([^<]+)<\/td>\s*<\/tr>/gi)];
  const mobileWeights=new Map();
  for(let i=0;i<fields.length;i+=2){
    if(fields[i][1]!=='CODE'||fields[i+1]?.[1]!=='WEIGHT')throw Error('Incomplete STXCAP mobile table');
    const code=plain(fields[i][2]),pct=plain(fields[i+1][2]);
    if(mobileWeights.has(code)||!pct.endsWith('%'))throw Error('Invalid STXCAP mobile row');
    mobileWeights.set(code,number(pct.slice(0,-1)));
  }
  if(mobileWeights.size!==rows.length||rows.some(p=>mobileWeights.get(p.symbol.slice(0,-3))!==p.weightPct))throw Error('STXCAP holdings tables disagree');
  rows.sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {publishedOn,totalPct,rows};
}

export async function verifySatrixClose(basket,getPrices,now){
  const local=new Date(now+7200000),today=iso(local.getTime());
  const completed=tradingDay(today)&&local.getUTCHours()>=18?today:previous(today);
  const end=basket.publishedOn<completed?basket.publishedOn:completed,start=iso(Date.parse(end)-14*DAY);
  const liquid=[...basket.rows].sort((a,b)=>b.weightPct-a.weightPct).slice(0,5);
  const histories=await Promise.allSettled(liquid.map(async p=>{
    const packet=await getPrices(p.symbol,start,end);
    if(packet.symbol!==p.symbol||packet.currency!=='ZAR')throw Error('STXCAP close identity mismatch');
    return new Set(packet.points.filter(([d,v])=>d>=start&&d<=end&&tradingDay(d)&&Math.abs(v-p.close)<.0051).map(([d])=>d));
  }));
  const evidence=histories.map(result=>result.status==='fulfilled'?result.value:new Set());
  const dates=[...new Set(evidence.flatMap(s=>[...s]))].filter(d=>evidence.filter(s=>s.has(d)).length>=4);
  if(dates.length!==1||dates[0]<FIRST_CLOSE||dates[0]>iso(now+7200000))throw Error('STXCAP valuation date could not be uniquely verified');
  return {asOf:dates[0],matched:liquid.filter((_,i)=>evidence[i].has(dates[0])).map(p=>p.symbol)};
}

export async function makeSatrixSnapshot(html,{now=Date.now(),prices=(symbol,start,end)=>fetchJseHistory(symbol,{start,end,now})}={}){
  const basket=parseSatrixETF(html,now),proof=await verifySatrixClose(basket,prices,now);
  const bytes=new TextEncoder().encode(JSON.stringify([proof.asOf,basket.rows]));
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  return {fund:'STXCAP',...proof,publishedOn:basket.publishedOn,observedAt:new Date(now).toISOString(),digest,totalPct:basket.totalPct,rows:basket.rows};
}

export async function archiveSatrix(kv,snapshot){
  const key=BASKET_PREFIX+snapshot.asOf,old=await kv.get(key,'json');
  if(old&&(old.publishedOn>snapshot.publishedOn||(old.publishedOn===snapshot.publishedOn&&old.observedAt>snapshot.observedAt)))return old;
  if(old?.digest===snapshot.digest)return old;
  if(old)await kv.put('j303:stxcap:revision:'+old.asOf+':'+old.digest,JSON.stringify(old));
  await kv.put(key,JSON.stringify(snapshot));
  return snapshot;
}

// Find the opening basket and every subsequent replacement. The dated keys are
// the source of truth, including disclosures discovered out of order.
export async function basketHistory(kv,baseline,end){
  let cursor;const keys=[];
  do{const page=await kv.list({prefix:BASKET_PREFIX,...(cursor?{cursor}:{})});keys.push(...page.keys.map(k=>k.name));cursor=page.list_complete?null:page.cursor;}while(cursor);
  const candidates=keys.filter(k=>k.slice(BASKET_PREFIX.length)<=end).sort();
  const prior=candidates.filter(k=>k.slice(BASKET_PREFIX.length)<=baseline).at(-1);
  const wanted=candidates.filter(k=>k===prior||k.slice(BASKET_PREFIX.length)>baseline),baskets=[];
  for(let i=0;i<wanted.length;i+=50){
    const slice=wanted.slice(i,i+50);
    const values=await kv.get(slice,'json');
    for(const key of slice){
      const b=values.get(key);if(!b)throw Error('STXCAP archive is refreshing. Please compare again.');
      baskets.push({asOf:b.asOf,publishedOn:b.publishedOn,digest:b.digest,rows:b.rows.map(p=>({symbol:p.symbol,name:p.name,industry:p.industry,weight:p.weightPct/b.totalPct}))});
    }
  }
  return baskets;
}

export async function pollSatrix(kv,now,fetcher=fetch){
  const r=await fetcher(SATRIX_URL,{headers:{Accept:'text/html','User-Agent':'Mozilla/5.0 (compatible; Arcus holdings research)'},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Satrix returned HTTP '+r.status);
  const snapshot=await makeSatrixSnapshot(await r.text(),{now,prices:(symbol,start,end)=>fetchJseHistory(symbol,{start,end,now,fetcher})});
  const saved=await archiveSatrix(kv,snapshot);
  await kv.put(SOURCE_HEALTH,JSON.stringify({status:'ok',asOf:saved.asOf,publishedOn:saved.publishedOn,digest:saved.digest,positions:saved.rows.length,checkedAt:new Date(now).toISOString()}));
  return saved;
}

// Check the issuer every two hours on trading days, every six on other days.
// The same trigger warms two constituents per tick, including Friday's close
// on Saturday. Retry only missing prices.
export async function scheduledSatrix(env,now=Date.now(),fetcher=fetch){
  const kv=env.HOLDINGS_ARCHIVE,local=iso(now+7200000),clock=new Date(now);
  const cadence=tradingDay(local)?2:6;
  const regularPoll=clock.getUTCMinutes()===0&&clock.getUTCHours()%cadence===0;
  if(regularPoll||!await kv.get(SOURCE_HEALTH)){
    try{await pollSatrix(kv,now,fetcher);}
    catch(error){
      const last=await kv.get(SOURCE_HEALTH,'json');
      await kv.put(SOURCE_HEALTH,JSON.stringify({...last,status:'retained-last-basket',reason:error.message,checkedAt:new Date(now).toISOString()}));
    }
    return;
  }
  const date=previous(local),jobKey='j303:stxcap:price-job';
  let job=await kv.get(jobKey,'json');
  if(job?.date!==date){
    const [basket]=await basketHistory(kv,date,date);
    if(!basket)return;
    job={date,pending:basket.rows.map(p=>p.symbol),retry:[],retryAt:0};
  }
  if(!job.pending.length){
    if(!job.retry.length||now<job.retryAt)return;
    job.pending=job.retry;job.retry=[];
  }
  const batch=job.pending.splice(0,2);
  await Promise.all(batch.map(async symbol=>{
    try{
      const packet=await refreshArchivePrice(kv,symbol,date,{now,fetcher});
      if(!packet.points.some(([d])=>d===date))job.retry.push(symbol);
    }catch{job.retry.push(symbol);}
  }));
  if(!job.pending.length)job.retryAt=now+3600000;
  job.checkedAt=new Date(now).toISOString();
  await kv.put(jobKey,JSON.stringify(job));
}
