// Pure browser-side source projection; SQL keeps HTTP Workers below their CPU budget.
const clean = v => String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
const text = v => clean(String(v).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'"));
function nameMatches(expected, actual) {
  const normalize = s => text(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bp\.l\.c\./g,'plc').replace(/\bs\.e\./g,'se').replace(/\bpubl\b|\(canada\)/g,'')
    .replace(/\bhldgs\b/g,'holdings').replace(/\bpptys\b/g,'properties').replace(/\binfo\b/g,'information')
    .replace(/\btech\b/g,'technology').replace(/\bmed\b/g,'medical').replace(/\bgrp\b/g,'group')
    .replace(/\bjsc\b/g,'joint stock company')
    .replace(/\bregistered shs\s*-([ab])-?/g, 'class $1').replace(/\bclass-([abc])-?/g, 'class $1').replace(/\bshs\s+class/g, 'shares class')
    .replace(/\baz nom post raggruppamento\b|\bsubord vtg\b|\b(?:fdr|dr)\b/g, '')
    .replace(/\bn\.?v\.?\b/g, 'nv').replace(/\bs\.?p\.?a\.?\b/g, 'spa').replace(/\bs\.?a\.?\b/g, 'sa')
    .replace(/\bintl\b/g, 'international').replace(/\bresh\b/g, 'research').replace(/\btechnologies\b/g, 'technology')
    .replace(/\b(?:un)?sponsored\b|\b(?:unsp|unspon|spons|spon|sp)\s+(?=adr\b)/g, '')
    .replace(/\b(?:adr|american depositary|american depository)\b.*$/, '')
    .replace(/\(?new york registry shares\)?|\bny reg shs\b/g, '')
    .replace(/\bcayman(?: islands)?\b|\b(?:class|cl|shs)\s*[abc h]\b|\s*-\s*[abc h]$|\/(?:de|md|ny)$/g, '')
    .replace(/\b(?:the|and|incorporated|corporation|holdings?|companies|company|limited|corp|inc|ltd|plc|group|co|cos|ag|aktiengesellschaft|nv|sa|spa|se|ab|oyj|reit|common|stock|ordinary|shares?|reg|registered|voting)\b/g, '').replace(/[^a-z0-9]/g, '');
  const a = normalize(expected), b = normalize(actual);
  if (a.length < 2 || b.length < 2) return false;
  if (a === b) return true;
  const reordered = clean(expected).toLowerCase().match(/^([a-z]+)\s*\(([a-z]+)\)$/);
  if (reordered && normalize(reordered[2] + ' ' + reordered[1]) === b) return true;
  const short = a.length < b.length ? a : b, long = a.length < b.length ? b : a;
  return short.length >= 7 && short.length / long.length >= .8 && long.startsWith(short);
}

const portfolios={IBKR:'ibkr',MARLOW:'marlow',EASYAI:'easyai',EASYGE:'easyge'};
const validDate=d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'');
const json=async response=>{if(!response.ok)throw Error('Arcus source unavailable');return response.json();};
const cash=p=>/^(cash|currency)$/i.test(p.asset||'') || /^(USD|TWD|EUR|GBP|JPY|ZAR) CASH$/i.test(p.name||'');
function asset(p){
  const description=(p.asset||'')+' '+(p.name||'');
  if(cash(p))return 'Cash';
  if(/money market|cash collateral|short.term reserves|market liquidity|\bMKTLIQ\b|\bSLBBH1142\b/i.test(description+' '+p.ticker))return 'Money Market';
  if(/\bprvt\b|\bprivate\b|\bunlisted\b/i.test(description))return 'Private';
  if(p.corporateAction || /\bCVR\b|acquired for cash/i.test(description))return 'Corporate action';
  if(/\bTRS\s*:|\b(?:futures?|swaps?|options?|warrants?|derivatives?)\b|\bEMINI\b/i.test(description))return 'Derivative';
  return p.asset||'Equity';
}
export function isNonListed(p){return ['Cash','Private','Money Market','Corporate action','Derivative'].includes(asset(p));}
export function allocationSnapshot(fund,allocation,members=[],index=[]) {
  if(!validDate(allocation?.asOf) || !allocation.positions?.length)throw Error('Arcus source weights unavailable');
  // Index once: a large ETF must not scan every constituent for every weight.
  const byTicker=new Map(),byName=new Map(),byId=new Map();
  const add=(map,key,value)=>{if(key){const list=map.get(key)||[];list.push(value);map.set(key,list);}};
  for(const m of members){for(const ticker of new Set([m.rawSymbol,...(m.candidates||[])]))add(byTicker,ticker,m);add(byName,m.name,m);}
  for(const r of index)add(byId,r.id,r);
  const seen=new Set();
  const positions=allocation.positions.map((p,i)=>{
    if(!Number.isFinite(p.weight))throw Error('Invalid source allocation');
    const matches=(p.ticker ? byTicker.get(p.ticker)||[] : byName.get(p.name)||[]).filter(m=>p.name===m.name || nameMatches(p.name,m.sourceName||m.name));
    const refs=matches.length===1 ? (byId.get(matches[0].id)||[]).filter(r=>r.status==='ready' &&
      matches[0].candidates?.includes(r.symbol)) : [];
    const kind=asset({...p,corporateAction:matches[0]?.corporateAction}),symbol=!isNonListed({asset:kind}) ? (refs.length===1?refs[0].symbol:null) : null;
    let id=symbol||fund+':'+(p.identity||p.ticker||i);
    // Repeated verified listings share returns and are aggregated by the engine.
    if(!symbol && seen.has(id))id+=':'+i;seen.add(id);
    return {id,symbol,ticker:p.ticker||symbol||kind,name:p.name,weight:p.weight/100,asset:kind,currency:p.currency||null,sector:p.sector||'Unclassified'};
  });
  const weight=positions.reduce((n,p)=>n+p.weight,0);
  if(weight<.98 || weight>1.02)throw Error('Complete source allocation unavailable');
  return {fund,asOf:allocation.asOf,positions,source:'Arcus',sourceDetail:'Arcus issuer allocation'};
}
export function portfolioSnapshot(fund,p) {
  if(!p || p.status==='unavailable' || !validDate(p.asOf) || !p.holdings?.length)throw Error('Current Arcus portfolio unavailable');
  const positions=p.holdings.map((h,i)=>{
    if(!Number.isFinite(h.weightPct))throw Error('Invalid source weight');
    const symbol=h.mappingStatus==='verified'?h.ticker:null;
    return {id:symbol||fund+':'+(h.sourceTicker||i),symbol,ticker:h.sourceTicker||symbol,name:h.name,weight:h.weightPct/100,asset:'Equity',currency:h.currency,sector:h.sector||'Unclassified'};
  });
  for(const c of p.cashWeights||[])if(Number.isFinite(c.weightPct)&&c.asOf===p.asOf)
    positions.push({id:'CASH:'+c.currency,symbol:null,ticker:c.currency,name:c.currency+' cash',weight:c.weightPct/100,asset:'Cash',currency:c.currency,sector:'Cash'});
  return {fund,name:p.name,asOf:p.asOf,positions,source:'Arcus',sourceDetail:'Arcus portfolio feed'};
}
export function completedReturns(data,today=new Date().toISOString().slice(0,10)) {
  if(!validDate(data?.oneDOn))return {};
  return Object.fromEntries(Object.entries(data.dailyReturns||{}).filter(([day,value])=>validDate(day)&&day<=data.oneDOn&&day<today&&Number.isFinite(value)&&value>-100));
}
export function resolveKnownListings(snapshot,companies) {
  const known=new Map(companies.map(c=>[c.ticker,c]));
  for(const p of snapshot.positions) {
    const c=known.get(p.ticker);
    if(!p.symbol && !isNonListed(p) && c && nameMatches(p.name,c.name))
      Object.assign(p,{id:c.ticker,symbol:c.ticker});
  }
  return snapshot;
}

