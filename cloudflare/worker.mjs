// Authentication is server-side. No passwords, verifier or session keys are shipped as assets.
import { dataResponse } from './data.mjs';
import { bridgeAsset } from './bridge.mjs';
const COOKIE = '__Host-arcus-attribution';
const TTL = 86400;
const enc = new TextEncoder();
const loginScript = `document.querySelector('form').addEventListener('submit',async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button'),s=document.querySelector('[role=status]');b.disabled=true;try{const r=await fetch('/login',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams(new FormData(f)),credentials:'same-origin'});if(r.status===204){location.replace('/');return;}s.textContent=r.status===429?'Too many attempts. Please wait a minute.':'Password not recognised. Please try again.';}catch{s.textContent='Could not connect. Please try again.';}finally{b.disabled=false;}});`;
const hex = bytes => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2,'0')).join('');
async function key(secret) {
  return crypto.subtle.importKey('raw', enc.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign','verify']);
}
export async function sign(secret, value) {
  return hex(await crypto.subtle.sign('HMAC', await key(secret), enc.encode(value)));
}
async function verify(secret, value, signature) {
  if (!/^[a-f0-9]{64}$/.test(signature || '')) return false;
  return crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(signature.match(/../g),x=>parseInt(x,16)), enc.encode(value));
}
function headers(extra={}) {
  return {'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
    'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",...extra};
}
function login(message='', status=200) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Arcus Attribution · Sign in</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b1424;color:#eef4ff;font:16px system-ui}main{padding:40px;background:#142238;border:1px solid #31425a;border-radius:16px;max-width:360px;width:calc(100% - 100px)}h1{font-size:26px}p{color:#b7c9df;line-height:1.5}label,input,button{display:block;box-sizing:border-box;width:100%}input{margin:8px 0 18px;padding:14px;border:1px solid #62738b;border-radius:8px;background:#0b1424;color:white;font-size:18px}button{padding:14px;border:0;border-radius:8px;background:#83baff;color:#071322;font-weight:700;font-size:16px}</style><main><h1>Arcus Attribution</h1><p>Private holdings analysis</p><form action="/login" method="post"><label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button>Sign in</button></form><p role="status">${message}</p></main><script src="/login.js" defer></script></html>`,{status,headers:headers({'Content-Type':'text/html; charset=utf-8'})});
}
async function authenticated(request,env) {
  const token=(request.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if (!token || token.length>250) return false;
  const [expiry,nonce,signature,...extra]=token.split('.');
  const seconds=Math.floor(Date.now()/1000);
  return !extra.length && /^\d+$/.test(expiry) && /^[a-f0-9]{32}$/.test(nonce||'') && Number(expiry)>seconds && Number(expiry)<=seconds+TTL && await verify(env.SESSION_KEY, 'session:'+expiry+'.'+nonce, signature);
}
export default {
  async fetch(request,env,ctx) {
    if (!env.PASSWORD_VERIFIER || !env.PASSWORD_PEPPER || !env.SESSION_KEY || !env.LOGIN_LIMITER)
      return new Response('Private site setup is not yet complete.',{status:503,headers:headers()});
    const url=new URL(request.url);
    if (url.protocol!=='https:') return new Response(null,{status:308,headers:{Location:'https://'+url.host+url.pathname}});
    if (url.pathname.startsWith('/arcus-bridge/')) {
      const asset = await bridgeAsset(request, env);
      if (!asset) return new Response('Not authorised.', {status:401,headers:headers()});
      if (asset.startsWith('data/')) return dataResponse(request,env,ctx);
      const response = await env.ASSETS.fetch(new Request(url.origin+(asset === 'index.html' ? '/' : '/'+asset), {method:request.method}));
      const secured = new Response(response.body, response);
      for (const [name,value] of Object.entries(headers())) secured.headers.set(name,value);
      return secured;
    }
    if (url.pathname==='/login.js' && request.method==='GET') return new Response(loginScript,{headers:headers({'Content-Type':'text/javascript; charset=utf-8'})});
    if (request.method==='POST' && ['/login','/logout'].includes(url.pathname)) {
      if (request.headers.get('origin')!==url.origin) return new Response('Request rejected.',{status:403,headers:headers()});
      if (url.pathname==='/logout') return new Response(null,{status:303,headers:headers({Location:'/', 'Set-Cookie':COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0','Clear-Site-Data':'"cache", "storage"'})});
      const allowed=await env.LOGIN_LIMITER.limit({key:'single-user-login'});
      if (!allowed.success) return login('Too many attempts. Please wait a minute.',429);
      if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return login('Invalid sign-in request.',400);
      const reader=request.body?.getReader(),decoder=new TextDecoder(); let body='',size=0;
      if (!reader) return login('Enter your password.',400);
      while (true) { const {done,value}=await reader.read(); if(done)break; size+=value.length; if(size>2048){await reader.cancel();return login('Invalid sign-in request.',413);} body+=decoder.decode(value,{stream:true}); }
      body+=decoder.decode();
      const password=new URLSearchParams(body).get('password') || '';
      if (!password || password.length>256 || !await verify(env.PASSWORD_PEPPER,'password:'+password,env.PASSWORD_VERIFIER)) return login('Password not recognised.',401);
      const payload=(Math.floor(Date.now()/1000)+TTL)+'.'+hex(crypto.getRandomValues(new Uint8Array(16)));
      const token=payload+'.'+await sign(env.SESSION_KEY,'session:'+payload);
      return new Response(null,{status:request.headers.get('accept')==='application/json'?204:303,headers:headers({Location:'/', 'Set-Cookie':COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+TTL})});
    }
    if (!['GET','HEAD'].includes(request.method)) return new Response('Method not allowed',{status:405,headers:headers()});
    if (!await authenticated(request,env)) return url.pathname==='/' || url.pathname==='/login' ? login() : new Response('Sign in required.',{status:401,headers:headers()});
    if (url.pathname === '/session') return new Response(null, {status:204,headers:headers()});
    if (url.pathname.startsWith('/data/')) return dataResponse(request,env,ctx);
    const response=await env.ASSETS.fetch(request);
    const secured=new Response(response.body,response);
    for(const [name,value] of Object.entries(headers())) secured.headers.set(name,value);
    return secured;
  }
};
