// Private reference replay. Never import these artificial levels/snapshots into the daily archive.
// Usage: node tests/check-bloomberg-export.mjs input.tsv YYYY-MM-DD private/replay.json
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { compare } from '../site/engine.mjs';
const [input, day, output] = process.argv.slice(2);
if (!input || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) throw Error('Supply the export and its user-confirmed valuation date. ONE_DAY is not an absolute date.');
const lines = fs.readFileSync(input, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(s => s.split('\t'));
const header = lines.findIndex(r => r[0] === 'Identifier' && r[1] === 'Ticker');
if (header < 0) throw Error('Unsupported Bloomberg columns');
const total = lines[header + 1];
const rows = lines.slice(header + 2).filter(r => r[1]?.trim());
const n = value => value?.trim() ? Number(value) : 0;
const prior = new Date(day + 'T12:00:00Z'); prior.setUTCDate(prior.getUTCDate() - 1);
while ([0, 6].includes(prior.getUTCDay())) prior.setUTCDate(prior.getUTCDate() - 1);
// This baseline is an arithmetic harness only, not evidence of actual dated holdings or a holiday calendar.
const baseline = prior.toISOString().slice(0, 10);
const dataset = {manifest:{schemaVersion:1,generatedAt:new Date().toISOString(),valuationDates:[baseline,day],months:[day.slice(0,7)],
  validationNotice:'BLOOMBERG INPUT REPLAY ONLY: supplied average weights and returns; not independently collected history. Date supplied by user.',
  funds:['ARKK','BAI'].map(id => ({id,name:'Bloomberg input replay · '+id,dates:[baseline],latest:baseline,positions:rows.filter(r => n(r[id==='ARKK'?2:3])!==0).length}))},snapshots:[],levels:[]};
const levelReturns = new Map();
for (const [fund,weight,ret] of [['ARKK',2,5],['BAI',3,6]]) {
  const positions=[];
  for (const row of rows) {
    if (!n(row[weight])) continue;
    const id=row[1].trim(), r=n(row[ret])/100;
    if (levelReturns.has(id)) assert.ok(Math.abs(levelReturns.get(id)-r)<1e-10, 'Shared security return differs: '+id);
    levelReturns.set(id,r);
    positions.push({id,ticker:id,name:row[0].trim(),sector:'Unclassified',weight:n(row[weight])/100});
  }
  dataset.snapshots.push({fund,asOf:baseline,positions});
}
for (const [id,ret] of [...levelReturns,['ARKK',n(total[5])/100],['BAI',n(total[6])/100]]) {
  for (const [date,value] of [[baseline,100],[day,100*(1+ret)]])
    dataset.levels.push({id,date,value,currency:'USD',basis:'verified-total-return',source:'Artificial one-day index from user-supplied Bloomberg return; REPLAY ONLY'});
}
const options={portfolio:'ARKK',benchmark:'BAI',start:day,end:day,currency:'USD'};
let result;
for(let repeat=0;repeat<10;repeat++) {
  result=compare(dataset,options);
  assert.equal(result.status,'complete');
  for(const [actual,expected] of [[result.returnA,n(total[5])/100],[result.returnB,n(total[6])/100],[result.activeReturn,n(total[7])/100]])
    assert.ok(Math.abs(actual-expected)<2e-11,`${actual} != ${expected}`);
  for(const row of rows) {
    if (!n(row[2]) && !n(row[3])) {
      assert.equal(n(row[8]),0); assert.equal(n(row[9]),0); continue;
    }
    const actual=result.rows.find(r => r.id===row[1].trim());
    assert.ok(actual, 'Missing row '+row[1]);
    assert.ok(Math.abs(actual.ctrA-n(row[8])/100)<2e-11, 'Portfolio CTR mismatch '+row[1]);
    assert.ok(Math.abs(actual.ctrB-n(row[9])/100)<2e-11, 'Benchmark CTR mismatch '+row[1]);
  }
}
if(output) fs.writeFileSync(output,JSON.stringify(dataset));
console.log(JSON.stringify({check:'Bloomberg inputs replayed through actual site engine, NOT independent market-data reconciliation',repeats:10,rows:rows.length,returnA:result.returnA*100,returnB:result.returnB*100,active:result.activeReturn*100},null,2));
