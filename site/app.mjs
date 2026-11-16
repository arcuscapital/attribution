import {basisLabel} from './price-data.mjs?v=returns-20261116';
import { dateRange, drawReturnChart, intradaySeries, createGroupedTable, renderSectorWeights, collapsible } from './ranges.mjs?v=trade-20261115';
import { groupByGics, UNKNOWN_GICS, gicsWeights, gicsSector, GICS_SECTORS, completedCalendar } from './rise-swix-core.mjs?v=trade-20261115';
import { createSessionGuard } from './session.mjs';
import { isNonListed, assetKind, primaryThemePath } from './arcus-source.mjs?v=cash-20261113';
const $ = (id) => document.getElementById(id);
// Return % graph and GICS sector weights can be hidden with an arrow; both open on every load (owner, 2026-11-15).
collapsible($('return-chart'), 'Return % graph');
collapsible($('gics-weights'), 'GICS sector weights');
collapsible($('theme-weights'), 'Theme and sub-theme weights');
collapsible($('reg28-weights'), 'Reg 28 weights');
collapsible($('sa-equity-weights'), 'SA equity by GICS sector');
// Trade slider (owner, 2026-11-15), loaded near the end of this file. var: the session reset below may run first.
var trade = null, tradeHelp = null, tradeSums = null, positionMeta = new Map(), jseSectors = null, mergedSectors = null;
const integrated = location.pathname.startsWith('/portfolio-analysis/');
let online = null, onlineMode = false;
let riseSwix=null;
const fundPickers = new Map();
let arcusReturns = new Map();
let securityLinks = new Map();
let activeWorker = null, cancelCalculation = null, accessGeneration = 0;
let exportUrl=null;
function clearExport(){
  if(exportUrl)URL.revokeObjectURL(exportUrl);
  exportUrl=null;$('download-ready').hidden=true;$('download-ready').removeAttribute('href');
}
const session = createSessionGuard({onLock() {
  riseSwix?.clear();
  accessGeneration++;
  clearExport();
  online?.clear();
  activeWorker?.terminate(); activeWorker = null;
  cancelCalculation?.(); cancelCalculation = null;
  folder = dataset = manifest = result = null; onlineMode = false;
  for (const id of ['metrics','rows','columns','method','research-note','archive-info','contribution-chart','cash-row','gics-weights','theme-weights','reg28-weights','sa-equity-weights','message','price-status','return-chart']) $(id).replaceChildren();
  $('return-chart').hidden = true;
  $('theme-weights').hidden = $('reg28-weights').hidden = $('sa-equity-weights').hidden = true;
  trade?.clear(); positionMeta.clear();
  if (gicsView) gicsView.panel.hidden = true;
  $('gics-weights').hidden = true;
  $('rows').closest('table')?.tFoot?.replaceChildren();
  $('results').hidden = true;
  for (const id of ['portfolio','benchmark']) { $(id).replaceChildren(); $(id).disabled = true; }
  arcusReturns.clear();
  securityLinks.clear();
  for (const picker of fundPickers.values()) picker.clear();
  $('run').disabled = true;
  $('missing-actions').hidden=true; $('assume-zero').checked=true;
  expandSelection();
  document.querySelector('main').hidden = true;
  $('session-lock').hidden = false;
}, onUnlock() { document.querySelector('main').hidden = false; $('session-lock').hidden = true; }});
if (integrated) {
  document.documentElement.classList.add('online-analysis');
  const setupPanel=document.querySelector('details.panel');
  const archiveActions=document.createElement('div');archiveActions.className='actions';
  archiveActions.append($('folder'),$('import'),document.querySelector('label[for="import"]'));
  setupPanel.append(archiveActions);
  $('connect-saved').textContent='Refresh saved holdings';
  $('controls').after($('archive-info'));
  $('back-arcus').hidden = false;
  try {
    const back = new URL(sessionStorage.getItem('arcus-analysis-return') || '/?tab=watchlist', location.origin);
    if (back.origin === location.origin && back.pathname === '/') $('back-arcus').href = back.pathname + back.search + back.hash;
  } catch {}
  $('back-arcus').addEventListener('click', e => {
    const previous = document.referrer && new URL(document.referrer);
    if (previous && previous.origin === location.origin && previous.pathname === '/') { e.preventDefault(); history.back(); }
  });
}
try {
  const mode = localStorage.getItem('bw-mode') || 'system';
  const light = mode === 'light' || (mode !== 'dark' && !matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('light', light);
  document.querySelector('meta[name="theme-color"]').content = light ? '#ffffff' : '#151c17';
} catch {}
if (!window.showDirectoryPicker || /Android/i.test(navigator.userAgent)) {
  $('folder').hidden = true;
  document.querySelector('label[for="import"]').classList.add('primary');
}
document.querySelector('label[for="import"]').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('import').click(); } });
// Hide private content while away; revalidate before it is revealed on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelector('main').hidden = true;
  else void session.check();
});
window.addEventListener('pageshow', () => { document.querySelector('main').hidden = true; void session.check(); });
window.addEventListener('pagehide',()=>online?.clear());
window.addEventListener('focus', () => { void session.check(); });
void session.check();
document.querySelector('form[action="/logout"]')?.addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch('/logout', {method:'POST', credentials:'same-origin'});
    if (!response.ok) throw Error('Sign out failed');
    session.lock();
    location.replace('/');
  } catch {
    button.disabled = false;
    message('Could not sign out. Please try again.');
  }
});
let folder = null,
  dataset = null,
  manifest = null,
  result = null,
  lastOptions = null,
  sortKey = "activeCtr",
  sortDirection = -1;
