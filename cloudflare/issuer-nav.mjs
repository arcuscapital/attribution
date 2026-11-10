import sources from './nav-sources.json' with {type:'json'};
import {navWorkbookRows} from './nav-xlsx.mjs';
const DAY=86400000;
export function navDate(value) {
  if(typeof value!=='string')return null;
  const s=value.trim();let m=s.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/),iso;
  if(m)iso=m.slice(1,4).join('-');
  else if((m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)))iso=`${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  else if(/^(?:\d{1,2}-[A-Za-z]{3,9}-\d{4}|[A-Za-z]{3,9} \d{1,2},? \d{4})$/.test(s)) {const t=Date.parse(s+' UTC');if(Number.isFinite(t))iso=new Date(t).toISOString().slice(0,10);}
  if(!iso||!Number.isFinite(Date.parse(iso))||new Date(iso).toISOString().slice(0,10)!==iso)return null;
  return iso;
}
export function navQuery(params,now=Date.now()) {
  const fund=params.get('fund'),date=params.get('date'),previousDate=params.get('previousDate');
  if(!/^[A-Z][A-Z0-9]{0,9}$/.test(fund||'')||navDate(date)!==date||navDate(previousDate)!==previousDate||previousDate>=date||
    Date.parse(date)-Date.parse(previousDate)>7*DAY||date>=new Date(now).toISOString().slice(0,10))throw Error('Invalid completed 1D NAV period');
  return {fund,date,previousDate};
}
export const plain=s=>String(s).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&#(?:x([a-f\d]+)|(\d+));/gi,(_,a,b)=>String.fromCharCode(parseInt(a||b,a?16:10))).replace(/\s+/g,' ').trim();
const num=s=>typeof s==='number'?s:Number(String(s).replace(/[$,%\s,]/g,''));
export function csvRows(s) {
  const rows=[];let row=[],cell='',quote=false;
  for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(quote&&s[i+1]==='"'){cell+='"';i++;}else quote=!quote;}
    else if(!quote&&(c===','||c==='\n')){row.push(cell.replace(/\r$/,''));cell='';if(c==='\n'){rows.push(row);row=[];}}
    else cell+=c;}
  if(cell||row.length){row.push(cell.replace(/\r$/,''));rows.push(row);}if(quote)throw Error('Malformed CSV');return rows;
}
function observations(rows) {
  const map=new Map();
  for(const [rawDate,rawNav] of rows){const date=navDate(rawDate),nav=num(rawNav);if(!date||!(nav>0)||!Number.isFinite(nav))continue;
    if(map.has(date)&&map.get(date)!==nav)throw Error('Conflicting NAVs');map.set(date,nav);}
  return [...map].sort(([a],[b])=>a.localeCompare(b));
}
export async function parseNavSource(source,body,fund) {
  if(source.type==='ssga'){
    const rows=await navWorkbookRows(body),identity=rows.find(r=>/^Ticker Symbol:?$/i.test(r[0]||'')),header=rows.findIndex(r=>r[0]==='Date'&&r[1]==='NAV');
    if(identity?.[1]!==fund||header<0)throw Error('NAV identity or columns mismatch');
    return {points:observations(rows.slice(header+1).map(r=>[r[0],r[1]]))};
  }
  if(source.type==='roundhill'){
    const rows=csvRows(body),head=rows.shift(),date=head.indexOf('Rate Date'),nav=head.indexOf('NAV'),ticker=head.indexOf('Fund Ticker');
    if(Math.min(date,nav,ticker)<0||rows.some(r=>r.length>1&&r[ticker]!==fund))throw Error('NAV identity or columns mismatch');
    return {points:observations(rows.map(r=>[r[date],r[nav]]))};
  }
  if(source.type==='wisdomtree-history'){
    const data=JSON.parse(body);if(!Array.isArray(data))throw Error('Invalid issuer history');
    return {points:observations(data.map(r=>[r.dt,r.nav]))};
  }
  const t=plain(body);
  if(!new RegExp('\\b'+fund+'\\b').test(t))throw Error('Fund identity missing');
  if(source.type==='firsttrust'){
    const table=body.match(/<table[^>]*>[\s\S]*?Date[\s\S]*?Market Price[\s\S]*?Net Asset Value[\s\S]*?<\/table>/i)?.[0];
    if(!table)throw Error('NAV table missing');
    const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>plain(c[1])));
    return {points:observations(rows.filter(r=>navDate(r[0])).map(r=>[r[0],r[2]]))};
  }
  let m,date,nav,change;
  if(source.type==='ishares'){
    m=t.match(/NAV as of ([A-Za-z]+ \d{1,2}, \d{4})\s*\$\s*\$?\s*([\d,.]+)[\s\S]{0,100}?1 Day NAV Change as of ([A-Za-z]+ \d{1,2}, \d{4})\s*(?:Increase|Decrease)?\s*\$\s*\$?\s*([-\d,.]+)\s*\(\s*([-\d.]+)\s*%/i);
    if(m&&navDate(m[1])===navDate(m[3])){date=navDate(m[1]);nav=num(m[2]);change=num(m[5])/100;}
  } else if(source.type==='globalx'){
    m=t.match(/ETF Prices As of ([A-Za-z]+ \d{1,2}, \d{4}) NAV \$([\d,.]+) Daily Change [-+$\d,.]+\s*\/\s*([-\d.]+)%/i);
    if(m){date=navDate(m[1]);nav=num(m[2]);change=num(m[3])/100;}
  } else if(source.type==='janus'){
    m=t.match(/NAV \$([\d,.]+) As of ([\d/]+) 1-Day Change \$[-\d,.]+\s*\(([-\d.]+)%\) As of ([\d/]+)/i);
    if(m&&navDate(m[2])===navDate(m[4])){date=navDate(m[2]);nav=num(m[1]);change=num(m[3])/100;}
  } else if(source.type==='wisdomtree'){
    m=t.match(/Net Asset Value As of ([\d/]+) NAV \$([\d,.]+) Change \$?[-\d,.]+ Change % ([-\d.]+)%/i);
    if(m){date=navDate(m[1]);nav=num(m[2]);change=num(m[3])/100;}
  }
  if(!date||!(nav>0)||!Number.isFinite(change)||change<=-1)throw Error('Dated NAV change missing');
  return {points:[[date,nav]],daily:{date,nav,return:change}};
}
export function selectNavReturn(parsed,query) {
  const {date,previousDate}=query,points=parsed.points.filter(([d])=>d<=date),last=points.at(-1),prior=points.at(-2);
  if(last?.[0]===date&&prior?.[0]===previousDate)return {status:'ok',nav:last[1],previousNav:prior[1],return:last[1]/prior[1]-1};
  if(parsed.daily?.date===date)return {status:'ok',nav:parsed.daily.nav,return:parsed.daily.return,previousNav:null,publishedDailyChange:true};
  return {status:'no-data',return:null,reason:'No issuer NAV change for the selected date'};
}
async function boundedBody(response,binary) {
  const reader=response.body.getReader(),chunks=[];let size=0;
  for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>5000000){await reader.cancel();throw Error('Issuer response too large');}chunks.push(r.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  return binary?bytes:new TextDecoder().decode(bytes);
}
export async function issuerNav(query,{fetcher=fetch,cache=globalThis.caches?.default,now=Date.now()}={}) {
  const source=sources[query.fund],base={...query,currency:'USD',basis:'nav-price-change',checkedAt:new Date(now).toISOString()};
  if(!source)return {...base,status:'no-data',return:null,reason:'No verified issuer NAV source'};
  const key=new Request('https://analysis-market-cache.invalid/issuer-nav-v1/'+query.fund);
  try {
    let parsed=null;
    try {const saved=await cache?.match(key);parsed=saved?await saved.json():null;} catch {}
    if(!parsed){
      // Workers supports manual/follow, not the browser's redirect:error mode.
      // Refuse every redirect here; registry entries are canonical issuer URLs.
      const response=await fetcher(source.url,{headers:{'User-Agent':'Mozilla/5.0','Accept':source.type.endsWith('history')?'application/json':'*/*'},redirect:'manual',signal:AbortSignal.timeout(14000)});
      if(!response.ok)throw Error('Issuer unavailable');
      parsed=await parseNavSource(source,await boundedBody(response,source.type==='ssga'),query.fund);
      parsed.checkedAt=base.checkedAt;
      if(!parsed.points.length)throw Error('Empty issuer NAV data');
      try {await cache?.put(key,Response.json(parsed,{headers:{'Cache-Control':'public, max-age=900'}}));} catch {}
    }
    return {...base,...selectNavReturn(parsed,query),sourceUrl:source.page||source.url,issuer:source.issuer,checkedAt:parsed.checkedAt||base.checkedAt};
  } catch {return {...base,status:'no-data',return:null,sourceUrl:source.page||source.url,issuer:source.issuer,reason:'Issuer NAV data unavailable'};}
}
