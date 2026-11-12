// Private, versioned historical import. No data is bundled in public assets or Git.
export const NAV_HISTORY_PREFIX = 'nav:bloomberg:20261112:';
export async function historicalNav(query, archive) {
  if (!archive) return null;
  try {
    const data = await archive.get(NAV_HISTORY_PREFIX + query.fund, 'json');
    if (data?.fund !== query.fund || data.currency !== 'USD' || data.field !== 'FUND_NET_ASSET_VAL' || !Array.isArray(data.points)) return null;
    const at = data.points.findIndex(p => p[0] === query.date);
    const end = data.points[at], start = data.points[at - 1];
    if (!end || start?.[0] !== query.previousDate || ![start[1], end[1]].every(n => typeof n === 'number' && Number.isFinite(n) && n > 0)) return null;
    const change = end[1] / start[1] - 1;
    if (Math.abs(change) > 0.35) return null; // Unverified corporate action or extreme move needs review.
    return {...query, status:'ok', currency:'USD', basis:'nav-price-change', nav:end[1], previousNav:start[1], return:change,
      issuer:'Bloomberg historical import', sourceType:'bloomberg-import', checkedAt:data.importedAt};
  } catch { return null; }
}
