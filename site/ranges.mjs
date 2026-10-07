/** Calendar boundaries anchored to the latest saved completed valuation date. */
export function dateRange(preset, dates) {
  const calendar = [...new Set(dates)].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  const end = calendar.at(-1);
  if (!end || preset === 'custom') return null;
  const day = new Date(end + 'T12:00:00Z');
  const iso = d => d.toISOString().slice(0, 10);
  const firstOfMonth = (offset = 0) => new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + offset, 1, 12));
  let start = new Date(day), through = new Date(day);
  switch (preset) {
    case 'day': break;
    case 'wtd': start.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7); break;
    case 'mtd': start = firstOfMonth(); break;
    case 'qtd': start = new Date(Date.UTC(day.getUTCFullYear(), Math.floor(day.getUTCMonth() / 3) * 3, 1, 12)); break;
    case 'ytd': start = new Date(Date.UTC(day.getUTCFullYear(), 0, 1, 12)); break;
    case 'last-week':
      through.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7 - 1);
      start = new Date(through); start.setUTCDate(through.getUTCDate() - 6); break;
    case 'last-month':
      start = firstOfMonth(-1); through = firstOfMonth(); through.setUTCDate(0); break;
    case 'last-3-months':
      start = firstOfMonth(-3); through = firstOfMonth(); through.setUTCDate(0); break;
    case 'last-year':
      start = new Date(Date.UTC(day.getUTCFullYear() - 1, 0, 1, 12));
      through = new Date(Date.UTC(day.getUTCFullYear() - 1, 11, 31, 12)); break;
    default: throw Error('Unknown date range');
  }
  // Do not truncate a requested history to available holdings: missing coverage must stay visible.
  // Snap the end to an observed valuation date only if it exists in the requested period.
  const observedEnd = calendar.filter(d => d >= iso(start) && d <= iso(through)).at(-1);
  return { start: iso(start), end: observedEnd || iso(through), anchor: end };
}
