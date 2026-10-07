"""Preserve issuer dates, weights, private positions and cash; never drop unknowns."""
import csv
import datetime as dt
import hashlib
import io
import math
import re
import json


def number(value):
    if value is None or str(value).strip() in ('', '-', '--'):
        return None
    result = float(re.sub(r'[$,%\s]', '', str(value)))
    if not math.isfinite(result):
        raise ValueError('Non-finite number')
    return result


def date(value):
    for fmt in ('%b %d, %Y', '%m/%d/%Y', '%Y-%m-%d'):
        try:
            return dt.datetime.strptime(value.strip(), fmt).date().isoformat()
        except ValueError:
            pass
    raise ValueError('Invalid issuer holdings date: '+value)


def mapped_symbol(ticker, exchange='', currency='USD'):
    """Conservative supported exchanges; blank/private identifiers stay unmapped."""
    t=ticker.strip()
    if not t or t=='-' or t.startswith('PP'):
        return None
    market=re.fullmatch(r'(.+?)\s+(US|UW|UN|UQ|GR|GY|JP|JT|HK|TT|TW|KS|KQ|LN|FP|SS|SW|NA|AU|CN|C1|C2|DC|FH|NO|IM|SM)',t)
    if market:
        code,market=market.groups()
        suffix={'GR':'DE','GY':'DE','JP':'T','JT':'T','HK':'HK','TT':'TW','TW':'TW','KS':'KS','KQ':'KQ','LN':'L','FP':'PA','SS':'ST','SW':'SW','NA':'AS','AU':'AX','CN':'TO','C1':'SS','C2':'SZ','DC':'CO','FH':'HE','NO':'OL','IM':'MI','SM':'MC'}
        if market in ('US','UW','UN','UQ'):return code.replace('.','-') if re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}',code) else None
        if re.fullmatch(r'[A-Z0-9][A-Z0-9.-]{0,12}',code):return (code.zfill(4) if market=='HK' else code)+'.'+suffix[market]
        return None
    if t.endswith(' UQ') or t.endswith(' UN'):
        t=t[:-3]
    if exchange in ('Taiwan Stock Exchange',): return t+'.TW'
    if exchange in ('Taipei Exchange', 'Gre Tai Securities Market'): return t+'.TWO'
    if exchange in ('Tokyo Stock Exchange',): return t+'.T'
    if exchange in ('Hong Kong Exchanges And Clearing Ltd', 'Hong Kong Stock Exchange'): return t.zfill(4)+'.HK'
    if exchange in ('Korea Exchange (Stock Market)', 'Korea Exchange (Kosdaq)'):
        return t.zfill(6)+('.KQ' if 'Kosdaq' in exchange else '.KS')
    if exchange in ('NASDAQ', 'New York Stock Exchange Inc.', 'NYSE', 'Nyse Mkt Llc', 'Cboe BZX', '') and currency=='USD' and re.fullmatch(r'[A-Z][A-Z0-9.-]{0,9}',t):
        return t.replace('.','-')
    return None


