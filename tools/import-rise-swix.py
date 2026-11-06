"""Convert the owner's report to a private KV value. Never prints holdings."""
import sys,json,hashlib,pathlib,openpyxl
p=pathlib.Path(sys.argv[1]);dest=pathlib.Path(sys.argv[2])
s=openpyxl.load_workbook(p,data_only=True)['Attribution']
assert s['B4'].value=='Portfolio: RISE ENHANCED EQUITY'
assert s['B5'].value=='Benchmark: SWIX ALL SHARE' and s['H5'].value=='Currency: ZAR'
assert s['H4'].value=='Period: 11/04/2026 - 11/05/2026'
assert [s.cell(10,c).value for c in [4,5,7,8,10,11]]==['Port','Bmrk']*3
def row(r):
 return {'sourceRow':r,'name':s.cell(r,2).value,'ticker':s.cell(r,3).value,'values':[s.cell(r,c).value for c in [4,5,7,8,10,11]]}
groups=[]
for r in range(12,151):
 x=row(r)
 if s.cell(r,2).alignment.indent==1:groups.append(dict(**x,children=[]))
 else:
  ticker=x['ticker'];cash=ticker=='ZAR';assert cash or ticker.endswith(' SJ')
  x.update(id=s.cell(r,17).value or ticker,isin=s.cell(r,17).value,cash=cash,symbol=None if cash else ticker[:-3]+'.JO')
  groups[-1]['children'].append(x)
value={'schemaVersion':1,'version':hashlib.sha256(p.read_bytes()).hexdigest(),'period':['2026-11-04','2026-11-05'],'currency':'ZAR','total':row(11),'groups':groups}
dest.parent.mkdir(parents=True,exist_ok=True);dest.write_text(json.dumps(value,ensure_ascii=False),encoding='utf-8')
print('Private report prepared:',len(groups),'groups;',sum(len(g['children']) for g in groups),'rows. Values not logged.')
