// Bounded reader for issuer NAV workbooks. Reads values only; no formulas,
// macros, external relationships or filesystem paths are evaluated.
export async function navWorkbookRows(bytes) {
  if(bytes.length<22 || bytes.length>5000000)throw Error('Invalid workbook size');
  const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),dec=new TextDecoder();
  let end=bytes.length-22;
  for(;end>=Math.max(0,bytes.length-65558)&&v.getUint32(end,true)!==0x06054b50;end--);
  if(end<0 || v.getUint32(end,true)!==0x06054b50)throw Error('Invalid workbook');
  const count=v.getUint16(end+10,true);let at=v.getUint32(end+16,true);const parts={};
  if(count>200)throw Error('Workbook too complex');
  for(let i=0;i<count;i++) {
    if(at+46>bytes.length||v.getUint32(at,true)!==0x02014b50)throw Error('Invalid directory');
    const method=v.getUint16(at+10,true),size=v.getUint32(at+20,true),expanded=v.getUint32(at+24,true),
      n=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),local=v.getUint32(at+42,true);
    const name=dec.decode(bytes.slice(at+46,at+46+n));
    if(['xl/sharedStrings.xml','xl/worksheets/sheet1.xml'].includes(name)) {
      if(expanded>6000000 || ![0,8].includes(method)||local+30>bytes.length||v.getUint32(local,true)!==0x04034b50)throw Error('Invalid part');
      const start=local+30+v.getUint16(local+26,true)+v.getUint16(local+28,true);
      if(start+size>bytes.length)throw Error('Truncated part');
      let body=bytes.slice(start,start+size);
      if(method===8) {
        const reader=new Blob([body]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let size=0;
        for(;;){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>6000000){await reader.cancel();throw Error('Part too large');}chunks.push(r.value);}
        body=new Uint8Array(size);let offset=0;for(const c of chunks){body.set(c,offset);offset+=c.length;}
      }
      if(body.length!==expanded)throw Error('Incomplete part');
      parts[name]=dec.decode(body).replace(/(<\/?)[A-Za-z][\w.-]*:/g,'$1');
    }
    at+=46+n+extra+comment;
  }
  const plain=s=>s.replace(/<[^>]*>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const strings=[...(parts['xl/sharedStrings.xml']||'').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(m=>plain(m[1]));
  if(!parts['xl/worksheets/sheet1.xml'])throw Error('Missing worksheet');
  return [...parts['xl/worksheets/sheet1.xml'].matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(m=>{
    const row=[];
    for(const c of m[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){
      const letters=c[1].match(/\br="([A-Z]+)\d+"/)?.[1];if(!letters)continue;
      let col=0;for(const x of letters)col=col*26+x.charCodeAt(0)-64;
      if(col>40)throw Error('Too many columns');
      const value=c[2].match(/<v[^>]*>([\s\S]*?)<\/v>/)?.[1]||'';
      row[col-1]=/\bt="s"/.test(c[1])?strings[Number(value)]||'':/\bt="inlineStr"/.test(c[1])?plain(c[2]):plain(value);
    }
    return row;
  });
}
