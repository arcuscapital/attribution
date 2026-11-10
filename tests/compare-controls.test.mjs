import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createOnlineSource} from '../site/online.mjs';

const app = fs.readFileSync('site/app.mjs', 'utf8');
class Control {
  constructor(value = '') { this.value = value; this.disabled = false; this.hidden = false; this.options = []; this.listeners = {}; this.children = []; this.classList = {add(){}, remove(){}, toggle(){}}; }
  replaceChildren(...children) { this.children = children; this.options = children; if (children.length && Object.hasOwn(children[0], 'value')) this.value = children[0].value; }
  append(...children) { this.children.push(...children); }
  addEventListener(type, callback) { (this.listeners[type] ||= []).push(callback); }
  set selectedIndex(index) { this.value = this.options[index]?.value || ''; }
}
function fields() {
  const nodes = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, new Control()); return nodes.get(id); };
  return {$, nodes};
}
const funds = [{id:'PORTFOLIO:TEST', name:'Test portfolio', dates:['2026-11-09']}, {id:'ETF', name:'Test ETF', dates:['2026-11-09']}, {id:'PORTFOLIO:SWIX', name:'SWIX', dates:['2026-11-09']}];
function selectionHarness(saved = null) {
  const {$} = fields();
  $('currency').value = 'ZAR'; $('group').options = [{value:'security'}, {value:'sector'}];
  const ctx = vm.createContext({$, savedSelection:() => saved, fundsForRole:values => values, fundPickers:new Map(),
    createFundPicker:() => ({render(){}}), securityLinks:new Map(), clearExport(){}, riseSwix:null, onlineMode:true,
    text:(_tag, textContent) => ({textContent}), preferredRange:() => 'day', applyRange(){}, expandSelection(){}, renderArchiveInfo(){}, manifest:null, result:null});
  vm.runInContext(app.slice(app.indexOf('const hasOption ='), app.indexOf('const preferredRange =')) +
    app.slice(app.indexOf('function setup('), app.indexOf('const FUND_THEMES =')), ctx);
  return {ctx, $};
}
test('new and restored non-SWIX comparisons default USD despite a prior saved ZAR preference', () => {
  for (const saved of [null, {portfolio:'PORTFOLIO:TEST',benchmark:'ETF',currency:'ZAR',group:'security'}]) {
    const h = selectionHarness(saved); h.ctx.setup({schemaVersion:1,funds,generatedAt:'2026-11-10',valuationDates:['2026-11-09']});
    assert.equal(h.$('currency').value, 'USD');
  }
});
test('restored SWIX benchmark defaults ZAR even when stored currency was USD', () => {
  const h = selectionHarness({portfolio:'PORTFOLIO:TEST',benchmark:'PORTFOLIO:SWIX',currency:'USD'});
  h.ctx.setup({schemaVersion:1,funds,generatedAt:'2026-11-10',valuationDates:['2026-11-09']});
  assert.equal(h.$('benchmark').value, 'PORTFOLIO:SWIX'); assert.equal(h.$('currency').value, 'ZAR');
});
test('benchmark changes reset the default, while manual currency and date changes are retained', () => {
  const {$} = fields();
  const ctx = vm.createContext({$, clearExport(){}, saveSelection(){}, result:{}});
  const start = app.indexOf("for(const id of ['portfolio','benchmark','currency','range','start','end']) $(id).addEventListener('change'");
  vm.runInContext(app.slice(start, app.indexOf("for(const id of ['portfolio','benchmark'])", start)), ctx);
  const change = id => $(''+id).listeners.change.forEach(fn => fn());
  $('benchmark').value = 'PORTFOLIO:SWIX'; change('benchmark'); assert.equal($('currency').value, 'ZAR');
  $('benchmark').value = 'ETF'; change('benchmark'); assert.equal($('currency').value, 'USD');
  $('currency').value = 'ZAR'; change('currency'); change('start'); change('portfolio');
  assert.equal($('currency').value, 'ZAR', 'explicit currency choice survives until benchmark changes');
});

