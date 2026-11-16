// Prepare a private KV import; never puts an archive in the public site or Git.
// node tools/publish-j303.mjs MODEL_JSON PRICE_DIRECTORY END_DATE OUTPUT_JSON
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildIndexPath,validateModel} from '../site/j303-core.mjs';
import {MODEL_KEY,STATE_KEY,priceKey} from '../cloudflare/j303-scheduled.mjs';
const [modelFile,priceDirectory,end,output]=process.argv.slice(2);
if(!output||!/^\d{4}-\d{2}-\d{2}$/.test(end||''))throw Error('Supply model, price directory, completed end date and private output file');
const model=validateModel(JSON.parse(await fs.readFile(modelFile,'utf8'))),packets=await Promise.all((await fs.readdir(priceDirectory)).filter(f=>f.endsWith('.json')).map(f=>fs.readFile(path.join(priceDirectory,f),'utf8').then(JSON.parse)));
const result=buildIndexPath(model,packets,end);
for(const snap of result.snapshots)if(Math.abs(snap.positions.reduce((s,p)=>s+p.weight,0)-1)>1e-9)throw Error('Holdings do not reconcile');
const state={...result.state,positions:result.snapshots.at(-1).positions,modelVersion:model.version,lastRebalance:result.events.filter(e=>e.kind.includes('review')).at(-1)};
const items=[[MODEL_KEY,model],['j303:model-history:'+model.version,model],[STATE_KEY,state],['j303:health:v1',{status:'ok',asOf:result.last,modelVersion:model.version,checkedAt:new Date().toISOString(),lastRebalance:state.lastRebalance}],...packets.map(p=>[priceKey(p.symbol),p]),...result.snapshots.map(s=>['j303:snapshot:'+s.asOf,{...s,modelVersion:model.version}])].map(([key,value])=>({key,value:JSON.stringify(value)}));
await fs.writeFile(output,JSON.stringify(items));console.log(JSON.stringify({keys:items.length,sessions:result.snapshots.length,members:state.positions.length,asOf:state.asOf,carried:result.carried.length}));
