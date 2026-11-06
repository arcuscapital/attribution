import {estimate} from './rise-swix-core.mjs';
self.onmessage=({data})=>{try{self.postMessage({ok:true,result:estimate(data.report,data.returns)});}catch(e){self.postMessage({ok:false,error:e.message});}};
