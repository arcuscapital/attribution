// Authenticated, on-demand research data. No cron, queue, Arcus DB or private public assets.
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
  if(route==='catalog') {
    const catalog=await env.HOLDINGS_ARCHIVE?.get('catalog','json');
    return catalog ? reply(catalog) : reply({error:'Saved holdings are not available yet.'},503);
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
  // Cache only public market data, behind authentication. One symbol per invocation.
  const key=new Request('https://analysis-market-cache.invalid/v1/'+encodeURIComponent(query.symbol)+'?start='+query.start+'&end='+query.end);
  const cached=await cache?.match(key);
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

