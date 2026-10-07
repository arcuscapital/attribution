import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{sign} from '../cloudflare/worker.mjs';
const origin='https://attribution.example';
async function setup(){return {PASSWORD_PEPPER:'random-test-pepper-not-production',PASSWORD_VERIFIER:await sign('random-test-pepper-not-production','password:fixture-pass'),SESSION_KEY:'random-test-signing-key',LOGIN_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async()=>new Response('private app')}};}
const post=(path,body='password=fixture-pass',headers={})=>new Request(origin+path,{method:'POST',headers:{origin,'content-type':'application/x-www-form-urlencoded',...headers},body});
test('all assets are protected and absent secrets fail closed',async()=>{
 const env=await setup();
 assert.equal((await worker.fetch(new Request(origin),{})).status,503);
 for(const path of ['/engine.mjs','/worker.mjs','/index.html','/style.css','/unknown'])assert.equal((await worker.fetch(new Request(origin+path),env)).status,401);
 assert.match(await (await worker.fetch(new Request(origin),env)).text(),/Password/);
});
test('correct password issues secure cookie; wrong password, forgery and cross-site login fail',async()=>{
 const env=await setup();
 assert.equal((await worker.fetch(post('/login','password=wrong'),env)).status,401);
 assert.equal((await worker.fetch(post('/login',undefined,{origin:'https://evil.example'}),env)).status,403);
 const r=await worker.fetch(post('/login'),env);assert.equal(r.status,303);
 assert.equal((await worker.fetch(post('/login',undefined,{accept:'application/json'}),env)).status,204);
 const cookie=r.headers.get('set-cookie');for(const v of ['HttpOnly','Secure','SameSite=Strict','Path=/'])assert.ok(cookie.includes(v));
 const req=c=>new Request(origin+'/engine.mjs',{headers:{cookie:c}});
 assert.equal(await (await worker.fetch(req(cookie),env)).text(),'private app');
 assert.equal((await worker.fetch(req(cookie.replace(/session=/,'session=x').replace(/\.[a-f0-9]{64}/,'.'+'0'.repeat(64))),env)).status,401);
 const logout=await worker.fetch(post('/logout'),env);assert.ok(logout.headers.get('set-cookie').includes('Max-Age=0'));
});
test('expired sessions and login rate limits are enforced',async()=>{
 const env=await setup(),payload='1.'+'a'.repeat(32),sig=await sign(env.SESSION_KEY,'session:'+payload);
 assert.equal((await worker.fetch(new Request(origin+'/app.mjs',{headers:{cookie:'__Host-arcus-attribution='+payload+'.'+sig}}),env)).status,401);
 env.LOGIN_LIMITER.limit=async()=>({success:false});assert.equal((await worker.fetch(post('/login'),env)).status,429);
});
