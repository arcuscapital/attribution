// Validate and date prices in the browser, avoiding date-format CPU work on Workers Free.
export function completedPrices(result, {symbol,start,end}, now=Date.now()) {
  const meta=result?.meta || {}, stamps=result?.timestamp || [];
  if (meta.symbol?.toUpperCase() !== symbol.toUpperCase()) throw Error('Price identity mismatch');
  const fx=symbol.endsWith('=X');
  const values=fx ? result?.indicators?.quote?.[0]?.close : result?.indicators?.adjclose?.[0]?.adjclose;
  if (!values?.length) throw Error('Adjusted closing prices are not available');
  const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:meta.exchangeTimezoneName || 'UTC',year:'numeric',month:'2-digit',day:'2-digit'});
  const iso=ms=>{const p=Object.fromEntries(formatter.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));return [p.year,p.month,p.day].join('-');};
  const today=iso(now), byDate=new Map();
  for(let i=0;i<stamps.length;i++) {
    const date=iso(stamps[i]*1000), value=values[i];
    // Never substitute a quote, raw equity close, or still-forming daily bar.
    if(date>=start && date<=end && date<today && typeof value==='number' && Number.isFinite(value) && value>0) byDate.set(date,value);
  }
  return {symbol,currency:meta.currency,points:[...byDate].sort(([a],[b])=>a.localeCompare(b)),checkedAt:new Date(now).toISOString(),basis:fx?'fx':'vendor-adjusted'};
}
