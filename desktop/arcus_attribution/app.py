"""Local-only updater. Python standard library; no Arcus or Cloudflare dependencies."""
import argparse
import csv
import datetime as dt
import hashlib
import json
import logging
import math
import os
from pathlib import Path
import sqlite3
import sys
import time
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo
from .sources import parse_snapshot

ROOT=Path(__file__).resolve().parents[2]
DEFAULT=Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'ArcusAttribution'

def fetch(url):
    request=urllib.request.Request(url,headers={'User-Agent':'Mozilla/5.0 (Arcus Attribution personal research)'})
    with urllib.request.urlopen(request,timeout=25) as r:
        data=r.read(12_000_001)
    if len(data)>12_000_000: raise ValueError('Source exceeds 12 MB safety limit')
    return data

def db_open(home):
    home.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(home/'history.sqlite',timeout=5)
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript('''
      CREATE TABLE IF NOT EXISTS snapshots(fund TEXT, asof TEXT, sha TEXT, captured TEXT, body TEXT,
        PRIMARY KEY(fund,asof,sha));
      CREATE INDEX IF NOT EXISTS snapshot_date ON snapshots(fund,asof,captured);
      CREATE TABLE IF NOT EXISTS levels(id TEXT, date TEXT, value REAL, currency TEXT, basis TEXT, source TEXT,
        PRIMARY KEY(id,date,basis));
      CREATE TABLE IF NOT EXISTS updates(id TEXT PRIMARY KEY, checked TEXT);
      CREATE TABLE IF NOT EXISTS health(ts TEXT, component TEXT, ok INTEGER, detail TEXT);
    ''')
    return db

def store(db,snapshot):
    db.execute('INSERT OR IGNORE INTO snapshots VALUES(?,?,?,?,?)',
      (snapshot['fund'],snapshot['asOf'],snapshot['sha256'],snapshot['capturedAt'],json.dumps(snapshot,separators=(',',':'))))
    db.commit()

def selected(db):
    # Revisions keep original history. Latest capture wins within each dated fund snapshot.
    rows=db.execute('SELECT body FROM (SELECT body,ROW_NUMBER() OVER(PARTITION BY fund,asof ORDER BY captured DESC,sha DESC) n FROM snapshots) WHERE n=1 ORDER BY json_extract(body,\'$.asOf\')')
    return [json.loads(row[0]) for row in rows]

def collect(db,home,funds):
    issues=[]
    rawdir=home/'archive';rawdir.mkdir(exist_ok=True)
    for fund,config in funds.items():
        try:
            raw=fetch(config['url']);snapshot=parse_snapshot(fund,config,raw)
            stem=f"{fund}_{snapshot['asOf']}_{snapshot['sha256'][:16]}"
            path=rawdir/(stem+'.csv')
            if not path.exists(): path.write_bytes(raw)
            meta=rawdir/(stem+'.json')
            if not meta.exists(): meta.write_text(json.dumps({k:v for k,v in snapshot.items() if k!='positions'}),encoding='utf-8')
            store(db,snapshot)
            logging.info('%s: %s, %s positions, weight %.3f%%',fund,snapshot['asOf'],len(snapshot['positions']),100*snapshot['weightTotal'])
            health(db,fund,True,f"Holdings {snapshot['asOf']}")
        except Exception as e:
            issues.append(f'{fund}: {e}');health(db,fund,False,str(e))
    return issues

def health(db,component,ok,detail):
    db.execute('INSERT INTO health VALUES(?,?,?,?)',(dt.datetime.now(dt.timezone.utc).isoformat(),component,int(ok),detail));db.commit()

def import_archive(db,folder,funds):
    count=0;issues=[]
    for path in sorted(folder.glob('*.csv')):
        fund=path.name.split('_')[0]
        if fund not in funds: continue
        try:
            meta=json.loads(path.with_suffix('.json').read_text(encoding='utf-8-sig')) if path.with_suffix('.json').exists() else {}
            capture=meta.get('capturedAt') or dt.datetime.fromtimestamp(path.stat().st_mtime,dt.timezone.utc).isoformat()
            raw=path.read_bytes(); snap=parse_snapshot(fund,funds[fund],raw,capture)
            if meta.get('asOf') and meta['asOf']!=snap['asOf']: raise ValueError('Metadata date differs from issuer date')
            if meta.get('sha256') and meta['sha256']!=snap['sha256']: raise ValueError('Archive checksum mismatch')
            store(db,snap);count+=1
        except Exception as e: issues.append(path.name+': '+str(e))
    return count,issues

