import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateRange } from '../site/ranges.mjs';
test('One Day uses the latest observed completed price date', () => {
  assert.deepEqual(dateRange('day', ['2026-10-02', '2026-10-06']), {start:'2026-10-06',end:'2026-10-06',anchor:'2026-10-06'});
});
test('previous week ends on observed Friday, not an unpriced Sunday', () => {
  const r = dateRange('last-week', ['2026-10-02', '2026-10-05', '2026-10-06']);
  assert.equal(r.start,'2026-09-28'); assert.equal(r.end,'2026-10-02');
});
test('month and quarter boundaries do not wrap on month-end dates', () => {
  assert.equal(dateRange('last-month', ['2026-03-31']).start,'2026-02-01');
  assert.equal(dateRange('last-month', ['2026-03-31']).end,'2026-02-28');
  assert.equal(dateRange('last-3-months', ['2026-01-30']).start,'2025-10-01');
  assert.equal(dateRange('qtd', ['2026-10-06']).start,'2026-10-01');
});
test('year ranges retain missing requested history instead of truncating', () => {
  assert.equal(dateRange('ytd',['2026-10-06']).start,'2026-01-01');
  assert.equal(dateRange('last-year',['2026-10-06']).end,'2025-12-31');
  assert.equal(dateRange('custom',['2026-10-06']),null);
  assert.equal(dateRange('day',[]),null);
});
