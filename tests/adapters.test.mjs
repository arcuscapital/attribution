import {test} from 'node:test';
import assert from 'node:assert/strict';
import '../collector/adapters.js';
const a=globalThis.ArcusSources;
const csv='Date,Account,StockTicker,CUSIP,SecurityName,Weightings,MoneyMarketFlag\n'+Array.from({length:5},(_,i)=>`10/06/2026,TEST,${i===4?'':'X'+i},ID${i},Company ${i},20%,${i===4?'Y':''}`).join('\n');
test('canonical roundtrip retains all dated positions including unmapped cash',()=>{
  const r=a.parse('TEST',{},csv),c=a.canonical(r),back=a.parse('TEST',{},c);
  assert.equal(back.asOf,'2026-10-06');assert.equal(back.positions.length,5);
  assert.equal(back.positions[4].asset,'Cash');assert.equal(back.positions[4].ticker,'');
  assert.equal(back.positions.reduce((s,p)=>s+p.weight,0),100);
});
test('missing weight, mixed dates and incomplete allocation are rejected',()=>{
  assert.throws(()=>a.parse('TEST',{},csv.replace('20%','')));
  assert.throws(()=>a.parse('TEST',{},csv.replace('10/06/2026','10/07/2026')));
  assert.throws(()=>a.parse('TEST',{},csv.replaceAll('20%','10%')));
});
test('decimal NAV weights are scaled but percentage weights are preserved',()=>{
  const r=a.parse('TEST',{},'holdings_date,ticker,proper_name,percent_of_nav\n'+Array.from({length:5},(_,i)=>`2026-10-06,X${i},Name${i},0.2`).join('\n'));
  assert.equal(r.positions[0].weight,20);
});
test('discovery follows the exact fund CSV on known issuer hosts only',()=>{
  assert.equal(a.discover('<a href="https://temaetfs.com/TEST-holdings.csv?a=1&amp;b=2">CSV</a>','','TEST'),'https://temaetfs.com/TEST-holdings.csv?a=1&b=2');
  assert.throws(()=>a.discover('<a href="https://unrelated.test/TEST.csv">CSV</a>','','TEST'));
});
test('Invesco pending dividend allocation is derived from reported value without discarding it',()=>{
  const holdings=Array.from({length:5},(_,i)=>({ticker:'X'+i,issuerName:'Company'+i,percentageOfTotalNetAssets:20,marketValueBase:200}));
  holdings.push({ticker:'USDPDV',issuerName:'USD Pending Dividends',percentageOfTotalNetAssets:null,marketValueBase:1,securityTypeName:'Currency'});
  const r=a.parse('TEST',{sourceFormat:'invesco',cusip:'123'},JSON.stringify({cusip:'123',effectiveDate:'2026-10-06',totalNumberOfHoldings:6,holdings}));
  assert.equal(r.positions.length,6);assert.equal(r.positions[5].weight,.1);
  assert.throws(()=>a.parse('TEST',{sourceFormat:'invesco',cusip:'wrong'},JSON.stringify({cusip:'123',effectiveDate:'2026-10-06',totalNumberOfHoldings:6,holdings})));
});
