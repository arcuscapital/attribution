import { dateRange } from './ranges.mjs';
import { createSessionGuard } from './session.mjs';
const $ = (id) => document.getElementById(id);
const integrated = location.pathname.startsWith('/portfolio-analysis/');
let online = null, onlineMode = false;
const fundPickers = new Map();
let arcusReturns = new Map();
let activeWorker = null, cancelCalculation = null, accessGeneration = 0;
let exportUrl=null;
function clearExport(){
  if(exportUrl)URL.revokeObjectURL(exportUrl);
  exportUrl=null;$('download-ready').hidden=true;$('download-ready').removeAttribute('href');
}
const session = createSessionGuard({onLock() {
  accessGeneration++;
  clearExport();
  online?.clear();
  activeWorker?.terminate(); activeWorker = null;
  cancelCalculation?.(); cancelCalculation = null;
  folder = dataset = manifest = result = null; onlineMode = false;
  for (const id of ['metrics','rows','columns','method','research-note','archive-info','contribution-chart','message','price-status']) $(id).replaceChildren();
  for (const id of ['portfolio','benchmark']) { $(id).replaceChildren(); $(id).disabled = true; }
  arcusReturns.clear();
  for (const picker of fundPickers.values()) picker.clear();
  $('run').disabled = true;
  $('missing-actions').hidden=true; $('assume-zero').checked=false;
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
const hasOption = (id, value) => [...$(id).options].some(o => o.value === value);
function restoreSelection(m) {
  const saved = savedSelection();
  if (!saved) return false;
  const ids = new Set(m.funds.map(f => f.id));
  if (!ids.has(saved.portfolio) || !ids.has(saved.benchmark) || saved.portfolio === saved.benchmark) return false;
  $('portfolio').value = saved.portfolio; $('benchmark').value = saved.benchmark;
  if (hasOption('currency', saved.currency)) $('currency').value = saved.currency;
  if (hasOption('group', saved.group)) $('group').value = saved.group;
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
  if (m?.schemaVersion !== 1 || !Array.isArray(m.funds) || m.funds.length < 2)
    throw Error("Invalid archive manifest. At least two funds are required.");
  manifest = m;
  result = null;
  clearExport();$('missing-actions').hidden=true;$('assume-zero').checked=false;
  $("results").hidden = true;
  $("empty").hidden = false;
  for (const id of ["portfolio", "benchmark"]) {
    $(id).replaceChildren(
      ...m.funds.map((f) => {
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
  for (const id of ['portfolio','benchmark']) {
    if (!fundPickers.has(id)) fundPickers.set(id,createFundPicker(id));
    fundPickers.get(id).render(m.funds);
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
function fundTheme(fund) {
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
    const name=text('span',f.id.startsWith('PORTFOLIO:')?f.name:`${f.id} · ${f.name}`,'fund-name');
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
    for(const theme of [...FUND_THEMES.map(([name])=>name),'Other ETFs']){
      const matches=funds.filter(f=>fundTheme(f)===theme && `${f.id} ${f.name} ${theme}`.toLowerCase().includes(query)).sort((a,b)=>a.id.localeCompare(b.id));
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
    for(const picker of fundPickers.values())picker.render(manifest.funds);
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
          manifest.holdingsSource==='arcus' && !f.currentSource ? 'Current Arcus allocation checked when you compare.' : `${f.positions} positions · holdings ${f.latest || "not collected"} · ${f.currentSource || (onlineMode ? 'saved allocation' : f.dates.length+' saved dates')}`,
        ),
      );
      if(f.allocationNote)card.append(text('p',f.allocationNote));
      return card;
    }),
  );
}
for(const id of ['portfolio','benchmark','currency','range','start','end']) $(id).addEventListener('change',()=>{
  clearExport();
  result=null;$('missing-actions').hidden=true;$('results').hidden=true;$('price-status').textContent='';$('message').replaceChildren();
  saveSelection();
});
for(const id of ['portfolio','benchmark']) $(id).addEventListener('change', renderArchiveInfo);
function applyRange() {
  const dates = manifest?.valuationDates || [];
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
async function loadRange(start, end) {
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
      const worker = new Worker(new URL("./worker.mjs?v=listed-focus-types-20261028", import.meta.url), {
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
        `Research estimate. Measured return coverage (absolute source weight): ${fmt(result.coverage.portfolio)} / ${fmt(result.coverage.benchmark)}. ${missingNames.length ? missingNames.length+' listed/unresolved holdings have missing returns.' : 'No listed-share return gaps.'} ${result.assumedReturns?.length ? result.assumedReturns.length+' positions use a labelled 0% assumption. ' : ''}${result.contributionMethod === 'average-weight-period' ? 'Portfolio returns sum average weight × security return.' : result.contributionMethod === 'arithmetic-daily' ? 'Contributions sum daily estimates; they are not compounded returns.' : 'Contributions use reference-return linking.'}`,
      );
    }
    $("empty").hidden = true;
    $("results").hidden = false;
    $("metrics").replaceChildren(
      ...[
        [options.portfolio, result.returnA, result.returnMethodA],
        [options.benchmark, result.returnB, result.returnMethodB],
        ["Difference", result.activeReturn, result.contributionMethod === 'average-weight-period' ? 'comparison' : null],
      ].map(([label, value, method]) => {
        const card = text("div", "", label === "Difference" ? "metric difference" : "metric");
        const body = text("div", "", "metric-text");
        body.append(
          text("span", label === "Difference" ? label : fundLabel(label)),
          text("small", options.currency + (method === 'weighted-estimate' ? ' · weighted return estimate' : method === 'reference' ? ' · reference return' : method === 'comparison' ? ' · return difference' : result.status === "partial" ? " · reference return" : " · holdings estimate")),
        );
        const figure = text("strong", fmt(value), value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative");
        if (label === "Difference") card.append(body, figure);
        else { const [labelNode, noteNode] = [...body.childNodes]; card.append(labelNode, figure, noteNode); }
        return card;
      }),
    );
    renderRows();
    renderMethod();
    if(onlineMode) $('price-status').textContent = (data.arcusSource ? 'Arcus completed returns first · '+data.arcusReturnCount+' securities/funds reused · ' : 'Adjusted daily returns · ')+options.start+' to '+options.end+' · '+options.currency+'. Checked '+new Date(data.priceCheckedAt).toLocaleTimeString()+'. No intraday quotes.';
    $('research-note').replaceChildren(
      text('strong','Research estimate — use for ideas, not exact accounting.'),
      text('p',data.arcusSource ? 'Current holdings and completed USD daily returns come from Arcus. ETF weights come from its issuer sources, retaining cash and private holdings. Where Arcus does not hold the requested dated return history, adjusted-price history and same-date FX fill the gap. Current allocations are applied to the selected period; historical trades are not reconstructed. Any archive allocation fallback is disclosed below.' : onlineMode ? 'Saved allocation weights are applied across this period as a research estimate, not actual historical trades. Shares use adjusted closing prices and same-date FX. Across verified Tokyo and Taiwan market holidays, the last local adjusted close is carried to the valuation date before applying that date’s FX. Missing open-session prices, cash income and unresolved positions remain blank unless you explicitly choose the labelled 0% assumption. No intraday quotes are used; vendor corrections can differ from Bloomberg.' : 'Where opening holdings are missing, the latest earlier snapshot is carried forward; for a new archive, a later snapshot within seven calendar days may be used. Dates are listed below. Later holdings introduce hindsight. Prices, FX cut-offs, trading and cash income may differ from Bloomberg.'),
      ...(result.holdingsWarnings || []).map(n => text('p',n)),
      ...(data.sourceWarnings || []).map(n=>text('p',n)),
      ...(result.assumedReturns?.length ? [text('p','Private holdings, cash, money-market funds, derivatives and corporate-action positions are shown at the bottom with an assumed 0% return. They are excluded from measured coverage. Missing listed-share returns remain blank unless you select the additional 0% assumption.')] : []),
      ...(result.status === 'partial' ? [text('p',`Known holdings contributions: ${fmt(result.knownContributionA)} / ${fmt(result.knownContributionB)}. ${result.contributionMethod === 'average-weight-period' ? 'Your portfolio headline is the sum of available average weight × security return contributions. ETF headlines use observed fund returns; the contribution subtotal may differ.' : 'Missing returns stay blank; available headline figures are fund reference returns, not these subtotals.'} ${result.contributionMethod === 'arithmetic-daily' ? 'Both contribution columns use arithmetic daily sums because a complete reference series is unavailable.' : ''}`)] : []),
      ...(result.missing?.length ? [text('p','Missing returns: '+[...new Set(result.missing.map(p=>p.name+(p.reason ? ' — '+p.reason : '')))].join('; '))] : []),
    );
    if (phone.matches) collapseSelection(options);
    scrollTo($('message').childElementCount ? 'message' : 'results');
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
function displayedRows() {
  if ($("group").value === "security") return result.rows;
  const groups = new Map();
  for (const r of result.rows) {
    const g = groups.get(r.sector) || {
      id: r.sector,
      ticker: r.sector,
      name: "Sector aggregate",
      sector: r.sector,
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
    groups.set(r.sector, g);
  }
  return [...groups.values()];
}
const columns = [
  ["ticker", "Security / sector"],
  ["weightA", "Avg weight · Portfolio"],
  ["weightB", "Avg weight · Benchmark"],
  ["securityReturn", "Security return"],
  ["activeWeight", "Active weight"],
  ["ctrA", "Contribution · Portfolio"],
  ["ctrB", "Contribution · Benchmark"],
  ["activeCtr", "Difference (pp)"],
];
// Phones show three columns; the remaining figures open under the tapped row.
const phoneColumns = () => $("group").value === "sector"
  ? [["ticker", "Sector"], ["activeWeight", "Active wt"], ["activeCtr", "Diff (pp)"]]
  : [["ticker", "Security"], ["securityReturn", "Return"], ["activeCtr", "Diff (pp)"]];
const signClass = (key, value) => ["ctrA", "ctrB", "activeCtr", "securityReturn", "activeWeight"].includes(key)
  ? (value === null || value === undefined ? "muted" : value >= 0 ? "positive" : "negative") : "";
function columnLabel(key, name) {
  if (!lastOptions) return name;
  return name.replace("· Portfolio", "· " + fundLabel(lastOptions.portfolio)).replace("· Benchmark", "· " + fundLabel(lastOptions.benchmark));
}
function syncSortControls() {
  $("sort").value = sortKey;
  $("sort-direction").textContent = sortKey === "ticker"
    ? (sortDirection === 1 ? "↓ A to Z" : "↑ Z to A")
    : (sortDirection === -1 ? "↓ Largest first" : "↑ Smallest first");
}
function renderRows() {
  if (!["complete", "partial"].includes(result?.status)) return;
  const compact = phone.matches;
  const visible = compact ? phoneColumns() : columns;
  if (!$("sort").options.length) $("sort").replaceChildren(...columns.map(([key, name]) => { const o = text("option", key === "ticker" ? "Name" : name); o.value = key; return o; }));
  syncSortControls();
  $("table-hint").textContent = compact
    ? "Percentage points. Tap a row for weights and contributions; sort with the controls above."
    : "Contributions in percentage points. Tap a column to sort. Swipe the table for more columns.";
  const tr = document.createElement("tr");
  for (const [key, name] of visible) {
    const th = text(
      "th",
      columnLabel(key, name) + (sortKey === key ? (sortDirection === 1 ? " ↑" : " ↓") : ""),
    );
    th.tabIndex = 0;
    th.addEventListener("click", () => {
      sortDirection = sortKey === key ? -sortDirection : -1;
      sortKey = key;
      renderRows();
    });
    th.addEventListener("keydown", (e) => {
      if (e.key === "Enter") th.click();
    });
    tr.append(th);
  }
  $("columns").replaceChildren(tr);
  const rows = [...displayedRows()].sort(
    (a, b) =>
      Number(!!a.nonListed)-Number(!!b.nonListed) || sortDirection *
      (typeof a[sortKey] === "string"
        ? a[sortKey].localeCompare(b[sortKey])
        : (a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)),
  );
  renderContributionChart(rows);
  $("rows").replaceChildren(
    ...rows.flatMap((r) => {
      const row = document.createElement("tr");
      for (const [key] of visible) {
        const cell = text("td", key === "ticker" ? r.ticker : fmt(r[key]));
        if (key === "ticker" && r.name !== r.ticker) cell.append(text("small", r.name));
        if (key === 'ticker' && r.assumedZero)cell.append(text('small','Assumed 0%'));
        if (compact || ["ctrA", "ctrB", "activeCtr"].includes(key)) cell.className = signClass(key, r[key]);
        row.append(cell);
      }
      if (!compact) return [row];
      const detail = document.createElement("tr");
      detail.className = "detail";
      detail.hidden = true;
      const cell = document.createElement("td");
      cell.colSpan = visible.length;
      const list = document.createElement("dl");
      for (const [key, name] of columns) {
        if (key === "ticker" || visible.some(([k]) => k === key)) continue;
        list.append(text("dt", columnLabel(key, name)), text("dd", fmt(r[key]), signClass(key, r[key])));
      }
      cell.append(list);
      detail.append(cell);
      row.className = "expandable";
      row.tabIndex = 0;
      row.setAttribute("aria-expanded", "false");
      row.addEventListener("click", () => {
        detail.hidden = !detail.hidden;
        row.setAttribute("aria-expanded", String(!detail.hidden));
      });
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); row.click(); }
      });
      return [row, detail];
    }),
  );
}
$("sort").addEventListener("change", () => {
  sortKey = $("sort").value;
  sortDirection = sortKey === "ticker" ? 1 : -1;
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
    const {comparisonXlsx} = await import('./export.mjs?v=listed-focus-types-20261028');
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
  const {createOnlineSource}=await import('./online.mjs?v=listed-focus-types-20261028');
  online = createOnlineSource({onUnauthorized:()=>session.lock(),onProgress:(done,total)=>{if(onlineMode) $('run').textContent='Checking prices '+done+' / '+total;}});
} catch {
  $('connect-saved').disabled=true;
  message('Saved online holdings are temporarily unavailable. You can still import an archive file.');
}
async function connectSaved() {
  const generation=accessGeneration;
  try {
    if(!await session.check())return;
    $('connect-saved').disabled=true;
    message('Loading saved ETFs and portfolios…');
    const m=await online.catalog();
    if(generation!==accessGeneration)return;
    onlineMode=true;dataset=folder=null; setup(m);
    void refreshArcusReturns();
    $('archive-title').textContent=m.holdingsSource==='arcus'?'Arcus ETFs & portfolios':'Saved ETFs & portfolios';
    if(m.holdingsSource==='arcus')$('archive-status').textContent='Current holdings are read from Arcus whenever you compare. Arcus completed returns are reused first. Source dates are shown with the result.';
    $('empty').hidden=true;
    $('range-note').textContent='Checking the latest completed US trading date…';
    const calendar=await online.calendar(m);
    if(generation!==accessGeneration || !onlineMode)return;
    manifest.valuationDates=calendar;
    $('range').value=preferredRange();applyRange();
    $('range-note').textContent='Completed daily returns through '+calendar.at(-1)+'. Today’s intraday session is excluded. '+(m.holdingsSource==='arcus'?'Holdings dates are checked against Arcus when you compare.':'Saved allocations may be older.');
    message('');
  } catch(error){if(generation===accessGeneration)message(error.message+' You can refresh saved holdings or use an archive file.');}
  finally {$('connect-saved').disabled=false;}
}
$('connect-saved').addEventListener('click',connectSaved);
if(integrated && online)void connectSaved();
