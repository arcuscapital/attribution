import copy
import datetime
import json
from pathlib import Path
import sys
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from arcus_attribution.sources import parse_snapshot
from arcus_attribution.app import db_open,store,selected,import_levels,export

CONFIG={'provider':'ark','name':'ARK test','url':'https://example.invalid/holdings.csv','currency':'USD'}
RAW=('date,fund,company,ticker,cusip,shares,market value ($),weight (%)\n'+''.join(f'10/01/2026,ARKK,Company {i},{"" if i==4 else "A"+str(i)},CUSIP{i},10,100,20%\n' for i in range(5))).encode()

class Tests(unittest.TestCase):
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

if __name__=='__main__':unittest.main()
