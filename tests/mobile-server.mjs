import http from 'node:http';
import {readFile} from 'node:fs/promises';
import worker,{sign} from '../cloudflare/worker.mjs';
const site=new URL('../site/',import.meta.url);
const funds=[{id:'ARKK',name:'ARK Innovation ETF'},{id:'BAI',name:'AI Innovation ETF'},{id:'PORTFOLIO:EASYAI',name:'EasyAI'},{id:'PORTFOLIO:EASYGE',name:'EasyGE'}].map(f=>({...f,dates:['2026-10-05'],latest:'2026-10-05',positions:3}));
const catalog={schemaVersion:1,version:'1790000000000',generatedAt:'2026-10-07T12:00:00Z',funds,valuationDates:[]};
const env={PASSWORD_PEPPER:'local-fixture-only',PASSWORD_VERIFIER:await sign('local-fixture-only','password:fixture-only'),SESSION_KEY:'local-fixture-only',LOGIN_LIMITER:{limit:async()=>({success:true})},ASSETS:{fetch:async request=>{
 const path=new URL(request.url).pathname;const name=path==='/'?'index.html':path.slice(1);
 if(!/^[a-z.-]+$/.test(name))return new Response('',{status:404});
 try{return new Response(await readFile(new URL(name,site)),{headers:{'content-type':name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript'}});}catch{return new Response('',{status:404});}
}},HOLDINGS_ARCHIVE:{get:async key=>key==='catalog'?catalog:{fund:key.split(':').slice(2).join(':'),name:'Synthetic allocation',asOf:'2026-10-05',positions:[{id:'AAPL',symbol:'AAPL',ticker:'AAPL',name:'Apple',sector:'Information Technology',weight:.5},{id:'NVDA',symbol:'NVDA',ticker:'NVDA',name:'Nvidia',sector:'Information Technology',weight:.4},{id:'UNKNOWN',ticker:'Private',name:'Unavailable return example',sector:'Unclassified',weight:.1}]}}};
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 const u=new URL(typeof url==='string'?url:url.url);
 if(u.hostname!=='query1.finance.yahoo.com')return realFetch(url,options);
 const symbol=decodeURIComponent(u.pathname.split('/').at(-1)),timestamp=[],values=[];
 for(let t=Date.parse('2025-01-01T16:00:00Z'),i=0;t<=Date.parse('2026-10-09T16:00:00Z');t+=86400000,i++){
  const day=new Date(t).getUTCDay();if(day===0||day===6)continue;
  timestamp.push(t/1000);values.push(100+i*(symbol==='NVDA'?.4:.2));
 }
 return Response.json({chart:{result:[{meta:{symbol,currency:'USD',exchangeTimezoneName:'America/New_York'},timestamp,indicators:{adjclose:[{adjclose:values}]}}]}});
};
http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url,'http://localhost:8767');let body='';for await(const c of req)body+=c;
  const path=url.pathname.startsWith('/portfolio-analysis')?url.pathname.slice('/portfolio-analysis'.length)||'/':url.pathname;
  const headers=new Headers(req.headers);if(headers.has('origin'))headers.set('origin','https://localhost:8767');
  const response=await worker.fetch(new Request('https://localhost:8767'+path+url.search,{method:req.method,headers,...(!['GET','HEAD'].includes(req.method)?{body}: {})}),env,{waitUntil:p=>p.catch(()=>{})});
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 }catch(e){res.writeHead(500);res.end(String(e));}
}).listen(8767,'127.0.0.1',()=>console.log('Synthetic authenticated mobile QA: http://localhost:8767/portfolio-analysis/'));

