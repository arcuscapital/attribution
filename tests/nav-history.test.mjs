import test from 'node:test';
import assert from 'node:assert/strict';
import {historicalNav,NAV_HISTORY_PREFIX} from '../cloudflare/nav-history.mjs';
import {dataResponse} from '../cloudflare/data.mjs';
const query={fund:'ARKK',previousDate:'2026-11-09',date:'2026-11-10'};
const record={fund:'ARKK',currency:'USD',field:'FUND_NET_ASSET_VAL',importedAt:'2026-11-12T00:00:00Z',points:[['2026-11-06',90],['2026-11-09',100],['2026-11-10',103]]};
const archive=value=>({get:async(key,type)=>{assert.equal(key,NAV_HISTORY_PREFIX+'ARKK');assert.equal(type,'json');return value;}});
test('private historical NAV returns exact adjacent values with provenance',async()=>{
 const r=await historicalNav(query,archive(record));assert.ok(Math.abs(r.return-.03)<1e-12);assert.equal(r.sourceType,'bloomberg-import');assert.equal(r.nav,103);
});
test('history rejects wrong identity, missing dates, intervening sessions, invalid values and unverified jumps',async()=>{
 for(const v of [null,{...record,fund:'BAI'},{...record,currency:'ZAR'},{...record,field:'PX_LAST'},{...record,points:[['2026-11-09',0],['2026-11-10',103]]},{...record,points:[['2026-11-09',100],['2026-11-10',50]]}])assert.equal(await historicalNav(query,archive(v)),null);
 assert.equal(await historicalNav({...query,previousDate:'2026-11-06'},archive(record)),null);
 assert.equal(await historicalNav({...query,date:'2026-11-11'},archive(record)),null);
 assert.equal(await historicalNav(query,{get:async()=>{throw Error('offline');}}),null);
});
test('route uses private history without issuer fetch, and never carries it to a newer day',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('unavailable');};
 const request=q=>new Request('https://test.invalid/data/nav?'+new URLSearchParams(q));
 const r=await dataResponse(request(query),{HOLDINGS_ARCHIVE:archive(record)},{},fetcher,null);assert.equal((await r.json()).sourceType,'bloomberg-import');assert.equal(calls,0);assert.equal(r.headers.get('Cache-Control'),'private, no-store');
 const newer=await dataResponse(request({...query,date:'2026-11-11',previousDate:'2026-11-10'}),{HOLDINGS_ARCHIVE:archive(record)},{},fetcher,null);assert.equal((await newer.json()).status,'no-data');
});
