import json
import tempfile
import unittest
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from arcus_attribution.publish import prepare,publish
class PublishTests(unittest.TestCase):
    def fixture(self,root):
        report=root/'reports';report.mkdir()
        funds=[dict(id=x,name=x) for x in ('A','PORTFOLIO:IBKR')]
        (report/'manifest.json').write_text(json.dumps(dict(months=['2026-10'],funds=funds,generatedAt='2026-10-07')))
        snaps=[dict(fund=f['id'],asOf='2026-10-05',positions=[dict(id='A',symbol='A',weight=.8,quantity=999,cost=123)]) for f in funds]
        (report/'2026-10.json').write_text(json.dumps(dict(snapshots=snaps)))
        return report
    def test_strips_sensitive_unnecessary_fields_and_preserves_weights(self):
        with tempfile.TemporaryDirectory() as tmp:
            report=self.fixture(Path(tmp));rows,m=prepare(report,'1790000000000')
            p=json.loads(rows[0]['value'])['positions'][0]
            self.assertEqual(p,dict(id='A',symbol='A',weight=.8))
            self.assertEqual(m['funds'][0]['latest'],'2026-10-05')
            self.assertEqual(m['valuationDates'],[])
    def test_failed_upload_never_changes_catalog(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.fixture(root);calls=[]
            def fail(cmd,**kwargs):
                calls.append(cmd)
                return type('Result',(),{'returncode':1})()
            with self.assertRaises(RuntimeError):
                publish(root,dict(node='node',wrangler='wrangler',authHome='fixture'),fail)
            self.assertEqual(len(calls),1)
            self.assertNotIn('catalog',calls[0])
    def test_catalog_is_last_and_account_is_fixed(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);self.fixture(root);calls=[]
            def run(cmd,**kwargs):
                self.assertEqual(kwargs['env']['CLOUDFLARE_ACCOUNT_ID'],'5695cae2becf35e049eb5df3e2849ae2')
                calls.append(cmd)
                return type('Result',(),{'returncode':0})()
            self.assertEqual(publish(root,dict(node='node',wrangler='wrangler',authHome='fixture'),run),2)
            self.assertIn('bulk',calls[0]);self.assertIn('catalog',calls[1])

