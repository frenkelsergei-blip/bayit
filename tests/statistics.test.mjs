import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySeries,periodDays} from '../app/src/statistics.js';
test('series includes the selected final day and reconciles with its records',()=>{
 const records=[{date:'2026-11-05'},{date:'2026-11-06'},{date:'2026-11-06'}];
 const series=dailySeries(records,7,'2026-11-06');
 assert.equal(series.at(-1).date,'2026-11-06');assert.equal(series.at(-1).count,2);
 assert.equal(series.reduce((s,r)=>s+r.count,0),3);
});
test('all-history buckets include old records as well as the latest day',()=>{
 const records=[{date:'2024-01-01'},{date:'2025-05-03'},{date:'2026-11-06'}];
 const series=dailySeries(records,'all','2026-11-06');
 assert.ok(series.length<=30);assert.equal(series[0].date,'2024-01-01');assert.equal(series.at(-1).endDate,'2026-11-06');assert.equal(series.reduce((s,r)=>s+r.count,0),3);
 assert.equal(periodDays(records,'30','2026-11-06'),30);
});