// Phone layout: one column, compact table and a collapsible selection panel.
const phone = matchMedia('(max-width: 600px)');
const SELECTION_KEY = 'arcus-analysis-selection';
const fundLabel = (id) => {
  const fund = manifest?.funds.find(f => f.id === id);
  return fund && id.startsWith('PORTFOLIO:') ? fund.name : id;
};
const rangeLabel = () => $('range').selectedOptions[0]?.textContent || 'Custom dates';
function saveSelection() {
  try { localStorage.setItem(SELECTION_KEY, JSON.stringify(Object.fromEntries(['portfolio','benchmark','currency','range','group'].map(id => [id, $(id).value])))); } catch {}
}
function savedSelection() {
  try { const saved = JSON.parse(localStorage.getItem(SELECTION_KEY) || 'null'); return saved && typeof saved === 'object' ? saved : null; } catch { return null; }
}
const fundsForRole=(funds,id)=>funds.filter(f=>!f.reportOnly || f.dailyIndexComparator || f.id===(id==='portfolio'?'PORTFOLIO:RISE':'PORTFOLIO:SWIX'));
const hasOption = (id, value) => [...$(id).options].some(o => o.value === value);
// Rise vs Swix and the rand funds (EasyBF, Best) open in rand; everything else in US dollars.
const RAND_FUNDS = new Set(['PORTFOLIO:EASYBF', 'PORTFOLIO:EASYSA','PORTFOLIO:J303','PORTFOLIO:SWIX']);
const defaultCurrency = () => RAND_FUNDS.has($('benchmark').value) || RAND_FUNDS.has($('portfolio').value) ? 'ZAR' : 'USD';
const j303Selected=()=>[$('portfolio').value,$('benchmark').value].includes('PORTFOLIO:J303');
const portfolioOrder=id=>({'PORTFOLIO:MARLOW':'PORTFOLIO:M0','PORTFOLIO:J303':'PORTFOLIO:M1','PORTFOLIO:SWIX':'PORTFOLIO:M2'}[id]||id);
function restoreSelection(m) {
  const saved = savedSelection();
  if (!saved) return false;
  const ids = new Set(m.funds.map(f => f.id));
  if (!ids.has(saved.portfolio) || !ids.has(saved.benchmark) || !hasOption('portfolio',saved.portfolio) || !hasOption('benchmark',saved.benchmark) || saved.portfolio === saved.benchmark) return false;
  $('portfolio').value = saved.portfolio; $('benchmark').value = saved.benchmark;
  $('currency').value = defaultCurrency();
  // Ordinary comparisons always list companies; only Rise vs Swix has sector rows (owner, 2026-11-12).
  // The sector view code is kept; its View control is hidden and a saved "sector" choice is ignored.
  $('group').value = 'security';
  return true;
}
const preferredRange = () => { const saved = savedSelection()?.range; return saved && saved !== 'custom' && hasOption('range', saved) ? saved : 'day'; };
function syncDateFields() {
  $('controls').classList.toggle('preset', $('range').value !== 'custom');
  const start = $('start').value, end = $('end').value;
  $('range-dates').textContent = start && end ? (start === end ? start : start + ' → ' + end) : '';
}
function collapseSelection(options) {
  $('summary-funds').textContent = fundLabel(options.portfolio) + ' vs ' + fundLabel(options.benchmark);
  $('summary-period').textContent = rangeLabel() + ' · ' + (options.start === options.end ? options.end : options.start + ' → ' + options.end) + ' · ' + options.currency;
  $('selection').classList.add('collapsed');
  $('selection-summary').hidden = false;
}
function expandSelection() {
  $('selection').classList.remove('collapsed');
  $('selection-summary').hidden = true;
}
$('change-selection').addEventListener('click', () => {
  expandSelection();
  $('selection').scrollIntoView({behavior: 'smooth', block: 'start'});
  $('portfolio').focus({preventScroll: true});
});
const scrollTo = (id) => { if (phone.matches) requestAnimationFrame(() => $(id).scrollIntoView({behavior: 'smooth', block: 'start'})); };
// Read the price-check note directly under the headline figures.
$('metrics').after($('price-status'));
const text = (tag, value, cls) => {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  return n;
};
function message(value) {
  $("message").replaceChildren(...(value ? [text("div", value)] : []));
}
async function readFile(handle) {
  const file = await handle.getFile();
  if (file.size > 35_000_000)
    throw Error(
      "File is too large. Connect the reports folder to load only the selected months.",
    );
  return JSON.parse(await file.text());
}
function setup(m) {
  riseSwix?.clear();
  if (m?.schemaVersion !== 1 || !Array.isArray(m.funds) || m.funds.length < 2)
    throw Error("Invalid archive manifest. At least two funds are required.");
  manifest = m;
  result = null;
  securityLinks.clear();
  clearExport();$('missing-actions').hidden=true;$('assume-zero').checked=true;
  $("results").hidden = true;
  $("empty").hidden = false;
  for (const id of ["portfolio", "benchmark"]) {
    $(id).replaceChildren(
      ...fundsForRole(m.funds,id).map((f) => {
        const o = text("option", f.id.startsWith('PORTFOLIO:') ? `${f.name} · My portfolio` : `${f.id} · ${f.name}`);
        o.value = f.id;
        return o;
      }),
    );
    $(id).disabled = false;
  }
  $("benchmark").selectedIndex = 1;
  if (!restoreSelection(m) && m.funds.some(f => f.id === 'ARKK') && m.funds.some(f => f.id === 'BAI')) {
    $('portfolio').value = 'ARKK'; $('benchmark').value = 'BAI';
  }
  $('currency').value = defaultCurrency();
  for (const id of ['portfolio','benchmark']) {
    if (!fundPickers.has(id)) fundPickers.set(id,createFundPicker(id));
    fundPickers.get(id).render(fundsForRole(m.funds,id));
  }
  const available = m.funds.flatMap((f) => f.dates || []).sort();
  $("start").value = available.at(0) || "";
  $("end").value = available.at(-1) || "";
  for (const id of ["start", "end", "run", "range"]) $(id).disabled = false;
  $('range').value = m.valuationDates?.length ? preferredRange() : 'custom';
  applyRange();
  expandSelection();
  $("archive-status").textContent =
    (onlineMode ? "Holdings saved " : "Archive updated ") +
    new Date(m.generatedAt).toLocaleString() +
    (onlineMode ? ". Available with your PC off. Prices are checked when you compare." : ". Nothing is uploaded.") + (m.validationNotice ? ' ' + m.validationNotice : '');
  renderArchiveInfo();
  $('source-status').textContent = `${m.funds.length} funds in this archive.` + ((m.pendingSources || []).length ? ' Source limitations: '+m.pendingSources.map(f=>f.id+' ('+f.reason+')').join('; ')+'.' : '');
  $("message").replaceChildren();
  riseSwix?.syncSelection();
}
const FUND_THEMES = [
  ['Portfolios',[]],
  ['AI','BAI WCLD AIQ ARTY CHAT IGPT WTAI THNQ IVES IVEP AIS LRNZ JHAI GPT'.split(' ')],
  ['Market benchmarks','QQQ RSP VOO QQEW IJR'.split(' ')],
  ['Robotics','ARKQ BOTT BOTZ HUMN KOID ROBO'.split(' ')],
  ['Semiconductors & photonics','SOXX DISK LAZR'.split(' ')],
  ['Space','ARKX ROKT UFO WARP'.split(' ')],
  ['Defence','ITA SHLD JEDI'.split(' ')],
  ['Healthcare & biotech','ARKG CANC IBB XBI'.split(' ')],
  ['Financials & fintech','ARKF FINX KRE'.split(' ')],
  ['Industry & infrastructure','AIRR PAVE WELD IYT'.split(' ')],
  ['Energy & resources','EART LIT URA'.split(' ')],
  ['Consumer staples',['IYK']],
  ['Growth & innovation','ARKK ARKW LOUP XT TEK FFND NITE'.split(' ')],
  ['Factors & strategies','MTUM VLUE GRNY FCTE FFLS TIME'.split(' ')],
];
const INDEX2 = 'QQQ RSP XLU IVW SLYV XLE XLY XLB XLK XLI XLF XLP XLV MDY VONE XLC SOXX IBIT'.split(' ');
function fundTheme(fund, picker) {
  if(picker==='benchmark' && INDEX2.includes(fund.id))return 'Indices 2';
  if (fund.id.startsWith('PORTFOLIO:')) return 'Portfolios';
  return FUND_THEMES.find(([,ids])=>ids.includes(fund.id))?.[0] || 'Other ETFs';
}
function createFundPicker(id) {
  const select=$(id), root=text('div','','fund-picker');
  // The underlying select retains archive/selection semantics; the visible
  // listbox supports bold groups and separately coloured daily-return labels.
  select.hidden=true;
  const trigger=text('button','','fund-trigger');trigger.type='button';
  trigger.id=id+'-picker'; trigger.setAttribute('role','combobox');
  trigger.setAttribute('aria-label',id==='portfolio'?'Portfolio':'Benchmark');
  trigger.setAttribute('aria-haspopup','listbox');trigger.setAttribute('aria-expanded','false');
  const popup=text('div','','fund-popup');popup.hidden=true;
  const search=document.createElement('input');search.type='search';search.placeholder='Search ETFs or portfolios';
  search.setAttribute('aria-label','Search '+id);search.autocomplete='off';
  const note=text('p',integrated?'1D · Arcus completed daily return · USD':'Saved archive funds','fund-return-note');
  const list=text('div','','fund-options');list.id=id+'-options';list.setAttribute('role','listbox');
  list.setAttribute('aria-label',id==='portfolio'?'Portfolio funds':'Benchmark funds');
  trigger.setAttribute('aria-controls',list.id);
  popup.append(search,note,list);root.append(trigger,popup);select.after(root);
  let funds=[];
  const close=()=>{popup.hidden=true;trigger.setAttribute('aria-expanded','false');};
  function label(f) {
    const name=text('span',f.id.startsWith('PORTFOLIO:')?f.name:`${f.id} · ${f.name}${id==='benchmark'&&f.id==='SOXX'?' · SOX ETF proxy':''}`,'fund-name');
    if(f.id.startsWith('PORTFOLIO:'))return [name];
    const daily=arcusReturns.get(f.id), value=daily?.oneDayReturnPct;
    const ret=text('span',Number.isFinite(value)?`${value>0?'+':''}${value.toFixed(2)}%`:f.id.startsWith('PORTFOLIO:')?'':'—','fund-return');
    if(Number.isFinite(value))ret.classList.add(value>=0?'gain':'loss');
    ret.title=daily?.oneDayDate?`Arcus 1D · ${daily.oneDayDate} · USD`:'Arcus 1D unavailable';
    return [name,ret];
  }
  function sync(){const f=funds.find(f=>f.id===select.value);trigger.replaceChildren(...(f?label(f):[text('span','Choose a fund')]));trigger.disabled=select.disabled;}
  function draw(){
    list.replaceChildren();const query=search.value.trim().toLowerCase();
    for(const theme of [...FUND_THEMES.map(([name])=>name),'Other ETFs',...(id==='benchmark'?['Indices 2']:[])]){
      const matches=funds.filter(f=>fundTheme(f,id)===theme && `${f.id} ${f.name} ${theme}`.toLowerCase().includes(query)).sort((a,b)=>portfolioOrder(a.id).localeCompare(portfolioOrder(b.id)));
      if(!matches.length)continue;
      const group=text('div','','fund-group');group.setAttribute('role','group');group.setAttribute('aria-label',theme);
      group.append(text('strong',theme,'fund-group-title'));
      for(const f of matches){
        const option=text('button','','fund-option');option.type='button';option.tabIndex=-1;option.setAttribute('role','option');
        option.setAttribute('aria-selected',String(f.id===select.value));option.dataset.fund=f.id;option.append(...label(f));
        option.addEventListener('click',()=>{select.value=f.id;select.dispatchEvent(new Event('change',{bubbles:true}));sync();close();trigger.focus();});
        group.append(option);
      }
      list.append(group);
    }
    if(!list.children.length)list.append(text('p','No matching funds.'));
  }
  function open(){if(trigger.disabled)return;for(const [other,picker] of fundPickers)if(other!==id)picker.close();popup.hidden=false;trigger.setAttribute('aria-expanded','true');search.value='';draw();search.focus();}
  trigger.addEventListener('click',()=>popup.hidden?open():close());
  trigger.addEventListener('keydown',e=>{if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();open();}});
  search.addEventListener('input',draw);
  popup.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();close();trigger.focus();return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
    if(e.target===search && ['Home','End'].includes(e.key))return;
    const options=[...list.querySelectorAll('[role="option"]')];if(!options.length)return;
    e.preventDefault();const at=options.indexOf(document.activeElement);
    const next=e.key==='Home'?0:e.key==='End'?options.length-1:e.key==='ArrowDown'?(at+1)%options.length:(at<=0?options.length:at)-1;
    options[next].focus();
  });
  root.addEventListener('focusout',e=>{if(!root.contains(e.relatedTarget))close();});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target))close();});
  select.addEventListener('change',sync);
  new MutationObserver(sync).observe(select,{attributes:true,attributeFilter:['disabled']});
  return {close,render(values){funds=values;sync();draw();},clear(){funds=[];list.replaceChildren();close();sync();}};
}
async function refreshArcusReturns(){
  if(!integrated)return;
  const generation=accessGeneration;
  try{
    const response=await fetch('./data/arcus-funds',{credentials:'same-origin',cache:'no-store'});
    if(response.status===401){session.lock();return;}
    if(!response.ok)return;
    const data=await response.json();if(generation!==accessGeneration || !manifest)return;
    arcusReturns=new Map((data.funds || []).map(f=>[f.id,f]));
    for(const [id,picker] of fundPickers)picker.render(fundsForRole(manifest.funds,id));
  }catch{} // Holdings/comparison remain available if the optional quote source fails.
}
function renderArchiveInfo() {
  $("archive-info").replaceChildren(
    ...manifest.funds.filter(f=>[$('portfolio').value,$('benchmark').value].includes(f.id)).map((f) => {
      const card = text("article", "", "archive-card");
      card.append(
        text("strong", f.id.startsWith('PORTFOLIO:') ? f.name : f.id),
        text(
          "p",
          f.dailyIndex ? 'Daily floating weights · automatic quarterly rebalance · ZAR' : f.dailyIndexComparator&&j303Selected() ? 'Saved SWIX allocation · daily floating weights · ZAR' : f.reportOnly ? 'Bloomberg report · 4–5 Nov 2026 · ZAR' : manifest.holdingsSource==='arcus' && !f.currentSource ? 'Current Arcus allocation checked when you compare.' : `${f.positions} positions · holdings ${f.latest || "not collected"} · ${f.currentSource || (onlineMode ? 'saved allocation' : f.dates.length+' saved dates')}`,
        ),
      );
      if(f.allocationNote)card.append(text('p',f.allocationNote));
      return card;
    }),
  );
}
for(const id of ['portfolio','benchmark','currency','range','start','end']) $(id).addEventListener('change',()=>{
  if(id==='benchmark')$('currency').value=['PORTFOLIO:SWIX','PORTFOLIO:J303'].includes($('benchmark').value)?'ZAR':'USD';
  clearExport();
  result=null;$('missing-actions').hidden=true;$('results').hidden=true;$('price-status').textContent='';$('message').replaceChildren();
  saveSelection();
});
for(const id of ['portfolio','benchmark']) $(id).addEventListener('change', renderArchiveInfo);
// A rand fund (EasyBF, Best) opens in rand; new weights typed for one portfolio do not carry to another.
for (const id of ['portfolio', 'benchmark']) $(id).addEventListener('change', () => {
  if (RAND_FUNDS.has($('portfolio').value) && !$('currency').disabled && hasOption('currency', 'ZAR')) { $('currency').value = 'ZAR'; saveSelection(); }
  if (id === 'portfolio') trade?.setScope($('portfolio').value);
});
function applyRange() {
  if(riseSwix?.isActive()){riseSwix.syncRange();return;}
  const dates = j303Selected()?completedCalendar().filter(d=>d>='2025-11-13'):manifest?.valuationDates || [];
  const range = dateRange($('range').value, dates);
  if (range) { $('start').value = range.start; $('end').value = range.end; }
  $('range-note').textContent = dates.length
    ? `Periods end at the latest saved completed price date: ${dates.at(-1)}. Missing holdings are reported; dates are not silently shortened.`
    : 'Select explicit dates, or run the desktop updater to enable date presets.';
  if (!dates.length) $('range').value = 'custom';
  syncDateFields();
}
$('range').addEventListener('change', applyRange);
for (const id of ['start', 'end']) $(id).addEventListener('change', () => { $('range').value = 'custom'; syncDateFields(); });
$("folder").addEventListener("click", async () => {
  try {
    if (!window.showDirectoryPicker) {
      message(
        "This browser does not support folder access. Use Import data file instead.",
      );
      return;
    }
    const chosen = await window.showDirectoryPicker({ mode: "read" });
    const m = await readFile(await chosen.getFileHandle("manifest.json"));
    if (!await session.check()) return;
    onlineMode = false; online?.clear(); setup(m);
    folder = chosen;
    dataset = null;
  } catch (e) {
    if (e.name !== "AbortError")
      message(
        e.name === "NotFoundError"
          ? "Select the reports folder containing manifest.json."
          : e.message,
      );
  }
});
$("import").addEventListener("change", async (event) => {
  try {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 35_000_000)
      throw Error("Use reports folder mode for large archives.");
    const parsed = JSON.parse(await file.text());
    if (!await session.check()) return;
    if (!parsed.manifest?.valuationDates) {
      const funds = new Set((parsed.manifest?.funds || []).map(f => f.id));
      parsed.manifest.valuationDates = [...new Set((parsed.levels || []).filter(l => l.id === 'SPY' || funds.has(l.id)).map(l => l.date))].sort();
    }
    onlineMode = false; online?.clear(); setup(parsed.manifest);
    dataset = parsed;
    folder = null;
  } catch (e) {
    message(e.message);
  } finally {
    event.target.value = "";
  }
});
// Listing, currency and asset of every position, the portfolio's own facts first (Reg 28 class, Trade button).
async function loadRange(start, end) {
  const data = await loadRangeData(start, end);
  positionMeta = new Map();
  for (const snapshot of data?.snapshots || []) for (const p of snapshot.positions || []) if (!positionMeta.has(p.id)) positionMeta.set(p.id, {symbol: p.symbol || null, ticker: p.ticker, name: p.name, currency: p.currency || null, asset: p.asset || ''});
  trade?.setScope($('portfolio').value);
  return data;
}
async function loadRangeData(start, end) {
  if (onlineMode) return online.load(manifest,[$('portfolio').value,$('benchmark').value],start,end,$('currency').value);
  if (dataset) return dataset;
  if (!folder) throw Error("Connect an archive first.");
  // Include a baseline month. Engine requires exact preceding valuation-day holdings.
  const baseline = new Date(start + "T12:00:00Z");
  baseline.setUTCDate(1);
  baseline.setUTCMonth(baseline.getUTCMonth() - 1);
  const months = manifest.months.filter(
    (m) => m >= baseline.toISOString().slice(0, 7) && m <= end.slice(0, 7),
  );
  // Include the actual proxy snapshot, even when the issuer only publishes monthly.
  for (const fund of manifest.funds.filter(f => [$('portfolio').value, $('benchmark').value].includes(f.id))) {
    const dates = [...fund.dates].sort();
    const before = dates.filter(d => d < start).at(-1);
    const after = dates.find(d => d >= start);
    for (const date of [before, after]) {
      if (date && manifest.months.includes(date.slice(0, 7)) && !months.includes(date.slice(0, 7))) months.push(date.slice(0, 7));
    }
  }
  const merged = { manifest, snapshots: [], levels: [] };
  for (const month of months) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw Error("Invalid month in archive");
    const part = await readFile(await folder.getFileHandle(month + ".json"));
    merged.snapshots.push(...part.snapshots);
    merged.levels.push(...part.levels);
  }
  return merged;
}
$("controls").addEventListener("submit", async (e) => {
  e.preventDefault();
  clearExport();
  $("run").disabled = true;
  $("run").textContent = "Calculating…";
  $("results").hidden = true;
  result = null;
  $('missing-actions').hidden=true;
  $('assume-zero').disabled=true;
  $('price-status').textContent='';
  const controls=[...$('controls').elements,$('connect-saved'),$('folder'),$('import')];
  const disabledBefore=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);
  try {
    if (!await session.check()) return;
    const generation = accessGeneration;
    if(onlineMode) {
      $('run').textContent='Checking latest saved holdings…';
      const latest=await online.refreshManifest(manifest);
      if(generation!==accessGeneration)return;
      const selected=[$('portfolio').value,$('benchmark').value];
      if(selected.some(id=>!latest.funds.some(f=>f.id===id)))throw Error('A selected fund is no longer available. Refresh saved holdings and select again.');
      Object.assign(manifest,latest);
      manifest.valuationDates=await online.calendar(manifest);
      if($('range').value!=='custom')applyRange();
      await refreshArcusReturns();
    }
    const options = Object.fromEntries(
      ["portfolio", "benchmark", "start", "end", "currency"].map((id) => [
        id,
        $(id).value,
      ]),
    );
    options.allowApproximateHoldings = true;
    options.allowPartialReturns = true;
    options.allowSnapshotResearch = onlineMode;
    options.assumeMissingZero=$('assume-zero').checked;
    lastOptions = options;
    saveSelection();
    const data = await loadRange(options.start, options.end);
    if (generation !== accessGeneration || !await session.check()) return;
    const response = await new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./worker.mjs?v=returns-20261116c", import.meta.url), {
        type: "module",
      });
      activeWorker = worker;
      cancelCalculation = () => reject(Error('Your session ended. Sign in before calculating again.'));
      worker.onmessage = ({ data }) => {
        worker.terminate();
        activeWorker = null;
        cancelCalculation = null;
        data.ok ? resolve(data.result) : reject(Error(data.error));
      };
      worker.onerror = () => {
        worker.terminate();
        activeWorker = null; cancelCalculation = null;
        reject(Error("Calculation failed. Your data has not been changed."));
      };
      worker.postMessage({ dataset: data, options });
    });
    if (generation !== accessGeneration || !await session.check()) return;
    result = response;
    const zeroLabel=$('assume-zero').closest?.('label');if(zeroLabel)zeroLabel.hidden=!!data.dailyHoldings&&(!data.dailyHoldingsFunds||[options.portfolio,options.benchmark].every(id=>data.dailyHoldingsFunds.includes(id)));
    result.issuerNav = data.issuerNav || {};
    securityLinks = buildSecurityLinks(data.snapshots);
    if(data.arcusSource) {
      for(const snap of data.snapshots){const fund=manifest.funds.find(f=>f.id===snap.fund);if(fund){fund.latest=snap.asOf;fund.positions=snap.positions.length;fund.currentSource=snap.source||'Archive fallback';}}
      renderArchiveInfo();
    }
    $('missing-actions').hidden= !onlineMode || !result.missing?.length;
    result.notes=[...(result.notes || []),...(data.priceNotes || [])];
    if(data.returnReasons)result.missing=(result.missing || []).map(p=>({...p,reason:data.returnReasons[p.fund+'|'+p.id]}));
    if (!["complete", "partial"].includes(result.status)) {
      $("empty").hidden = false;
      $("message").replaceChildren(
        text("strong", "Not enough complete data for this comparison."),
        text(
          "p",
          "No fund return has been fabricated. Collect the missing history or import verified return levels.",
        ),
      );
      const ul = document.createElement("ul");
      for (const issue of result.issues.slice(0, 12))
        ul.append(text("li", issue));
      $("message").append(ul);
      scrollTo('message');
      const missing = [
        ...new Map(
          (result.missing || []).map((x) => [x.fund + "|" + x.id, x]),
        ).values(),
      ];
      if (missing.length) {
        $("message").append(
          text(
            "p",
            "Missing returns: " +
              missing
                .slice(0, 15)
                .map((m) => `${m.fund}: ${m.name}${m.reason ? ' — '+m.reason : ''}`)
                .join("; ") +
              (missing.length > 15 ? ` and ${missing.length - 15} more.` : ""),
          ),
        );
      }
      return;
    }
    $("message").replaceChildren();
    if (result.status === "partial") {
      const missingNames = [...new Set(result.missing.map((m) => m.name))];
      message(
        `Research estimate. Measured return coverage (absolute source weight): ${fmt(result.coverage.portfolio)} / ${fmt(result.coverage.benchmark)}. ${missingNames.length ? missingNames.length+' listed/unresolved holdings have missing returns.' : 'No listed-share return gaps.'} ${result.assumedReturns?.length ? result.assumedReturns.length+(result.assumedReturns.length===1?' position uses':' positions use')+' a labelled 0% assumption. ' : ''}${result.contributionMethod === 'average-weight-period' ? 'Portfolio returns sum average weight × security return.' : result.contributionMethod === 'mixed-holdings' ? 'Index contributions compound daily; the saved allocation uses average weight × period return.' : result.contributionMethod === 'arithmetic-daily' ? 'Contributions sum daily estimates; they are not compounded returns.' : 'Contributions use reference-return linking.'}`,
      );
    }
    // Listed holdings without a price are counted as 0% by default and reported here in red.
    const zeroNames=[...new Set((result.rows||[]).filter(r=>r.assumedZero&&!r.nonListed).map(r=>r.name||r.id))];
    if(zeroNames.length)$("message").append(text("p","No price, counted as 0% return: "+zeroNames.join(", "),"missing-zero"));
    $("empty").hidden = true;
    $("results").hidden = false;
    $("metrics").replaceChildren(
      ...[
        [options.portfolio, result.returnA, result.returnMethodA],
        [options.benchmark, result.returnB, result.returnMethodB],
        ["Difference", result.activeReturn, 'comparison'],
      ].map(([label, value, method]) => {
        const card = text("div", "", label === "Difference" ? "metric difference" : "metric");
        const body = text("div", "", "metric-text");
        body.append(
          text("span", label === "Difference" ? label : fundLabel(label)),
          text("small", options.currency + (result.returnBasis ? ' · '+basisLabel(result.returnBasis) : '') + (method === 'weighted-estimate' ? ' · weighted return estimate' : method === 'reference' ? ' · reference return' : method === 'comparison' ? ' · return difference' : method === 'daily-holdings' ? ' · holdings estimate' : result.status === "partial" ? " · reference return" : " · holdings estimate")),
        );
        const figure = text("strong", fmt(value), value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative");
        if (label === "Difference") card.append(body, figure);
        else { const [labelNode, noteNode] = [...body.childNodes]; card.append(labelNode, figure, noteNode); }
        return card;
      }),
      renderReconciliation(result, options),
    );
    renderRows();
    // Cumulative return chart under the table (periods of two or more valuation days).
    drawReturnChart($('return-chart'), result.series ? {...result.series, labelA: fundLabel(options.portfolio), labelB: fundLabel(options.benchmark),
      note: options.currency + ' · '+(result.returnBasis?basisLabel(result.returnBasis):'archive return basis') + (!data.dailyHoldings&&options.assumeMissingZero ? ' · missing returns at 0%' : '')} : null);
    // 1D: one session has no daily path, so the chart follows the session's 5-minute prices instead.
    if (!result.series && onlineMode && online?.intraday && result.end && (options.start === options.end || $('range').value === 'day')) drawIntradayChart(result, options);
    renderMethod();
    if(onlineMode) $('price-status').textContent = basisLabel(data.returnBasis)+' · '+(data.dailyHoldings?'Daily floating holdings · automatic quarterly rebalance · ':data.returnBasis==='total-return'?'Dividend-adjusted security histories · ':data.arcusSource ? 'Arcus completed price returns first · '+data.arcusReturnCount+' securities/funds reused · ' : 'Completed closing prices · ')+options.start+' to '+options.end+' · '+options.currency+'. Checked '+new Date(data.priceCheckedAt).toLocaleTimeString()+'. No intraday quotes.';
    $('research-note').replaceChildren(
      text('strong','Research estimate — use for ideas, not exact accounting.'),
      text('p',data.dailyHoldings ? 'J303 holdings drift with daily closing prices and rebalance automatically each quarter. Dividends are excluded for one session and reinvested in multi-session total returns. Historical weights reconstruct public disclosures; source dates and assumptions are recorded in Method. SWIX uses its independently saved allocation. J303 and SWIX use daily compounded contributions; other saved portfolios retain their period-weight calculation and labelled cash assumptions. Missing index prices stop the comparison.' : data.arcusSource ? 'Current holdings come from Arcus. One-session comparisons can reuse completed Arcus price returns; multi-session comparisons use dividend-inclusive histories. ETF weights come from its issuer sources, retaining cash and private holdings. Where Arcus does not hold the requested dated return history, adjusted-price history and same-date FX fill the gap. Current allocations are applied to the selected period; historical trades are not reconstructed. Any archive allocation fallback is disclosed below.' : onlineMode ? 'Saved allocation weights are applied across this period as a research estimate, not actual historical trades. Both sides use the displayed return basis and same-date FX. Across verified Tokyo and Taiwan market holidays, the last local adjusted close is carried to the valuation date before applying that date’s FX. Missing open-session prices, cash income and unresolved positions remain blank unless you explicitly choose the labelled 0% assumption. No intraday quotes are used; vendor corrections can differ from Bloomberg.' : 'Where opening holdings are missing, the latest earlier snapshot is carried forward; for a new archive, a later snapshot within seven calendar days may be used. Dates are listed below. Later holdings introduce hindsight. Prices, FX cut-offs, trading and cash income may differ from Bloomberg.'),
      ...(result.holdingsWarnings || []).map(n => text('p',n)),
      ...(data.sourceWarnings || []).map(n=>text('p',n)),
      ...(result.assumedReturns?.length ? [text('p','Private holdings, cash, money-market funds, derivatives and corporate-action positions are shown at the bottom with an assumed 0% return. They are excluded from measured coverage. Missing listed-share returns remain blank unless you select the additional 0% assumption.')] : []),
      ...(result.status === 'partial' ? [text('p',`Known holdings contributions: ${fmt(result.knownContributionA)} / ${fmt(result.knownContributionB)}. ${result.contributionMethod === 'average-weight-period' ? 'Your portfolio headline is the sum of available average weight × security return contributions. ETF headlines use observed fund returns; the contribution subtotal may differ.' : 'Missing returns stay blank; available headline figures are fund reference returns, not these subtotals.'} ${result.contributionMethod === 'mixed-holdings' ? 'Index contributions compound daily; the saved allocation uses average weight × period return.' : result.contributionMethod === 'arithmetic-daily' ? 'Both contribution columns use arithmetic daily sums because a complete reference series is unavailable.' : ''}`)] : []),
      ...(result.missing?.length ? [text('p','Missing returns: '+[...new Set(result.missing.map(p=>p.name+(p.reason ? ' — '+p.reason : '')))].join('; '))] : []),
    );
    if (phone.matches) collapseSelection(options);
    scrollTo($('message').childElementCount ? 'message' : 'results');
    void loadClassData(result);
  } catch (error) {
    message(error.message);
    scrollTo('message');
  } finally {
    controls.forEach((el,i)=>el.disabled = !manifest || disabledBefore[i]);
    $("run").disabled = !manifest;
    $("run").textContent = "Compare funds";
    $('assume-zero').disabled=false;
  }
});
$('retry-missing').addEventListener('click',()=>{
  if(!result || $('run').disabled)return;
  const count=online?.retryMissing(result.missing);
  if(count)$('controls').requestSubmit();
  else message('These gaps need cash income, private valuations or a verified listing. There is no listed price to retry. Import verified return levels, or choose the explicit 0% assumption and compare again.');
});
$('assume-zero').addEventListener('change',()=>{if(manifest && !$('run').disabled)$('controls').requestSubmit();});
const fmt = (v) =>
  v === null || v === undefined ? "—" : (v * 100).toFixed(2) + "%";
