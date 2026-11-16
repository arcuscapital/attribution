import {previous,iso} from '../site/rise-swix-core.mjs';
async function sharenet(symbol,fetcher,start,end){
  const code=symbol.slice(0,-3),r=await fetcher('https://www.sharenet.co.za/v3/frontend/quickshare_ajax.php?sharecode='+code+'&range=chart10y&compare=none',{signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('Closing-price backup unavailable');
  const body=await r.text();if(body.length>200000)throw Error('Invalid closing-price history');
  const raw=JSON.parse(body);if(raw.code!==code||typeof raw.chart!=='string')throw Error('Price identity mismatch');
  const points=[...raw.chart.matchAll(/\[(\d{10,13}),\s*([\d.]+)\]/g)].map(([,t,p])=>[iso(Number(t)*(t.length===10?1000:1)+7200000),Number(p)/100]).filter(([d,v])=>d>=start&&d<=end&&v>0);
  if(!points.length)throw Error('No completed closes');return [...new Map(points)];
}
export async function fetchJseHistory(symbol,{fetcher=fetch,now=Date.now(),start='2025-03-01'}={}){
  if(!/^[A-Z0-9-]+\.JO$/.test(symbol))throw Error('Invalid JSE symbol');
  const end=previous(iso(now+7200000));
  try{
    const url='https://query1.finance.yahoo.com/v8/finance/chart/'+symbol+'?period1='+Math.floor(Date.parse(start)/1000)+'&period2='+Math.floor((Date.parse(end)+86400000)/1000)+'&interval=1d&events=splits';
    const r=await fetcher(url,{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
    if(!r.ok)throw Error('Price service unavailable');
    const raw=(await r.json()).chart?.result?.[0];
    if(raw?.meta?.symbol?.toUpperCase()!==symbol||!['ZAR','ZAc'].includes(raw.meta.currency))throw Error('JSE price identity mismatch');
    const scale=raw.meta.currency==='ZAc'?.01:1,closes=raw.indicators?.quote?.[0]?.close||[];
    const points=(raw.timestamp||[]).map((t,i)=>[iso(t*1000+7200000),closes[i]*scale]).filter(([d,v])=>d>=start&&d<=end&&v>0&&Number.isFinite(v));
    if(!points.length)throw Error('No completed closes');
    let unitCorrections=0;
    // Yahoo has historical ZAR/ZAc switches on several JSE listings. A 100x
    // change is corrected ONLY when independent same-day closes confirm it.
    if(points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02))){
      const other=new Map(await sharenet(symbol,fetcher,start,end));
      for(const p of points){const ratio=other.get(p[0])/p[1];if(ratio>99&&ratio<101){p[1]*=100;unitCorrections++;}else if(ratio>.0099&&ratio<.0101){p[1]/=100;unitCorrections++;}}
      if(points.some((p,i)=>i&&(p[1]/points[i-1][1]>50||p[1]/points[i-1][1]<.02)))throw Error('Unresolved currency discontinuity');
    }
    return {symbol,currency:'ZAR',basis:'price-return',source:'Yahoo split-adjusted close (ordinary dividends excluded)',unitCorrections,points,checkedAt:new Date(now).toISOString()};
  }catch(error){
    if(error.message==='Unresolved currency discontinuity')throw error;
    const points=await sharenet(symbol,fetcher,start,end);
    return {symbol,currency:'ZAR',basis:'price-return',source:'Sharenet closing price',points:[...new Map(points)],checkedAt:new Date(now).toISOString()};
  }
}
