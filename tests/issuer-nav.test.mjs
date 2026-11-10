import {test} from 'node:test';
import assert from 'node:assert/strict';
import {issuerNav,navQuery,navDate,parseNavSource,selectNavReturn} from '../cloudflare/issuer-nav.mjs';
import {navInCurrency} from '../site/online.mjs';
import {dataResponse} from '../cloudflare/data.mjs';
import {deflateRawSync} from 'node:zlib';
import {navWorkbookRows} from '../cloudflare/nav-xlsx.mjs';
const query={fund:'AIQ',date:'2026-11-09',previousDate:'2026-11-06'};
const globalx='AIQ ETF Prices As of Nov 9, 2026 NAV $58.58 Daily Change $1.69 / 2.97% Market Price $58.77 Daily Change $1.88 / 3.30%';
const json={status:'ok',fund:'AIQ',date:query.date,previousDate:query.previousDate,currency:'USD',return:.0297,basis:'nav-price-change'};
const opt={...query,currency:'USD'};
test('NAV query accepts only completed bounded dates and a symbol, not arbitrary URLs',()=>{
  assert.deepEqual(navQuery(new URLSearchParams(query),Date.parse('2026-11-10')),query);
  for(const bad of [{fund:'https://evil.invalid'},{date:'2026-02-30'},{date:'2026-11-10'},{previousDate:'2026-10-01'},{previousDate:query.date}])
    assert.throws(()=>navQuery(new URLSearchParams({...query,...bad}),Date.parse('2026-11-10')));
  assert.equal(navDate('06-Sept-2026'),'2026-09-06');assert.equal(navDate('2/30/2026'),null);
});
test('issuer parser selects NAV daily change, not neighbouring market return',async()=>{
  const p=await parseNavSource({type:'globalx'},globalx,'AIQ');
  assert.equal(selectNavReturn(p,query).return,.0297);
  assert.equal(selectNavReturn(p,{...query,date:'2026-11-06',previousDate:'2026-11-05'}).status,'no-data');
  await assert.rejects(parseNavSource({type:'globalx'},globalx,'BOTZ'));
  const loss=await parseNavSource({type:'globalx'},globalx.replace('AIQ','LIT').replace('$1.69 / 2.97%','-$0.39 / -0.64%'),'LIT');
  assert.equal(loss.daily.return,-.0064);
});
test('iShares and Janus require the NAV and change dates to agree, including losses and zero',async()=>{
  const h='IBIT NAV as of Nov 09, 2026 $ $ 42.31 52 WK: 33 - 60 1 Day NAV Change as of Nov 09, 2026 Decrease $ $ -0.56 ( -1.32 %)';
  assert.equal((await parseNavSource({type:'ishares'},h,'IBIT')).daily.return,-.0132);
  await assert.rejects(parseNavSource({type:'ishares'},h.replace('Change as of Nov 09','Change as of Nov 06'),'IBIT'));
  const j='JHAI NAV $30.11 As of 11/09/2026 1-Day Change $0.00 (0.00%) As of 11/09/2026';
  assert.equal((await parseNavSource({type:'janus'},j,'JHAI')).daily.return,0);
});
test('history requires both exact valuation dates and detects intervening sessions',async()=>{
  const body='Fund Name,Fund Ticker,CUSIP,NAV,Market Price,Rate Date\nFund,CHAT,123,100,102,11/05/2026\nFund,CHAT,123,101,108,11/06/2026\nFund,CHAT,123,105,115,11/09/2026';
  const p=await parseNavSource({type:'roundhill'},body,'CHAT');
  assert.ok(Math.abs(selectNavReturn(p,query).return-(105/101-1))<1e-12);
  assert.equal(selectNavReturn(p,{...query,previousDate:'2026-11-05'}).status,'no-data');
  await assert.rejects(parseNavSource({type:'roundhill'},body,'HUMN'));
  await assert.rejects(parseNavSource({type:'roundhill'},body+'\nFund,CHAT,123,106,115,11/09/2026','CHAT'));
});
test('First Trust uses NAV column and WisdomTree isolates its NAV block',async()=>{
  const f='<h1>AIRR</h1><table><tr><th>Date</th><th>Market Price</th><th>Net Asset Value</th></tr><tr><td>11/9/2026</td><td>$200</td><td>$110</td></tr><tr><td>11/6/2026</td><td>$100</td><td>$100</td></tr></table>';
  assert.ok(Math.abs(selectNavReturn(await parseNavSource({type:'firsttrust'},f,'AIRR'),query).return-.1)<1e-12);
  const w='WTAI Net Asset Value As of 11/9/2026 NAV $33.058 Change $1.555 Change % 4.94% Closing Market Price Change % 6.34%';
  assert.ok(Math.abs((await parseNavSource({type:'wisdomtree'},w,'WTAI')).daily.return-.0494)<1e-12);
});
test('request fetches only its fixed issuer source, caches public data, and does not invent unavailable values',async()=>{
  const saved=new Map();let calls=0;
  const cache={match:async k=>saved.get(k.url)?.clone(),put:async(k,v)=>saved.set(k.url,v.clone())};
  const fetcher=async(url,opts)=>{calls++;assert.match(url,/^https:\/\/www.globalxetfs.com\/funds\/aiq/);assert.equal(opts.redirect,'error');assert.equal(opts.headers.Cookie,undefined);return new Response(globalx);};
  assert.equal((await issuerNav(query,{fetcher,cache})).return,.0297);
  assert.equal((await issuerNav(query,{fetcher,cache})).return,.0297);assert.equal(calls,1);
  const missing=await issuerNav({...query,fund:'UNKNOWN'},{fetcher,cache});assert.equal(missing.return,null);assert.equal(calls,1);
  assert.equal((await issuerNav(query,{fetcher:async()=>new Response('blocked',{status:403}),cache:null})).status,'no-data');
  assert.equal((await issuerNav(query,{fetcher,cache:{match:async()=>{throw Error('cache unavailable');},put:async()=>{throw Error('cache unavailable');}}})).return,.0297);
});

