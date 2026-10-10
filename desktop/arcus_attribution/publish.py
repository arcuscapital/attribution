"""Optional private mobile publication after the existing desktop update.
Uses the user's deployment OAuth, never an API token or public Git asset.
"""
import datetime as dt
import json
import os
from pathlib import Path
import re
import tempfile
import time
from .processes import run_hidden

def prepare(folder, version=None):
    folder=Path(folder)
    manifest=json.loads((folder/'manifest.json').read_text(encoding='utf-8'))
    latest={}
    for month in manifest['months']:
        if not re.fullmatch(r'\d{4}-\d{2}',month):raise ValueError('Invalid report month')
        for snap in json.loads((folder/(month+'.json')).read_text(encoding='utf-8'))['snapshots']:
            if snap['fund'] not in latest or snap['asOf']>latest[snap['fund']]['asOf']:
                latest[snap['fund']]=snap
    version=version or str(int(time.time()*1000))
    records=[];funds=[]
    for f in manifest['funds']:
        snap=latest.get(f['id'])
        if not snap or not snap['positions']:continue
        # Only the research allocation. No account balances, quantities or cost prices.
        fields=('id','symbol','ticker','name','sector','asset','currency','weight')
        clean=dict(fund=snap['fund'],name=f['name'],asOf=snap['asOf'],
                   positions=[{k:p[k] for k in fields if k in p} for p in snap['positions']])
        records.append(dict(key='holdings:'+version+':'+f['id'],value=json.dumps(clean,separators=(',',':'))))
        funds.append(dict(id=f['id'],name=f['name'],latest=snap['asOf'],dates=[snap['asOf']],positions=len(clean['positions'])))
    if len(funds)<2:raise ValueError('At least two saved funds are required')
    catalog=dict(schemaVersion=1,version=version,generatedAt=manifest['generatedAt'],
                 publishedAt=dt.datetime.now(dt.timezone.utc).isoformat(),funds=funds,valuationDates=[],
                 validationNotice='Allocation research, not transaction-level attribution. Returns use independently checked daily prices.')
    return records,catalog

def publish(home, config, runner=run_hidden):
    root=Path(__file__).resolve().parents[2]
    records,catalog=prepare(Path(home)/'reports')
    env=os.environ.copy()
    env['CLOUDFLARE_ACCOUNT_ID']='5695cae2becf35e049eb5df3e2849ae2'
    env['XDG_CONFIG_HOME']=config['authHome']
    env['WRANGLER_SEND_METRICS']='false'
    # Explicit executable paths are private machine configuration.
    base=[config['node'],config['wrangler']]
    def command(args):
        result=runner(base+args+['--config',str(root/'wrangler.jsonc')],cwd=root,env=env,capture_output=True,encoding='utf-8',timeout=180)
        if result.returncode:raise RuntimeError('Mobile archive publication failed; previous published holdings remain usable. Check Wrangler sign-in.')
    with tempfile.TemporaryDirectory(prefix='arcus-private-publish-') as temp:
        rows=Path(temp)/'holdings.json';rows.write_text(json.dumps(records),encoding='utf-8')
        command(['kv','bulk','put',str(rows),'--binding','HOLDINGS_ARCHIVE','--remote'])
        pointer=Path(temp)/'catalog.json';pointer.write_text(json.dumps(catalog),encoding='utf-8')
        # Publish last: a partial upload never replaces the visible catalog.
        command(['kv','key','put','catalog','--path',str(pointer),'--binding','HOLDINGS_ARCHIVE','--remote'])
    # Retain recent generations for open phone sessions; remove the preceding obsolete generation.
    state_file=Path(home)/'mobile-publish-state.json'
    state=json.loads(state_file.read_text()) if state_file.exists() else {'generations':[]}
    generations=[*state.get('generations',[]),[r['key'] for r in records]]
    obsolete=generations[:-2]
    if obsolete:
        with tempfile.TemporaryDirectory(prefix='arcus-private-cleanup-') as temp:
            path=Path(temp)/'keys.json';path.write_text(json.dumps([k for group in obsolete for k in group]))
            command(['kv','bulk','delete',str(path),'--binding','HOLDINGS_ARCHIVE','--remote'])
    state_file.write_text(json.dumps({'generations':generations[-2:],'publishedAt':catalog['publishedAt'],'version':catalog['version']}))
    return len(records)