function reconciliationSide(comparison, options, side) {
  const role = side === 'A' ? 'portfolio' : 'benchmark', fund = options[role];
  const rows = comparison.rows || [], values = rows.map(row => row['ctr' + side]).filter(Number.isFinite);
  const contribution = Object.hasOwn(comparison, 'knownContribution' + side)
    ? comparison['knownContribution' + side] : values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  const reference = comparison['fundReturn' + side] ?? null;
  const residual = Object.hasOwn(comparison, 'residual' + side) ? comparison['residual' + side]
    : Number.isFinite(reference) && Number.isFinite(contribution) ? reference - contribution : null;
  const coverage = comparison.coverage?.[role] ?? rows.reduce((sum, row) =>
    sum + (!row.assumedZero && Number.isFinite(row['ctr' + side]) && Number.isFinite(row['weight' + side]) ? Math.abs(row['weight' + side]) : 0), 0);
  const missing = new Set((comparison.missing || []).filter(item => item.fund === fund).map(item => item.id)).size;
  const account = fund.startsWith('PORTFOLIO:');
  const method = comparison['returnMethod' + side];
  const referenceBasis = comparison['fundReturnBasis' + side];
  const marketReference = !account && ['vendor-adjusted', 'arcus-completed-session','price-return','total-return'].includes(referenceBasis);
  const showNav = !account && Boolean(options.start) && options.start === options.end;
  const nav = showNav ? comparison.issuerNav?.[fund] : null;
  const navReturn = nav?.status === 'ok' && nav.date === options.end && nav.currency === options.currency && Number.isFinite(nav.return) ? nav.return : null;
  const referenceLabel = method==='daily-holdings' ? 'Reconstructed holdings index' : account ? 'Observed account reference' : marketReference ? 'Observed fund market return'
    : referenceBasis === 'verified-total-return' ? 'Imported verified total return'
    : referenceBasis === 'mixed' ? 'Observed fund reference (mixed sources)' : 'Observed fund reference';
  return {role, fund, reference, contribution, residual, coverage, missing, account, referenceLabel, marketReference, showNav, nav, navReturn,
    basis: method === 'weighted-estimate' ? 'Weighted portfolio estimate' : method === 'reference' ? referenceLabel : 'Holdings estimate'};
}
const fmtPoints = value => !Number.isFinite(value) ? '—' : (value > 0 ? '+' : '') + (value * 100).toFixed(2) + ' pp';
function renderReconciliation(comparison, options) {
  const section = text('section', '', 'return-reconciliation');
  section.setAttribute('aria-label', 'Return reconciliation');
  section.append(text('h2', 'Return reconciliation'), text('p', 'Fund returns and holdings contributions are shown separately. Contributions are not rescaled to close a gap.'));
  const grid = text('div', '', 'reconciliation-grid');
  for (const side of ['A', 'B']) {
    const data = reconciliationSide(comparison, options, side), card = text('article', '', 'reconciliation-fund');
    card.append(text('h3', (data.role === 'portfolio' ? 'Portfolio · ' : 'Benchmark · ') + fundLabel(data.fund)), text('p', data.basis + ' · ' + options.currency));
    const list = text('dl');
    const fields = [
      [data.referenceLabel, fmt(data.reference)],
      ...(data.showNav ? [['1D NAV return', Number.isFinite(data.navReturn) ? fmt(data.navReturn) : 'No data']] : []),
      ['Holdings contribution subtotal', fmtPoints(data.contribution)],
      ['Reference less contributions', fmtPoints(data.residual)],
      ...(data.showNav ? [
        ['NAV less contributions', Number.isFinite(data.navReturn) && Number.isFinite(data.contribution) ? fmtPoints(data.navReturn - data.contribution) : 'No data'],
        ...(data.marketReference ? [['Market return less NAV', Number.isFinite(data.reference) && Number.isFinite(data.navReturn) ? fmtPoints(data.reference - data.navReturn) : 'No data']] : []),
      ] : []),
      ['Measured weight coverage', fmt(data.coverage)],
      ['Missing security returns', String(data.missing)],
    ];
    for (const [label, value] of fields) {
      const term = text('dt', label), amount = text('dd', value);
      if (label === 'Reference less contributions' || label === 'NAV less contributions') { term.className = 'reconciliation-gap'; amount.className = 'reconciliation-gap'; }
      if (label === 'Measured weight coverage') term.title = 'Absolute source weight with measured security returns; excludes assumed returns.';
      list.append(term, amount);
    }
    card.append(list);
    if (data.showNav && Number.isFinite(data.navReturn)) {
      card.append(text('small', `${data.nav.issuer || 'Issuer'} · NAV dated ${data.nav.date}. Change in NAV per share; excludes distributions.${data.nav.fxAdjusted ? ' Converted from USD using the same dated FX as this comparison.' : ''}`));
      if(data.nav.sourceUrl && /^https:\/\//.test(data.nav.sourceUrl) && $('back-arcus')?.tagName !== 'SPAN') {
        const link=text('a','Issuer NAV source');link.href=data.nav.sourceUrl;link.target='_blank';link.rel='noopener noreferrer';card.append(link);
      }
    }
    if (data.marketReference && Number.isFinite(data.reference)) card.append(text('small', 'Market-price return is not NAV return.'));
    if (!Number.isFinite(data.reference)) card.append(text('small', 'No independent reference return is available, so a reconciliation gap cannot be calculated.'));
    grid.append(card);
  }
  section.append(grid);
  return section;
}
// Use resolved listing identities, not issuer display tickers (which may omit an exchange).
function buildSecurityLinks(snapshots = []) {
  // The Marlow-only Arcus login gets this page with the back link replaced by an empty span
  // (restrictAnalysisPage in arcus-watchlists lib/portfolio-analysis-bridge.mjs). That login must
  // have no links out of Portfolio Analysis, so its tickers stay plain text.
  if ($('back-arcus')?.tagName === 'SPAN') return new Map();
  const symbols = new Map();
  for (const snapshot of snapshots) for (const position of snapshot.positions || []) {
    const symbol = position.symbol;
    if (isNonListed(position) || typeof symbol !== 'string' || !/^[A-Z0-9][A-Z0-9.\-^=]{0,24}$/.test(symbol)) continue;
    if (!symbols.has(position.id)) symbols.set(position.id, symbol);
    else if (symbols.get(position.id) !== symbol) symbols.set(position.id, null);
  }
  const base = integrated ? '/' : 'https://arcuscapital.co.za/';
  return new Map([...symbols].filter(([, symbol]) => symbol).map(([id, symbol]) =>
    [id, base + '?tab=watchlist&symbol=' + encodeURIComponent(symbol)]));
}
function displayedRows() {
  if ($("group").value === "security") return result.rows;
  const groups = new Map();
  for (const r of result.rows) {
    const g = groups.get(r.sector) || {
      id: r.sector,
      ticker: r.sector,
      name: "Sector aggregate",
      aggregate: true,
      sector: r.sector,
      themes: new Set(),
      weightA: 0,
      weightB: 0,
      ctrA: 0,
      ctrB: 0,
      activeWeight: 0,
      activeCtr: 0,
      securityReturn: null,
    };
    for (const key of [
      "weightA",
      "weightB",
      "ctrA",
      "ctrB",
      "activeWeight",
      "activeCtr",
    ])
      g[key] = g[key] === null || r[key] === null ? null : g[key] + r[key];
    g.themes.add(themeLabel(r));
    g.theme = [...g.themes].sort().join(' / ');
    groups.set(r.sector, g);
  }
  return [...groups.values()];
}
// Desktop follows the Rise vs Swix table (Bloomberg PORT layout): Name and Ticker, then Port and Bmrk
// under each heading. Difference and Theme stay at the right end.
const columns = [
  ["name", "Name"],
  ["ticker", "Ticker"],
  ["weightA", "Avg % weight · Portfolio"],
  ["weightB", "Avg % weight · Benchmark"],
  ["returnA", "Return (%) · Portfolio"],
  ["returnB", "Return (%) · Benchmark"],
  ["ctrA", "CTR (pp) · Portfolio"],
  ["ctrB", "CTR (pp) · Benchmark"],
  ["activeWeight", "Difference · Avg % weight"],
  ["activeCtr", "Difference · CTR (pp)"],
  ["theme", "Theme"],
  ["subTheme", "Sub-theme"],
];
const columnGroups = [["Avg % weight", ["weightA", "weightB"]], ["Return (%)", ["returnA", "returnB"]],
  ["CTR (pp)", ["ctrA", "ctrB"]], ["Difference", ["activeWeight", "activeCtr"]]];
