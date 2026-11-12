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

// Cumulative return chart under the comparison tables, in the style of Bloomberg's Total Return chart:
// portfolio and benchmark lines on top, the performance difference (portfolio minus benchmark) as a
// shaded area below. Plain SVG, no library. Values are percentages from the period's starting close.
// It lives in this shared module because the Arcus bridge serves only a fixed list of page files;
// a new file would need a Watchlists deployment.
const NS = 'http://www.w3.org/2000/svg';
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const node = (tag, attrs = {}, text) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text !== undefined) n.textContent = text;
  return n;
};
const fmt = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

// Evenly spaced round tick values covering lo..hi.
export function niceTicks(lo, hi, count = 6) {
  if (!(hi > lo)) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / count, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw);
  const values = [];
  for (let v = Math.floor(lo / step) * step, top = Math.ceil(hi / step) * step; v <= top + step * 1e-9; v += step) values.push(+v.toFixed(10));
  return values;
}

// Which dates get an x-axis label: every k-th date so labels stay about 44px apart, always the last.
export function labelIndexes(count, plotWidth) {
  const step = Math.max(1, Math.ceil(44 / (plotWidth / Math.max(1, count - 1))));
  const out = [];
  for (let i = 0; i < count; i += step) out.push(i);
  if (out.at(-1) !== count - 1 && (count - 1 - out.at(-1)) * plotWidth / Math.max(1, count - 1) > 30) out.push(count - 1);
  return out;
}