def parse_snapshot(fund, config, raw, captured_at=None):
    text=raw.decode('utf-8-sig').replace('\r\r\n','\n')
    rows=list(csv.reader(io.StringIO(text)))
    positions=[]
    if config['provider']=='ishares':
        as_of=date(next(r[1] for r in rows if r and r[0]=='Fund Holdings as of'))
        offset=next(i for i,r in enumerate(rows) if r and r[0]=='Ticker' and 'Weight (%)' in r)
        header=rows[offset]
        for row in rows[offset+1:]:
            if len(row)!=len(header) or not row[1]: continue
            r=dict(zip(header,row))
            weight=number(r['Weight (%)'])
            if weight is None: raise ValueError('Position missing weight: '+r['Name'])
            currency=r.get('Market Currency') or r.get('Currency') or 'USD'
            asset=r['Asset Class']
            cash=asset in ('Cash', 'Cash Collateral and Margins')
            symbol=None if cash or asset!='Equity' else mapped_symbol(r['Ticker'],r['Exchange'],currency)
            identifier=('CASH:'+currency) if cash else (symbol or 'ISH:'+hashlib.sha256((r['Ticker']+'|'+r['Name']+'|'+r['Exchange']).encode()).hexdigest()[:16])
            positions.append(dict(id=identifier,symbol=symbol,ticker=r['Ticker'],name=r['Name'],sector=r['Sector'] or 'Unclassified',
                asset=asset,currency=currency,weight=weight/100,quantity=number(r['Quantity']),marketValue=number(r['Market Value']),
                marketValueCurrency=r.get('Currency','USD'),sourcePrice=number(r['Price'])))
    elif config['provider']=='ark':
        header=rows[0]; dates=set()
        for row in rows[1:]:
            if len(row)!=len(header) or row[1]!=fund: continue
            r=dict(zip(header,row));dates.add(date(r['date']))
            w=number(r['weight (%)'])
            if w is None: raise ValueError('Position missing weight')
            t=r['ticker'].strip(); name=r['company']; cusip=r['cusip'].strip()
            cash=bool(re.search(r'CASH|MONEY MARKET|TREASURY',name,re.I))
            private=cusip.startswith('PP') or not t
            symbol=None if cash or private else mapped_symbol(t)
            identifier='CASH:USD' if cash else (symbol or 'CUSIP:'+cusip if cusip else 'ARK:'+name)
            positions.append(dict(id=identifier,symbol=symbol,ticker=t,name=name,cusip=cusip,sector='Cash' if cash else 'Unclassified',
                asset='Cash fund' if cash else 'Private/Unmapped' if private else 'Equity',currency='USD',weight=w/100,
                quantity=number(r['shares']),marketValue=number(r['market value ($)']),marketValueCurrency='USD'))
        if len(dates)!=1: raise ValueError('Missing or mixed issuer dates')
        as_of=dates.pop()
    elif config['provider']=='generic':
        header=rows[0]
        if header[:4]!=['asOf','ticker','name','weight']:raise ValueError('Expected validated canonical issuer data')
        dates=set()
        for row in rows[1:]:
            if len(row)!=len(header):raise ValueError('Incomplete canonical row')
            r=dict(zip(header,row));dates.add(date(r['asOf']));w=number(r['weight'])
            if w is None:raise ValueError('Missing weight')
            ticker=r['ticker'];name=r['name'];asset=r['asset'];identity=r.get('cusip','')
            cash=bool(re.search(r'cash|currency|reserve|money.market',asset,re.I) or re.search(r'\bCASH\b|US DOLLAR|USD Pending Dividends|MMDA|TREASURY|TRSY',name,re.I) or re.fullmatch(r'(?:NEW TAIWAN DOLLAR|SWEDISH KRONA|SOUTH KOREA WON|JAPANESE YEN|EURO|BRITISH POUND)',name,re.I))
            derivative=bool(re.search(r'derivative|future|option|warrant|\bWTS\b|\bCVR\b|\bSPV\b|private|prvt',asset+' '+name,re.I))
            symbol=None if cash or derivative else mapped_symbol(ticker)
            # Issuer's blanket KS tag incorrectly identifies this specific Kosdaq-listed security.
            if ticker=='056080 KS' and 'Yujin Robot' in name:symbol='056080.KQ'
            identifier=symbol or 'ISS:'+hashlib.sha256((identity+'|'+ticker+'|'+name).encode()).hexdigest()[:16]
            positions.append(dict(id=identifier,symbol=symbol,ticker=ticker,name=name,sector=r['sector'] or 'Unclassified',asset=asset or ('Cash' if cash else 'Equity/Unmapped'),currency=r['currency'],weight=w/100))
        if len(dates)!=1:raise ValueError('Mixed canonical dates')
        as_of=dates.pop()
    else:
        raise ValueError('Unsupported issuer')
    if len(positions)<5: raise ValueError('Incomplete holdings file')
    total=sum(p['weight'] for p in positions)
    if not .98 <= total <= 1.02: raise ValueError(f'Unexpected weight sum: {total:.4%}')
    if as_of > (dt.datetime.now(dt.timezone.utc).date()+dt.timedelta(days=1)).isoformat(): raise ValueError('Future holdings date')
    # Multiple lots of the same security are retained; the engine aggregates weights.
    return dict(schemaVersion=1,fund=fund,name=config['name'],asOf=as_of,currency=config['currency'],
        capturedAt=captured_at or dt.datetime.now(dt.timezone.utc).isoformat(),sha256=hashlib.sha256(raw).hexdigest(),
        source=config['url'],weightTotal=total,positions=positions)
