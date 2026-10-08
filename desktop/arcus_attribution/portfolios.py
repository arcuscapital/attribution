"""Private portfolio imports. No account values, quantities or cost prices are retained."""
import datetime as dt
import hashlib
import json
import math
import os
from pathlib import Path
import re
from .processes import run_hidden

NAMES={'easyai':'EasyAI','easyge':'EasyGE','ibkr':'IBKR','marlow':'Marlow'}

def snapshots(payload, identities=None):
    identities=identities or {}
    result=[]
    for f in payload.get('portfolios',[]):
        if f.get('id') not in NAMES or not f.get('holdings'):continue
        asof=f.get('asOf','');dt.date.fromisoformat(asof)
        if asof > (dt.datetime.now(dt.timezone.utc).date()+dt.timedelta(days=1)).isoformat():raise ValueError('Future portfolio date')
        positions=[]
        for p in f['holdings']:
            weight=p.get('weightPct')
            if not isinstance(weight,(int,float)) or not math.isfinite(weight):raise ValueError('Invalid portfolio weight')
            source=p.get('sourceTicker') or p.get('ticker') or ''
            identity=source+'|'+p.get('name','')
            symbol=(p.get('quoteTicker') or p.get('ticker')) if p.get('mappingStatus')=='verified' else identities.get(identity)
            if symbol and not re.fullmatch(r'[A-Za-z0-9^][A-Za-z0-9.^=\-]{0,29}',symbol):symbol=None
            positions.append(dict(id=symbol or 'PORT:'+hashlib.sha256(identity.encode()).hexdigest()[:20],symbol=symbol,
                ticker=source,name=p.get('name') or source,sector='Unclassified',currency=p.get('currency') or '',
                asset='Equity' if symbol else 'Unmapped',weight=weight/100))
        for c in f.get('cashWeights',[]):
            weight=c.get('weightPct');currency=c.get('currency')
            if c.get('asOf')!=asof or not re.fullmatch('[A-Z]{3}',currency or '') or not isinstance(weight,(int,float)) or not math.isfinite(weight):continue
            positions.append(dict(id='CASH:'+currency,symbol=None,ticker=currency,name=currency+' cash',sector='Cash',currency=currency,asset='Cash',weight=weight/100))
        body=dict(schemaVersion=1,fund='PORTFOLIO:'+f['id'].upper(),name=NAMES[f['id']],asOf=asof,currency='USD',source='Private Arcus portfolio snapshot',
            weightTotal=sum(p['weight'] for p in positions),positions=positions,
            warnings=['Source holdings only; missing cash, prices and official return references remain unknown.']+f.get('warnings',[]))
        body['sha256']=hashlib.sha256(json.dumps(body,sort_keys=True).encode()).hexdigest()
        body['capturedAt']=payload.get('generatedAt') or dt.datetime.now(dt.timezone.utc).isoformat()
        result.append(body)
    return result

def read_archive(home, settings):
    cfg=settings.get('portfolioCache')
    return read_cache(home, settings, cfg) if cfg else ([], [])


def read_cache(home, settings, cfg):
    """One read-only query of Arcus's existing cache; no refresh/queue jobs.
    EasyAI/GE opening snapshots have only 14-day source retention. All four
    current snapshots are archived locally with their original as-of dates.
    """
    env=os.environ.copy();env.pop('XDG_CONFIG_HOME',None)
    env['CLOUDFLARE_ACCOUNT_ID']=cfg['accountId'];env['WRANGLER_SEND_METRICS']='false'
    sql="SELECT key,body,updated_at FROM portfolio_cache WHERE key='feed' OR (key>='estimate-opening:' AND key<'estimate-opening;')"
    try:
        p=run_hidden(['node',cfg['wrangler'],'d1','execute',cfg['database'],'--config',cfg['config'],'--remote','--command',sql,'--json'],capture_output=True,encoding='utf-8',timeout=90,env=env)
        if p.returncode:raise ValueError('Portfolio cache read failed; retained local history. Check source sign-in.')
        result=[]
        for batch in json.loads(p.stdout):
            for row in batch.get('results',[]):
                body=json.loads(row['body'])
                if isinstance(body,list):body={'generatedAt':dt.datetime.fromtimestamp(row['updated_at']/1000,dt.timezone.utc).isoformat(),'portfolios':body}
                result.extend(snapshots(body,settings.get('portfolioIdentities',{})))
        return result,[]
    except Exception as e:return [],[str(e)]
