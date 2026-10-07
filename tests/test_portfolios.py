import sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from arcus_attribution.portfolios import snapshots

class PortfolioTests(unittest.TestCase):
 def fixture(self):
  return {'generatedAt':'2026-10-07T09:00:00Z','portfolios':[{'id':'easyai','asOf':'2026-10-06','accountValue':100000,'holdings':[
   {'sourceTicker':'A','ticker':'A','name':'First','weightPct':85,'mappingStatus':'verified','positionQty':123,'avgPrice':45},
   {'ticker':'B','name':'Unknown','weightPct':10,'mappingStatus':'unresolved'}],
   'cashWeights':[{'currency':'USD','weightPct':5,'asOf':'2026-10-06'}]}]}
 def test_only_minimal_positions_dates_and_actual_cash_are_saved(self):
  s=snapshots(self.fixture())[0];self.assertEqual(s['asOf'],'2026-10-06');self.assertAlmostEqual(s['weightTotal'],1)
  self.assertEqual(s['fund'],'PORTFOLIO:EASYAI')
  self.assertEqual(s['positions'][0]['symbol'],'A');self.assertIsNone(s['positions'][1]['symbol'])
  self.assertEqual(s['positions'][2]['id'],'CASH:USD')
  self.assertNotIn('accountValue',s);self.assertNotIn('positionQty',s['positions'][0]);self.assertNotIn('avgPrice',s['positions'][0])
 def test_missing_cash_and_returns_are_not_invented(self):
  data=self.fixture();data['portfolios'][0].pop('cashWeights');s=snapshots(data)[0]
  self.assertEqual(len(s['positions']),2);self.assertAlmostEqual(s['weightTotal'],.95)
 def test_no_aggregate_themes_or_unknown_portfolios(self):
  d=self.fixture();d['portfolios'][0]['id']='all';self.assertEqual(snapshots(d),[])
 def test_invalid_weights_rejected(self):
  d=self.fixture();d['portfolios'][0]['holdings'][0]['weightPct']=None
  with self.assertRaises(ValueError):snapshots(d)
