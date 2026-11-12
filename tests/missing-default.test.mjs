import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
// Owner's rule (2026-11-12): a holding without a price is reported as an error and counted as 0% by
// default, so the rest of the comparison goes ahead. The box can still be unticked.
test('ordinary comparisons count missing returns as 0% by default and name them in red',async()=>{
 const html=await readFile(new URL('../site/index.html',import.meta.url),'utf8'),app=await readFile(new URL('../site/app.mjs',import.meta.url),'utf8');
 assert.match(html,/<input id="assume-zero" type="checkbox" checked \/>/);
 assert.equal((app.match(/\$\('assume-zero'\)\.checked=false/g)||[]).length,0);
 assert.equal((app.match(/\$\('assume-zero'\)\.checked=true/g)||[]).length,2);
 assert.match(app,/No price, counted as 0% return: /);assert.match(app,/"missing-zero"/);
});