def chart(symbol,start):
    start_ts=int(dt.datetime.combine(dt.date.fromisoformat(start),dt.time(),dt.timezone.utc).timestamp())
    params=urllib.parse.urlencode({'period1':start_ts,'period2':int(time.time()),'interval':'1d','events':'div,splits'})
    data=json.loads(fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+urllib.parse.quote(symbol,safe='')+'?'+params))
    result=(data.get('chart',{}).get('result') or [None])[0]
    if result is None: raise ValueError('No price history for '+symbol)
    zone=ZoneInfo(result['meta'].get('exchangeTimezoneName','UTC'))
    values=(result['indicators'].get('adjclose') or [{}])[0].get('adjclose')
    if not values: raise ValueError('Adjusted history unavailable for '+symbol)
    today=dt.datetime.now(zone).date().isoformat()
    points={}
    for stamp,value in zip(result.get('timestamp',[]),values):
        day=dt.datetime.fromtimestamp(stamp,zone).date().isoformat()
        if day<today and value is not None and math.isfinite(value) and value>0: points[day]=value
    return result['meta'].get('currency'),points

def update_prices(db,funds):
    snaps=selected(db)
    if not snaps:return []
    baseline=(dt.date.fromisoformat(min(s['asOf'] for s in snaps))-dt.timedelta(days=10)).isoformat()
    ids={p['symbol'] for s in snaps for p in s['positions'] if p.get('symbol')}
    ids.update(funds);ids.update(('USDZAR=X','SPY'))
    today=dt.datetime.now(dt.timezone.utc).date().isoformat()
    issues=[]
    fx_cache={}
    for symbol in sorted(ids):
        checked=db.execute('SELECT checked FROM updates WHERE id=?',(symbol,)).fetchone()
        if checked and checked[0]==today: continue
        try:
            # Reload since inception of this archive: adjusted history can be retrospectively rescaled.
            # Joining newly adjusted levels to old-scale levels fabricates a return at the boundary.
            currency,points=chart(symbol,baseline)
            basis='fx' if symbol=='USDZAR=X' else 'vendor-adjusted'
            if symbol!='USDZAR=X' and currency!='USD':
                if currency not in ('TWD','KRW','JPY','HKD','EUR','GBP','CHF','CAD','AUD'):
                    raise ValueError(f'{symbol} uses unsupported price currency {currency}; import verified USD total-return levels')
                if currency not in fx_cache:
                    fx_currency,fx_points=chart(currency+'USD=X',baseline)
                    if fx_currency!='USD':raise ValueError('Unexpected FX quote direction for '+currency)
                    fx_cache[currency]=fx_points
                fx_points=fx_cache[currency]
                # Exact-date conversion only: missing local/FX dates remain visible gaps.
                points={day:value*fx_points[day] for day,value in points.items() if day in fx_points}
                currency='USD'
            if not points:raise ValueError('No completed daily prices')
            for day,value in points.items():
                db.execute('INSERT OR REPLACE INTO levels VALUES(?,?,?,?,?,?)',(symbol,day,value,currency,basis,'Yahoo adjusted close; estimate, not audited fund NAV'))
            db.execute('INSERT OR REPLACE INTO updates VALUES(?,?)',(symbol,today));db.commit()
        except Exception as e:issues.append(str(e))
        time.sleep(.15)
    return issues

def import_levels(db,path):
    # User-supplied total-return index levels must be comparable over the entire date history.
    with path.open(encoding='utf-8-sig',newline='') as handle:
        rows=list(csv.DictReader(handle))
    parsed=[]
    for r in rows:
        day=dt.date.fromisoformat(r['date']).isoformat();value=float(r['value'])
        if not math.isfinite(value) or value<=0:raise ValueError('Level must be positive')
        if r['basis'] not in ('verified-total-return','fx'):raise ValueError('Unknown basis')
        if r['basis']=='verified-total-return' and r['currency']!='USD':raise ValueError('Import USD total-return levels')
        parsed.append((r['id'],day,value,r['currency'],r['basis'],r['source']))
    with db: db.executemany('INSERT OR REPLACE INTO levels VALUES(?,?,?,?,?,?)',parsed)
    return len(parsed)

def atomic_json(path,value):
    temp=path.with_suffix(path.suffix+'.tmp')
    temp.write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf-8')
    os.replace(temp,path)