const shortLabel = {weightA: "Port", weightB: "Bmrk", newWeight: "New", returnA: "Port", returnB: "Bmrk", ctrA: "Port", ctrB: "Bmrk", activeWeight: "Wgt", activeCtr: "CTR"};
const textColumn = key => key === 'name' || key === 'ticker' || key === 'theme' || key === 'subTheme' || key === 'gics' || key === 'reg28';
// Trade slider and class columns (owner, 2026-11-15). With the slider on, New sits after Bmrk under Avg % weight.
// To the right of CTR: GICS sector for Best and EasyBF, and Reg 28 class for EasyBF.
const classKind = () => tradeHelp?.tradeTables(lastOptions?.portfolio) || null;
const classColumns = () => { const kind = classKind(); return kind === 'gics' || kind === 'reg28' ? [['gics', 'GICS sector'], ...(kind === 'reg28' ? [['reg28', 'Reg 28 class']] : [])] : []; };
function tableColumns() {
  const extra = classColumns();
  return columns.flatMap(c => c[0] === 'weightB' && trade?.on ? [c, ['newWeight', 'Avg % weight · New']] : c[0] === 'ctrB' ? [c, ...extra] : [c]);
}
const tableGroups = () => columnGroups.map(([label, keys]) => [keys[0]==='returnA'&&result?.returnBasis?basisLabel(result.returnBasis)+' (%)':label,keys]).map(([name, keys]) => keys[0] === 'weightA' && trade?.on ? [name, [...keys, 'newWeight']] : [name, keys]);
// GICS sectors: the Bloomberg list for the Arcus shares, plus each JSE share's sector from the Rise vs Swix report.
function sectorList() {
  const base = manifest?.gics?.sectors || {};
  if (!jseSectors) return base;
  if (mergedSectors?.base !== base || mergedSectors.jse !== jseSectors) mergedSectors = {base, jse: jseSectors, all: {...base, ...jseSectors}};
  return mergedSectors.all;
}
const reg28Api = () => globalThis.ArcusEasyTrades?.reg28 && globalThis.ArcusEasyTrades?.reg28Label ? globalThis.ArcusEasyTrades : null;
const isCashRow = row => assetKind(row) === 'Cash';
function reg28Class(row) {
  const api = reg28Api(), meta = positionMeta.get(row.id) || {};
  if (!api || row.aggregate) return '';
  if (isCashRow(row)) return (meta.currency || row.ticker) === 'ZAR' ? 'Local cash' : 'Foreign cash';
  try { return api.reg28Label({sourceTicker: row.ticker, ticker: meta.symbol, name: row.name, currency: meta.currency}) || ''; } catch { return ''; }
}
const percent = value => Number.isFinite(value) ? value * 100 : 0;
// Holdings of the portfolio side, plus any other row given a new weight (a share to buy).
function tradeItems() {
  const sectors = sectorList();
  return (result?.rows || []).filter(r => Math.abs(r.weightA || 0) > 1e-12 || trade?.has(r.id)).map(r => { const meta = positionMeta.get(r.id) || {};
    return {key: r.id, current: percent(r.weightA), ticker: r.ticker, symbol: meta.symbol || null, name: r.name, currency: meta.currency || null, cash: isCashRow(r), sector: gicsSector(r, sectors)}; })
    .concat(addedShares().map(s => ({key: s.id, current: 0, ticker: s.ticker, symbol: s.symbol, name: s.name, currency: s.currency || null, cash: false, sector: gicsSector(s, sectors)})));
}
// Shares added with Add new share (owner, 2026-11-16) that are not rows of this comparison.
function addedShares() {
  if (!trade?.on || !trade.newShares) return [];
  const ids = new Set((result?.rows || []).map(r => r.id));
  return trade.newShares().filter(s => !ids.has(s.id));
}
const newWeight = item => trade?.on ? trade.weight(item.key, item.current) : item.current;
// JSE sectors and the Reg 28 rules are fetched once, only when a comparison needs them; the tables redraw when they arrive.
let classLoading = null, rulesTried = false;
async function loadClassData(shown) {
  if (!integrated || !tradeHelp || classLoading) return;
  const needSectors = !jseSectors && (shown.rows || []).some(r => /\.JO$/i.test(r.id));
  const needRules = classKind() === 'reg28' && !reg28Api() && !rulesTried;
  if (!needSectors && !needRules) return;
  classLoading = (async () => {
    if (needSectors) try {
      const response = await fetch('./data/rise-swix', {credentials: 'same-origin', cache: 'no-store'});
      if (response.status === 401) { session.lock(); return; }
      const report = response.ok ? await response.json() : null, found = {};
      for (const group of report?.groups || []) if (GICS_SECTORS.includes(group.name)) for (const p of group.children || []) if (typeof p.symbol === 'string') found[p.symbol.toUpperCase()] = group.name;
      jseSectors = found;
    } catch { jseSectors = {}; }
    if (needRules) rulesTried = true;
    if (needRules) await new Promise(resolve => { const script = document.createElement('script'); script.src = '/easy-trades.js'; script.onload = script.onerror = resolve; document.head.append(script); });
  })();
  try { await classLoading; } finally { classLoading = null; }
  if (shown === result && ['complete', 'partial'].includes(result?.status)) renderRows();
}
function tradeList() {
  return (trade?.entries() || []).map(([id, target]) => { const row = result?.rows.find(r => r.id === id), meta = positionMeta.get(id) || {}, added = trade.newShare?.(id);
    return row ? {id, symbol: meta.symbol || null, ticker: row.ticker, name: row.name, current: percent(row.weightA), target}
      : added ? {id, symbol: added.symbol, ticker: added.ticker, name: added.name, current: 0, target} : null; }).filter(Boolean);
}
// Add new share: a row of this comparison keeps its own New field; any other share is looked up through Arcus
// (Yahoo Finance: name, trading currency). Names are matched against the Arcus share list and the table.
const shareKey = text => String(text || '').trim().toUpperCase().replace(/\s+/g, '');
let tradeCompanies = null;
async function tradeSuggestions() {
  if (!tradeCompanies) tradeCompanies = (async () => {
    const out = new Map();
    for (const r of result?.rows || []) if (!r.aggregate && !isNonListed(r) && /^[A-Z0-9^][A-Z0-9.\-^=]{0,24}$/.test(r.id || '')) out.set(r.id, {ticker: r.id, name: r.name || r.ticker});
    try {
      const response = integrated ? await fetch('/api/config', {credentials: 'same-origin', cache: 'no-store'}) : null;
      const config = response?.ok ? await response.json() : null;
      for (const c of config?.companies || []) { const t = shareKey(c.ticker); if (t && !out.has(t)) out.set(t, {ticker: t, name: String(c.name || t), memberships: c.memberships}); }
    } catch {}
    return [...out.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  })().catch(() => { tradeCompanies = null; return []; });
  return tradeCompanies;
}
async function findTradeShare(text) {
  const raw = String(text || '').trim(), key = shareKey(raw), upper = raw.toUpperCase();
  const rows = (result?.rows || []).filter(r => !r.aggregate && !isNonListed(r) && !isCashRow(r));
  const inTable = symbol => rows.find(r => [r.id, r.ticker, positionMeta.get(r.id)?.symbol].some(v => shareKey(v) === symbol));
  const asRow = r => ({key: r.id, existing: true, held: Math.abs(r.weightA || 0) > 1e-12, label: r.ticker || r.id});
  const row = inTable(key) || rows.find(r => String(r.name || '').trim().toUpperCase() === upper);
  if (row) return asRow(row);
  const list = await tradeSuggestions(), named = list.find(s => s.ticker === key) || list.find(s => s.name.toUpperCase() === upper) || list.filter(s => s.name.toUpperCase().startsWith(upper)).sort((a, b) => a.name.length - b.name.length)[0];
  const symbol = named?.ticker || key;
  if (!/^[A-Z0-9^][A-Z0-9.\-^=]{0,24}$/.test(symbol)) return {error: 'No share matches “' + raw + '”. Type its ticker, for example NVDA, ASML.AS or NPN.JO.'};
  if (named && inTable(symbol)) return asRow(inTable(symbol));
  let found = null;
  try {
    const response = await fetch('/api/lookup?symbol=' + encodeURIComponent(symbol), {credentials: 'same-origin', cache: 'no-store'});
    if (response.status === 401) { session.lock(); return {error: 'Signed out. Sign in again to add a share.'}; }
    found = response.ok ? await response.json() : null;
  } catch {}
  if (!found?.ok || !found.currency) return {error: symbol + ' was not found on Yahoo Finance. Check the ticker: JSE shares end in .JO, London .L, Amsterdam .AS, Hong Kong .HK.'};
  const ticker = shareKey(found.symbol) || symbol, again = inTable(ticker);
  if (again) return asRow(again);
  const theme = primaryThemePath((list.find(s => s.ticker === ticker) || named)?.memberships); // its Arcus theme, for EasyAI and EasyGE
  return {share: {id: ticker, symbol: ticker, ticker, name: String(found.name || named?.name || ticker), currency: found.currency === 'ZAc' ? 'ZAR' : found.currency === 'GBp' ? 'GBP' : found.currency,
    theme: theme?.theme || 'Unclassified', subTheme: theme?.subTheme || ''}};
}
const tradeActionOptions = () => ({fund: () => lastOptions?.portfolio, fundName: () => fundLabel(lastOptions?.portfolio), trades: tradeList, integrated, check: () => session.check(),
  findShare: findTradeShare, suggest: tradeSuggestions});
// The exposure table after the chart (owner, 2026-11-15): GICS sector weights; for EasyAI, EasyGE, IBKR and Marlow theme
// and sub-theme weights instead; for EasyBF also the Reg 28 table and SA equity by GICS sector. With the Trade slider
// on, those funds get a New column that follows the weights typed in the table.
function renderSummaryTables() {
  const kind = classKind(), on = !!trade?.on, items = tradeItems(), port = fundLabel(lastOptions?.portfolio), bench = fundLabel(lastOptions?.benchmark);
  const period = (lastOptions?.start || '') + ' to ' + (lastOptions?.end || ''), typed = ' New follows the weights you type in the table; holdings you have not changed keep their weight.';
  const empty = id => { $(id).replaceChildren(); $(id).hidden = true; };
  if (kind === 'theme') {
    empty('gics-weights');
    const themed = result.rows.map(r => { const a = percent(r.weightA), cash = isCashRow(r);
      return {theme: cash ? 'Cash' : themeLabel(r), subTheme: cash ? '' : (typeof r.subTheme === 'string' ? r.subTheme.trim() : ''), a, b: percent(r.weightB), n: on ? trade.weight(r.id, a) : a}; })
      .concat(addedShares().map(s => ({theme: s.theme || 'Unclassified', subTheme: s.subTheme || '', a: 0, b: 0, n: trade.weight(s.id, 0)})));
    renderSectorWeights($('theme-weights'), tradeHelp.themeWeights(themed), {title: 'Theme and sub-theme weights', first: 'Theme · sub-theme', portfolio: port, benchmark: bench, newLabel: on ? 'New % weight' : null, compact: true,
      note: 'Average weights, ' + period + ', by Arcus theme with its sub-themes underneath. Holdings without an Arcus theme are under Unclassified.' + (on ? typed : '')});
  } else {
    empty('theme-weights');
    let weights = gicsWeights(result.rows, sectorList());
    const gicsNew = on && kind === 'gics';
    if (gicsNew) weights = tradeHelp.withNewSectors(weights, items, newWeight);
    renderSectorWeights($('gics-weights'), weights, {portfolio: port, benchmark: bench, newLabel: gicsNew ? 'New % weight' : null,
      note: 'Average weights, ' + period + '. Holdings without a GICS sector (cash, funds, private or not on the list) are under Unknown GICS.' + (gicsNew ? typed : '')});
  }
  const api = kind === 'reg28' ? reg28Api() : null;
  let tables = null;
  if (api) try { tables = tradeHelp.reg28Tables(api, items, newWeight); } catch (error) { console.warn('Reg 28 tables unavailable', error); }
  if (!tables) { empty('reg28-weights'); empty('sa-equity-weights'); return; }
  const limits = api.REG28_LIMITS || {};
  renderSectorWeights($('reg28-weights'), {list: tables.rows.filter(r => !r.total), total: tables.rows.find(r => r.total)}, {title: 'Reg 28 weights', first: 'Reg 28 class', portfolioLabel: port + ' %', benchmark: null,
    newLabel: on ? 'New %' : null, limit: true,
    note: 'Average weights, ' + period + ', classed by the same rules as the Trade screen. Limits: total foreign ' + limits.totalForeign + '%, total equity ' + limits.totalEquity + '%, gold ' + limits.gold + '%; a figure over its limit is red.'
      + (on ? typed + ' Cash is left as it is, so Total shows whether the new weights still add up.' : '')});
  renderSectorWeights($('sa-equity-weights'), tables.equity, {title: 'SA equity by GICS sector', first: 'GICS sector', portfolioLabel: '% of SA equity', benchmark: null, newLabel: on ? 'New %' : null,
    note: 'Local equity holdings only, each sector as a share of SA equity. SA equity is ' + tradeHelp.fmt2(tables.equity.shareA) + '% of ' + port + (on ? ' now and ' + tradeHelp.fmt2(tables.equity.shareN) + '% with the new weights' : '')
      + '. Funds and shares without a GICS sector are under Unknown GICS.'});
}
// Sorting by Theme groups each theme's sub-themes together; sorting by Sub-theme keeps same-named sub-themes
// of different themes apart. Ties end in name order.
const textTieBreak = {theme: ['subTheme', 'name'], subTheme: ['theme', 'name'], name: [], ticker: []};
function themeLabel(row) {
  const value = Array.isArray(row.theme) ? row.theme.filter(Boolean).join(' / ') : row.theme;
  return typeof value === 'string' && value.trim() ? value.trim() : 'Unclassified';
}
// A security has one return on both sides; a sector's return on a side is its contribution over its weight.
function sideReturn(row, side) {
  if (!row.aggregate) return row.securityReturn ?? null;
  const weight = row['weight' + side], ctr = row['ctr' + side];
  return Number.isFinite(weight) && Number.isFinite(ctr) && Math.abs(weight) > 1e-12 ? ctr / weight : null;
}
const rowValue = (row, key) => key === 'returnA' ? sideReturn(row, 'A') : key === 'returnB' ? sideReturn(row, 'B')
  : key === 'newWeight' ? (trade && !row.aggregate ? trade.weight(row.id, percent(row.weightA)) / 100 : row.weightA) : row[key];
// Figures as in the Rise vs Swix table: two decimals, no % sign (the heading gives the unit).
const cellNumber = value => Number.isFinite(value) ? (Math.abs(value) < .00005 ? 0 : value * 100).toFixed(2) : '—';
// Sum original values, not displayed/rounded cells or incomplete sector groups.
function tableTotals(rows) {
  const totals = {}, missing = {};
  for (const key of ['weightA', 'weightB', 'activeWeight', 'ctrA', 'ctrB', 'activeCtr']) {
    const values = rows.map(row => row[key]).filter(Number.isFinite);
    totals[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    missing[key] = rows.length - values.length;
  }
  return {totals, missing};
}
function tableCellValue(row, key) {
  if (key === 'name') return row.aggregate ? row.ticker : row.name || row.ticker;
  if (key === 'subTheme') return typeof row.subTheme === 'string' && row.subTheme.trim() ? row.subTheme.trim() : '—';
  if (key === 'gics') return row.aggregate ? '—' : gicsSector(row, sectorList());
  if (key === 'reg28') return reg28Class(row) || '—';
  return key === 'ticker' ? row.ticker : key === 'theme' ? themeLabel(row) : cellNumber(rowValue(row, key));
}
// The total is the first row under the headings, as in the Rise vs Swix table.
function tableTotalRow(visible) {
  const tr = document.createElement('tr'), first = visible[0][0];
  tr.className = 'table-total';
  const {totals, missing} = tableTotals(result.rows);
  const worst = Math.max(0, ...visible.map(([key]) => missing[key] || 0));
  for (const [key] of visible) {
    let cell;
    if (key === first) {
      cell = text('th', 'Total');
      cell.scope = 'row';
      cell.append(text('small', 'Available values · unrounded sums' + (worst ? ` · ${worst} missing` : '')));
      cell.title = cell.children?.[0]?.textContent || ''; // dark desktop hides the caption, as the Rise total row has none
    } else if (key === 'returnA' || key === 'returnB') {
      const value = result[key];
      cell = text('td', cellNumber(value), signClass(key, value));
      cell.title = 'Headline return, as in the summary above.';
    } else if (key === 'securityReturn') {
      cell = text('td', '—');
      cell.title = 'Individual security returns cannot be added together.';
    } else if (key === 'newWeight') {
      cell = tradeSums.cell(result.rows.map(row => ({key: row.id, current: percent(row.weightA)})).concat(addedShares().map(s => ({key: s.id, current: 0}))));
    } else if (textColumn(key)) cell = text('td', key === 'theme' || key === 'subTheme' ? '—' : '');
    else {
      cell = text('td', cellNumber(totals[key]), signClass(key, totals[key]));
      cell.title = missing[key] ? `Sum of available values; ${missing[key]} missing. Calculated before rounding.` : 'Sum calculated before rounding.';
      if (missing[key]) cell.append(text('small', `${missing[key]} missing`));
    }
    tr.append(cell);
  }
  return tr;
}
// 1D chart (owner, 2026-11-13): 5-minute prices for the largest holdings (up to 150 listings per side, four at a
// time), drawn only if this comparison is still the one on screen. A failure leaves the chart hidden.
let intradayRun = 0;
async function drawIntradayChart(shown, options) {
  const run = ++intradayRun, date = shown.end;
  const side = key => shown['returnMethod' + key] === 'reference' && Number.isFinite(shown['fundReturn' + key])
    ? [{id: options[key === 'A' ? 'portfolio' : 'benchmark'], weight: 1, daily: shown['fundReturn' + key]}]
    : (shown.rows || []).filter(r => r['weight' + key] && !r.assumedZero && Number.isFinite(r['ctr' + key]) && Number.isFinite(r.securityReturn))
        .map(r => ({id: r.id, weight: r['weight' + key], daily: r.securityReturn}));
  const sides = [side('A'), side('B')], listed = id => /^[A-Z0-9][A-Z0-9.\-^=]{0,24}$/.test(id || '');
  const symbols = [...new Set(sides.flatMap(items => [...items].sort((x, y) => Math.abs(y.weight) - Math.abs(x.weight)).map(i => i.id).filter(listed).slice(0, 150)))];
  const bars = new Map();
  let next = 0;
  await Promise.all([0, 1, 2, 3].map(async () => {
    while (next < symbols.length && run === intradayRun) {
      const id = symbols[next++];
      try { const data = await online.intraday(id, date); if (data?.t?.length > 1 && data.t.length === data.c?.length) bars.set(id, data); } catch {}
    }
  }));
  if (run !== intradayRun || shown !== result) return;
  const series = intradaySeries(sides, bars);
  if (!series) return;
  const share = v => Math.round(100 * v) + '%';
  drawReturnChart($('return-chart'), {...series, minPoints: 3, labelA: fundLabel(options.portfolio), labelB: fundLabel(options.benchmark), title: 'Intraday return (%)',
    subtitle: date + ' · 5-minute prices, your local time · ends at the official 1D close · ' + options.currency + ' · intraday prices for ' + share(series.coverage[0]) + ' / ' + share(series.coverage[1]) + ' of weight'});
}
// GICS grouping (owner, 2026-11-13): with Grouping = GICS sector, ordinary comparisons show the Rise vs Swix
// table (white sector rows that open to the holdings, same columns and formatting); No grouping keeps the table.
var gicsView = null, gicsShown = null; // var: the reset above may run before this line
function gicsPanel() {
  if (gicsView) return gicsView;
  const rowOf = holding => result?.rows.find(r => r.id === holding.id) || {id: holding.id, ticker: holding.ticker, name: holding.name};
  const panel = text('section', '', 'panel rise-swix'), grid = createGroupedTable({trade, extra: classColumns,
    extraText: (holding, key) => tableCellValue(rowOf(holding), key), locked: holding => isNonListed(rowOf(holding))});
  panel.id = 'gics-table';
  panel.hidden = true;
  const note = text('p'), foot = text('p'), actions = text('div', '', 'rise-actions');
  if (trade) actions.append(trade.actions(tradeActionOptions()));
  panel.append(text('h2', 'Return contributions · GICS sectors'), note, actions, grid.scroll, foot);
  $('rows').closest('.panel').before(panel);
  return gicsView = {panel, grid, note, foot};
}
function renderGicsTable() {
  const view = gicsPanel(), options = lastOptions || {}, port = fundLabel(options.portfolio), bench = fundLabel(options.benchmark);
  if (gicsShown !== result) { view.grid.reset(); gicsShown = result; }
  view.grid.setLabels({portfolio: port, benchmark: bench});
  const value = groupByGics(result.rows, sectorList(), {total: port + ' vs ' + bench, returnA: result.returnA, returnB: result.returnB});
  view.grid.render(value);
  const unknown = value.groups.find(g => g.name === UNKNOWN_GICS)?.children.length || 0;
  view.note.textContent = 'Port = ' + port + ' · Bmrk = ' + bench + ' · ' + (options.start || '') + ' to ' + (options.end || '') + ' · ' + (options.currency || '') + ' · grouped by GICS sector';
  view.foot.textContent = 'GICS sectors from Bloomberg for the Arcus share list' + (manifest?.gics?.asOf ? ' (' + manifest.gics.asOf + ')' : '') + '. '
    + (unknown ? unknown + (unknown === 1 ? ' holding has' : ' holdings have') + ' no GICS sector (cash, funds, private or not on the list) and ' + (unknown === 1 ? 'is' : 'are') + ' under Unknown GICS. ' : '')
    + 'Sector returns are contribution over weight on each side; the first row uses the headline returns. Italic returns are for shares that side does not hold: the share’s own return, for reference, with no weight or contribution. Swipe horizontally for more columns.';
  view.panel.hidden = false;
}
// Cash row (owner, 2026-11-13): average cash weight of each side (cash and money-market holdings), shown
// between the contribution chart and the table. A reference index with no holdings shows "No holdings data".
const CASH_KINDS = new Set(['Cash', 'Money Market']);
const cashLabel = row => {
  const ticker = String(row.ticker || '').trim();
  return ticker && ticker.length <= 6 && !/^(?:cash|money market)$/i.test(ticker) ? ticker : String(row.name || ticker || 'Cash').trim();
};
function cashSide(rows, side) {
  const key = 'weight' + side, fund = lastOptions?.[side === 'A' ? 'portfolio' : 'benchmark'];
  const held = rows.filter(row => Number.isFinite(row[key]) && Math.abs(row[key]) > 1e-9);
  if (!held.length || (held.length === 1 && held[0].id === fund)) return null;
  const cash = held.filter(row => CASH_KINDS.has(assetKind(row)));
  return {total: cash.reduce((sum, row) => sum + row[key], 0),
    parts: cash.map(row => [cashLabel(row), row[key]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))};
}
function renderCashRow() {
  const root = document.getElementById('cash-row');
  if (!root) return;
  root.replaceChildren(...['A', 'B'].map(side => {
    const data = cashSide(result?.rows || [], side), box = text('div', '', 'cash-side');
    const note = !data ? 'No holdings data' : !data.parts.length ? 'No cash holdings'
      : data.parts.slice(0, 3).map(([label, weight]) => label + ' ' + cellNumber(weight)).join(' · ') + (data.parts.length > 3 ? ' · +' + (data.parts.length - 3) + ' more' : '');
    box.append(text('span', 'Cash · ' + fundLabel(lastOptions?.[side === 'A' ? 'portfolio' : 'benchmark']), 'cash-label'),
      text('strong', data ? cellNumber(data.total) + '%' : '—', 'cash-figure'), text('small', note, 'cash-note'));
    if (data?.parts.length) box.title = data.parts.map(([label, weight]) => label + ' ' + cellNumber(weight) + '%').join('\n');
    return box;
  }));
}
function wireTableScroll(table) {
  const scroll = table.closest('.scroll');
  if (!scroll) return;
  scroll.id = 'holdings-table-scroll';
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', 'Holdings comparison. Scroll within the table to keep column headings visible.');
  scroll.setAttribute('aria-describedby', 'table-scroll-status');
  let nav = document.getElementById('table-scroll-nav');
  if (!nav) {
    nav = text('div', '', 'table-scroll-nav'); nav.id = 'table-scroll-nav';
    const status = text('span', '', 'table-scroll-status'); status.id = 'table-scroll-status';
    const left = text('button', '← Scroll left'), right = text('button', 'Scroll right →');
    for (const button of [left, right]) { button.type = 'button'; button.setAttribute('aria-controls', scroll.id); }
    left.dataset.direction = 'left'; right.dataset.direction = 'right';
    left.onclick = () => scroll.scrollBy({left: -Math.max(240, scroll.clientWidth * .75), behavior: 'smooth'});
    right.onclick = () => scroll.scrollBy({left: Math.max(240, scroll.clientWidth * .75), behavior: 'smooth'});
    nav.append(status, left, right); scroll.before(nav);
    const update = () => {
      const overflow = scroll.scrollWidth > scroll.clientWidth + 2;
      left.hidden = right.hidden = !overflow;
      left.disabled = scroll.scrollLeft <= 1;
      right.disabled = scroll.scrollLeft + scroll.clientWidth >= scroll.scrollWidth - 2;
      status.textContent = overflow ? (right.disabled ? 'End of columns · scroll left to return' : 'More columns to the right, including Theme') : 'Scroll rows below · column headings stay visible';
    };
    scroll.addEventListener('scroll', update, {passive: true});
    scroll._updateTableScroll = update;
    if (typeof ResizeObserver !== 'undefined') {
      scroll._tableResizeObserver = new ResizeObserver(update);
      scroll._tableResizeObserver.observe(scroll);
      scroll._tableResizeObserver.observe(table);
    }
  }
  scroll._updateTableScroll?.();
}
// Phones show three columns; the remaining figures open under the tapped row.
const phoneColumns = () => $("group").value === "sector"
  ? [["ticker", "Sector"], ["activeWeight", "Active wt (%)"], ["activeCtr", "Diff (pp)"]]
  : trade?.on ? [["ticker", "Security"], ["weightA", "Weight (%)"], ["newWeight", "New (%)"]] // Trade slider: weight now and the new weight
  : [["ticker", "Security"], ["returnA", "Return (%)"], ["activeCtr", "Diff (pp)"]];
const signClass = (key, value) => ["ctrA", "ctrB", "activeCtr", "securityReturn", "returnA", "returnB", "activeWeight"].includes(key)
  ? (value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative") : "";
function columnLabel(key, name) {
  if (!lastOptions) return name;
  return name.replace("· Portfolio", "· " + fundLabel(lastOptions.portfolio)).replace("· Benchmark", "· " + fundLabel(lastOptions.benchmark));
}
function syncSortControls() {
  $("sort").value = sortKey;
  $("sort-direction").textContent = textColumn(sortKey)
    ? (sortDirection === 1 ? "↓ A to Z" : "↑ Z to A")
    : (sortDirection === -1 ? "↓ Largest first" : "↑ Smallest first");
}
function renderRows() {
  if (!["complete", "partial"].includes(result?.status)) return;
  const compact = phone.matches, sectors = $("group").value === "sector", all = tableColumns(), groups = tableGroups();
  const visible = compact ? phoneColumns() : all;
  if (!all.some(([key]) => key === sortKey)) { sortKey = 'activeCtr'; sortDirection = -1; }
  if ([...$("sort").options].map(o => o.value).join() !== all.map(([key]) => key).join()) $("sort").replaceChildren(...all.map(([key, name]) => { const o = text("option", name); o.value = key; return o; }));
  syncSortControls();
  tradeSums?.reset();
  $('rows').closest('table').classList.toggle('trade-on', !!trade?.on);
  $("table-hint").textContent = compact
    ? "Weights and returns in %, contributions in percentage points. Tap a heading to sort, or a row for weights and contributions."
    : "Weights and returns in %, contributions (CTR) in percentage points. Click a heading to sort. The total is the first row, from unrounded values. Scroll inside the table.";
  if (!sectors && securityLinks.size) $('table-hint').textContent += ' Tickers open Arcus Watchlists in a new tab.';
  const heading = (key, name, label) => {
    const th = text("th", label + (sortKey === key ? (sortDirection === 1 ? " ↑" : " ↓") : ""));
    th.scope = "col";
    if (label !== columnLabel(key, name)) th.title = columnLabel(key, name);
    th.tabIndex = 0;
    th.setAttribute("aria-sort", sortKey === key ? (sortDirection === 1 ? "ascending" : "descending") : "none");
    th.addEventListener("click", () => {
      sortDirection = sortKey === key ? -sortDirection : textColumn(key) ? 1 : -1;
      sortKey = key;
      renderRows();
    });
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); th.click(); }
    });
    return th;
  };
  if (compact) {
    const tr = document.createElement("tr");
    for (const [key, name] of visible) tr.append(heading(key, name, columnLabel(key, name)));
    $("columns").replaceChildren(tr);
  } else {
    // Two heading rows, as in the Rise vs Swix table: group headings over Port and Bmrk.
    const top = document.createElement("tr"), sub = document.createElement("tr");
    for (const [key, name] of all) {
      const group = groups.find(([, keys]) => keys.includes(key));
      if (!group) {
        const th = heading(key, name, name);
        th.rowSpan = 2;
        if (key === 'gics' || key === 'reg28') th.classList.add('class-head');
        top.append(th);
        continue;
      }
      if (group[1][0] === key) {
        const th = text("th", group[0]);
        th.colSpan = group[1].length;
        th.scope = "colgroup";
        top.append(th);
      }
      sub.append(heading(key, name, shortLabel[key]));
    }
    $("columns").replaceChildren(top, sub);
  }
  $("rows").dataset.group = $("group").value;
  const rows = [...displayedRows()].sort(
    (a, b) =>
      Number(!!a.nonListed)-Number(!!b.nonListed) || sortDirection *
      (textColumn(sortKey)
        ? [sortKey, ...(textTieBreak[sortKey] || [])].reduce((order, key) => order || String(tableCellValue(a, key)).localeCompare(String(tableCellValue(b, key))), 0)
        : (rowValue(a, sortKey) ?? -Infinity) - (rowValue(b, sortKey) ?? -Infinity)),
  );
  renderContributionChart(rows);
  renderCashRow();
  const grouped = $('grouping')?.value === 'gics';
  $('rows').closest('.panel').hidden = grouped;
  if (grouped) renderGicsTable(); else if (gicsView) gicsView.panel.hidden = true;
  // GICS sector weights after the chart, with or without grouping (owner, 2026-11-13).
  renderSummaryTables();
  const body = [
    tableTotalRow(visible),
    ...rows.flatMap((r) => {
      const row = document.createElement("tr");
      if (trade?.on && !r.aggregate) trade.markRow(row, trade.has(r.id));
      for (const [key] of visible) {
        if (key === 'newWeight') { // Trade slider: the current weight shows faintly until a new one is typed
          row.append(trade.newCell({key: r.aggregate ? null : r.id, current: percent(r.weightA), locked: !!r.aggregate || isNonListed(r), label: r.name || r.ticker}));
          continue;
        }
        const value = rowValue(r, key), cell = text("td", tableCellValue(r, key));
        cell.dataset.col = key; // dark mode colours companies and their weights orange, sectors white
        if (key === 'theme' || key === 'subTheme') {
          cell.classList.add('theme-cell');
          if (r.themePath) cell.title = r.themePath; // full Arcus path, e.g. Ai › Semis › Accelerators
        }
        if (key === 'gics' || key === 'reg28') { cell.classList.add('theme-cell'); cell.title = cell.textContent; }
        if (!compact && (key === 'name' || key === 'ticker')) cell.title = cell.textContent + (key === 'name' && r.assumedZero ? ' · Assumed 0%' : ''); // full text when a fixed-width cell is cut short
        if (key === 'ticker' && !compact && r.aggregate) cell.textContent = '';
        if (key === 'ticker' && !sectors && !r.nonListed && securityLinks.has(r.id)) {
          const link = text('a', r.ticker, 'security-link');
          link.href = securityLinks.get(r.id);
          link.target = '_blank';
          link.rel = 'noopener';
          link.title = 'Open ' + r.ticker + ' in Arcus Watchlists (new tab)';
          link.setAttribute('aria-label', link.title);
          cell.replaceChildren(link);
        }
        if (compact && key === "ticker" && r.name !== r.ticker) cell.append(text("small", r.name));
        if (key === (compact ? 'ticker' : 'name') && r.assumedZero) cell.append(text('small', 'Assumed 0%'));
        // As in the Rise vs Swix table, an exact zero stays uncoloured on desktop.
        if (compact || ["returnA", "returnB", "ctrA", "ctrB", "activeCtr"].includes(key)) cell.className = !compact && value === 0 ? '' : signClass(key, value);
        if (!compact && !r.aggregate && (key === 'returnA' || key === 'returnB')) {
          const side = key.slice(-1);
          if (r.assumedZero) {
            cell.classList.add('zeroed');
            cell.title = 'No price: counted as 0% return.';
          } else if (Number.isFinite(value) && !(Math.abs(r['weight' + side] ?? 0) > 0)) {
            cell.classList.add('reference'); // italic, as in the Rise vs Swix table
            cell.title = (side === 'A' ? 'The portfolio' : 'The benchmark') + ' does not hold this security. Its own return, for reference.';
          }
        }
        row.append(cell);
      }
      if (!compact) return [row];
      const detail = document.createElement("tr");
      detail.className = "detail";
      detail.hidden = true;
      const cell = document.createElement("td");
      cell.colSpan = visible.length;
      const list = document.createElement("dl");
      for (const [key, name] of all) {
        if (key === "ticker" || key === "name" || key === "newWeight" || (key === "returnB" && !r.aggregate) || visible.some(([k]) => k === key)) continue;
        list.append(text("dt", columnLabel(key, name)), text("dd", tableCellValue(r, key), signClass(key, rowValue(r, key))));
      }
      cell.append(list);
      detail.append(cell);
      row.className = "expandable";
      row.tabIndex = 0;
      row.setAttribute("aria-expanded", "false");
      row.addEventListener("click", (e) => {
        if (e.target.closest('a,input')) return;
        detail.hidden = !detail.hidden;
        row.setAttribute("aria-expanded", String(!detail.hidden));
      });
      row.addEventListener("keydown", (e) => {
        if (e.target.closest('a,input')) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
      return [row, detail];
    }),
  ];
  if (trade) trade.keepFocus($('rows'), () => $("rows").replaceChildren(...body)); else $("rows").replaceChildren(...body);
  const table = $('rows').closest('table');
  table.tFoot?.remove();
  wireTableScroll(table);
}
$('grouping')?.addEventListener('change', () => { if (result && ['complete', 'partial'].includes(result.status)) renderRows(); });
$("sort").addEventListener("change", () => {
  sortKey = $("sort").value;
  sortDirection = textColumn(sortKey) ? 1 : -1;
  if (result) renderRows();
});
$("sort-direction").addEventListener("click", () => {
  sortDirection = -sortDirection;
  if (result) renderRows();
});
phone.addEventListener("change", () => { if (result && ["complete", "partial"].includes(result.status)) renderRows(); if (!phone.matches) expandSelection(); });
function renderContributionChart(rows) {
  const top = rows.filter(r => Number.isFinite(r.activeCtr)).sort((a,b) => Math.abs(b.activeCtr)-Math.abs(a.activeCtr)).slice(0,6);
  const root = $('contribution-chart');
  root.replaceChildren(text('h2', 'Biggest contribution differences'), text('p', 'Portfolio minus benchmark · percentage points'));
  const max = Math.max(...top.map(r => Math.abs(r.activeCtr)), 0.000001);
  for (const row of top) {
    const item = text('div','','contribution-row');
    item.append(text('span',row.ticker), text('strong',(row.activeCtr >= 0 ? '+' : '')+(row.activeCtr*100).toFixed(2)+' pp',row.activeCtr >= 0 ? 'positive' : 'negative'));
    const bar = document.createElement('meter');
    bar.min = 0; bar.max = max; bar.value = Math.abs(row.activeCtr);
    bar.className = row.activeCtr >= 0 ? 'positive' : 'negative';
    bar.setAttribute('aria-label', row.ticker + ' contribution difference magnitude');
    item.append(bar); root.append(item);
  }
  if (!top.length) root.append(text('p','No complete contribution differences for this selection.'));
}
function renderMethod() {
  const node = $("method");
  node.replaceChildren(
    text(
      "p",
      `${result.days} valuation days. Opening baseline: ${result.baseline}. Results through ${result.end}.`,
    ),
  );
  const ul = document.createElement("ul");
  for (const n of result.notes) ul.append(text("li", n));
  node.append(
    ul,
    text(
      "p",
      `Fund reference returns: ${fmt(result.fundReturnA)} / ${fmt(result.fundReturnB)}. Unexplained difference versus holdings estimate: ${fmt(result.residualA)} / ${fmt(result.residualB)}.`,
    ),
  );
  const table = document.createElement("table"),
    head = document.createElement("tr");
  for (const v of [
    "Sector",
    "Allocation (pp)",
    "Selection (pp)",
    "Interaction (pp)",
  ])
    head.append(text("th", v));
  table.append(head);
  for (const s of result.sectors) {
    const row = document.createElement("tr");
    for (const v of [
      s.sector,
      fmt(s.allocation),
      fmt(s.selection),
      fmt(s.interaction),
    ])
      row.append(text("td", v));
    table.append(row);
  }
  const scroll = text("div", "", "scroll");
  scroll.append(table);
  node.append(scroll);
}
$("group").addEventListener("change", () => { saveSelection(); if (result && ['complete', 'partial'].includes(result.status)) renderRows(); });
$("download").addEventListener("click", async () => {
  $('download').disabled = true;
  try {
    if (!await session.check()) return;
    if (!["complete", "partial"].includes(result?.status)) return;
    const current = result, generation = accessGeneration;
    const selection = {portfolio:fundLabel(lastOptions.portfolio), benchmark:fundLabel(lastOptions.benchmark),
      rows:displayedRows(), view:$('group').value === 'security' ? 'Holdings' : 'Sector'};
    const {comparisonXlsx} = await import('./export.mjs?v=returns-20261116');
    if (!await session.check() || generation !== accessGeneration || current !== result) return;
    const blob = new Blob([comparisonXlsx(current, selection)],
      {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    clearExport();
    exportUrl = URL.createObjectURL(blob);
    const link = $('download-ready');
    link.href = exportUrl;link.hidden=false;
    link.download = `arcus-comparison-${current.start}-${current.end}.xlsx`;
    link.click();
    // Keep a direct user-gesture link available if a browser blocks the async download.
  } catch (error) { message('Excel download unavailable. '+error.message); }
  finally { $('download').disabled = false; }
});

// An older Arcus bridge may not yet allow the online modules during rollout/rollback.
try {
  const {createOnlineSource}=await import('./online.mjs?v=returns-20261116c');
  online = createOnlineSource({onUnauthorized:()=>session.lock(),onProgress:(done,total)=>{if(onlineMode) $('run').textContent='Checking prices '+done+' / '+total;}});
} catch {
  $('connect-saved').disabled=true;
  message('Saved online holdings are temporarily unavailable. You can still import an archive file.');
}
// Trade slider (owner, 2026-11-15). An older Arcus bridge does not serve trade.mjs: the page then works as before,
// without the slider. The Marlow-only login (its back link is an empty span) never gets it.
if ($('back-arcus')?.tagName !== 'SPAN') try {
  tradeHelp = await import('./trade.mjs?v=trade-20261115');
  trade = tradeHelp.createTradeMode();
  tradeSums = trade.sums();
  trade.setScope($('portfolio').value);
  $('download-ready').after(trade.actions(tradeActionOptions()));
  $('trade-toggle').hidden = false;
  $('trade-mode').checked = false; // off on every load
  $('trade-mode').addEventListener('change', () => trade.setOn($('trade-mode').checked));
  // Slider on or off, or another portfolio: redraw. Typing only moves the sums (their own cells) and the summary tables.
  // Phones show Security, Weight and New while the slider is on: list the fund's own holdings first (largest weight),
  // and go back to the earlier order when it is switched off.
  let sortBeforeTrade = null;
  trade.subscribe(why => {
    if (why === 'mode' && phone.matches) {
      if (trade.on && !['ticker', 'weightA', 'newWeight'].includes(sortKey)) { sortBeforeTrade = [sortKey, sortDirection]; sortKey = 'weightA'; sortDirection = -1; }
      else if (!trade.on && sortBeforeTrade) { [sortKey, sortDirection] = sortBeforeTrade; sortBeforeTrade = null; }
    }
    if (why === 'order' || !result || !['complete', 'partial'].includes(result.status) || $('results').hidden) return;
    if (why === 'value') renderSummaryTables(); else renderRows();
  });
} catch (error) { trade = tradeHelp = tradeSums = null; console.warn('Trade slider unavailable', error); }
async function connectSaved() {
  const generation=accessGeneration;
  try {
    if(!await session.check())return;
    $('connect-saved').disabled=true;
    message('Loading saved ETFs and portfolios…');
    const m=await online.catalog();
    if(generation!==accessGeneration)return;
    if(integrated&&m.riseSwixEnabled&&!riseSwix){const module=await import('./rise-swix.mjs?v=returns-20261116c');riseSwix=module.createRiseSwix({check:()=>session.check(),lock:()=>session.lock(),trade});}
    onlineMode=true;dataset=folder=null; setup(m);
    void refreshArcusReturns();
    $('archive-title').textContent=m.holdingsSource==='arcus'?'Arcus ETFs & portfolios':'Saved ETFs & portfolios';
    if(m.holdingsSource==='arcus')$('archive-status').textContent='Current holdings are read from Arcus whenever you compare. One session uses price returns; longer periods use total-return histories. Source dates are shown with the result.';
    $('empty').hidden=true;
    $('range-note').textContent='Checking the latest completed US trading date…';
    const calendar=await online.calendar(m);
    if(generation!==accessGeneration || !onlineMode)return;
    manifest.valuationDates=calendar;
    $('range').value=riseSwix?.isActive()?'day':preferredRange();applyRange();
    $('range-note').textContent='Completed daily returns through '+calendar.at(-1)+'. Today’s intraday session is excluded. '+(m.holdingsSource==='arcus'?'Holdings dates are checked against Arcus when you compare.':'Saved allocations may be older.');
    riseSwix?.syncSelection();
    message('');
  } catch(error){if(generation===accessGeneration)message(error.message+' You can refresh saved holdings or use an archive file.');}
  finally {$('connect-saved').disabled=false;}
}
$('connect-saved').addEventListener('click',connectSaved);
if(integrated && online)void connectSaved();
