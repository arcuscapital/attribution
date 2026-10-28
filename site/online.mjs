import {normalizeArcusPacket,resolveArchiveListings,isNonListed} from './arcus-source.mjs?v=listed-focus-20261028';
import {completedPrices,valuationPrices} from './price-data.mjs?v=missing-recovery-20261028';
// A failed price request is not evidence that a company is private.
export function missingReturnReason(position) {
  const asset=String(position.asset || '').trim();
  if(/^cash(?:\b|$)/i.test(asset))return 'Cash income unavailable';
  if(/^money market$/i.test(asset))return 'Money-market fund: share-class NAV and income required';
  if(/^(private|unlisted)(?: equity| company)?$/i.test(asset))return 'Private/unlisted holding: no exchange return';
  if(position.symbol)return 'Listed security: adjusted close or same-date FX unavailable';
  return 'Listing unresolved: no verified exchange symbol (not classified as private)';
}
export function arcusReturnLevels(returns,calendar,start,end) {
  const days=calendar.filter(d=>d>=start&&d<=end),prior=calendar.filter(d=>d<start).at(-1),levels=[],used=new Set();
  if(!prior || !days.length)return {levels,used};
  for(const [id,values] of Object.entries(returns)) {
    if(!days.every(d=>Number.isFinite(values[d])&&values[d]>-100))continue;
    let value=100;
    levels.push({id,date:prior,value,currency:'USD',basis:'arcus-completed-session'});
    for(const date of days){value*=1+values[date]/100;levels.push({id,date,value,currency:'USD',basis:'arcus-completed-session'});}
    used.add(id);
  }
  return {levels,used};
}
// Phone-independent data adapter; prices only for the two selected holdings lists.
export function createOnlineSource({fetcher=fetch,onUnauthorized=()=>{},onProgress=()=>{}}={}) {
  let controller=new AbortController(), generation=0;
  const prices=new Map(), holdings=new Map();
  const refreshSymbols=new Set();
  let lastSnapshots=[],lastDownloaded=new Map(),lastCurrency='USD';
  async function get(path) {
    const response=await fetcher('./data/'+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(response.status===401){onUnauthorized();throw Error('Sign in to Arcus again.');}
    let data;try{data=await response.json();}catch{throw Error('Analysis data is temporarily unavailable. Try again.');}
    if(!response.ok)throw Error(data.error || 'Data unavailable');
    return data;
  }
  async function price(symbol,start,end) {
    const key=[symbol,start,end].join('|'),saved=prices.get(key);
    const refresh=refreshSymbols.delete(symbol);
    if(!refresh && saved && Date.now()-saved.at<15*60000)return saved.promise;
    const promise=get('prices?'+new URLSearchParams({symbol,start,end,...(refresh?{refresh:'1'}:{})})).then(raw=>completedPrices(raw,{symbol,start,end}));
    const entry={at:Date.now(),promise};prices.set(key,entry);
    try{return await promise;}catch(e){if(prices.get(key)===entry)prices.delete(key);throw e;}
  }
  return {
    clear(){generation++;controller.abort();controller=new AbortController();prices.clear();holdings.clear();refreshSymbols.clear();lastSnapshots=[];lastDownloaded.clear();},
    retryMissing(missing=[]) {
      const keys=new Set(missing.map(p=>p.fund+'|'+p.id));
      for(const snap of lastSnapshots)for(const p of snap.positions)if(p.symbol && keys.has(snap.fund+'|'+p.id)) {
        refreshSymbols.add(p.symbol);
        const c=lastDownloaded.get(p.symbol)?.currency;
        if(c && c!=='USD')refreshSymbols.add((c==='GBp'?'GBP':c)+'USD=X');
      }
      if(lastCurrency==='ZAR' && refreshSymbols.size)refreshSymbols.add('USDZAR=X');
      return refreshSymbols.size;
    },
    catalog:()=>get('catalog'),
    async calendar(manifest){
      if(manifest?.holdingsSource==='arcus' && manifest.valuationDates?.length)return manifest.valuationDates;
      const now=new Date(),end=new Date(now.getTime()-86400000).toISOString().slice(0,10);
      const start=(now.getUTCFullYear()-1)+'-01-01';
      return (await price('SPY',start,end)).points.map(p=>p[0]);
    },
    async load(manifest,ids,start,end,currency) {
      const run=generation, baseline=new Date(Date.parse(start)-14*86400000).toISOString().slice(0,10);
      if(!start || !end || start>end || Date.parse(end)-Date.parse(start)>1096*86400000)throw Error('Choose a period of at most three years.');
      const sourceNotes=[],arcusReturns={},arcusPackets=new Map();
      const arcus=manifest.holdingsSource==='arcus';
      async function archive(fund){
        const key=manifest.version+':'+fund;
        if(!holdings.has(key))holdings.set(key,await get('holdings?'+new URLSearchParams({fund,version:manifest.version})));
        return holdings.get(key);
      }
      const snapshots=await Promise.all(ids.map(async fund=>{
        if(arcus) {
          const packet=normalizeArcusPacket(await get('arcus-source?'+new URLSearchParams({fund})));
          arcusPackets.set(fund,packet);
          if(packet.warning)sourceNotes.push(fund+': '+packet.warning);
          if(packet.snapshot){
            if(packet.snapshot.positions.some(p=>!p.symbol&&!isNonListed(p))) {
              try{resolveArchiveListings(packet.snapshot,await archive(fund));}
              catch(e){if(controller.signal.aborted)throw e;sourceNotes.push(fund+': saved listing identities unavailable; unresolved listed shares remain visible.');}
            }
            return packet.snapshot;
          }
          sourceNotes.push(fund+': archive allocation fallback; current Arcus constituents dated '+packet.arcusHoldingsAsOf+'.');
        }
        return archive(fund);
      }));
      // A shared listing must not change when the two requests finish in a
      // different order. Prefer the selected portfolio's dated facts on overlap.
      for(const fund of [...ids].reverse())for(const [symbol,values] of Object.entries(arcusPackets.get(fund)?.returns||{}))
        arcusReturns[symbol]={...(arcusReturns[symbol]||{}),...values};
      const calendar=arcus ? manifest.valuationDates||[] : [];
      const useCalendar=calendar.some(d=>d<start)&&calendar.some(d=>d>=start&&d<=end);
      const reused=arcusReturnLevels(arcusReturns,calendar,start,end);
      const symbols=new Set([...(useCalendar?[]:['SPY']),...ids.filter(id=>!id.startsWith('PORTFOLIO:'))]);
      for(const snapshot of snapshots)for(const p of snapshot.positions)if(p.symbol&&!isNonListed(p))symbols.add(p.symbol);
      for(const symbol of reused.used)symbols.delete(symbol);
      if(currency==='ZAR')symbols.add('USDZAR=X');
      const downloaded=new Map(), failures=[];
      async function batch(list) {
        let next=0,done=0;
        await Promise.all([0,1].map(async()=>{
          while(next<list.length) {
            if(run!==generation)throw Error('Data request cancelled');
            const symbol=list[next++];
            try{downloaded.set(symbol,await price(symbol,baseline,end));}
            catch(e){if(run!==generation)throw e;failures.push(symbol+': '+e.message);}
            onProgress(++done,list.length);
          }
        }));
      }
      await batch([...symbols]);
      if(!useCalendar && !downloaded.get('SPY')?.points.length)throw Error('Could not verify the trading dates. Please retry when prices are available.');
      const fxCurrencies=new Set();
      for(const data of downloaded.values())if(!data.symbol.endsWith('=X') && data.currency!=='USD')fxCurrencies.add(data.currency==='GBp'?'GBP':data.currency);
      const supported=new Set('TWD KRW JPY HKD EUR GBP CHF CAD AUD CNY SEK NOK DKK ILS INR SGD NZD BRL MXN ZAR'.split(' '));
      await batch([...fxCurrencies].filter(c=>supported.has(c)).map(c=>c+'USD=X'));
      const levels=[...reused.levels],priceNotes=[...sourceNotes];
      const valuationDates=useCalendar ? calendar : downloaded.get('SPY').points.map(([date])=>date);
      if(arcus)priceNotes.push('Arcus completed-session USD returns reused for '+reused.used.size+' securities/funds. Other requested listings use adjusted-price history only where the selected period is unavailable in Arcus. No intraday quotes are used.');
      for(const [id,data] of downloaded) {
        const aligned=valuationPrices(data,valuationDates);
        if(aligned.carried.length)priceNotes.push(id+': local adjusted close carried across verified '+(data.timeZone==='Asia/Taipei'?'Taiwan':'Tokyo')+' market closures ('+aligned.carried.map(p=>p.date+' uses '+p.priceDate).join('; ')+'); FX still uses each valuation date.');
        if(data.currency==='USD' || id==='USDZAR=X') {
          for(const [date,value] of data.points)levels.push({id,date,value,currency:data.currency,basis:id.endsWith('=X')?'fx':'vendor-adjusted'});
        } else if(!id.endsWith('=X')) {
          const c=data.currency==='GBp'?'GBP':data.currency,fx=downloaded.get(c+'USD=X');
          if(fx?.currency!=='USD')continue;
          const map=new Map(fx.points);
          for(const [date,value] of aligned.points)if(map.has(date))levels.push({id,date,value:value*(data.currency==='GBp'?.01:1)*map.get(date),currency:'USD',basis:'vendor-adjusted'});
        }
      }
      if(run!==generation)throw Error('Data request cancelled');
      lastSnapshots=snapshots;lastDownloaded=downloaded;lastCurrency=currency;
      const returnReasons=Object.fromEntries(snapshots.flatMap(s=>s.positions.map(p=>[s.fund+'|'+p.id,missingReturnReason(p)])));
      const nonListedIds=[...new Set(snapshots.flatMap(s=>s.positions.filter(isNonListed).map(p=>p.id)))];
      return {manifest,snapshots,levels,valuationDates,nonListedIds,returnReasons,priceNotes,priceFailures:failures,sourceWarnings:sourceNotes,arcusSource:arcus,arcusReturnCount:reused.used.size,priceCheckedAt:new Date().toISOString()};
    }
  };
}