// A chart problem hides the chart; it never interrupts the comparison results around it.
export function drawReturnChart(root, series) {
  try { drawChart(root, series); }
  catch (error) { root._series = null; root.replaceChildren(); root.hidden = true; console.warn('Return chart unavailable', error); }
}
function drawChart(root, series) {
  root._series = series || null;
  root.replaceChildren();
  const valid = series && Array.isArray(series.dates) && series.dates.length >= 3 &&
    series.a?.length === series.dates.length && series.b?.length === series.dates.length &&
    [...series.a, ...series.b].every(Number.isFinite);
  root.hidden = !valid;
  if (!valid) return;
  if (!root._observer && typeof ResizeObserver === 'function') {
    let width = 0, timer;
    root._observer = new ResizeObserver(() => {
      const w = Math.round(root.clientWidth);
      if (Math.abs(w - width) < 8) return;
      width = w; clearTimeout(timer); timer = setTimeout(() => { if (root._series) drawReturnChart(root, root._series); }, 120);
    });
    root._observer.observe(root);
  }
  const {dates, a, b, labelA, labelB, title} = series;
  const diff = a.map((v, i) => v - b[i]), n = dates.length;
  const heading = document.createElement('div'); heading.className = 'return-chart-head';
  const h = document.createElement('h3'); h.textContent = title || 'Cumulative return (%)';
  const sub = document.createElement('p');
  sub.textContent = dates[0] + ' to ' + dates.at(-1) + ' · daily · ' + (series.note || 'from the starting close');
  heading.append(h, sub);

  const phone = root.clientWidth < 600;
  const W = Math.max(320, Math.round(root.clientWidth || 900)), padL = 8, padR = phone ? 58 : 72;
  const top = 12, H1 = phone ? 200 : 270, gap = 26, H2 = phone ? 120 : 160, axis = 38, H = top + H1 + gap + H2 + axis;
  const plotW = W - padL - padR, x = i => padL + i * plotW / (n - 1);
  const scale = (values, y0, height) => {
    let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const pad = (hi - lo || 1) * 0.08; lo -= pad; hi += pad;
    const t = niceTicks(lo, hi, phone ? 4 : 6); lo = Math.min(lo, t[0]); hi = Math.max(hi, t.at(-1));
    return {ticks: t, y: v => y0 + (hi - v) / (hi - lo) * height};
  };
  const s1 = scale([...a, ...b], top, H1), s2 = scale(diff, top + H1 + gap, H2);
  const svg = node('svg', {viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', class: 'return-chart-svg',
    'aria-label': `Cumulative return ${dates[0]} to ${dates.at(-1)}: ${labelA} ${fmt(a.at(-1))}%, ${labelB} ${fmt(b.at(-1))}%, difference ${fmt(diff.at(-1))} percentage points.`});
  const labels = labelIndexes(n, plotW);
  const grid = node('g', {class: 'rc-grid'});
  for (const [s, y0, height] of [[s1, top, H1], [s2, top + H1 + gap, H2]]) {
    for (const v of s.ticks) {
      const y = s.y(v); if (y < y0 - 0.5 || y > y0 + height + 0.5) continue;
      grid.append(node('line', {x1: padL, x2: padL + plotW, y1: y, y2: y}));
      grid.append(node('text', {x: padL + plotW + 6, y: y + 4, class: 'rc-axis'}, fmt(v)));
    }
    for (const i of labels) grid.append(node('line', {x1: x(i), x2: x(i), y1: y0, y2: y0 + height}));
    grid.append(node('rect', {x: padL, y: y0, width: plotW, height, class: 'rc-frame'}));
  }
  svg.append(grid);
  // x-axis: day of month, with the month and year under the first labelled day of each month.
  let month = '';
  const yAxis = top + H1 + gap + H2 + 16;
  for (const i of labels) {
    const [yy, mm, dd] = dates[i].split('-');
    svg.append(node('text', {x: x(i), y: yAxis, class: 'rc-axis', 'text-anchor': 'middle'}, String(+dd)));
    if (mm + yy !== month) { month = mm + yy; svg.append(node('text', {x: x(i), y: yAxis + 15, class: 'rc-axis', 'text-anchor': 'middle'}, MONTHS[+mm - 1] + ' ' + yy)); }
  }
  const line = (values, s, cls) => node('polyline', {points: values.map((v, i) => x(i).toFixed(1) + ',' + s.y(v).toFixed(1)).join(' '), class: cls});
  svg.append(node('line', {x1: padL, x2: padL + plotW, y1: s1.y(0), y2: s1.y(0), class: 'rc-zero'}));
  svg.append(line(b, s1, 'rc-bmrk'), line(a, s1, 'rc-port'));
  // Difference: one area drawn twice, clipped above (ahead) and below (behind) the zero line.
  const zero = s2.y(0), id = 'rc' + Math.random().toString(36).slice(2, 8);
  const area = 'M' + x(0) + ',' + zero + ' ' + diff.map((v, i) => 'L' + x(i).toFixed(1) + ',' + s2.y(v).toFixed(1)).join(' ') + ' L' + x(n - 1) + ',' + zero + ' Z';
  const defs = node('defs');
  defs.append(node('clipPath', {id: id + 'u'}), node('clipPath', {id: id + 'd'}));
  defs.firstChild.append(node('rect', {x: padL, y: top + H1 + gap, width: plotW, height: Math.max(0, zero - (top + H1 + gap))}));
  defs.lastChild.append(node('rect', {x: padL, y: zero, width: plotW, height: Math.max(0, top + H1 + gap + H2 - zero)}));
  svg.append(defs, node('path', {d: area, class: 'rc-ahead', 'clip-path': `url(#${id}u)`}), node('path', {d: area, class: 'rc-behind', 'clip-path': `url(#${id}d)`}));
  svg.append(node('line', {x1: padL, x2: padL + plotW, y1: zero, y2: zero, class: 'rc-zero'}), line(diff, s2, 'rc-diff'));
  // Values at the right edge, kept apart when close.
  let ya = s1.y(a.at(-1)), yb = s1.y(b.at(-1));
  if (Math.abs(ya - yb) < 18) { const mid = (ya + yb) / 2, up = ya <= yb ? -9 : 9; ya = mid + up; yb = mid - up; }
  const tag = (y, value, cls) => {
    const g = node('g', {class: cls});
    g.append(node('rect', {x: padL + plotW + 2, y: y - 9, width: padR - 4, height: 18, rx: 2}), node('text', {x: padL + plotW + 6, y: y + 4}, fmt(value)));
    return g;
  };
  svg.append(tag(yb, b.at(-1), 'rc-tag-bmrk'), tag(ya, a.at(-1), 'rc-tag-port'), tag(s2.y(diff.at(-1)), diff.at(-1), 'rc-tag-diff'));
  // Legends, top right of each panel.
  const legend = (rows, y0) => {
    const g = node('g', {class: 'rc-legend'}), widest = Math.max(...rows.map(r => r[0].length)) * 7 + 70;
    const x0 = padL + plotW - widest - 8;
    g.append(node('rect', {x: x0, y: y0 + 6, width: widest, height: rows.length * 17 + 6, class: 'rc-legend-box'}));
    rows.forEach(([label, value, cls], k) => {
      g.append(node('rect', {x: x0 + 6, y: y0 + 13 + k * 17, width: 9, height: 9, class: cls}));
      g.append(node('text', {x: x0 + 20, y: y0 + 21 + k * 17}, label));
      g.append(node('text', {x: x0 + widest - 6, y: y0 + 21 + k * 17, 'text-anchor': 'end'}, fmt(value)));
    });
    return g;
  };
  svg.append(legend([[labelA, a.at(-1), 'rc-key-port'], [labelB, b.at(-1), 'rc-key-bmrk']], top));
  svg.append(legend([['Performance difference', diff.at(-1), 'rc-key-diff']], top + H1 + gap));
  // Hover: a guide line and the day's values.
  const hover = node('g', {class: 'rc-hover', visibility: 'hidden'});
  const guide = node('line', {y1: top, y2: top + H1 + gap + H2});
  const box = node('rect', {width: 196, height: 72, rx: 3}), tip = node('text');
  hover.append(guide, box, tip);
  const hit = node('rect', {x: padL, y: top, width: plotW, height: H1 + gap + H2, class: 'rc-hit'});
  const show = event => {
    const r = svg.getBoundingClientRect(), px = (event.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - padL) / plotW * (n - 1))));
    const gx = x(i), bx = gx + 206 > padL + plotW ? gx - 206 : gx + 10;
    guide.setAttribute('x1', gx); guide.setAttribute('x2', gx);
    box.setAttribute('x', bx); box.setAttribute('y', top + 8);
    tip.replaceChildren(...[dates[i], labelA + ' ' + fmt(a[i]), labelB + ' ' + fmt(b[i]), 'Difference ' + fmt(diff[i])].map((t, k) =>
      node('tspan', {x: bx + 8, y: top + 25 + k * 15}, t.length > 30 ? t.slice(0, 29) + '…' : t)));
    hover.setAttribute('visibility', 'visible');
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => hover.setAttribute('visibility', 'hidden'));
  svg.append(hover, hit);
  root.append(heading, svg);
}
