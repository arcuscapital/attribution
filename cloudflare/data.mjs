// Authenticated, on-demand research data. No cron, queue, Arcus DB or private public assets.
import {issuerNav,navQuery} from './issuer-nav.mjs';
const DAY = 86400000;
const SYMBOL = /^[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,29}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const reply = (body, status=200) => Response.json(body, {status,headers:{'Cache-Control':'private, no-store'}});
export function priceQuery(params) {
  const symbol=params.get('symbol'), start=params.get('start'), end=params.get('end');
  if (!SYMBOL.test(symbol || '') || !DATE.test(start || '') || !DATE.test(end || '') ||
      !Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || start>end ||
      Date.parse(end)-Date.parse(start)>1096*DAY || Date.parse(end)>Date.now()+DAY) throw Error('Choose a valid symbol and a period of at most three years.');
  return {symbol,start,end};
}
export async function dataResponse(request,env,ctx={},fetcher=fetch,cache=globalThis.caches?.default) {
  const url=new URL(request.url), route=url.pathname.split('/').at(-1);
  if(request.method!=='GET')return reply({error:'GET required'},405);
  if(route==='nav') {
    let query;try{query=navQuery(url.searchParams);}catch(e){return reply({error:e.message},400);}
    return reply(await issuerNav(query,{fetcher,cache}));
  }
  if(route==='rise-swix') {
    const report=await env.HOLDINGS_ARCHIVE?.get('rise-swix:report:v1');
    return report ? new Response(report,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}}) : reply({error:'Rise/Swix report unavailable'},404);
  }
  if(route==='catalog') {
    const catalog=await env.HOLDINGS_ARCHIVE?.get('catalog','json');
    const ready=await env.HOLDINGS_ARCHIVE?.get('rise-swix:ready');
    return catalog ? reply({...catalog,...(ready?{riseSwixAvailable:true}:{})}) : reply({error:'Saved holdings are not available yet.'},503);
  }
  if(route==='holdings') {
    const fund=url.searchParams.get('fund'), version=url.searchParams.get('version');
    if(!/^[A-Z0-9:._-]{1,50}$/.test(fund||'') || !/^\d{13}$/.test(version||''))return reply({error:'Invalid fund'},400);
    const snapshot=await env.HOLDINGS_ARCHIVE?.get('holdings:'+version+':'+fund,'json');
    return snapshot ? reply(snapshot) : reply({error:'This saved holding is unavailable. Reload the fund list.'},404);
  }
  if(route!=='prices')return reply({error:'Not found'},404);
  let query;
  try {query=priceQuery(url.searchParams);} catch(e){return reply({error:e.message},400);}
  // Public Sharenet closing prices (price only) for JSE listings: the two ETNs always, and any other
  // JSE share as the backup when Yahoo has no usable price. One-year history when the period starts
  // within a year, otherwise ten years. Cached for 15 minutes per listing and range.
  if(url.searchParams.get('source')==='sharenet'){
    if(!/^[A-Z0-9]{2,10}\.JO$/.test(query.symbol))return reply({error:'Unsupported listing'},400);
    const code=query.symbol.slice(0,-3),range=Date.parse(query.start)>=Date.now()-360*DAY?'chart1y':'chart10y';
    const key=new Request('https://analysis-market-cache.invalid/jse-closes-v1/'+range+'/'+code);
    const saved=await cache?.match(key);if(saved)return new Response(saved.body,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
    try{
      const response=await fetcher('https://www.sharenet.co.za/v3/frontend/quickshare_ajax.php?sharecode='+code+'&range='+range+'&compare=none',{signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error('Closing-price source unavailable');
      const body=await response.text();if(body.length>200000)throw Error('Invalid closing-price history');
      const data=JSON.parse(body);if(data.code!==code||typeof data.chart!=='string')throw Error('Closing-price identity mismatch');
      if(cache){const write=cache.put(key,new Response(body,{headers:{'Cache-Control':'public, max-age=900'}}));if(ctx.waitUntil)ctx.waitUntil(write);else await write;}
      return new Response(body,{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store'}});
    }catch{return reply({error:'Closing-price history unavailable'},502);}
  }
  // Cache only public market data, behind authentication. One symbol per invocation.
  const key=new Request('https://analysis-market-cache.invalid/v1/'+encodeURIComponent(query.symbol)+'?start='+query.start+'&end='+query.end);
  const cached=url.searchParams.get('refresh')==='1' ? null : await cache?.match(key);
  if(cached)return reply(await cached.json());
  const period1=Math.floor(Date.parse(query.start)/1000),period2=Math.min(Math.floor(Date.now()/1000),Math.floor(Date.parse(query.end)/1000)+2*86400);
  try {
    const response=await fetcher('https://query1.finance.yahoo.com/v8/finance/chart/'+encodeURIComponent(query.symbol)+'?period1='+period1+'&period2='+period2+'&interval=1d&events=div%2Csplits&includeAdjustedClose=true',{headers:{'User-Agent':'Mozilla/5.0'},signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw Error('Price source is temporarily unavailable');
    const data=await response.json();
    const raw=data.chart?.result?.[0];
    if(raw?.meta?.symbol?.toUpperCase()!==query.symbol.toUpperCase())throw Error('Price identity mismatch');
    const fx=query.symbol.endsWith('=X');
    const values=fx ? raw.indicators?.quote?.[0]?.close : raw.indicators?.adjclose?.[0]?.adjclose;
    if(!values?.length || !raw.timestamp?.length)throw Error('Adjusted closing prices are not available');
    const result={meta:{symbol:raw.meta.symbol,currency:raw.meta.currency,exchangeTimezoneName:raw.meta.exchangeTimezoneName},
      timestamp:raw.timestamp,indicators:fx?{quote:[{close:values}]}:{adjclose:[{adjclose:values}]}};

    if(cache) {
      const write=cache.put(key,Response.json(result,{headers:{'Cache-Control':'public, max-age=900'}}));
      if(ctx.waitUntil)ctx.waitUntil(write);else await write;
    }
    return reply(result);
  } catch(e){return reply({error:e.message || 'Prices unavailable',symbol:query.symbol},502);}
}

