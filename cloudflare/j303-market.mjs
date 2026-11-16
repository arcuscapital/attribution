import {previous,iso} from '../site/rise-swix-core.mjs';
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
    if(correction||dividends.length||points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02))){
      const other=new Map(await sharenet(symbol,fetcher,start,end));
      for(const p of points){const ratio=other.get(p[0])/p[1];if(ratio>99&&ratio<101){p[1]*=100;unitCorrections++;}else if(ratio>.0099&&ratio<.0101){p[1]/=100;unitCorrections++;}}
      if(points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02)))throw Error('Unresolved currency discontinuity');
      const coverage=correction?.coverage,first=points[0][0];
      if(coverage&&!coverage.terminal&&first<=iso(Date.parse(coverage.through)+86400000))points=[...[...other].filter(([d])=>d>=coverage.from&&d<first&&d<=coverage.through),...points];
    }
    return {symbol,currency:'ZAR',basis:'price-return',source:'Yahoo closing prices; cash dividends reinvested on ex-date for total returns',unitCorrections,points,dividends,returnVersion:RETURN_VERSION,totalReturnFrom:points[0][0],totalReturnPoints:cashDividendLevels(points,dividends),checkedAt:new Date(now).toISOString()};
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
