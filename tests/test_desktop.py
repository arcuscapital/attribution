import copy
import datetime
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from arcus_attribution.sources import parse_snapshot
from arcus_attribution.app import db_open,store,selected,import_levels,export,update_prices

CONFIG={'provider':'ark','name':'ARK test','url':'https://example.invalid/holdings.csv','currency':'USD'}
RAW=('date,fund,company,ticker,cusip,shares,market value ($),weight (%)\n'+''.join(f'10/01/2026,ARKK,Company {i},{"" if i==4 else "A"+str(i)},CUSIP{i},10,100,20%\n' for i in range(5))).encode()

class Tests(unittest.TestCase):
 def test_foreign_cash_not_mapped_to_stock_but_dollar_tree_is(self):
  rows=['asOf,ticker,name,weight,sector,asset,currency,cusip']
  rows += [f'2026-10-01,{t},{n},20,Unclassified,,USD,' for t,n in [('TWD','NEW TAIWAN DOLLAR'),('SEK','SWEDISH KRONA'),('KRW','SOUTH KOREA WON'),('DLTR','DOLLAR TREE INC'),('AAPL','APPLE INC')]]
  snap=parse_snapshot('T',dict(CONFIG,provider='generic'),'\n'.join(rows).encode())
  self.assertTrue(all(p['symbol'] is None for p in snap['positions'][:3]))
  self.assertEqual(snap['positions'][3]['symbol'],'DLTR')
 def test_price_currency_conversion_exact_dates_and_daily_cache(self):
  with tempfile.TemporaryDirectory() as tmp:
   db=db_open(Path(tmp));snap=parse_snapshot('ARKK',CONFIG,RAW)
   snap['positions']=[dict(snap['positions'][0],symbol='GB',id='GB'),dict(snap['positions'][1],symbol='CN',id='CN')];store(db,snap)
   def prices(symbol,start):
    return {'GB':('GBp',{'2026-10-01':10000,'2026-10-02':11000}), 'CN':('CNY',{'2026-10-01':100,'2026-10-02':110}), 'GBPUSD=X':('USD',{'2026-10-01':1.25}), 'CNYUSD=X':('USD',{'2026-10-01':.14,'2026-10-02':.15}), 'SPY':('USD',{'2026-10-01':100}), 'USDZAR=X':('ZAR',{'2026-10-01':17})}[symbol]
   with patch('arcus_attribution.app.chart',side_effect=prices) as mock,patch('arcus_attribution.app.time.sleep'):
    self.assertEqual(update_prices(db,{}),[])
    self.assertEqual(db.execute("SELECT value FROM levels WHERE id='GB'").fetchone()[0],125)
    self.assertEqual(db.execute("SELECT value FROM levels WHERE id='CN' AND date='2026-10-02'").fetchone()[0],16.5)
    self.assertEqual(db.execute("SELECT count(*) FROM levels WHERE id='GB'").fetchone()[0],1)
    count=mock.call_count;self.assertEqual(update_prices(db,{}),[]);self.assertEqual(mock.call_count,count)
   db.close()
 def test_private_preserved(self):
  snap=parse_snapshot('ARKK',CONFIG,RAW);self.assertEqual(len(snap['positions']),5);self.assertIsNone(snap['positions'][4]['symbol']);self.assertEqual(snap['asOf'],'2026-10-01')
 def test_missing_weight_rejected(self):
  with self.assertRaises(ValueError):parse_snapshot('ARKK',CONFIG,RAW.replace(b'20%',b''))
 def test_mixed_dates_rejected(self):
  with self.assertRaises(ValueError):parse_snapshot('ARKK',CONFIG,RAW.replace(b'10/01/2026',b'10/02/2026',1))
 def test_idempotent_import_and_revisions(self):
  with tempfile.TemporaryDirectory() as tmp:
   db=db_open(Path(tmp));snap=parse_snapshot('ARKK',CONFIG,RAW,'2026-10-01T09:00:00Z')
   for _ in range(10):store(db,snap)
   self.assertEqual(db.execute('SELECT count(*) FROM snapshots').fetchone()[0],1)
   corrected=copy.deepcopy(snap);corrected['sha256']='revised';corrected['capturedAt']='2026-10-01T10:00:00Z';corrected['positions'][0]['name']='Corrected';store(db,corrected);store(db,snap)
   self.assertEqual(selected(db)[0]['positions'][0]['name'],'Corrected');self.assertEqual(db.execute('SELECT count(*) FROM snapshots').fetchone()[0],2);db.close()
 def test_export_contains_no_secrets_and_valid_manifest(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);db=db_open(home);store(db,parse_snapshot('ARKK',CONFIG,RAW));m=export(db,home,{'ARKK':CONFIG});self.assertEqual(m['schemaVersion'],1);self.assertEqual(m['funds'][0]['positions'],5);self.assertTrue((home/'reports/manifest.json').exists());db.close()
 def test_levels_atomic_invalid_input_does_not_partially_import(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);db=db_open(home);p=home/'input.csv';p.write_text('id,date,value,currency,basis,source\nX,2026-10-01,100,USD,verified-total-return,manual\nX,2026-10-02,nan,USD,verified-total-return,manual\n')
   with self.assertRaises(ValueError):import_levels(db,p)
   self.assertEqual(db.execute('SELECT count(*) FROM levels').fetchone()[0],0);db.close()
 def test_manifest_preserves_observed_valuation_dates(self):
  with tempfile.TemporaryDirectory() as tmp:
   home=Path(tmp);db=db_open(home)
   db.executemany('INSERT INTO levels VALUES(?,?,?,?,?,?)',[
    ('SPY','2026-10-02',100,'USD','vendor-adjusted','test'),
    ('SPY','2026-10-05',101,'USD','vendor-adjusted','test'),
    ('X','2026-10-06',103,'USD','vendor-adjusted','test')])
   m=export(db,home,{'ARKK':CONFIG});self.assertEqual(m['valuationDates'],['2026-10-02','2026-10-05']);db.close()

if __name__=='__main__':unittest.main()
