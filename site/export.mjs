// Small, dependency-free OOXML export. Data stays in the authenticated browser.
// Numeric cells retain JS precision; Excel applies 0.00% only to their display.
const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const xml = value => String(value ?? '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
const col = n => String.fromCharCode(65 + n);
function cell(ref, value, style = 0, formula) {
  if (value === null || value === undefined || (typeof value === 'number' && !Number.isFinite(value)))
    return `<c r="${ref}" s="${style}"/>`;
  if (typeof value === 'number')
    return `<c r="${ref}" s="${style}">${formula ? `<f>${xml(formula)}</f>` : ''}<v>${value}</v></c>`;
  // inlineStr explicitly stores text; strings beginning =, +, -, @ cannot execute.
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
const crcTable = Uint32Array.from({length:256}, (_, n) => {
  for (let i = 0; i < 8; i++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function header(size, fields) {
  const bytes = new Uint8Array(size), view = new DataView(bytes.buffer);
  for (const [offset, width, value] of fields) view[width === 4 ? 'setUint32' : 'setUint16'](offset, value, true);
  return bytes;
}
function zip(files) {
  const encoder = new TextEncoder(), parts = [], central = [];
  let offset = 0, centralSize = 0;
  for (const [path, contents] of files) {
    const name = encoder.encode(path), data = encoder.encode(contents), crc = crc32(data);
    const local = header(30, [[0,4,0x04034b50],[4,2,20],[6,2,0x800],[12,2,33],
      [14,4,crc],[18,4,data.length],[22,4,data.length],[26,2,name.length]]);
    const entry = header(46, [[0,4,0x02014b50],[4,2,20],[6,2,20],[8,2,0x800],[14,2,33],
      [16,4,crc],[20,4,data.length],[24,4,data.length],[28,2,name.length],[42,4,offset]]);
    parts.push(local, name, data); central.push(entry, name);
    offset += local.length + name.length + data.length;
    centralSize += entry.length + name.length;
  }
  const end = header(22, [[0,4,0x06054b50],[8,2,files.length],[10,2,files.length],
    [12,4,centralSize],[16,4,offset]]);
  const bytes = new Uint8Array(offset + centralSize + end.length);
  let position = 0;
  for (const part of [...parts, ...central, end]) { bytes.set(part, position); position += part.length; }
  return bytes;
}
const styles = `<?xml version="1.0" encoding="UTF-8"?>
<styleSheet xmlns="${ns}">
<fonts count="4">
 <font><sz val="11"/><color rgb="FF24364B"/><name val="Arial"/></font>
 <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>
 <font><b/><sz val="16"/><color rgb="FF173E69"/><name val="Arial"/></font>
 <font><b/><sz val="11"/><color rgb="FF173E69"/><name val="Arial"/></font>
</fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FF1764A0"/><bgColor indexed="64"/></patternFill></fill>
 <fill><patternFill patternType="solid"><fgColor rgb="FFF0F5FB"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border/><border><bottom style="thin"><color rgb="FFC6D6E6"/></bottom></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="9">
 <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
 <xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
 <xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
 <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
 <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf>
 <xf numFmtId="10" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
 <xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0"><alignment vertical="center"/></xf>
 <xf numFmtId="10" fontId="3" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf>
 <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0"><alignment vertical="center"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

export function comparisonXlsx(result, {portfolio, benchmark, rows = result.rows, view = 'Holdings'} = {}) {
  if (!['complete', 'partial'].includes(result?.status) || !rows?.length) throw Error('Compare funds before downloading.');
  const first = 4, last = first + rows.length - 1;
  const headers = ['Security / sector',`Avg weight · ${portfolio}`,`Avg weight · ${benchmark}`,
    'Active weight','Security return',`Contribution · ${portfolio}`,`Contribution · ${benchmark}`,'Contribution difference'];
  const sheetRows = [];
  const add = (n, values, style = 0, height = 23) => sheetRows.push(`<row r="${n}" ht="${height}" customHeight="1">` +
    values.map((value, i) => cell(col(i) + n, value, style)).join('') + '</row>');
  add(1, ['Arcus · Portfolio comparison'], 3, 30);
  add(2, ['From',result.start,'Through',result.end,'Currency',result.currency,'View',view]);
  add(3, ['Portfolio',portfolio,'Benchmark',benchmark], 4);
  const headlineFormula = (side, value) => {
    if (result['returnMethod' + side] !== 'weighted-estimate' || view !== 'Holdings') return undefined;
    const contributions = side === 'A' ? 'F' : 'G';
    // Sum the individual weight × return formulas, excluding unavailable cells.
    return Number.isFinite(value) ? `SUM(Analysis!${contributions}${first}:${contributions}${last})` : undefined;
  };
  sheetRows.push('<row r="4" ht="26" customHeight="1">' +
    cell('A4',portfolio,4) + cell('B4',result.returnA,7,headlineFormula('A',result.returnA)) +
    cell('C4',benchmark,4) + cell('D4',result.returnB,7,headlineFormula('B',result.returnB)) +
    cell('E4','Difference',4) + cell('F4',result.activeReturn,7,'B4-D4') + '</row>');
  const basis = side => result['returnMethod' + side] === 'weighted-estimate'
    ? 'Weighted estimate (available returns)' : result['returnMethod' + side] === 'reference' || result.status === 'partial'
      ? 'Fund reference return' : 'Holdings estimate';
  add(5,['Return basis',basis('A'),null,basis('B')]);
  if (result.coverage) sheetRows.push('<row r="6" ht="23" customHeight="1">' +
    cell('A6','Coverage',4) + cell('B6',result.coverage.portfolio,1) +
    cell('C6','Coverage',4) + cell('D6',result.coverage.benchmark,1) + '</row>');
  const analysisRows = ['<row r="1" ht="26" customHeight="1">' +
    cell('A1',portfolio,4) + cell('B1',result.returnA,7,'Summary!B4') +
    cell('C1',benchmark,4) + cell('D1',result.returnB,7,'Summary!D4') +
    cell('E1','Difference',4) + cell('F1',result.activeReturn,7,'Summary!F4') +
    cell('G1','Currency',4) + cell('H1',result.currency) + '</row>',
    '<row r="3" ht="48" customHeight="1">'+headers.map((value,i)=>cell(col(i)+'3',value,2)).join('')+'</row>'];
  rows.forEach((row, i) => {
    const n = first + i, numericStyle = i % 2 ? 5 : 1, textStyle = i % 2 ? 6 : 0;
    const values = [row.ticker,row.weightA,row.weightB,row.activeWeight,row.securityReturn,row.ctrA,row.ctrB,row.activeCtr];
    analysisRows.push(`<row r="${n}" ht="23" customHeight="1">` + values.map((value,j) => {
      const formula = j === 3 ? `B${n}-C${n}` : j === 7 ? `F${n}-G${n}`
        : result.contributionMethod === 'average-weight-period' && view === 'Holdings' && (j === 5 || j === 6)
          ? (values[j === 5 ? 1 : 2] === 0 ? '0' : `${j === 5 ? 'B' : 'C'}${n}*E${n}`) : undefined;
      return cell(col(j)+n,value,j===0?textStyle:numericStyle,formula);
    }).join('') + '</row>');
  });
  // Sum available contributions without turning an entirely missing column into zero.
  const totals = [null,null,null,null,null,'ctrA','ctrB','activeCtr'];
  analysisRows.push(`<row r="${last+2}" ht="26" customHeight="1">` + cell('A'+(last+2),'Total',8) +
    totals.map((key,j) => {
      if (!key) return '';
      const valid=rows.map(row=>row[key]).filter(Number.isFinite);
      return cell(col(j)+(last+2), valid.length?valid.reduce((a,b)=>a+b,0):null,7,`SUM(${col(j)}${first}:${col(j)}${last})`);
    }).join('') + '</row>');
  const sheet = (contents, heights, widths, extras, pane='') => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="${ns}">
<sheetPr><tabColor rgb="FF1764A0"/><pageSetUpPr fitToPage="1"/></sheetPr>
<dimension ref="A1:H${heights}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0" zoomScale="90" zoomScaleNormal="100">
${pane || '<selection activeCell="A1" sqref="A1"/>'}</sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="23"/><cols>${widths.map((width,i)=>`<col min="${i+1}" max="${i+1}" width="${width}" customWidth="1"/>`).join('')}</cols>
<sheetData>${contents.join('')}</sheetData>${extras}
<pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.2" footer="0.2"/>
<pageSetup orientation="landscape" paperSize="9" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  const summary = sheet(sheetRows,7,[12,28,18,20,18,18,10,16],
    '<mergeCells count="3"><mergeCell ref="A1:H1"/><mergeCell ref="B5:C5"/><mergeCell ref="D5:F5"/></mergeCells>');
  const analysis = sheet(analysisRows,last+2,[view==='Sector'?24:12,18,18,14,16,18,18,19],
    `<autoFilter ref="A3:H${last}"/>`,
    '<pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A4" sqref="A4"/>');
  return zip([
    ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Analysis" sheetId="2" r:id="rId2"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`],
    ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',summary],['xl/worksheets/sheet2.xml',analysis],
  ]);
}
