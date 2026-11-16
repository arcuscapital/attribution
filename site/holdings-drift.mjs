/** Market/currency/schedule independent long-only holdings arithmetic.
 * Adapters own dated snapshots, FX, corporate actions and rebalance events.
 * A later 13F adapter can reset its opening snapshot without a second engine.
 */
export function driftHoldings(positions,returns){
  const lookup=returns instanceof Map?returns:new Map(Object.entries(returns||{}));
  const ids=new Set();let totalWeight=0,totalReturn=0;
  const contributions=positions.map(p=>{
    if(typeof p.id!=='string'||ids.has(p.id)||!Number.isFinite(p.weight)||p.weight<0)throw Error('Invalid drift holding');
    ids.add(p.id);totalWeight+=p.weight;
    const r=p.weight===0?0:lookup.get(p.id);
    if(!Number.isFinite(r)||r< -1)throw Error('Missing or invalid return for '+p.id);
    const contribution=p.weight*r;totalReturn+=contribution;
    return {id:p.id,openingWeight:p.weight,return:r,contribution};
  });
  if(Math.abs(totalWeight-1)>1e-8||totalReturn<=-1)throw Error('Drift portfolio must have positive value and weights summing to one');
  return {return:totalReturn,contributions,positions:positions.map((p,i)=>({...p,weight:p.weight*(1+contributions[i].return)/(1+totalReturn)}))};
}
export function advanceUnits(units,previousPrices,currentPrices){
  const holdings=units instanceof Map?[...units]:Object.entries(units),before=previousPrices instanceof Map?previousPrices:new Map(Object.entries(previousPrices)),after=currentPrices instanceof Map?currentPrices:new Map(Object.entries(currentPrices));
  let total=0;const returns=new Map();
  const positions=holdings.map(([id,quantity])=>{
    const a=before.get(id),b=after.get(id);
    if(!Number.isFinite(quantity)||quantity<0||!(a>0)||!Number.isFinite(a)||!(b>=0)||!Number.isFinite(b))throw Error('Invalid unit valuation for '+id);
    total+=quantity*a;returns.set(id,b/a-1);return {id,weight:quantity*a};
  });
  if(!(total>0))throw Error('Drift portfolio has no value');positions.forEach(p=>p.weight/=total);
  return driftHoldings(positions,returns);
}
