// Trade slider (owner, 2026-11-15). A switch under Compare funds adds a "New" weight column to the comparison
// tables. The cell shows the current weight faintly; typing a new weight marks the whole row, and the total and
// the sector / Reg 28 tables follow as you type. The Trade button hands the marked rows to the Arcus Trade
// screens, which size, check and show every order exactly as they do for a trade entered there.
// Nothing here places or sends an order.
import {GICS_SECTORS,UNKNOWN_GICS} from './rise-swix-core.mjs?v=phone-20261119';

export const HANDOFF_KEY='arcus-analysis-trades';
export const TRADE_ACCOUNTS={'PORTFOLIO:EASYAI':'easyai','PORTFOLIO:EASYGE':'easyge','PORTFOLIO:EASYBF':'easybf','PORTFOLIO:EASYSA':'easysa'};
export const tradeAccount=fund=>TRADE_ACCOUNTS[fund]||null;
// The exposure view that matters for each fund, and that follows the new weights: SA equity books (Rise, Best) by
// GICS sector, the balanced fund (EasyBF) by Reg 28 class plus its SA equity by GICS sector, and the global thematic
// books (EasyAI, EasyGE, IBKR, Marlow) by Arcus theme and sub-theme. Only the four Easy funds can go on to Trade.
const THEME_FUNDS=new Set(['PORTFOLIO:EASYAI','PORTFOLIO:EASYGE','PORTFOLIO:IBKR','PORTFOLIO:MARLOW']);
export const tradeTables=fund=>fund==='PORTFOLIO:RISE'||fund==='PORTFOLIO:EASYSA'?'gics':fund==='PORTFOLIO:EASYBF'?'reg28':THEME_FUNDS.has(fund)?'theme':null;
// Theme and sub-theme weights for both sides. items = [{theme,subTheme,a,b,n}] in percent; themes by portfolio
// weight, Unclassified and Cash last, each followed by its sub-themes (left out when a theme has no named one).
export function themeWeights(items){
 const themes=new Map(),add=(to,i)=>{to.a+=i.a||0;to.b+=i.b||0;to.n+=i.n||0;};
 for(const i of items){
  const name=i.theme||'Unclassified',sub=i.subTheme||'';
  if(!themes.has(name))themes.set(name,{name,a:0,b:0,n:0,subs:new Map()});
  const t=themes.get(name);add(t,i);
  if(!t.subs.has(sub))t.subs.set(sub,{name:sub||'No sub-theme',a:0,b:0,n:0,sub:true,blank:!sub});
  add(t.subs.get(sub),i);
 }
 const last=name=>name==='Cash'?2:name==='Unclassified'?1:0,by=(x,y)=>y.a-x.a||y.b-x.b||x.name.localeCompare(y.name);
 const ordered=[...themes.values()].sort((x,y)=>last(x.name)-last(y.name)||by(x,y)),list=[];
 for(const t of ordered){
  const subs=[...t.subs.values()].sort((x,y)=>x.blank-y.blank||by(x,y));
  list.push({name:t.name,a:t.a,b:t.b,n:t.n,strong:true});
  if(subs.some(s=>!s.blank))for(const s of subs)list.push({name:s.name,a:s.a,b:s.b,n:s.n,sub:true});
 }
 const sum=key=>ordered.reduce((s,t)=>s+t[key],0);
 return {list,total:{name:'Total',a:sum('a'),b:sum('b'),n:sum('n')}};
}
export const fmt2=v=>Number.isFinite(v)?(Math.abs(v)<.005?0:v).toFixed(2):'—';
// A typed weight in percent: null when empty, NaN when it is not a number from 0 to 100, else two decimals.
export function parseWeight(text){
 const s=String(text??'').trim().replace(/%$/,'').trim().replace(',','.');
 if(!s)return null;
 if(!/^\d{0,3}(?:\.\d*)?$/.test(s)||s==='.')return NaN;
 const v=Number(s);
 return Number.isFinite(v)&&v>=0&&v<=100?Math.round(v*100)/100:NaN;
}
// What the Trade screen receives: the fund, the order type chosen here and one line per marked row.
export function handoff(account,fund,execution,trades,now=Date.now()){
 return {v:1,account,fund,execution,createdAt:now,trades:trades.map(t=>({id:String(t.id),symbol:t.symbol||null,ticker:t.ticker||null,name:t.name||'',
  current:Number.isFinite(t.current)?Math.round(t.current*10000)/10000:0,target:t.target}))};
}
// GICS sector weights with a New column. value = {list:[{name,a,b}],total}; items = [{key,current,sector}].
export function withNewSectors(value,items,weight){
 const sums=new Map();
 for(const i of items)sums.set(i.sector,(sums.get(i.sector)||0)+weight(i));
 const list=value.list.map(x=>({...x,n:sums.get(x.name)||0}));
 for(const [name,n] of sums)if(!list.some(x=>x.name===name)&&Math.abs(n)>1e-9)list.push({name,a:0,b:0,n});
 return {list,total:{...value.total,n:list.reduce((s,x)=>s+x.n,0)}};
}
// EasyBF: the Reg 28 table and SA equity by GICS sector, now and with the new weights. api is Arcus's own
// ArcusEasyTrades (the Trade screen's rules), so both pages class every holding the same way.
// items = [{key,current,ticker,symbol,name,currency,cash,sector}], weights in percent of the fund.
const REG28_ORDER=['foreignEquity','foreignOther','foreignCash','totalForeign','localEquity','totalEquity','bonds','property','commodities','gold','localCash','total'];
export function reg28Tables(api,items,weight){
 const build=w=>({holdings:items.filter(i=>!i.cash).map(i=>({sourceTicker:i.ticker,ticker:i.symbol||null,name:i.name,currency:i.currency||null,weightPct:w(i)})),
  cashWeights:items.filter(i=>i.cash).map(i=>({currency:i.currency||i.ticker,weightPct:w(i)}))});
 const now=api.reg28(build(i=>i.current||0),[]),next=api.reg28(build(weight),[]);
 const a=new Map(now.rows.map(r=>[r.key,r])),n=new Map(next.rows.map(r=>[r.key,r]));
 const rows=REG28_ORDER.filter(key=>a.has(key)||n.has(key)).map(key=>{const x=a.get(key),y=n.get(key),limit=(x||y).limit;
  return {key,name:(x||y).label,limit,a:x?.old??0,n:y?.old??0,breachA:!!x?.breachOld,breachN:!!y?.breachOld,total:key==='total'};});
 const bucket=new Map(next.holdings.map(h=>[h.symbol,h.bucket]));
 const local=items.filter(i=>!i.cash&&bucket.get(i.ticker)==='localEquity'),sums=new Map([...GICS_SECTORS,UNKNOWN_GICS].map(name=>[name,{name,a:0,n:0}]));
 let shareA=0,shareN=0;
 for(const i of local){const g=sums.get(i.sector)||sums.get(UNKNOWN_GICS),w=weight(i);g.a+=i.current||0;g.n+=w;shareA+=i.current||0;shareN+=w;}
 const list=[...sums.values()].filter(x=>x.name!==UNKNOWN_GICS||Math.abs(x.a)>1e-9||Math.abs(x.n)>1e-9)
  .map(x=>({name:x.name,a:shareA?x.a/shareA*100:0,n:shareN?x.n/shareN*100:0}));
 return {rows,equity:{list,total:{name:'SA equity',a:shareA?100:0,n:shareN?100:0},shareA,shareN}};
}
// Add new share (owner, 2026-11-16): a share the fund does not hold, by its ticker or name, with a new weight. It
// belongs to the portfolio like a typed weight, counts in the totals and exposure tables, and goes to Trade with the
// other rows, where Arcus prices it and sizes the buy. Its id is its listing ticker, as for table rows.
const SHARE_ID=/^[A-Z0-9^][A-Z0-9.\-^=]{0,24}$/;
let addPanels=0;
export function createTradeMode(){
 let on=false,scope=null,orderType='';
 const values=new Map(),texts=new Map(),subs=new Set(),extras=new Map();
 const emit=why=>{for(const f of [...subs])try{f(why);}catch(e){console.warn('Trade slider',e);}};
 const mode={
  get on(){return on;},
  setOn(v){v=!!v;if(v===on)return;on=v;emit('mode');},
  get scope(){return scope;},
  // Entries belong to one portfolio: choosing another starts clean.
  setScope(id){if(id===scope)return;scope=id;const had=values.size||texts.size||extras.size;values.clear();texts.clear();extras.clear();if(had)emit('scope');},
  // Shares added with Add new share: [{id,symbol,ticker,name,currency,theme,subTheme}].
  newShares:()=>[...extras.values()],
  newShare:key=>extras.get(key)||null,
  addShare(share,weight){
   const id=String(share?.id||'').toUpperCase(),v=parseWeight(weight);
   if(!SHARE_ID.test(id)||v===null||Number.isNaN(v))return null;
   extras.set(id,{...share,id});values.set(id,v);texts.set(id,String(weight).trim());emit('add');return id;
  },
  removeShare(key){if(!extras.delete(key))return;values.delete(key);texts.delete(key);emit('add');},
  get orderType(){return orderType;},
  setOrderType(v){orderType=['MARKET','VWAP'].includes(v)?v:'';emit('order');},
  has:key=>values.has(key),value:key=>values.get(key),text:key=>texts.get(key)??'',count:()=>values.size,entries:()=>[...values],
  type(key,text){
   const v=parseWeight(text);
   if(String(text).trim()==='')texts.delete(key);else texts.set(key,String(text));
   if(v===null||Number.isNaN(v))values.delete(key);else values.set(key,v);
   emit('value');return v;
  },
  clear(){const had=values.size||texts.size||extras.size;values.clear();texts.clear();extras.clear();if(had)emit('clear');},
  // New weight of a holding: what was typed, else its current weight.
  weight:(key,current)=>values.has(key)?values.get(key):Number.isFinite(current)?current:0,
  subscribe(f){subs.add(f);return()=>subs.delete(f);},
  markRow(tr,edited){tr?.classList.toggle('trade-edited',!!edited);},
  // The New cell of a holding. Cash and other non-traded rows show their weight without a field.
  newCell({key,current=null,locked=false,label=''}){
   const td=document.createElement('td');td.className='trade-new';td.dataset.col='newWeight';
   if(locked||!key){td.classList.add('trade-locked');td.textContent=Number.isFinite(current)&&Math.abs(current)>1e-9?fmt2(current):'';td.title='Not traded here: this weight stays as it is.';return td;}
   const input=document.createElement('input');
   input.type='text';input.inputMode='decimal';input.autocomplete='off';input.spellcheck=false;input.maxLength=7;input.size=6;
   input.className='trade-input';input.dataset.tradeKey=key;
   input.placeholder=fmt2(Number.isFinite(current)?current:0);input.value=mode.text(key);
   input.setAttribute('aria-label','New weight for '+(label||key)+', percent');
   input.title='Type a new weight in percent. Leave it empty to keep '+input.placeholder+'.';
   const paint=()=>{const bad=Number.isNaN(parseWeight(input.value));if(bad)input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');
    input.title=bad?'Enter a weight from 0 to 100.':'Type a new weight in percent. Leave it empty to keep '+input.placeholder+'.';};
   paint();
   input.addEventListener('input',()=>{mode.type(key,input.value);paint();mode.markRow(input.closest('tr'),mode.has(key));});
   // Rows on phones open on a tap, and sector rows sort or open on a key press: neither applies inside the field.
   for(const type of ['click','pointerdown'])input.addEventListener(type,e=>e.stopPropagation());
   input.addEventListener('keydown',e=>{
    e.stopPropagation();
    if(e.key==='Escape'&&input.value){e.preventDefault();input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));return;}
    if(e.key!=='Enter'&&e.key!=='ArrowDown'&&e.key!=='ArrowUp')return;
    const all=[...(input.closest('table')?.querySelectorAll('.trade-input')||[])],next=all[all.indexOf(input)+(e.key==='ArrowUp'?-1:1)];
    e.preventDefault();if(next){next.focus();next.select();}
   });
   input.addEventListener('focus',()=>input.select());
   td.append(input);return td;
  },
  // Cells holding a sum of new weights (total and sector rows); they follow every keystroke.
  sums(){
   let cells=[];
   const total=items=>items.reduce((s,i)=>s+mode.weight(i.key,i.current),0);
   const refresh=()=>{for(const c of cells)c.td.textContent=fmt2(total(c.items));};
   mode.subscribe(why=>{if(why==='value'||why==='clear'||why==='scope')refresh();});
   return {reset(){cells=[];},refresh,
    cell(items,title='Sum of the new weights. Holdings you have not changed keep their weight.'){
     const td=document.createElement('td');td.className='trade-new trade-sum';td.dataset.col='newWeight';td.title=title;td.textContent=fmt2(total(items));
     cells.push({td,items});return td;}};
  },
  // Redraw a table without losing the field being typed in (Live refreshes redraw every 35 seconds).
  keepFocus(root,draw){
   const active=typeof document==='undefined'?null:document.activeElement;
   const key=active?.classList?.contains('trade-input')&&root.contains(active)?active.dataset.tradeKey:null,at=key?[active.selectionStart,active.selectionEnd]:null;
   draw();
   if(!key)return;
   const next=[...root.querySelectorAll('.trade-input')].find(i=>i.dataset.tradeKey===key);
   if(next){next.focus({preventScroll:true});try{next.setSelectionRange(at[0],at[1]);}catch{}}
  },
  // The Add new share panel under the buttons: ticker (or name) and % weight, then the shares added so far, each with
  // its weight (editable) and a remove button.
  addPanel({fund,fundName,findShare,suggest,emit,onClose}){
   const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text)el.textContent=text;return el;};
   const el=make('div','trade-add-panel');el.hidden=true;el.setAttribute('role','group');el.setAttribute('aria-label','Add new share');
   const head=make('div','trade-add-head'),title=make('strong','','Add new share'),close=make('button','trade-add-close','×');
   close.type='button';close.setAttribute('aria-label','Close Add new share');head.append(title,close);
   const help=make('p','trade-add-help');
   const form=make('div','trade-add-form'),ticker=make('input','trade-add-ticker'),weight=make('input','trade-add-weight'),confirm=make('button','trade-add-confirm','Add');
   const list=make('datalist');list.id='trade-add-list-'+(++addPanels);
   ticker.type='text';ticker.autocomplete='off';ticker.spellcheck=false;ticker.maxLength=60;ticker.placeholder='Ticker or name, e.g. NVDA or NPN.JO';
   ticker.setAttribute('aria-label','Share ticker or name');ticker.setAttribute('list',list.id);
   weight.type='text';weight.inputMode='decimal';weight.autocomplete='off';weight.maxLength=7;weight.placeholder='% weight';weight.setAttribute('aria-label','New weight of the share, percent');
   confirm.type='button';form.append(ticker,weight,confirm);
   const status=make('p','trade-add-status');status.setAttribute('role','status');
   const table=make('table','trade-add-shares'),body=make('tbody');table.append(body);
   const foot=make('p','trade-add-foot','Each new share joins the New column totals and the exposure tables. Press Trade to send it to the Trade screen with the other new weights: Arcus prices it there and turns the weight into a buy.');
   el.append(head,help,form,list,status,table,foot);
   let open=false,listed=false;
   const draw=()=>{
    const shares=[...extras.values()];table.hidden=!shares.length;
    body.replaceChildren(...shares.map(s=>{
     const tr=make('tr'),th=make('th','',s.ticker),name=make('td','trade-add-name',s.name||s.ticker),cell=make('td'),input=make('input','trade-input'),remove=make('button','trade-add-remove','×');
     th.scope='row';if(s.currency)name.append(make('small','',s.currency));
     input.type='text';input.inputMode='decimal';input.autocomplete='off';input.maxLength=7;input.size=6;input.value=texts.get(s.id)??'';input.placeholder='0.00';
     input.setAttribute('aria-label','New weight for '+(s.name||s.ticker)+', percent');
     input.addEventListener('input',()=>{const v=mode.type(s.id,input.value);if(Number.isNaN(v))input.setAttribute('aria-invalid','true');else input.removeAttribute('aria-invalid');});
     input.addEventListener('keydown',e=>e.stopPropagation());
     remove.type='button';remove.setAttribute('aria-label','Remove '+s.ticker);remove.title='Remove '+s.ticker;
     remove.addEventListener('click',()=>{mode.removeShare(s.id);status.textContent=s.ticker+' removed.';});
     cell.append(input);const end=make('td');end.append(remove);tr.append(th,name,cell,end);return tr;}));
   };
   const show=v=>{
    open=!!v;el.hidden=!open;
    if(!open)return;
    help.textContent='A share '+(fundName()||'this portfolio')+' does not hold: type its ticker (or pick a name from the list) and its new % weight.';
    draw();
    if(!listed&&suggest){listed=true;Promise.resolve().then(suggest).then(items=>{list.replaceChildren(...(items||[]).slice(0,3000).map(i=>{const o=make('option');o.value=i.ticker;o.label=i.name&&i.name!==i.ticker?i.name:'';return o;}));}).catch(()=>{listed=false;});}
    if(typeof matchMedia!=='function'||matchMedia('(pointer: fine)').matches)ticker.focus?.();
   };
   const submit=async()=>{
    const text=ticker.value.trim(),typed=weight.value,w=parseWeight(typed);
    if(!text){status.textContent='Type the share’s ticker or name.';ticker.focus?.();return;}
    if(w===null||Number.isNaN(w)||w<=0){status.textContent='Enter a % weight from 0.01 to 100.';weight.focus?.();return;}
    if(!findShare){status.textContent='Adding a share is not available here.';return;}
    confirm.disabled=true;status.textContent='Looking up '+text+'…';const at=scope;
    try{
     const found=await findShare(text);
     if(scope!==at){status.textContent='';return;} // another portfolio was chosen meanwhile
     if(found?.error){status.textContent=found.error;return;}
     if(found?.existing){mode.type(found.key,String(w));emit('add');
      status.textContent=found.label+(found.held?' is already held: its new weight '+fmt2(w)+'% is set in the table.':' is in the table (the benchmark holds it): its new weight '+fmt2(w)+'% is set there.');}
     else if(found?.share&&mode.addShare(found.share,String(w)))status.textContent=found.share.ticker+(found.share.name&&found.share.name!==found.share.ticker?' · '+found.share.name:'')+' added at '+fmt2(w)+'%.';
     else{status.textContent='That share could not be added.';return;}
     // Clear only what was added: a ticker or weight typed while this one was being looked up stays.
     if(ticker.value.trim()===text)ticker.value='';if(weight.value===typed)weight.value='';ticker.focus?.();
    }catch{status.textContent='The share could not be looked up. Try again.';}
    finally{confirm.disabled=false;}
   };
   confirm.addEventListener('click',submit);
   for(const field of [ticker,weight])field.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();submit();}if(e.key==='Escape'){e.preventDefault();show(false);onClose?.();}});
   close.addEventListener('click',()=>{show(false);onClose?.();});
   return {el,draw,show,get open(){return open;}};
  },
  // Trade button and order type, shown to the right of the download button while the slider is on.
  // fund() is the portfolio id, fundName() its label, trades() the marked rows [{id,symbol,ticker,name,current,target}].
  // findShare(text) -> {key,existing,held,label} for a share already in the table, {share} for a new one, or {error};
  // suggest() -> [{ticker,name}] for the ticker field's list. Both come from the page (they read Arcus).
  actions({fund,fundName,trades,integrated=true,check=async()=>true,findShare=null,suggest=null}){
   const wrap=document.createElement('span');wrap.className='trade-actions';wrap.hidden=!on;
   const button=document.createElement('button');button.type='button';button.className='trade-button';button.textContent='Trade';
   const select=document.createElement('select');select.className='trade-order-type';select.setAttribute('aria-label','Order type for these trades');
   for(const [value,label] of [['','Order type'],['MARKET','At Market'],['VWAP','VWAP']]){const o=document.createElement('option');o.value=value;o.textContent=label;select.append(o);}
   const note=document.createElement('span');note.className='trade-note';note.setAttribute('role','status');
   const add=document.createElement('button');add.type='button';add.className='trade-add-button';add.textContent='+ Add new share';add.setAttribute('aria-expanded','false');
   const panel=mode.addPanel({fund,fundName,findShare,suggest,emit,onClose:()=>{add.setAttribute('aria-expanded','false');add.focus?.();}});
   wrap.append(button,select,add,note,panel.el);
   const say=text=>{note.textContent=text;};
   const sync=why=>{
    wrap.hidden=!on;select.value=orderType;if(!on)panel.show(false);
    const n=values.size,k=extras.size;button.title=n?'Open the Trade screen with '+n+(n===1?' trade':' trades'):'Type a new weight in the New column first';
    add.textContent='+ Add new share'+(k?' ('+k+')':'');add.setAttribute('aria-expanded',String(panel.open));
    if(why==='add'||why==='scope'||why==='clear'||why==='mode')panel.draw();
    if(why!=='order'||orderType)say('');
   };
   mode.subscribe(sync);sync();
   add.addEventListener('click',()=>{
    const id=fund(),account=tradeAccount(id);
    if(!account){say((fundName()||'This portfolio')+' has no Arcus trade portfolio. New shares can be added for EasyAI, EasyGE, EasyBF and Best.');return;}
    if(!integrated){say('Open Portfolio Analysis from Arcus to add a share.');return;}
    panel.show(!panel.open);add.setAttribute('aria-expanded',String(panel.open));
   });
   select.addEventListener('change',()=>mode.setOrderType(select.value));
   button.addEventListener('click',async()=>{
    const id=fund(),account=tradeAccount(id),list=trades();
    if(!list.length){say('Type a new weight in the New column, or add a new share, first.');return;}
    if(!account){say((fundName()||'This portfolio')+' has no Arcus trade portfolio. Trades can be sent for EasyAI, EasyGE, EasyBF and Best.');return;}
    if(!integrated){say('Open Portfolio Analysis from Arcus to send trades.');return;}
    if(!orderType){say('Choose At Market or VWAP for these trades.');select.focus();return;}
    button.disabled=true;
    try{
     if(!await check())return;
     try{sessionStorage.setItem(HANDOFF_KEY,JSON.stringify(handoff(account,id,orderType,list)));}
     catch{say('This browser could not pass the trades to the Trade screen.');return;}
     location.assign('/?tab=trade&acct='+account);
    }finally{button.disabled=false;}
   });
   return wrap;
  },
 };
 return mode;
}
