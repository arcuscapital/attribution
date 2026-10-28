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
  return {symbol,currency:meta.currency,timeZone:meta.exchangeTimezoneName,points:[...byDate].sort(([a],[b])=>a.localeCompare(b)),checkedAt:new Date(now).toISOString(),basis:fx?'fx':'vendor-adjusted'};
}

// Cash-equity closures, not the separate derivatives holiday-trading calendar.
// Source: https://www.jpx.co.jp/english/corporate/about-jpx/calendar/index.html
// Verified 2026-10-14. Unverified years/markets retain exact-date-only behaviour.
const TOKYO_HOLIDAYS = {
  2026: new Set('01-01 01-02 01-03 01-12 02-11 02-23 03-20 04-29 05-03 05-04 05-05 05-06 07-20 08-11 09-21 09-22 09-23 10-12 11-03 11-23 12-31'.split(' ')),
  2027: new Set('01-01 01-02 01-03 01-11 02-11 02-23 03-21 03-22 04-29 05-03 05-04 05-05 07-19 08-11 09-20 09-23 10-11 11-03 11-23 12-31'.split(' ')),
};
// TWSE cash-equity calendar, verified 2026-10-28 (opening dates excluded).
// https://www.twse.com.tw/holidaySchedule/holidaySchedule?queryYear=115&response=json
const TAIWAN_HOLIDAYS={2026:new Set('01-01 02-12 02-13 02-15 02-16 02-17 02-18 02-19 02-20 02-27 02-28 04-03 04-04 04-05 04-06 05-01 06-19 09-25 09-28 10-09 10-10 10-25 10-26 12-25'.split(' '))};
function marketClosed(calendar,date) {
  const holidays=calendar[date.slice(0,4)];
  if(!holidays)return false;
  return [0,6].includes(new Date(date+'T00:00:00Z').getUTCDay()) || holidays.has(date.slice(5));
}
const previousDate=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);

// Carry the LOCAL adjusted price only across verified closed days. FX must still
// be observed on the valuation date. Never bridge a missing open-session close.
export function valuationPrices(data, dates) {
  const points=new Map(data.points), carried=[];
  const calendar=/^[0-9A-Z]{4}\.T$/i.test(data.symbol) && data.currency==='JPY' && data.timeZone==='Asia/Tokyo' ? TOKYO_HOLIDAYS
    : /^\d{4,6}\.TW$/i.test(data.symbol) && data.currency==='TWD' && data.timeZone==='Asia/Taipei' ? TAIWAN_HOLIDAYS : null;
  if(!calendar)return {points:data.points,carried};
  const closed=date=>marketClosed(calendar,date);
  for(const date of dates) {
    if(points.has(date) || !closed(date))continue;
    let from=date,steps=0;
    while(closed(from) && steps++<16)from=previousDate(from);
    if(!calendar[from.slice(0,4)] || closed(from) || !points.has(from))continue;
    points.set(date,points.get(from));
    carried.push({date,priceDate:from});
  }
  return {points:[...points].sort(([a],[b])=>a.localeCompare(b)),carried};
}
