import {previous,iso,tradingDay} from '../site/rise-swix-core.mjs';
import {cashDividendLevels,RETURN_VERSION} from '../site/price-data.mjs';
import corrections from './sa-income-corrections.json' with {type:'json'};
// Some vendors truncate a listing's earlier history on refresh. Preserve an
// already verified prefix only when overlapping closes establish a consistent
// scale; this also restates the prefix after a newly reported split.
export function preserveHistory(previousPacket,next){
  if(previousPacket?.symbol!==next.symbol||previousPacket.currency!==next.currency||previousPacket.basis!==next.basis||!next.points?.length)return next;
  const first=next.points[0][0],prefix=(previousPacket.points||[]).filter(([d,v])=>d<first&&v>0);
  if(!prefix.length)return next;
  const old=new Map(previousPacket.points),ratios=next.points.filter(([d])=>old.has(d)).slice(0,5).map(([d,v])=>v/old.get(d));
  const factor=ratios[0];
  if(ratios.length<3||!(factor>0)||ratios.some(r=>!Number.isFinite(r)||Math.abs(r/factor-1)>1e-4))return next;
  const points=[...prefix.map(([d,v])=>[d,v*factor]),...next.points];
  const result={...next,points,historyPrefix:{through:prefix.at(-1)[0],source:previousPacket.historyPrefix?.source||previousPacket.source,scale:factor}};
  if(previousPacket.returnVersion===RETURN_VERSION&&next.returnVersion===RETURN_VERSION){
    result.dividends=[...(previousPacket.dividends||[]).filter(d=>d.date<first).map(d=>({...d,amount:d.amount*factor})),...(next.dividends||[])];
    result.totalReturnFrom=previousPacket.totalReturnFrom;
    result.totalReturnPoints=cashDividendLevels(points.filter(([d])=>d>=result.totalReturnFrom),result.dividends);
  }
  return result;
}
async function sharenet(symbol,fetcher,start,end){
  const code=symbol.slice(0,-3),r=await fetcher('https://www.sharenet.co.za/v3/frontend/quickshare_ajax.php?sharecode='+code+'&range=chart10y&compare=none',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Closing-price backup unavailable');
  const body=await r.text();if(body.length>200000)throw Error('Invalid closing-price history');
  const raw=JSON.parse(body);if(raw.code!==code||typeof raw.chart!=='string')throw Error('Price identity mismatch');
  const points=[...raw.chart.matchAll(/\[(\d{10,13}),\s*([\d.]+)\]/g)].map(([,t,p])=>[iso(Number(t)*(t.length===10?1000:1)+7200000),Number(p)/100]).filter(([d,v])=>d>=start&&d<=end&&v>0);
  if(!points.length)throw Error('No completed closes');return [...new Map(points)];
}

// Compare speed (owner, 2026-11-20): the J303 job keeps full JSE close histories in this archive, current through the
// last completed session. A comparison's JSE price request reuses one when it covers the whole period, instead of a
// ~1 s Yahoo (and Sharenet) round trip; otherwise it returns null and the caller downloads as before. Same rule as
// refreshArchivePrice: the latest session is trusted only from a packet checked within a day.
export async function savedJseHistory(kv,{symbol,start,end},now=Date.now()){
  if(!kv||!/^[A-Z0-9-]+\.JO$/.test(symbol||''))return null;
  let saved;try{saved=await kv.get('j303:price:v1:'+symbol,'json');}catch{return null;}
  if(saved?.symbol!==symbol||saved.currency!=='ZAR'||saved.returnVersion!==RETURN_VERSION||!saved.points?.length||!saved.totalReturnPoints?.length)return null;
  const completed=previous(iso(now+7200000)),cap=end<completed?end:completed,final=tradingDay(cap)?cap:previous(cap);
  if(saved.points[0][0]>start||saved.totalReturnFrom>start||!saved.points.some(([d])=>d===final))return null;
  if(final>=previous(completed)&&!(now-Date.parse(saved.checkedAt)<86400000))return null;
  const points=saved.points.filter(([d])=>d>=start&&d<=end),dividends=(saved.dividends||[]).filter(d=>d.date>=start&&d.date<=end);
  if(!points.length)return null;
  try{return {...saved,points,dividends,totalReturnFrom:points[0][0],totalReturnPoints:cashDividendLevels(points,dividends),savedHistory:true};}
  catch{return null;}
}
// Price requests and the scheduled warmer share this archive. A failed
// refresh must not shorten a saved series or discard its dividend coverage.
export async function refreshArchivePrice(kv,symbol,through,{fetcher=fetch,now=Date.now()}={}){
  const key='j303:price:v1:'+symbol,saved=await kv.get(key,'json');
  const completed=previous(iso(now+7200000)),end=through<completed?completed:through;
  const has=(p,d)=>p?.points?.some(([day])=>day===d);
  const losesHistory=p=>saved&&(p.points[0][0]>saved.points[0][0]||p.points.at(-1)[0]<saved.points.at(-1)[0]||
    (saved.returnVersion===RETURN_VERSION&&(p.returnVersion!==RETURN_VERSION||p.totalReturnFrom>saved.totalReturnFrom||
    (p.totalReturnPoints?.at(-1)?.[0]||'')<(saved.totalReturnPoints?.at(-1)?.[0]||''))));
  if(has(saved,through)&&saved.returnVersion===RETURN_VERSION&&(through<previous(completed)||now-Date.parse(saved.checkedAt)<86400000))return saved;
  try{
    const last=saved?.points?.at(-1)?.[0];
    const start=last&&last<end&&saved.returnVersion===RETURN_VERSION?previous(previous(previous(last))):'2025-03-01';
    let packet=preserveHistory(saved,await fetchJseHistory(symbol,{fetcher,now,start,end}));
    if(losesHistory(packet)){
      packet=preserveHistory(saved,await fetchJseHistory(symbol,{fetcher,now,end}));
      if(losesHistory(packet))return saved;
    }
    if(!has(packet,through)&&has(saved,through))return saved;
    await kv.put(key,JSON.stringify(packet));return packet;
  }catch(error){if(saved)return saved;throw error;}
}
export async function fetchJseHistory(symbol,{fetcher=fetch,now=Date.now(),start='2025-03-01',end=previous(iso(now+7200000))}={}){
  if(!/^[A-Z0-9-]+\.JO$/.test(symbol))throw Error('Invalid JSE symbol');
  try{
    const url='https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?period1='+Math.floor(Date.parse(start)/1000)+'&period2='+Math.floor((Date.parse(end)+86400000)/1000)+'&interval=1d&events=div%2Csplits&includeAdjustedClose=true';
    const r=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Price service unavailable');
    const raw=(await r.json()).chart?.result?.[0];
    if(raw?.meta?.symbol?.toUpperCase()!==symbol||!['ZAR','ZAc'].includes(raw.meta.currency))throw Error('JSE price identity mismatch');
    const scale=raw.meta.currency==='ZAc'?.01:1,closes=raw.indicators?.quote?.[0]?.close||[];
    let points=(raw.timestamp||[]).map((t,i)=>[iso(t*1000+7200000),closes[i]*scale]).filter(([d,v])=>d>=start&&d<=end&&v>0&&Number.isFinite(v));
    if(!points.length)throw Error('No completed closes');
    const events=new Map(Object.values(raw.events?.dividends||{}).map(d=>[iso(d.date*1000+7200000),{date:iso(d.date*1000+7200000),amount:d.amount*scale}]));
    const correction=corrections[symbol];
    for(const d of correction?.dividends||[])events.set(d.date,d);
    const dividends=[...events.values()].filter(d=>d.date>=start&&d.date<=end);
    let unitCorrections=0;
    // Yahoo has historical ZAR/ZAc switches on several JSE listings. A 100x
    // change is corrected ONLY when independent same-day closes confirm it.
    const missing = new Set((raw.timestamp||[]).map((t,i)=>[iso(t*1000+7200000),closes[i]]).filter(([d,v])=>d>=start&&d<=end&&!(v>0)).map(([d])=>d));
    const lastYahoo=points.at(-1)[0], needsTail=lastYahoo<end&&tradingDay(end);
    const filled=[];
    if(correction||dividends.length||missing.size||needsTail||points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02))){
      const other=new Map(await sharenet(symbol,fetcher,start,end));
      for(const p of points){const ratio=other.get(p[0])/p[1];if(ratio>99&&ratio<101){p[1]*=100;unitCorrections++;}else if(ratio>.0099&&ratio<.0101){p[1]/=100;unitCorrections++;}}
      if(points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02)))throw Error('Unresolved currency discontinuity');
      // Quickshare closes are in cents. Verify the same ZAR basis against
      // adjacent observed Yahoo closes before filling a dated gap or tail.
      if(missing.size||needsTail){
        const observed=new Map(points);
        for(const [d,v] of other){
          if(observed.has(d)||(!missing.has(d)&&d<=lastYahoo)||!tradingDay(d))continue;
          const overlap=points.filter(([day])=>day<d&&other.has(day)).slice(-3);
          // Yahoo regularMarketPrice, when supplied for this exact session,
          // independently identifies the close even after a split.
          const quoteOnDate=raw.meta.regularMarketTime&&iso(raw.meta.regularMarketTime*1000+7200000)===d&&raw.meta.regularMarketPrice>0;
          const matches=(a,b)=>Math.abs(a-b)<=Math.max(.011,a*.00015);
          if(quoteOnDate?!matches(v,raw.meta.regularMarketPrice*scale):overlap.length<2||overlap.some(([day,a])=>!matches(a,other.get(day))))continue;
          observed.set(d,v);filled.push(d);
        }
        points=[...observed].sort(([a],[b])=>a.localeCompare(b));
      }
      const coverage=correction?.coverage,first=points[0][0];
      if(coverage&&!coverage.terminal&&first<=iso(Date.parse(coverage.through)+86400000))points=[...[...other].filter(([d])=>d>=coverage.from&&d<first&&d<=coverage.through),...points];
    }
    return {symbol,currency:'ZAR',basis:'price-return',source:'Yahoo closing prices; cash dividends reinvested on ex-date for total returns',unitCorrections,...(filled.length?{sharenetCloses:filled}:{}),points,dividends,returnVersion:RETURN_VERSION,totalReturnFrom:points[0][0],totalReturnPoints:cashDividendLevels(points,dividends),checkedAt:new Date(now).toISOString()};
  }catch(error){
    if(error.message==='Unresolved currency discontinuity')throw error;
    const points=await sharenet(symbol,fetcher,start,end),correction=corrections[symbol];
    if(correction?.coverage.terminal){
      const completed=points.filter(([d])=>d>=correction.coverage.from&&d<=correction.coverage.through),dividends=correction.dividends;
      if(completed.length)return {symbol,currency:'ZAR',basis:'price-return',source:'Sharenet closing prices; issuer-confirmed historical cash dividends',points,dividends,returnVersion:RETURN_VERSION,totalReturnFrom:completed[0][0],totalReturnThrough:completed.at(-1)[0],totalReturnPoints:cashDividendLevels(completed,dividends),incomeSources:correction.sources,checkedAt:new Date(now).toISOString()};
    }
    return {symbol,currency:'ZAR',basis:'price-return',source:'Sharenet closing price',totalReturnUnavailable:error.message,points:[...new Map(points)],checkedAt:new Date(now).toISOString()};
  }
}
