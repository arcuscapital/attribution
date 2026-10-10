import {completedPrices} from './price-data.mjs';
// Phone-independent data adapter; prices only for the two selected holdings lists.
export function createOnlineSource({fetcher=fetch,onUnauthorized=()=>{},onProgress=()=>{}}={}) {
  let controller=new AbortController(), generation=0;
  const prices=new Map(), holdings=new Map();
  async function get(path) {
    const response=await fetcher('./data/'+path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});
    if(response.status===401){onUnauthorized();throw Error('Sign in to Arcus again.');}
    let data;try{data=await response.json();}catch{throw Error('Analysis data is temporarily unavailable. Try again.');}
    if(!response.ok)throw Error(data.error || 'Data unavailable');
    return data;
  }
  async function price(symbol,start,end) {
    const key=[symbol,start,end].join('|'),saved=prices.get(key);
    if(saved && Date.now()-saved.at<15*60000)return saved.promise;
    const promise=get('prices?'+new URLSearchParams({symbol,start,end})).then(raw=>completedPrices(raw,{symbol,start,end}));
    const entry={at:Date.now(),promise};prices.set(key,entry);
    try{return await promise;}catch(e){if(prices.get(key)===entry)prices.delete(key);throw e;}
  }
  return {
    clear(){generation++;controller.abort();controller=new AbortController();prices.clear();holdings.clear();},
    catalog:()=>get('catalog'),
    async calendar(){
      const now=new Date(),end=new Date(now.getTime()-86400000).toISOString().slice(0,10);
      const start=(now.getUTCFullYear()-1)+'-01-01';
      return (await price('SPY',start,end)).points.map(p=>p[0]);
    },
    async load(manifest,ids,start,end,currency) {
      const run=generation, baseline=new Date(Date.parse(start)-14*86400000).toISOString().slice(0,10);
      if(!start || !end || start>end || Date.parse(end)-Date.parse(start)>1096*86400000)throw Error('Choose a period of at most three years.');
      const snapshots=await Promise.all(ids.map(async fund=>{
        const key=manifest.version+':'+fund;
        if(!holdings.has(key))holdings.set(key,await get('holdings?'+new URLSearchParams({fund,version:manifest.version})));
        return holdings.get(key);
      }));
      const symbols=new Set(['SPY',...ids.filter(id=>!id.startsWith('PORTFOLIO:'))]);
      for(const snapshot of snapshots)for(const p of snapshot.positions)if(p.symbol)symbols.add(p.symbol);
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
      if(!downloaded.get('SPY')?.points.length)throw Error('Could not verify the trading dates. Please retry when prices are available.');
      const fxCurrencies=new Set();
      for(const data of downloaded.values())if(!data.symbol.endsWith('=X') && data.currency!=='USD')fxCurrencies.add(data.currency==='GBp'?'GBP':data.currency);
      const supported=new Set('TWD KRW JPY HKD EUR GBP CHF CAD AUD CNY SEK NOK DKK ILS INR SGD NZD BRL MXN ZAR'.split(' '));
      await batch([...fxCurrencies].filter(c=>supported.has(c)).map(c=>c+'USD=X'));
      const levels=[];
      for(const [id,data] of downloaded) {
        if(data.currency==='USD' || id==='USDZAR=X') {
          for(const [date,value] of data.points)levels.push({id,date,value,currency:data.currency,basis:id.endsWith('=X')?'fx':'vendor-adjusted'});
        } else if(!id.endsWith('=X')) {
          const c=data.currency==='GBp'?'GBP':data.currency,fx=downloaded.get(c+'USD=X');
          if(fx?.currency!=='USD')continue;
          const map=new Map(fx.points);
          for(const [date,value] of data.points)if(map.has(date))levels.push({id,date,value:value*(data.currency==='GBp'?.01:1)*map.get(date),currency:'USD',basis:'vendor-adjusted'});
        }
      }
      if(run!==generation)throw Error('Data request cancelled');
      return {manifest,snapshots,levels,priceFailures:failures,priceCheckedAt:new Date().toISOString()};
    }
  };
}