function submitHarness({latest, refreshError, onlineMode = true} = {}) {
  const {$} = fields(), calls = [], manifest = {schemaVersion:1,version:'old',funds:funds.slice(0,2),valuationDates:['2026-11-06']};
  for (const [id,value] of Object.entries({portfolio:'PORTFOLIO:TEST', benchmark:'ETF',currency:'USD',range:'day',start:'2026-11-06',end:'2026-11-06'})) $(id).value = value;
  $('controls').elements = ['portfolio','benchmark','currency','range','start','end','run'].map($);
  let posted;
  const ctx = vm.createContext({$, manifest, onlineMode, accessGeneration:0, session:{check:async()=>true}, result:null,
    clearExport(){}, saveSelection(){}, loadRange:async(start,end)=>{calls.push(['load',start,end]);return {snapshots:[],levels:[]};},
    online:{refreshManifest:async current=>{calls.push(['freshness',current.version]);if(refreshError)throw Error(refreshError);return latest || {...manifest,version:'new',valuationDates:['2026-11-09']};},
      calendar:async latest=>{calls.push(['calendar',latest.version]);return latest.valuationDates;}},
    applyRange:()=>{$('start').value=$('end').value=manifest.valuationDates.at(-1);calls.push(['range']);},
    refreshArcusReturns:async()=>calls.push(['returns']), lastOptions:null, securityLinks:new Map(), buildSecurityLinks:()=>new Map(),
    renderArchiveInfo(){}, activeWorker:null, cancelCalculation:null,
    Worker:class {terminate(){} postMessage(value){posted=value;calls.push(['calculate']);queueMicrotask(()=>this.onmessage({data:{ok:true,result:{status:'unavailable',issues:[],missing:[],notes:[]}}}));}},
    URL, Promise, document:{createElement:()=>new Control()}, text:()=>new Control(), message:value=>calls.push(['error',value]), scrollTo(){},
  });
  const start = app.indexOf('$("controls").addEventListener("submit",');
  const end = app.indexOf("$('retry-missing').addEventListener", start);
  vm.runInContext(app.slice(start,end).replaceAll('import.meta.url', "'https://fixture.invalid/app.mjs'"), ctx);
  return {ctx, $, calls, manifest, posted:()=>posted, run:()=>$('controls').listeners.submit[0]({preventDefault(){}})};
}
test('Compare checks latest holdings before loading/pricing, updates dates, and keeps the selected pair/currency', async () => {
  const h = submitHarness(); h.$('currency').value = 'ZAR'; await h.run();
  assert.deepEqual(h.calls.map(call=>call[0]), ['freshness','calendar','range','returns','load','calculate']);
  assert.equal(h.manifest.version, 'new'); assert.equal(h.posted().options.start, '2026-11-09');
  assert.equal(h.posted().options.benchmark, 'ETF'); assert.equal(h.posted().options.portfolio, 'PORTFOLIO:TEST');
  assert.equal(h.posted().options.currency, 'ZAR'); assert.equal(h.$('run').disabled, false);
  await h.run(); assert.equal(h.calls.filter(call=>call[0]==='freshness').length,2, 'every explicit Compare verifies freshness');
});
test('custom dates remain exact and offline imported comparisons do not query saved holdings', async () => {
  const custom = submitHarness(); custom.$('range').value = 'custom'; await custom.run();
  assert.equal(custom.posted().options.start, '2026-11-06'); assert.equal(custom.calls.some(call=>call[0]==='range'),false);
  const offline = submitHarness({onlineMode:false}); await offline.run();
  assert.deepEqual(offline.calls.map(call=>call[0]), ['load','calculate']);
});
test('unverified holdings or a disappeared fund stop Compare before pricing or calculation', async () => {
  for (const options of [{refreshError:'Holdings check failed'}, {latest:{schemaVersion:1,version:'new',funds:[funds[0]],valuationDates:['2026-11-09']}}]) {
    const h = submitHarness(options); await h.run();
    assert.equal(h.calls.some(call=>call[0]==='load'||call[0]==='calculate'),false);
    assert.equal(h.calls.at(-1)[0], 'error'); assert.equal(h.$('run').disabled,false);
  }
});
test('freshness service uses no-store reads and rejects malformed catalog data', async () => {
  const requests = []; let valid = true;
  const source = createOnlineSource({fetcher:async(path,options)=>{requests.push({path,options});return Response.json(valid?{schemaVersion:1,version:'new',funds}:{});}});
  assert.equal((await source.refreshManifest({version:'old'})).version,'new');
  assert.equal(requests[0].path,'./data/catalog'); assert.equal(requests[0].options.cache,'no-store');
  valid=false; await assert.rejects(()=>source.refreshManifest({version:'old'}),/verify latest saved holdings/);
});
test('unchanged saved holdings reuse their cache, while a new version is loaded before comparison', async () => {
  const requests = [], day = value => Date.parse(value + 'T16:00:00Z') / 1000;
  let version = 'v1';
  const source = createOnlineSource({fetcher:async(path,options)=>{
    const url = new URL(path,'https://fixture.invalid/'); requests.push(url.pathname + url.search);
    if (url.pathname.endsWith('/catalog')) return Response.json({schemaVersion:1,version,funds:funds.slice(0,2)});
    if (url.pathname.endsWith('/holdings')) return Response.json({fund:url.searchParams.get('fund'),asOf:'2026-10-01',positions:[{id:'SHARE',symbol:'SHARE',weight:version==='v1'?.4:.7}]});
    const symbol = url.searchParams.get('symbol');
    return Response.json({meta:{symbol,currency:'USD',exchangeTimezoneName:'UTC'},timestamp:['2026-10-07','2026-10-08'].map(day),indicators:{adjclose:[{adjclose:[100,105]}]}});
  }});
  let manifest = {schemaVersion:1,version:'v1',funds:funds.slice(0,2)};
  const run = () => source.load(manifest,['PORTFOLIO:TEST','ETF'],'2026-10-08','2026-10-08','USD');
  const first = await run(); assert.equal(first.snapshots[0].positions[0].weight,.4);
  manifest = await source.refreshManifest(manifest); await run();
  assert.equal(requests.filter(path=>path.includes('/holdings?')).length,2,'same version does not redownload either holdings file');
  version='v2'; manifest = await source.refreshManifest(manifest); const latest = await run();
  assert.equal(latest.snapshots[0].positions[0].weight,.7);
  assert.equal(requests.filter(path=>path.includes('/holdings?')).length,4);
  assert.ok(requests.filter(path=>path.includes('/holdings?')).slice(-2).every(path=>path.includes('version=v2')));
});
test('leaving specialized RISE/SWIX returns to USD instead of restoring an old ZAR preference', () => {
  const rise = fs.readFileSync('site/rise-swix.mjs','utf8'), {$} = fields();
  for (const id of ['portfolio','benchmark']) {
    $(id).options = [{value:'PORTFOLIO:RISE'},{value:'PORTFOLIO:SWIX'},{value:'ETF'},{value:'OTHER'}];
    $(id).dispatchEvent = () => {};
  }
  $('portfolio').value='PORTFOLIO:RISE'; $('benchmark').value='PORTFOLIO:SWIX'; $('currency').value='ZAR';
  $('range').options=[{textContent:'One Day'}]; $('range').dispatchEvent=()=>{}; $('assume-zero').closest=()=>({hidden:false});
  const ctx = vm.createContext({$, syncing:false, entered:false, priorCurrency:null, RISE:'PORTFOLIO:RISE', SWIX:'PORTFOLIO:SWIX',
    opened:new Set(), sort:null, live:{}, panel:{}, Event,
    isActive:()=>$('portfolio').value==='PORTFOLIO:RISE'&&$('benchmark').value==='PORTFOLIO:SWIX',
    syncRange:()=>{$('currency').disabled=true;$('currency').value='ZAR';},
  });
  const start=rise.indexOf(' function syncSelection('),end=rise.indexOf(' function format(',start);
  vm.runInContext(rise.slice(start,end),ctx); ctx.syncSelection();
  assert.equal($('currency').value,'ZAR'); assert.equal($('currency').disabled,true);
  $('benchmark').value='ETF'; ctx.syncSelection({target:{id:'benchmark'}});
  assert.equal($('currency').value,'USD'); assert.equal($('currency').disabled,false);
});
test('explicit RISE/SWIX Compare reloads the published report; live price refresh does not', () => {
  const rise = fs.readFileSync('site/rise-swix.mjs','utf8'), {$} = fields(), calls=[];
  const oldReport={version:'old',period:['2026-11-04','2026-11-05']}, refresh=new Control();
  $('range').value='live'; let active=true;
  const ctx=vm.createContext({$,report:oldReport,last:{},refresh,busy:false,timer:undefined,
    isActive:()=>active,cancel:()=>calls.push('cancel'),table:{replaceChildren:()=>calls.push('clear')},
    clearTimeout(){},run:()=>calls.push(ctx.report===null?'reload report':'reuse report')});
  const submit=rise.slice(rise.indexOf(" $('controls').addEventListener('submit'"),rise.indexOf(" for(const id of ['portfolio'",rise.indexOf(" $('controls').addEventListener('submit'")));
  vm.runInContext(submit,ctx);
  const event={preventDefault(){},stopImmediatePropagation(){}};
  active=false; $('controls').listeners.submit[0](event); assert.equal(ctx.report,oldReport); assert.equal(calls.length,0);
  active=true; $('controls').listeners.submit[0](event); assert.deepEqual(calls,['cancel','clear','reload report']);
  assert.deepEqual(oldReport.period,['2026-11-04','2026-11-05'],'checking a new published report does not rewrite the old report dates');
  ctx.report=oldReport; calls.length=0;
  const refreshHandler=rise.split('\n').find(line=>line.includes("refresh.addEventListener('click'"));
  vm.runInContext(refreshHandler,ctx); refresh.listeners.click[0]();
  assert.deepEqual(calls,['reuse report']); assert.equal(ctx.report,oldReport);
});
