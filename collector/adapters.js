/* Shared pure issuer adapters: runs in Apps Script and the desktop's Node process.
 * Extract data only; never execute issuer scripts. Preserve cash and unknown holdings.
 */
globalThis.ArcusSources = (() => {
  const key = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g,'');
  const clean = x => String(x ?? '').replace(/<[^>]*>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;|&#160;/g,' ').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g,' ').trim();
  function csv(s) {
    const out=[]; let row=[],v='',quoted=false;
    for(let i=0;i<s.length;i++) { const c=s[i];
      if(c==='"') {if(quoted && s[i+1]==='"'){v+='"';i++;}else quoted=!quoted;}
      else if(c===','&&!quoted){row.push(v.trim());v='';}
      else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&s[i+1]==='\n')i++;row.push(v.trim());if(row.some(Boolean))out.push(row);row=[];v='';}
      else v+=c;
    }
    if(quoted)throw Error('Incomplete CSV');
    row.push(v.trim());if(row.some(Boolean))out.push(row);return out;
  }
  function iso(value) {
    const s=clean(value), direct=s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/);
    if(direct)return direct[0];
    const us=s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d)\b/);
    if(us)return `${us[3]}-${us[1].padStart(2,'0')}-${us[2].padStart(2,'0')}`;
    const named=s.match(/\b(?:\d{1,2}[- ])?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[- ](?:\d{1,2},? )?20\d\d\b/i);
    if(named && Number.isFinite(Date.parse(named[0]+' UTC')))return new Date(Date.parse(named[0]+' UTC')).toISOString().slice(0,10);
    return null;
  }
  const aliases={name:['name','securityname','securitydescription','propername','description','companyname','holdingname'],ticker:['ticker','stockticker','symbol','identifier'],weight:['weight','weighting','weightings','weightpercent','etfweight','weightofnav','ofnetassets','netassets','percentofnav','netassetspercentagetimes100','ofnetassetvalues'],date:['date','holdingsdate','reportdate'],sector:['sector'],asset:['asset','assetclass','securitytype'],currency:['currency'],identity:['cusip','sedol','figi','securityidentifier']};
  function rowsToPositions(rows,hint,fund) {
    const offset=rows.findIndex(r=>r.some(c=>aliases.weight.includes(key(c))));
    if(offset<0)throw Error('Complete weighted holdings table not found');
    const h=rows[offset].map(key), idx={};
    for(const [field,names] of Object.entries(aliases)) idx[field]=h.findIndex(k=>names.includes(k));
    // Janus names occupy an intentionally unnamed first header cell.
    if(idx.name<0 && (h[0]==='' || h[0].startsWith('fullportfolioholdings')))idx.name=0;
    if(idx.name<0)throw Error('Holding names missing');
    const dated=new Set();const positions=[];
    if(hint)dated.add(hint);
    for(const row of rows.slice(offset+1)) {
      if(row.length!==h.length)continue;
      const account=h.indexOf('account');
      if(fund && account>=0 && row[account].toUpperCase()!==fund)continue;
      const get=f=>idx[f]<0?'':row[idx[f]];
      const name=clean(get('name')); if(!name || /^total$/i.test(name))continue;
      const rawWeight=get('weight');
      if(!String(rawWeight).trim())throw Error('Weight missing for '+name);
      let weight=Number(String(rawWeight).replace(/[%,$\s]/g,''));
      if(!Number.isFinite(weight))throw Error('Invalid weight for '+name);
      if(h[idx.weight]==='percentofnav')weight*=100;
      if(get('date')) {const d=iso(get('date'));if(!d)throw Error('Invalid row date');dated.add(d);}
      const cashFlag=h.findIndex(k=>['iscash','moneymarketflag'].includes(k));
      const isCash=cashFlag>=0 && /^(1|y|yes|true)$/i.test(row[cashFlag]);
      positions.push({ticker:clean(get('ticker')),name,weight,sector:clean(get('sector'))||'Unclassified',asset:isCash?'Cash':clean(get('asset')),currency:clean(get('currency'))||'USD',identity:clean(get('identity'))});
    }
    if(dated.size!==1)throw Error('Missing or conflicting holdings dates');
    return {asOf:[...dated][0],positions};
  }
  function parse(fund,config,raw) {
    let result;
    const format=config.sourceFormat || 'csv';
    if(/^"?asOf"?,"?ticker"?,"?name"?,"?weight"?,/.test(raw)) {
      const rows=csv(raw);return rowsToPositions(rows,iso(rows[1]?.[0]));
    }
    if(format==='xlsx') {
      const parts=JSON.parse(raw);
      const strings=[...parts.strings.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>clean(m[1]));
      const rows=[...parts.sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(m=>{
        const row=[];
        for(const c of m[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
          const ref=c[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!ref)throw Error('Cell reference missing');
          let col=0;for(const ch of ref)col=col*26+ch.charCodeAt(0)-64;
          while(row.length<col)row.push('');
          const v=c[2].match(/<v>([\s\S]*?)<\/v>/)?.[1]||'';
          row[col-1]=/\bt="s"/.test(c[1])?strings[Number(v)]:clean(v||c[2]);
        }return row;
      });
      result=rowsToPositions(rows,iso(rows.slice(0,3).flat().join(' ')));
    } else if(format==='invesco') {
      const d=JSON.parse(raw);
      if(d.cusip!==config.cusip || d.holdings?.length!==d.totalNumberOfHoldings)throw Error('Incomplete or wrong issuer fund');
      const denominators=d.holdings.filter(r=>r.percentageOfTotalNetAssets>0&&r.marketValueBase>0).map(r=>r.marketValueBase/(r.percentageOfTotalNetAssets/100)).sort((a,b)=>a-b);
      const nav=denominators[Math.floor(denominators.length/2)];
      result={asOf:iso(d.effectiveDate),positions:d.holdings.map(r=>({ticker:r.ticker||'',name:r.issuerName,weight:r.percentageOfTotalNetAssets ?? (100*r.marketValueBase/nav),asset:r.securityTypeName,currency:r.currency||'USD',identity:r.cusip,sector:'Unclassified'}))};
    } else if(format==='vanguard') {
      const d=JSON.parse(raw),asOf=iso(d.latestEffectiveDate),p=d[d.latestEffectiveDate];
      if(!p?.equity)throw Error('Vanguard holdings missing');
      const denominators=p.equity.filter(r=>r.percentOfFunds>0&&r.marketValue>0).map(r=>r.marketValue/(r.percentOfFunds/100)).sort((a,b)=>a-b);
      const nav=denominators[Math.floor(denominators.length/2)];
      result={asOf,positions:['equity','fixedIncome','shortTermReserves','derivatives'].flatMap(type=>(p[type]||[]).map(r=>({ticker:r.ticker||'',name:r.holdingName||r.description,weight:r.percentOfFunds===''||r.percentOfFunds==null?100*r.marketValue/nav:Number(r.percentOfFunds),identity:r.cusip||'',currency:'USD',asset:type==='shortTermReserves'?'Cash':type,sector:'Unclassified'})))};
    } else if(format==='robo') {
      const script=raw.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if(!script)throw Error('Issuer data missing');const a=JSON.parse(script[1]);
      const c=a.find(v=>v&&typeof v==='object'&&!Array.isArray(v)&&a[v.componentType]==='HoldingsComponent'&&String(a[v.ticker]).toUpperCase()===fund);
      if(!c||!Array.isArray(a[c.finData]))throw Error('Full issuer holdings missing');
      result={asOf:iso(a[c.date]),positions:a[c.finData].map(ref=>{const r=a[ref];return {ticker:a[r.ticker]||'',name:a[r.description],weight:Number(String(a[r.percent_of_nav]).replace(/[% ,]/g,'')),identity:a[r.figi]||'',currency:'USD',asset:'',sector:'Unclassified'};})};
    } else if(format==='html') {
      const tables=[...raw.matchAll(/<table\b[^>]*>[\s\S]*?<\/table>/gi)].map(m=>m[0]);
      const table=tables.find(t=>/weight/i.test(t)&&/ticker|identifier/i.test(t));
      if(!table)throw Error('Weighted holdings table unavailable');
      const plain=clean(raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));
      const dated=plain.match(/(?:Holdings (?:of the Fund )?as of|Full Portfolio Holdings \(As of|Data as of)\s*([^.)]{1,45})/i);
      const hint=dated&&iso(dated[1]);
      const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(x=>clean(x[1])));
      result=rowsToPositions(rows,hint,fund);
    } else {
      const rows=csv(raw.replace(/^\uFEFF/,''));
      const hint=iso(rows.slice(0,4).map(r=>r.join(' ')).join(' '));
      result=rowsToPositions(rows,hint,fund);
    }
    if(!result.asOf || result.positions.length<5)throw Error('Incomplete dated holdings');
    if(result.positions.some(p=>!p.name||typeof p.weight!=='number'||!Number.isFinite(p.weight)))throw Error('Invalid holding or missing weight');
    const sum=result.positions.reduce((s,p)=>s+p.weight,0);
    if((sum<98||sum>102)&&!config.allowPartialAllocation)throw Error('Incomplete allocation: '+sum.toFixed(3)+'%');
    return result;
  }
  function canonical(result) {
    const rows=[['asOf','ticker','name','weight','sector','asset','currency','cusip'],...result.positions.map(p=>[result.asOf,p.ticker,p.name,p.weight,p.sector||'Unclassified',p.asset||'',p.currency||'USD',p.identity||''])];
    return rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\n');
  }
  function discover(raw,base,fund) {
    const links=[...raw.matchAll(/href=["']([^"']+)["']/gi)].map(m=>m[1].replace(/&amp;/g,'&'));
    const candidate=links.find(u=>/\.csv(?:\?|$)/i.test(u)&&u.toLowerCase().includes(fund.toLowerCase()));
    if(!candidate)throw Error('Current full CSV link unavailable');
    // Do not follow arbitrary hosts supplied by page content.
    if(!/^https:\/\/(?:temaetfs\.com|assets\.globalxetfs\.com)\//i.test(candidate))throw Error('Unrecognised CSV host');
    return candidate;
  }
  return {parse,canonical,csv,iso,discover};
})();
