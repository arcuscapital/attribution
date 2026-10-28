import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comparisonXlsx} from '../site/export.mjs';
function unzip(bytes) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), decoder=new TextDecoder(), files=new Map();
  let offset=0;
  while(view.getUint32(offset,true)===0x04034b50) {
    const length=view.getUint32(offset+18,true),names=view.getUint16(offset+26,true),extra=view.getUint16(offset+28,true);
    assert.equal(view.getUint16(offset+8,true),0);
    const name=decoder.decode(bytes.subarray(offset+30,offset+30+names)),start=offset+30+names+extra;
    files.set(name,decoder.decode(bytes.subarray(start,start+length)));offset=start+length;
  }
  assert.equal(view.getUint32(offset,true),0x02014b50);
  assert.equal(view.getUint32(bytes.length-22,true),0x06054b50);
  assert.equal(view.getUint16(bytes.length-12,true),files.size);
  return files;
}
const row={ticker:'FIX',name:'Comfort Systems',sector:'Industrials',weightA:.05882359179,weightB:0,activeWeight:.05882359179,
  securityReturn:-.00696562,ctrA:.05882359179*-.00696562,ctrB:0,activeCtr:.05882359179*-.00696562};
const result={status:'partial',start:'2026-10-13',end:'2026-10-13',currency:'USD',returnA:row.ctrA,returnB:-.012,activeReturn:row.ctrA+.012,
  returnMethodA:'weighted-estimate',returnMethodB:'reference',contributionMethod:'average-weight-period',
  coverage:{portfolio:.9789,benchmark:.9776},rows:[row,{...row,ticker:'Unknown',securityReturn:null,ctrA:null,ctrB:0,activeCtr:null}],
  notes:['Method / disclaimer','long disclaimer'],holdingsWarnings:['Holdings warning']};
const options={portfolio:'IBKR',benchmark:'BAI'};
test('xlsx is a real OOXML package with numeric fractional percentages and full precision',()=>{
  const files=unzip(comparisonXlsx(result,options)),sheet=files.get('xl/worksheets/sheet2.xml');
  assert.equal(files.size,7);
  assert.match(sheet,/<c r="B4" s="1"><v>0\.05882359179<\/v>/);
  assert.match(sheet,/<c r="D4" s="1"><v>-0\.00696562<\/v>/);
  assert.match(sheet,/<c r="E4" s="1"><f>B4-C4<\/f>/);
  assert.match(sheet,/<c r="F4" s="1"><f>B4\*D4<\/f><v>/);
  assert.match(sheet,/<c r="F5" s="1"\/>/);
  assert.match(sheet,/<c r="G4" s="1"><f>0<\/f><v>0<\/v>/);
  assert.match(files.get('xl/styles.xml'),/numFmtId="10"/); // Excel's native 0.00%
  assert.match(files.get('xl/worksheets/sheet1.xml'),/<f>SUM\(Analysis!F4:F5\)<\/f>/);
});
test('two-sheet export keeps returns in row 1, headers in row 3, freeze below row 3 and a free-scrolling summary',()=>{
  const files=unzip(comparisonXlsx(result,options)),sheet=files.get('xl/worksheets/sheet2.xml'),summary=files.get('xl/worksheets/sheet1.xml');
  assert.doesNotMatch(sheet+summary,/Holdings warning|Method \/ disclaimer|long disclaimer|Values below|Holdings method/);
  assert.match(sheet,/Avg weight · IBKR/);assert.match(sheet,/Contribution · BAI/);
  assert.match(sheet,/autoFilter ref="A3:H5"/);assert.match(sheet,/showGridLines="1"/);
  assert.match(summary,/showGridLines="1"/);
  assert.match(sheet,/<col min="1" max="1" width="12"/);
  assert.match(sheet,/zoomScale="100"/);
  assert.match(sheet,/<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/);
  assert.doesNotMatch(summary,/<pane|state="frozen"|xSplit|ySplit/);
  assert.match(sheet,/<c r="B1" s="7"><f>Summary!B4<\/f>/);
  assert.match(sheet,/<row r="3" ht="48"/);
  assert.match(files.get('xl/workbook.xml'),/name="Summary".*name="Analysis"/);
  const style=files.get('xl/styles.xml');assert.match(style,/FF1764A0/);assert.match(style,/FFFFFFFF/);
});
test('formula-like security names are explicit text, XML escaped, never executable formulas',()=>{
  const files=unzip(comparisonXlsx({...result,rows:[{...row,ticker:'=HYPERLINK("https://evil") A & <B>\x01'}]},options));
  const sheet=files.get('xl/worksheets/sheet2.xml');
  assert.match(sheet,/<c r="A4" s="0" t="inlineStr">/);
  assert.match(sheet,/=HYPERLINK\(&quot;https:\/\/evil&quot;\)/);
  assert.match(sheet,/A &amp; &lt;B&gt;/);assert.doesNotMatch(sheet,/\x01/);
});
test('sector export preserves grouped values, blanks and summaries without security product formulas',()=>{
  const files=unzip(comparisonXlsx(result,{...options,view:'Sector',rows:[{...row,ticker:'Industrials',securityReturn:null}]}));
  const sheet=files.get('xl/worksheets/sheet2.xml');
  assert.doesNotMatch(sheet,/<f>B4\*D4<\/f>|SUMPRODUCT/);
  assert.match(sheet,/<c r="D4" s="1"\/>/);
  assert.match(sheet,/<c r="F4" s="1"><v>/);
  assert.doesNotMatch(files.get('xl/worksheets/sheet1.xml'),/SUM\(Analysis!/);
});
test('invalid/incomplete comparisons cannot create a misleading workbook',()=>{
  assert.throws(()=>comparisonXlsx({...result,status:'incomplete'},options));
  assert.throws(()=>comparisonXlsx({...result,rows:[]},options));
});
