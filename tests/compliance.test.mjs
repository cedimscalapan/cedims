import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const code = ts.transpileModule(readFileSync(new URL('../src/lib/utils/compliance.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildRequirements, scopedCalendar, summarizeRequirements, riskReason, fetchAllRows } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const now = Date.parse('2026-09-27T12:00:00Z');
const load = { id: 'load', user_id: 'teacher', subject: 'English', grade_level: 'Grade 5' };
const calendar = [1, 2, 3].map(term => ({ id: `c${term}`, school_year: '2026-2027', term, week_number: 1, deadline_date: term === 3 ? '2026-12-01T12:00:00Z' : '2026-09-01T12:00:00Z', is_active: true }));
const sub = { id: 's', user_id: 'teacher', teaching_load_id: 'load', school_year: '2026-2027', term_number: 2, week_number: 1, doc_type: 'DLL', compliance_status: 'late', created_at: '2026-09-02T12:00:00Z' };
test('Term 2 Week 1 never fulfills Term 1 Week 1', () => {
    const rows = buildRequirements([load], calendar, [sub], [], now);
    assert.deepEqual(rows.map(r => r.status), ['missing', 'late', 'upcoming']);
    const summary = summarizeRequirements(rows, now);
    assert.equal(summary.submitted, 1); assert.equal(summary.rate, 33); assert.equal(summary.dueRate, 50);
});
test('duplicate, supplementary and missing records cannot inflate fulfillment', () => {
    const rows = buildRequirements([load], calendar, [sub, { ...sub, id: 'duplicate' }, { ...sub, id: 'extra', term_number: 1, compliance_status: 'supplementary' }, { ...sub, id: 'missing', term_number: 3, compliance_status: 'missing' }], [], now);
    assert.equal(summarizeRequirements(rows, now).submitted, 1);
});
test('review status uses approved/returned, independently of lateness', () => {
    for (const status of ['approved', 'returned', 'needs-check']) {
        const rows = buildRequirements([load], calendar, [sub], [{ submission_id: 's', status }], now);
        assert.equal(rows[1].review, status); assert.equal(rows[1].status, 'late');
    }
});
test('ambiguous legacy week is not credited to multiple terms', () => {
    const legacy = { ...sub, term_number: null };
    assert.equal(summarizeRequirements(buildRequirements([load], calendar, [legacy], [], now), now).submitted, 0);
    assert.equal(buildRequirements([load], calendar, [{ ...legacy, calendar_id: 'c2' }], [], now)[1].status, 'late');
    assert.equal(buildRequirements([load], calendar, [{ ...legacy, file_path: 'DLL/Term_2/Week_1/a.pdf' }], [], now)[1].status, 'late');
});
test('explicit term takes precedence over stale calendar link', () => {
    const rows = buildRequirements([load], calendar, [{ ...sub, calendar_id: 'c1' }], [], now);
    assert.equal(rows[0].status, 'missing'); assert.equal(rows[1].status, 'late');
});
test('inactive loads, other years and administrative documents do not count', () => {
    assert.equal(buildRequirements([{ ...load, is_active: false }], calendar, [sub], [], now).length, 0);
    for (const wrong of [{ ...sub, school_year: '2025-2026' }, { ...sub, doc_type: 'ISP' }]) assert.equal(summarizeRequirements(buildRequirements([load], calendar, [wrong], [], now), now).submitted, 0);
});
test('same subject in different grades is two requirements', () => {
    const rows = buildRequirements([load, { ...load, id: 'grade6', grade_level: 'Grade 6' }], [calendar[1]], [sub], [], now);
    assert.equal(rows.length, 2); assert.equal(rows[1].status, 'missing');
});
test('district calendar overrides global duplicate and excludes other districts', () => {
    const district = { ...calendar[0], id: 'district', district_id: 'd1' };
    const rows = scopedCalendar([calendar[0], district, { ...calendar[1], district_id: 'd2' }], 'd1');
    assert.deepEqual(rows, [district]);
});
test('zero requirements has no misleading percentage; future work is not at risk', () => {
    assert.equal(summarizeRequirements([], now).rate, null);
    assert.equal(riskReason(buildRequirements([load], [calendar[2]], [], [], now)), '');
    assert.match(riskReason(buildRequirements([load], calendar, [], [], now)), /2 weeks/);
});
test('report fetching reads beyond API page limits and propagates errors', async () => {
    let calls = 0;
    const rows = await fetchAllRows(() => ({ range: async (start) => { calls++; return { data: start === 0 ? Array(500).fill({}) : [{}] }; } }));
    assert.equal(rows.length, 501); assert.equal(calls, 2);
    await assert.rejects(() => fetchAllRows(() => ({ range: async () => ({ error: new Error('denied') }) })), /denied/);
});