// Reuse only a previously verified identity, never the archive's weight or date.
export function resolveArchiveListings(snapshot,archive) {
  for(const p of snapshot.positions) {
    if(p.symbol || isNonListed(p) || !p.ticker)continue;
    const matches=(archive?.positions||[]).filter(a=>a.symbol && !isNonListed(a) &&
      (p.ticker===a.ticker || p.ticker===a.symbol) && nameMatches(p.name,a.name));
    const symbols=[...new Set(matches.map(a=>a.symbol))];
    if(symbols.length===1)Object.assign(p,{id:symbols[0],symbol:symbols[0]});
  }
  return snapshot;
}

export function normalizeArcusPacket(packet) {
  if(!packet.kind)return packet; // Backward-compatible rollout and standalone fixtures.
  const {fund,source,seed,main={}}=packet;
  let snapshot,warning=null,returns={};
  if(packet.kind==='portfolio') {
    snapshot=portfolioSnapshot(fund,source.portfolio);
    for(const [symbol,data] of Object.entries(source.stocks||{}))returns[symbol]=completedReturns(data);
  } else {
    const meta=source.fund;
    if(!meta?.positions?.length)throw Error('Current Arcus constituents unavailable');
    let allocation=meta.allocation;
    if(seed?.asOf>=meta.asOf && (!allocation||seed.asOf>allocation.asOf))allocation=seed;
    if(allocation?.asOf>=meta.asOf)snapshot=allocationSnapshot(fund,allocation,meta.positions,source.index||[]);
    else warning='Arcus has current constituents but complete current allocation weights are unavailable. The dated archive allocation is retained explicitly.';
    for(const r of source.index||[])if(r.status==='ready' && r.symbol)returns[r.symbol]=completedReturns(r.data);
  }
  if(snapshot)resolveKnownListings(snapshot,main.companies||[]);
  for(const [symbol,data] of Object.entries(main.returns||{}))returns[symbol]={...(returns[symbol]||{}),...completedReturns(data)};
  return {snapshot:snapshot||null,returns,warning,arcusHoldingsAsOf:source.fund?.asOf,checkedAt:packet.checkedAt,returnBasis:'Arcus completed-session USD returns'};
}
