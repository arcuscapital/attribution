import {RISE,SWIX,isRisePair,validateReport,period,reported,historyReturn,liveReturn,estimate,completeQuotes,completedCalendar,sessionDate,previous,ETN_PRICE_ONLY,etnPriceReturn,sortRiseGroups} from './rise-swix-core.mjs?v=header-sort-20261109';
import {dateRange} from './ranges.mjs';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text??'';if(cls)n.className=cls;return n;};
export function createRiseSwix({check,lock}){
 let generation=0,controller=new AbortController(),timer,report=null,busy=false,worker=null,rejectWorker=null,last=null,priorCurrency=null,entered=false,syncing=false;
 const prices=new Map(),opened=new Set();
 let sort=null,refocus=null;
 const panel=el('section',null,'panel rise-swix');panel.id='rise-swix';panel.hidden=true;$('results').before(panel);
 const title=el('h2','Rise vs Swix'),note=el('p'),status=el('p'),scroll=el('div',null,'rise-scroll'),table=el('table'),foot=el('p'),download=el('button','Download CSV');download.type='button';
 scroll.append(table);panel.append(title,note,status,download,scroll,foot);
 const live=el('option','Live');live.value='live';live.hidden=true;live.disabled=true;$('range').options[0].after(live);
 const isActive=()=>isRisePair($('portfolio').value,$('benchmark').value);
 function cancel(clear=false){generation++;controller.abort();controller=new AbortController();clearTimeout(timer);worker?.terminate();worker=null;rejectWorker?.(Error('Selection changed'));rejectWorker=null;busy=false;$('run').disabled=false;if(clear){report=null;prices.clear();last=null;table.replaceChildren();panel.hidden=true;opened.clear();}}
 async function get(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(r.status===401){lock();throw Error('Sign in again.');}if(!r.ok)throw Error('Data unavailable. Please retry.');return r.json();}
 function syncRange(){
  if(!isActive())return;
  $('currency').value='ZAR';$('currency').disabled=true;
  const range=$('range').value;
  if(range==='live'){$('start').value=$('end').value=sessionDate();}
  else if(range!=='custom'){const dates=dateRange(range,completedCalendar());if(dates){$('start').value=dates.start;$('end').value=dates.end;}}
  $('controls').classList.toggle('preset',range!=='custom');
  $('range-dates').textContent=$('start').value+' → '+$('end').value;
  $('range-note').textContent=range==='live'?'ZAR · All holdings, sectors and both portfolios refresh together every 35 seconds.':'ZAR · Completed JSE sessions. Other periods use the report weights as labelled research estimates.';
 }
 function syncSelection(event){
  if(syncing)return;syncing=true;
  const p=$('portfolio'),b=$('benchmark'),target=event?.target.id;
  const choose=(select,value)=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));};
  const ordinary=(select,avoid)=>[...select.options].find(o=>![RISE,SWIX,avoid].includes(o.value))?.value;
  if(target==='portfolio'&&p.value===RISE)choose(b,SWIX);
  else if(target==='benchmark'&&b.value===SWIX)choose(p,RISE);
  else if(p.value!==RISE&&b.value===SWIX)choose(b,ordinary(b,p.value));
  else if(b.value!==SWIX&&p.value===RISE)choose(p,ordinary(p,b.value));
  const active=isActive();live.hidden=live.disabled=!active;$('range').options[0].textContent=active?'1D':'One Day';
  if(active){if(!entered){priorCurrency=$('currency').value;entered=true;$('range').value='day';opened.clear();sort=null;}syncRange();}
  else{panel.hidden=true;if(entered){entered=false;$('currency').disabled=false;$('currency').value=priorCurrency||'USD';if($('range').value==='live')$('range').value='day';$('range').dispatchEvent(new Event('change'));}}
  $('assume-zero').closest('label').hidden=active;
  syncing=false;
 }
 function format(v){return v===null?'—':(Math.abs(v)<.005?0:v).toFixed(2);}
 function row(x,type,index){
  const tr=el('tr',null,type),name=el('td');
  if(type==='rise-sector'){
   const button=el('button');button.type='button';button.append(el('span',opened.has(index)?'▾':'▸'),el('span',x.name));button.setAttribute('aria-expanded',String(opened.has(index)));
   button.addEventListener('click',()=>{opened.has(index)?opened.delete(index):opened.add(index);render(last);});name.append(button);
  }else name.textContent=x.name;
  tr.append(name,el('td',x.ticker||''));
  x.values.forEach((v,i)=>tr.append(el('td',format(v),i>1&&v!==null&&v!==0?(v>0?'positive':'negative'):'')));
  return tr;
 }
 function render(value){
  if(!value)return;last=value;const x=scroll.scrollLeft;
  const head=el('thead'),a=el('tr'),b=el('tr');
  // Every column heading sorts: sectors first, then the holdings inside each open sector. Total stays on top.
  const sortable=(th,key,label,name)=>{
   const active=sort?.key===key,button=el('button',label);button.type='button';button.dataset.sort=String(key);
   th.setAttribute('aria-sort',active?(sort.dir===1?'ascending':'descending'):'none');
   button.setAttribute('aria-label','Sort by '+name+(active?(sort.dir===1?', ascending':', descending'):''));
   if(active)button.append(el('span',sort.dir===1?' ↑':' ↓','rise-sort-mark'));
   button.addEventListener('click',()=>{sort=active?{key,dir:-sort.dir}:{key,dir:typeof key==='string'?1:-1};refocus=String(key);render(last);});
   th.append(button);return th;
  };
  for(const [text,key] of [['Name','name'],['Ticker','ticker']]){const th=el('th');th.rowSpan=2;th.scope='col';a.append(sortable(th,key,text,text));}
  ['Avg % weight','Total return (%)','CTR (pp)'].forEach((text,g)=>{const th=el('th',text);th.colSpan=2;th.scope='colgroup';a.append(th);['Port','Bmrk'].forEach((label,s)=>{const sub=el('th');sub.scope='col';b.append(sortable(sub,g*2+s,label,text+' '+label));});});
  head.append(a,b);const body=el('tbody');body.append(row(value.total,'rise-total'));
  sortRiseGroups(value.groups,sort).forEach(({group,index,children})=>{body.append(row(group,'rise-sector',index));if(opened.has(index))children.forEach(c=>body.append(row(c,'rise-holding')));});table.replaceChildren(head,body);scroll.scrollLeft=x;
  if(refocus!==null){table.querySelector('[data-sort="'+refocus+'"]')?.focus();refocus=null;}
  note.textContent='Port = Rise · Bmrk = Swix · '+value.start+' to '+value.end+' · ZAR · '+value.basis;
  foot.textContent=value.exact?'Source: Bloomberg report, 4–5 November 2026. Reported sector totals and source blanks retained.':'Holdings-based estimate. The 4–5 November 2026 report’s average weights are assumed across the selected period; trades and actual average holdings are not reconstructed. ZAR cash is held constant with 0% assumed income. '+(value.live?'Live uses price returns; intraday distributions are not included. Provider quotes may be delayed; Updated is the fetch time.':'Shares use vendor-adjusted returns. NEWSLV and SBCOP use Sharenet closing-price returns (price-only estimates).')+' All figures are in ZAR. Swipe horizontally for more columns.';
  panel.hidden=false;$('empty').hidden=true;$('results').hidden=true;
 }
 async function calculation(returns){return new Promise((resolve,reject)=>{worker=new Worker(new URL('./rise-swix-worker.mjs',import.meta.url),{type:'module'});rejectWorker=reject;worker.onmessage=({data})=>{worker.terminate();worker=null;rejectWorker=null;data.ok?resolve(data.result):reject(Error(data.error));};worker.onerror=()=>{worker?.terminate();worker=null;rejectWorker=null;reject(Error('Calculation unavailable'));};worker.postMessage({report,returns});});}
 async function loadHistory(symbol,baseline,end){
  const key=[symbol,baseline,end].join('|');if(prices.has(key))return prices.get(key);
  const raw=await get('./data/prices?'+new URLSearchParams({symbol,start:baseline,end,...(ETN_PRICE_ONLY.has(symbol)?{source:'sharenet'}:{})}));const value=(ETN_PRICE_ONLY.has(symbol)?etnPriceReturn:historyReturn)(raw,symbol,baseline,end);prices.set(key,value);return value;
 }
 async function run(){
  if(!isActive()||busy||document.hidden)return;busy=true;clearTimeout(timer);const began=Date.now(),gen=generation,liveMode=$('range').value==='live';
  $('run').disabled=true;status.textContent=last?'Refreshing all holdings…':'Checking all holdings…';panel.hidden=false;
  try{
   if(!await check()||gen!==generation)return;
   if(!report){const candidate=validateReport(await get('./data/rise-swix'));if(gen!==generation)return;report=candidate;}
   const start=$('start').value,end=$('end').value;
   if(liveMode&&start!==sessionDate()){syncRange();cancel();void run();return;}
   let value;
   if(!liveMode&&reported(report,start,end))value={groups:report.groups,total:report.total,exact:true,basis:'Bloomberg reported'};
   else{
    const positions=report.groups.flatMap(g=>g.children).filter(p=>!p.cash),symbols=[...new Set(positions.map(p=>p.symbol))],returns={};
    if(liveMode){
     const cycle=crypto.randomUUID(),patch=await completeQuotes(symbols,async(batch,id)=>{
      const r=await fetch('/api/live-prices/shard',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),body:JSON.stringify({symbols:batch,cycleId:id})});
      if(r.status===401){lock();throw Error('Sign in again.');}if(!r.ok)throw Error('Quote batch failed.');return r.json();
     },cycle);
     for(const symbol of symbols)returns[symbol]=liveReturn(patch[symbol],previous(sessionDate()));
    }else{
     const dates=period(start,end);if(dates.end>completedCalendar().at(-1))throw Error('Choose a completed session, or select Live.');
     let next=0,done=0;const missing=[];
     await Promise.all([0,1,2].map(async()=>{while(next<symbols.length){const s=symbols[next++];if(gen!==generation)return;try{returns[s]=await loadHistory(s,dates.baseline,dates.end);}catch(e){if(controller.signal.aborted)throw e;missing.push(s);}status.textContent='Checking prices '+(++done)+' / '+symbols.length;}}));
     if(missing.length)throw Error('Complete valuation unavailable. Missing adjusted prices for '+missing.join(', ')+'. No holdings have been dropped.');
    }
    value={...await calculation(returns),basis:liveMode?'Live price-return estimate':'Holdings-based estimate',live:liveMode};
   }
   if(gen!==generation||!isActive()||!await check())return;
   const at=new Date().toISOString();render({...value,start,end,at});status.textContent='Updated '+new Date(at).toLocaleTimeString()+(liveMode?' · Complete snapshot · 35s refresh':'');
  }catch(e){if(gen===generation){status.textContent=(last?'Keeping the previous complete result from '+new Date(last.at).toLocaleTimeString()+'. ':'')+e.message;}}
  finally{if(gen===generation){busy=false;$('run').disabled=false;$('run').textContent='Compare funds';if(liveMode&&isActive()&&!document.hidden)timer=setTimeout(run,Math.max(1000,35000-(Date.now()-began)));}}
 }
 $('controls').addEventListener('submit',e=>{if(!isActive())return;e.preventDefault();e.stopImmediatePropagation();cancel();last=null;table.replaceChildren();void run();},true);
 for(const id of ['portfolio','benchmark','currency','range','start','end'])$(id).addEventListener('change',e=>{cancel();last=null;table.replaceChildren();note.textContent='';foot.textContent='';status.textContent='';syncSelection(e);if(isActive()&&['range','start','end'].includes(id))syncRange();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else if(isActive()&&$('range').value==='live'){syncRange();void run();}});
 window.addEventListener('pagehide',()=>cancel(true));
 download.addEventListener('click',async()=>{
  const value=last,gen=generation;if(!value||!await check()||generation!==gen)return;
  const rows=[['Name','Ticker','Avg % weight Port','Avg % weight Bmrk','Total return % Port','Total return % Bmrk','CTR pp Port','CTR pp Bmrk'],[value.basis+'; ZAR; '+value.start+' to '+value.end],...([value.total,...value.groups.flatMap(g=>[g,...g.children])].map(r=>[r.name,r.ticker||'',...r.values.map(v=>v??'')]))];
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-](?=\D)/,"'").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='rise-swix-zar-'+value.start+'-'+value.end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 return {isActive,syncRange,syncSelection,clear:()=>cancel(true)};
}
