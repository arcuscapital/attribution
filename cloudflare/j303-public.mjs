// Only the freely visible top-ten disclosure. No login or subscriber endpoints.
const ALIASES={'GFIELDS':'GFI','NASPERS-N':'NPN','ANGGOLD':'ANG','FIRSTRAND':'FSR','CAPITEC':'CPI','STANBANK':'SBK','MTN GROUP':'MTN','VALTERRA':'VAL','ANGLO':'AGL','PROSUS':'PRX','ABSA':'ABG','IMPLATS':'IMP','BATS':'BTI','SHOPRIT':'SHP'};
export const PUBLIC_URL='https://www.fundsdata.co.za/Summary.aspx?c=STXCAP';
export function parsePublicAnchors(html,model,now=Date.now()){
  const table=html.slice(html.indexOf('Top Holdings as at')).split('</table>')[0];
  const match=table.match(/^Top Holdings as at (\d{1,2}) ([A-Za-z]{3}) (\d{4})/);
  if(!match)throw Error('Public holdings date unavailable');
  const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(match[2])+1;
  const asOf=match[3]+'-'+String(month).padStart(2,'0')+'-'+match[1].padStart(2,'0');
  if(!month||Date.parse(asOf)>now||Date.parse(asOf)<Date.parse('2025-01-01'))throw Error('Invalid public holdings date');
  const weights={};
  for(const row of table.matchAll(/<tr>([\s\S]*?)<\/tr>/g)){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map(x=>x[1].replace(/<[^>]*>/g,'').replace(/&nbsp;/g,' ').trim());
    if(cells.length!==4||/^Totals?$/i.test(cells[0])||!/^\d+(?:\.\d+)?%$/.test(cells[3]))continue;
    const symbol=(ALIASES[cells[0]]||cells[0])+'.JO';
    if(!model.holdings.some(p=>p.symbol===symbol))throw Error('Unresolved public constituent');
    const weight=parseFloat(cells[3])/100;if(!(weight>0&&weight<.2)||weights[symbol])throw Error('Invalid public holding weight');weights[symbol]=weight;
  }
  const sum=Object.values(weights).reduce((a,b)=>a+b,0);
  if(Object.keys(weights).length!==10||sum<.25||sum>.85)throw Error('Incomplete public holdings disclosure');
  return {asOf,weights,source:PUBLIC_URL,observedAt:new Date(now).toISOString()};
}
export async function refreshPublicAnchors(kv,model,now,fetcher=fetch){
  const response=await fetcher(PUBLIC_URL,{signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Public holdings source unavailable');
  const html=await response.text();if(html.length>600000)throw Error('Unexpected public disclosure');
  const data=parsePublicAnchors(html,model,now),old=await kv.get('j303:public-anchors:v1','json');
  if(!old||data.asOf>old.asOf)await kv.put('j303:public-anchors:v1',JSON.stringify(data));
  return data;
}
