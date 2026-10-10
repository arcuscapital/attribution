import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker,{sign} from '../cloudflare/worker.mjs';
import {bridgeAsset} from '../cloudflare/bridge.mjs';
import {createSessionGuard} from '../site/session.mjs';
const secret='fixture-bridge-key',now=1791620000000,origin='https://attribution.example';
async function request({asset='app.mjs',method='GET',seconds=Math.floor(now/1000),signPath,signMethod}={}){
 const path='/arcus-bridge/'+asset;
 return new Request(origin+path,{method,headers:{'X-Arcus-Time':String(seconds),'X-Arcus-Signature':await sign(secret,`arcus-attribution:v1\n${signMethod||method}\n${signPath||path}\n${seconds}`)}});
}
test('only fresh request-bound server assertions open listed assets',async()=>{
 const env={ANALYSIS_BRIDGE_KEY:secret};
 assert.equal(await bridgeAsset(await request(),env,now),'app.mjs');
 for(const options of [{seconds:now/1000-31},{seconds:now/1000+6},{asset:'private.json'},{method:'POST'},{signPath:'/arcus-bridge/engine.mjs'},{signMethod:'HEAD'}])
  assert.equal(await bridgeAsset(await request(options),env,now),null);
 assert.equal(await bridgeAsset(await request(),{},now),null);
 assert.equal(await bridgeAsset(await request(),{ANALYSIS_BRIDGE_KEY:'wrong'},now),null);
 assert.equal(await bridgeAsset(new Request(origin+'/arcus-bridge/app.mjs'),env,now),null);
});
test('bridge cannot bypass incomplete setup, standalone login, or protected nonassets',async()=>{
 const env={ANALYSIS_BRIDGE_KEY:secret,PASSWORD_PEPPER:'test',PASSWORD_VERIFIER:'test',SESSION_KEY:'test',LOGIN_LIMITER:{},ASSETS:{fetch:async req=>new Response(new URL(req.url).pathname)}};
 assert.equal((await worker.fetch(await request(),{})).status,503);
 assert.equal((await worker.fetch(new Request(origin+'/arcus-bridge/app.mjs'),env)).status,401);
 assert.equal((await worker.fetch(new Request(origin+'/app.mjs'),env)).status,401);
 const response=await worker.fetch(await request({seconds:Math.floor(Date.now()/1000)}),env);
 assert.equal(await response.text(),'/app.mjs');assert.equal(response.headers.get('X-Frame-Options'),'DENY');
 assert.equal(response.headers.get('Set-Cookie'),null);
});
test('session expiry, logout and offline lock before revealing private data',async()=>{
 let status=204,locked=0,unlocked=0;
 const guard=createSessionGuard({fetcher:async()=>new Response(null,{status}),onLock:()=>locked++,onUnlock:()=>unlocked++});
 assert.equal(await guard.check(),true);assert.equal(unlocked,1);
 status=401;assert.equal(await guard.check(),false);assert.equal(locked,1);
 status=204;assert.equal(await guard.check(),true);guard.lock();assert.equal(locked,2);
 const offline=createSessionGuard({fetcher:async()=>{throw Error('offline');},onLock:()=>locked++});
 assert.equal(await offline.check(),false);assert.equal(locked,3);
});
test('in-flight session success cannot unlock after logout',async()=>{
 let complete,unlocked=0;
 const guard=createSessionGuard({fetcher:()=>new Promise(r=>complete=r),onUnlock:()=>unlocked++});
 const pending=guard.check();guard.lock();complete(new Response(null,{status:204}));
 assert.equal(await pending,false);assert.equal(unlocked,0);
});
