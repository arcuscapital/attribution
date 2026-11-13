import {RISE,SWIX,isRisePair,validateReport,period,reported,historyReturn,liveReturn,estimate,completeQuotes,completedCalendar,sessionDate,previous,ETN_PRICE_ONLY,etnPriceReturn,sortRiseGroups,withShareReturns,collectQuotes,liveReturns,jseCloseReturn,checkCoverage,adjustedLevels,jseCloseLevels,riseSeries} from './rise-swix-core.mjs?v=return-chart-20261112';
import {dateRange,drawReturnChart,renderSectorWeights} from './ranges.mjs?v=weights-20261113';
const $=id=>document.getElementById(id),el=(tag,text,cls)=>{const n=document.createElement(tag);n.textContent=text??'';if(cls)n.className=cls;return n;};
export function createRiseSwix({check,lock}){
 let generation=0,controller=new AbortController(),timer,report=null,busy=false,worker=null,rejectWorker=null,last=null,priorCurrency=null,priorGrouping='none',entered=false,syncing=false;
 const prices=new Map(),opened=new Set();let current=null;
 let sort=null,refocus=null,cooldown;
 const panel=el('section',null,'panel rise-swix');panel.id='rise-swix';panel.hidden=true;$('results').before(panel);
 const title=el('h2','Rise vs Swix'),note=el('p'),status=el('p'),scroll=el('div',null,'rise-scroll'),table=el('table'),foot=el('p'),download=el('button','Download CSV');download.type='button';
 // Live only: refresh now without clearing the table; disabled while refreshing and for 5 s after a press.
 const refresh=el('button','Refresh'),actions=el('div',null,'rise-actions');refresh.type='button';refresh.hidden=true;refresh.setAttribute('aria-label','Refresh live prices now');actions.append(download,refresh);
 // Red list of holdings without a usable price in the latest attempt; hidden when every holding is priced.
 const missingNote=el('p',null,'rise-missing');missingNote.hidden=true;
 // Cumulative return chart for periods of two or more sessions, directly under the table.
 const chart=el('div',null,'return-chart');chart.hidden=true;
 // GICS sector weights under the chart, with or without grouping (owner, 2026-11-13).
 const weights=el('div',null,'sector-weights');weights.hidden=true;
 scroll.append(table);panel.append(title,note,status,missingNote,actions,scroll,chart,weights,foot);
 function showMissing(symbols=[],zeroed=false){ // zeroed: 'live', 'history' or false
  const names=new Map((report?.groups||[]).flatMap(g=>g.children).filter(p=>!p.cash).map(p=>[p.symbol,p.name+' ('+p.ticker+')'])),list=[...new Set(symbols)].map(s=>names.get(s)||s);
  missingNote.textContent=list.length?(zeroed?(zeroed==='live'?'No live price from Yahoo or Sharenet, counted as 0% return: ':'No price from Yahoo or Sharenet for these dates, counted as 0% return: '):'Not getting prices for '+list.length+(list.length===1?' share: ':' shares: '))+list.join(', '):'';missingNote.hidden=!list.length;
 }
 $('grouping')?.addEventListener('change',()=>{if(isActive()&&last)render(last);});
 const live=el('option','Live');live.value='live';live.hidden=true;live.disabled=true;$('range').options[0].after(live);
 const isActive=()=>isRisePair($('portfolio').value,$('benchmark').value);
 function cancel(clear=false){generation++;controller.abort();controller=new AbortController();clearTimeout(timer);clearTimeout(cooldown);refresh.disabled=false;worker?.terminate();worker=null;rejectWorker?.(Error('Selection changed'));rejectWorker=null;busy=false;$('run').disabled=false;if(clear){report=null;prices.clear();last=null;table.replaceChildren();drawReturnChart(chart,null);panel.hidden=true;opened.clear();showMissing();}}
 async function get(path){const r=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:controller.signal});if(r.status===401){lock();throw Error('Sign in again.');}if(!r.ok)throw Error('Data unavailable. Please retry.');return r.json();}
 function syncRange(){
  if(!isActive())return;
  $('currency').value='ZAR';$('currency').disabled=true;
  const range=$('range').value;refresh.hidden=range!=='live';
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
  if(active){if(!entered){priorCurrency=$('currency').value;priorGrouping=$('grouping')?.value||'none';if($('grouping'))$('grouping').value='gics';entered=true;$('range').value='day';opened.clear();current=null;sort=null;}syncRange();}
  else{panel.hidden=true;if(entered){entered=false;if($('grouping'))$('grouping').value=priorGrouping;$('currency').disabled=false;$('currency').value=$('benchmark').value===SWIX?'ZAR':'USD';if($('range').value==='live')$('range').value='day';$('range').dispatchEvent(new Event('change'));}}
  $('assume-zero').closest('label').hidden=active;
  syncing=false;
 }
 function format(v){return v===null?'—':(Math.abs(v)<.005?0:v).toFixed(2);}
 function row(x,type,index){
  const tr=el('tr',null,type),name=el('td');
  if(type==='rise-sector'){
   const button=el('button');button.type='button';button.append(el('span',opened.has(index)?'▾':'▸'),el('span',x.name));button.setAttribute('aria-expanded',String(opened.has(index)));
   button.addEventListener('click',()=>{opened.has(index)?opened.delete(index):opened.add(index);current=index;render(last);});name.append(button);
   if(current===index)tr.classList.add('rise-current'); // the last clicked sector gets the Bloomberg selection band
  }else name.textContent=x.name;
  tr.append(name,el('td',x.ticker||''));
  x.values.forEach((v,i)=>{
   const td=el('td',format(v),i>1&&v!==null&&v!==0?(v>0?'positive':'negative'):'');
   if(x.reference?.includes(i)){td.classList.add('rise-reference');td.title=(i===2?'Rise':'Swix')+' does not hold this share. Its own return, for reference.';}
   if(x.zeroed&&(i===2||i===3)&&v!==null){td.classList.add('rise-zeroed');td.title='No price from Yahoo or Sharenet: counted as 0% return.';}
   tr.append(td);
  });
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
  // Grouping: GICS sectors (default here) or No grouping, which lists every holding like the other comparisons.
  const flat=$('grouping')?.value==='none';table.classList.toggle('rise-flat',flat);
  if(flat)sortRiseGroups([{name:'',values:[],children:value.groups.flatMap(g=>g.children)}],sort)[0].children.forEach(c=>body.append(row(c,'rise-holding')));
  else sortRiseGroups(value.groups,sort).forEach(({group,index,children})=>{body.append(row(group,'rise-sector',index));if(opened.has(index))children.forEach(c=>body.append(row(c,'rise-holding')));});
  table.replaceChildren(head,body);scroll.scrollLeft=x;
  if(refocus!==null){table.querySelector('[data-sort="'+refocus+'"]')?.focus();refocus=null;}
  drawReturnChart(chart,value.series&&!value.live&&!value.exact?{...value.series,labelA:value.total?.name||'Rise',labelB:'SWIX ALL SHARE',note:'ZAR · report weights from the start · adjusted closes (Sharenet closes where Yahoo had none)'}:null);
  renderSectorWeights(weights,{list:value.groups.map(g=>({name:g.name,a:g.values[0]??0,b:g.values[1]??0})),total:{name:'Total',a:value.total.values[0],b:value.total.values[1]}},{portfolio:'Rise',benchmark:'Swix',heading:'h3',note:'Report average weights by GICS sector (Bloomberg report sectors).'});
  note.textContent='Port = Rise · Bmrk = Swix · '+value.start+' to '+value.end+' · ZAR · '+value.basis;
  const reference=' Italic returns are for shares that side does not hold: the share’s own return, for reference, with no weight or contribution.';
  foot.textContent=value.exact?'Source: Bloomberg report, 4–5 November 2026. Reported sector totals and source blanks retained, except share returns where one side does not hold the share.'+reference:'Holdings-based estimate. The 4–5 November 2026 report’s average weights are assumed across the selected period; trades and actual average holdings are not reconstructed. ZAR cash is held constant with 0% assumed income. '+(value.live?'Live uses price returns; intraday distributions are not included. Provider quotes may be delayed; Updated is the fetch time.'+(value.backup?.length?' Sharenet’s latest price (possibly delayed) is the backup for '+count(value.backup.length)+' without a usable Yahoo quote.':''):'Shares use vendor-adjusted returns. NEWSLV and SBCOP use Sharenet closing-price returns (price-only estimates).'+(value.backup?.length?' Where Yahoo had no adjusted price on a required date, '+count(value.backup.length)+' use Sharenet closing prices as the backup (price only; a dividend on those dates is not included).':''))+(value.zero?.length?' Shares with no price from Yahoo or Sharenet count as 0% return and are listed in red.':'')+reference+' All figures are in ZAR. Swipe horizontally for more columns.';
  panel.hidden=false;$('empty').hidden=true;$('results').hidden=true;
 }
 async function calculation(returns){return new Promise((resolve,reject)=>{worker=new Worker(new URL('./rise-swix-worker.mjs',import.meta.url),{type:'module'});rejectWorker=reject;worker.onmessage=({data})=>{worker.terminate();worker=null;rejectWorker=null;data.ok?resolve(data.result):reject(Error(data.error));};worker.onerror=()=>{worker?.terminate();worker=null;rejectWorker=null;reject(Error('Calculation unavailable'));};worker.postMessage({report,returns});});}
 const count=n=>n+(n===1?' share':' shares'),fatal=e=>controller.signal.aborted||e?.name==='AbortError'||e?.message==='Sign in again.';
 // Backup prices: Sharenet public closing prices (price only) for JSE listings, used when Yahoo has
 // no usable price. Live uses Sharenet's point for today, its latest (possibly delayed) price.
 const sharenet=(symbol,baseline,end)=>get('./data/prices?'+new URLSearchParams({symbol,start:baseline,end,source:'sharenet'}));
 async function backupReturn(symbol,baseline,end){return jseCloseReturn(await sharenet(symbol,baseline,end),symbol,baseline,end);}
 // Each result keeps the day-by-day price levels for the chart under the table.
 async function loadHistory(symbol,baseline,end){
  const key=[symbol,baseline,end].join('|');if(prices.has(key))return prices.get(key);
  let value;
  if(ETN_PRICE_ONLY.has(symbol)){const raw=await sharenet(symbol,baseline,end);value={value:etnPriceReturn(raw,symbol,baseline,end),backup:false,levels:jseCloseLevels(raw,symbol)};}
  else try{const raw=await get('./data/prices?'+new URLSearchParams({symbol,start:baseline,end}));value={value:historyReturn(raw,symbol,baseline,end),backup:false,levels:adjustedLevels(raw,symbol)};}
  catch(e){if(fatal(e))throw e;const raw=await sharenet(symbol,baseline,end);value={value:jseCloseReturn(raw,symbol,baseline,end),backup:true,levels:jseCloseLevels(raw,symbol)};}
  prices.set(key,value);return value;
 }
 async function run(){
  if(!isActive()||busy||document.hidden)return;busy=true;clearTimeout(timer);clearTimeout(cooldown);refresh.disabled=true;const began=Date.now(),gen=generation,liveMode=$('range').value==='live';
  $('run').disabled=true;status.textContent=last?'Refreshing all holdings…':'Checking all holdings…';panel.hidden=false;
  try{
   if(!await check()||gen!==generation)return;
   if(!report){const candidate=validateReport(await get('./data/rise-swix'));if(gen!==generation)return;report=candidate;}
   const start=$('start').value,end=$('end').value;
   if(liveMode&&start!==sessionDate()){syncRange();cancel();void run();return;}
   let value;
   if(!liveMode&&reported(report,start,end))value={groups:withShareReturns(report.groups),total:report.total,exact:true,basis:'Bloomberg reported'};
   else{
    const positions=report.groups.flatMap(g=>g.children).filter(p=>!p.cash),symbols=[...new Set(positions.map(p=>p.symbol))],returns={},backup=[],levels={};let zero=[],series=null;
    if(liveMode){
     const cycle=crypto.randomUUID(),{patch}=await collectQuotes(symbols,async(batch,id)=>{ // tolerant: a failed batch falls to the backup
      const r=await fetch('/api/live-prices/shard',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]),body:JSON.stringify({symbols:batch,cycleId:id})});
      if(r.status===401){lock();throw Error('Sign in again.');}if(!r.ok)throw Error('Quote batch failed.');return r.json();
     },cycle,{tolerant:true});
     const live=liveReturns(symbols,patch,previous(sessionDate()));Object.assign(returns,live.returns);
     const today=sessionDate(),base=previous(today);let next=0;
     await Promise.all([0,1,2].map(async()=>{while(next<live.zero.length){const s=live.zero[next++];try{returns[s]=await backupReturn(s,base,today);backup.push(s);}catch(e){if(fatal(e))throw e;returns[s]=0;zero.push(s);}}}));
     checkCoverage(zero,symbols.length,true);
    }else{
     const dates=period(start,end);if(dates.end>completedCalendar().at(-1))throw Error('Choose a completed session, or select Live.');
     let next=0,done=0;
     await Promise.all([0,1,2].map(async()=>{while(next<symbols.length){const s=symbols[next++];if(gen!==generation)return;try{const r=await loadHistory(s,dates.baseline,dates.end);returns[s]=r.value;levels[s]=r.levels;if(r.backup)backup.push(s);}catch(e){if(fatal(e))throw e;returns[s]=0;zero.push(s);}status.textContent='Checking prices '+(++done)+' / '+symbols.length;}}));
     checkCoverage(zero,symbols.length,false);
     const days=completedCalendar().filter(d=>d>=dates.baseline&&d<=dates.end);
     if(days.length>=3)series=riseSeries(report,levels,days,new Set(zero));
    }
    const result=await calculation(returns),zeroSet=new Set(zero);
    const groups=zeroSet.size?result.groups.map(g=>({...g,children:g.children.map(p=>zeroSet.has(p.symbol)?{...p,zeroed:true}:p)})):result.groups;
    value={...result,groups:withShareReturns(groups),basis:liveMode?'Live price-return estimate':'Holdings-based estimate',live:liveMode,zero,backup,series};
   }
   if(gen!==generation||!isActive()||!await check())return;
   const at=new Date().toISOString(),zeroCount=value.zero?.length||0,backupCount=value.backup?.length||0;render({...value,start,end,at});showMissing(value.zero||[],liveMode?'live':'history');
   status.textContent='Updated '+new Date(at).toLocaleTimeString()+(zeroCount?' · '+count(zeroCount)+' at 0% (no price)':liveMode?' · Complete snapshot':'')+(backupCount?' · '+count(backupCount)+' on Sharenet backup prices':'')+(liveMode?' · 35s refresh':'');
  }catch(e){if(gen===generation){status.textContent=(last?'Keeping the previous complete result from '+new Date(last.at).toLocaleTimeString()+'. ':'')+e.message;showMissing(e.missing);}}
  finally{if(gen===generation){busy=false;$('run').disabled=false;$('run').textContent='Compare funds';cooldown=setTimeout(()=>{refresh.disabled=false;},Math.max(0,5000-(Date.now()-began)));if(liveMode&&isActive()&&!document.hidden)timer=setTimeout(run,Math.max(1000,35000-(Date.now()-began)));}}
 }
 // An explicit Compare rechecks the published report; live price refreshes keep
 // its stated report dates and do not start a holdings collector or poller.
 $('controls').addEventListener('submit',e=>{if(!isActive())return;e.preventDefault();e.stopImmediatePropagation();cancel();report=null;last=null;table.replaceChildren();void run();},true);
 for(const id of ['portfolio','benchmark','currency','range','start','end'])$(id).addEventListener('change',e=>{cancel();last=null;table.replaceChildren();drawReturnChart(chart,null);note.textContent='';foot.textContent='';status.textContent='';showMissing();syncSelection(e);if(isActive()&&['range','start','end'].includes(id))syncRange();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();else if(isActive()&&$('range').value==='live'){syncRange();void run();}});
 window.addEventListener('pagehide',()=>cancel(true));
 refresh.addEventListener('click',()=>{if(busy||refresh.disabled||!isActive()||$('range').value!=='live')return;clearTimeout(timer);void run();});
 download.addEventListener('click',async()=>{
  const value=last,gen=generation;if(!value||!await check()||generation!==gen)return;
  const rows=[['Name','Ticker','Avg % weight Port','Avg % weight Bmrk','Total return % Port','Total return % Bmrk','CTR pp Port','CTR pp Bmrk'],[value.basis+'; ZAR; '+value.start+' to '+value.end],...([value.total,...value.groups.flatMap(g=>[g,...g.children])].map(r=>[r.name,r.ticker||'',...r.values.map(v=>v??'')]))];
  const csv=rows.map(r=>r.map(v=>'"'+String(v).replace(/^[=+@-](?=\D)/,"'").replaceAll('"','""')+'"').join(',')).join('\r\n');const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));const a=el('a');a.href=url;a.download='rise-swix-zar-'+value.start+'-'+value.end+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 return {isActive,syncRange,syncSelection,clear:()=>cancel(true)};
}