// A minimal genuine compressed XLSX container, constructed without fixture files.
function workbook(xml){
 const name=Buffer.from('xl/worksheets/sheet1.xml'),raw=Buffer.from(xml),data=deflateRawSync(raw);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt16LE(name.length,26);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(8,10);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(raw.length,24);directory.writeUInt16LE(name.length,28);
 const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(local.length+name.length+data.length,16);
 return Buffer.concat([local,name,data,directory,name,end]);
}
test('compressed issuer NAV workbook preserves date/NAV columns and rejects malformed containers',async()=>{
 const row=(a,b,i)=>`<row><c r="A${i}" t="inlineStr"><is><t>${a}</t></is></c><c r="B${i}" t="inlineStr"><is><t>${b}</t></is></c></row>`;
 const bytes=workbook('<worksheet><sheetData>'+row('Ticker Symbol','XLK',1)+row('Date','NAV',2)+row('Nov 6 2026','100',3)+row('Nov 9 2026','103',4)+'</sheetData></worksheet>');
 const parsed=await parseNavSource({type:'ssga'},bytes,'XLK');assert.ok(Math.abs(selectNavReturn(parsed,query).return-.03)<1e-12);
 await assert.rejects(parseNavSource({type:'ssga'},bytes,'MDY'));
 await assert.rejects(navWorkbookRows(bytes.slice(0,-30)));
 const corrupt=Buffer.from(bytes);corrupt.writeUInt32LE(7000000,corrupt.readUInt32LE(corrupt.length-6)+24);await assert.rejects(navWorkbookRows(corrupt),/Invalid part/);
});
test('NAV route rejects invalid input before fetch and contains upstream failures',async()=>{
  let calls=0;const f=async()=>{calls++;throw Error('private internal message');};
  const invalid=await dataResponse(new Request('https://analysis.invalid/data/nav?fund=AIQ'),{}, {},f,null);assert.equal(invalid.status,400);assert.equal(calls,0);
  const valid=await dataResponse(new Request('https://analysis.invalid/data/nav?'+new URLSearchParams(query)),{}, {},f,null);assert.equal(valid.status,200);assert.equal((await valid.json()).status,'no-data');
});
test('same-date USD/ZAR conversion is explicit and missing FX never becomes zero',()=>{
  assert.equal(navInCurrency(json,opt).return,.0297);
  const zar=navInCurrency(json,{...opt,currency:'ZAR',fx:[['2026-11-06',18],['2026-11-09',18.5]]});
  assert.ok(Math.abs(zar.return-((1+.0297)*18.5/18-1))<1e-12);assert.equal(zar.fxAdjusted,true);
  for(const packet of [null,{...json,date:'2026-11-06'},{...json,fund:'WRONG'},{...json,return:null},{...json,basis:'market'}])assert.equal(navInCurrency(packet,opt).return,null);
  assert.equal(navInCurrency(json,{...opt,currency:'ZAR',fx:[['2026-11-09',18.5]]}).return,null);
});