def export(db,home,funds):
    folder=home/'reports';folder.mkdir(exist_ok=True)
    snapshots=selected(db)
    sectors_path=home/'sectors.json'
    sectors=json.loads(sectors_path.read_text(encoding='utf-8')) if sectors_path.exists() else {}
    mapping=sectors.get('sectors',{})
    for snap in snapshots:
        for p in snap['positions']:
            if p['sector']=='Unclassified' and p.get('symbol') in mapping:
                p['sector']=mapping[p['symbol']];p['sectorBasis']='Current classification fallback: '+str(sectors.get('asOf','unknown'))
    months={}
    for s in snapshots:months.setdefault(s['asOf'][:7],{'snapshots':[],'levels':[]})['snapshots'].append(s)
    for row in db.execute('SELECT id,date,value,currency,basis,source FROM levels ORDER BY date,id,basis'):
        item=dict(zip(('id','date','value','currency','basis','source'),row))
        months.setdefault(item['date'][:7],{'snapshots':[],'levels':[]})['levels'].append(item)
    for month,body in months.items():atomic_json(folder/(month+'.json'),dict(schemaVersion=1,**body))
    funds_out=[]
    for id,config in funds.items():
        dates=sorted(s['asOf'] for s in snapshots if s['fund']==id)
        latest=next((s for s in reversed(snapshots) if s['fund']==id),None)
        funds_out.append(dict(id=id,name=config['name'],dates=dates,latest=latest['asOf'] if latest else None,
            positions=len(latest['positions']) if latest else 0))
    events=[dict(zip(('at','component','ok','detail'),row)) for row in db.execute('SELECT ts,component,ok,detail FROM health ORDER BY ts DESC LIMIT 20')]
    manifest=dict(schemaVersion=1,generatedAt=dt.datetime.now(dt.timezone.utc).isoformat(),funds=funds_out,
        months=sorted(months),events=events,method='Beginning-weight daily estimate. Missing holdings or returns block full-period results.')
    atomic_json(folder/'manifest.json',manifest)
    # Single import alternative is convenient for the small pilot. Folder mode is preferred as history grows.
    if sum((folder/(m+'.json')).stat().st_size for m in months)<20_000_000:
        atomic_json(folder/'arcus-attribution.json',dict(manifest=manifest,snapshots=snapshots,levels=[x for m in months.values() for x in m['levels']]))
    else:
        bundle=folder/'arcus-attribution.json'
        if bundle.exists():bundle.unlink()  # Generated convenience export only; archives/database remain untouched.
    return manifest

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('command',choices=['update','collect','export','import-archive','import-levels'])
    parser.add_argument('--home',type=Path,default=DEFAULT)
    parser.add_argument('--folder',type=Path)
    args=parser.parse_args()
    args.home.mkdir(parents=True,exist_ok=True)
    logging.basicConfig(level=logging.INFO,format='%(asctime)s %(message)s',handlers=[logging.StreamHandler(),logging.FileHandler(args.home/'updater.log',encoding='utf-8')])
    funds=json.loads((ROOT/'config/funds.json').read_text())
    db=db_open(args.home);issues=[]
    try:
        if args.command=='import-archive':
            if not args.folder:parser.error('--folder required')
            count,issues=import_archive(db,args.folder,funds);logging.info('Imported %s archive files',count)
        elif args.command=='import-levels':
            if not args.folder:parser.error('--folder must point to CSV')
            logging.info('Imported %s return levels',import_levels(db,args.folder))
        elif args.command in ('update','collect'):
            settings=args.home/'settings.json'
            if settings.exists():
                archive=json.loads(settings.read_text()).get('archiveFolder')
                if archive:
                    if Path(archive).is_dir():_,errors=import_archive(db,Path(archive),funds);issues.extend(errors)
                    else:issues.append('Configured Google archive folder is unavailable; current download cannot recover missing past holdings')
            issues.extend(collect(db,args.home,funds))
            if args.command=='update':issues.extend(update_prices(db,funds))
        for issue in issues:logging.warning(issue);health(db,'update',False,issue)
        manifest=export(db,args.home,funds)
        # Consistent completed backup, never a live database in a synchronised directory.
        backup=args.home/'history-backup.sqlite'; target=sqlite3.connect(backup)
        db.backup(target);target.close()
        logging.info('Reports: %s; funds: %s',args.home/'reports',[(f['id'],f['latest']) for f in manifest['funds']])
        return 2 if issues else 0
    finally:db.close()

if __name__=='__main__':sys.exit(main())
