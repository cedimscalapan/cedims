import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const deadlineCode = ts.transpileModule(readFileSync(new URL('../src/lib/utils/deadlineRules.ts', import.meta.url), 'utf8'), { compilerOptions }).outputText;
const deadlineModuleUrl = `data:text/javascript;base64,${Buffer.from(deadlineCode).toString('base64')}`;
const complianceSource = readFileSync(new URL('../src/lib/utils/compliance.ts', import.meta.url), 'utf8')
    .replace("import { effectiveDeadlineForSubject } from './deadlineRules';", `import { effectiveDeadlineForSubject } from '${deadlineModuleUrl}';`);
const code = ts.transpileModule(complianceSource, { compilerOptions }).outputText;
const { buildRequirements, scopedCalendar, summarizeRequirements, summarizeSubmissionReviews, documentTypeCounts, riskReason, fetchAllRows, currentCompliancePeriod, previousPeriodChange, isWeeklyComplianceDocType } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const now = Date.parse('2026-09-27T12:00:00Z');
const load = { id: 'load', user_id: 'teacher', subject: 'English', grade_level: 'Grade 5' };
const calendar = [1, 2, 3].map(term => ({ id: `c${term}`, school_year: '2026-2027', term, week_number: 1, deadline_date: term === 3 ? '2026-12-01T12:00:00Z' : '2026-09-01T12:00:00Z', is_active: true }));
const sub = { id: 's', user_id: 'teacher', teaching_load_id: 'load', school_year: '2026-2027', term_number: 2, week_number: 1, doc_type: 'DLL', compliance_status: 'late', created_at: '2026-09-02T12:00:00Z' };
test('current period selects next deadline and falls back to final scheduled week', () => {
    assert.deepEqual(currentCompliancePeriod(calendar, now), { term: '3', week: '1' });
    assert.deepEqual(currentCompliancePeriod(calendar, Date.parse('2030-01-01')), { term: '3', week: '1' });
    assert.deepEqual(currentCompliancePeriod([], now), { term: 'all', week: 'all' });
});
test('only Bulusan and Guinobatan HGP are due Friday at 10 AM Manila time', async () => {
    const { effectiveDeadlineForSubject } = await import(deadlineModuleUrl);
    const monday = '2026-10-19T02:00:00.000Z';
    assert.equal(effectiveDeadlineForSubject(monday, 'HGP', 'Bulusan Elementary School').toISOString(), '2026-10-23T02:00:00.000Z');
    assert.equal(effectiveDeadlineForSubject(monday, 'HGP', 'Guinobatan Elementary School').toISOString(), '2026-10-23T02:00:00.000Z');
    assert.equal(effectiveDeadlineForSubject(monday, 'HGP', 'Guinobatan ES').toISOString(), '2026-10-23T02:00:00.000Z');
    assert.equal(effectiveDeadlineForSubject(monday, 'HGP', 'Ibaba Elementary School').toISOString(), '2026-10-20T02:00:00.000Z');
    assert.equal(effectiveDeadlineForSubject(monday, 'HGP', 'Salong Elementary School').toISOString(), '2026-10-20T02:00:00.000Z');
    assert.equal(effectiveDeadlineForSubject(monday, 'MAPEH', 'Bulusan Elementary School').toISOString(), '2026-10-20T02:00:00.000Z');
});
test('every school and subject uses the same effective deadline for pending and submitted work', async () => {
    const { effectiveDeadlineForSubject } = await import(deadlineModuleUrl);
    const schools = ['Bulusan Elementary School', 'Guinobatan Elementary School', 'Ibaba Elementary School', 'Salong Elementary School', 'Suqui Elementary School'];
    const week = { ...calendar[0], term: 2, week_number: 7, deadline_date: '2026-10-26T02:00:00.000Z' };
    const wednesday = Date.parse('2026-10-28T02:00:00.000Z');
    for (const school_name of schools) {
        for (const subject of ['HGP', 'Makabansa', 'MAPEH', 'Filipino']) {
            const fridayHgp = subject === 'HGP' && /^(Bulusan|Guinobatan)/.test(school_name);
            const expectedDeadline = fridayHgp ? '2026-10-30T02:00:00.000Z'
                : subject === 'Filipino' ? '2026-10-26T02:00:00.000Z' : '2026-10-27T02:00:00.000Z';
            const assignedLoad = { ...load, subject, school_name };
            assert.equal(effectiveDeadlineForSubject(week.deadline_date, subject, school_name).toISOString(), expectedDeadline);
            const pending = buildRequirements([assignedLoad], [week], [], [], wednesday)[0];
            assert.equal(pending.status, fridayHgp ? 'upcoming' : 'missing', `${school_name} ${subject} pending`);
            const submitted = buildRequirements([assignedLoad], [week], [{ ...sub, term_number: 2, week_number: 7, created_at: '2026-10-28T02:00:00.000Z', compliance_status: 'compliant' }], [], wednesday)[0];
            assert.equal(submitted.status, fridayHgp ? 'on-time' : 'late', `${school_name} ${subject} submitted`);
        }
    }
});
test('Bulusan HGP uploads remain on time through Friday while other school rules stay intact', () => {
    const week = { ...calendar[0], term: 1, week_number: 1, deadline_date: '2026-10-19T02:00:00Z' };
    const hgpLoad = { ...load, subject: 'HGP', school_name: 'Bulusan Elementary School' };
    const submission = { ...sub, term_number: 1, week_number: 1, created_at: '2026-10-20T03:00:00Z', compliance_status: 'late' };
    const rows = buildRequirements([hgpLoad], [week], [submission]);
    assert.equal(rows[0].status, 'on-time');
    const otherSchoolRows = buildRequirements([{ ...hgpLoad, school_name: 'Salong Elementary School' }], [week], [submission]);
    assert.equal(otherSchoolRows[0].status, 'late');

    const guinobatanLoad = { ...hgpLoad, school_name: 'Guinobatan Elementary School' };
    const guinobatanRows = buildRequirements([guinobatanLoad], [week], [submission]);
    assert.equal(guinobatanRows[0].status, 'on-time');
});
test('Guinobatan HGP is upcoming on Wednesday before its Friday 10 AM deadline, then missing after it', () => {
    const week = { ...calendar[0], term: 2, week_number: 6, deadline_date: '2026-10-19T02:00:00.000Z' };
    const guinobatanHgp = { ...load, subject: 'HGP', school_name: 'Guinobatan Elementary School' };
    const wednesdayElevenAMManila = Date.parse('2026-10-21T03:00:00.000Z');
    const beforeDeadline = buildRequirements([guinobatanHgp], [week], [], [], wednesdayElevenAMManila);
    assert.equal(beforeDeadline[0].status, 'upcoming');
    assert.equal(summarizeRequirements(beforeDeadline).missing, 0);

    const afterDeadline = buildRequirements([guinobatanHgp], [week], [], [], Date.parse('2026-10-23T02:00:01.000Z'));
    assert.equal(afterDeadline[0].status, 'missing');
    assert.equal(summarizeRequirements(afterDeadline).missing, 1);
});
test('comparison crosses term boundaries and excludes aggregate/first periods', () => {
    const rows = buildRequirements([load], calendar, [sub], [], now);
    assert.equal(previousPeriodChange(rows, '2', '1'), 100);
    assert.equal(previousPeriodChange(rows, '1', '1'), null);
    assert.equal(previousPeriodChange(rows, 'all', 'all'), null);
});
test('Term 2 Week 1 never fulfills Term 1 Week 1', () => {
    const rows = buildRequirements([load], calendar, [sub], [], now);
    assert.deepEqual(rows.map(r => r.status), ['missing', 'late', 'upcoming']);
    const summary = summarizeRequirements(rows, now);
    assert.equal(summary.submitted, 1); assert.equal(summary.rate, 33); assert.equal(summary.dueRate, 50);
});
test('selected week can count every no-DLL requirement as missing for action stats', () => {
    const futureWeek = [{ ...calendar[2], id: 'past-week', term: 1, week_number: 1, deadline_date: '2026-09-01T12:00:00Z' }];
    const rows = buildRequirements([
        load,
        { ...load, id: 'math', subject: 'Math' },
        { ...load, id: 'science', subject: 'Science' },
    ], futureWeek, [{ ...sub, term_number: 1, week_number: 1 }], [], now);
    const summary = summarizeRequirements(rows, now, true);
    assert.equal(summary.expected, 3);
    assert.equal(summary.submitted, 1);
    assert.equal(summary.missing, 2);
});
test('duplicate, supplementary and missing records cannot inflate fulfillment', () => {
    const rows = buildRequirements([load], calendar, [sub, { ...sub, id: 'duplicate' }, { ...sub, id: 'extra', term_number: 1, compliance_status: 'supplementary' }, { ...sub, id: 'missing', term_number: 3, compliance_status: 'missing' }], [], now);
    assert.equal(summarizeRequirements(rows, now).submitted, 1);
});
test('supplementary uploads require remarks but do not fulfill requirements', () => {
    const extra = { ...sub, id: 'extra', term_number: 1, compliance_status: 'supplementary' };
    const rows = buildRequirements([load], [calendar[0]], [extra], [], now);
    assert.equal(summarizeRequirements(rows, now).submitted, 0);
    assert.deepEqual(summarizeSubmissionReviews([extra], []), { forChecking: 1, checked: 0, reviewable: 1 });
    assert.deepEqual(summarizeSubmissionReviews([extra], [{ submission_id: 'extra', reviewer_comment: 'checked' }]), { forChecking: 0, checked: 1, reviewable: 1 });
});
test('ISP and ISR uploads do not require checking remarks', () => {
    const isp = { ...sub, id: 'isp', doc_type: 'ISP', compliance_status: 'compliant' };
    const isr = { ...sub, id: 'isr', doc_type: 'ISR', compliance_status: 'late' };
    assert.deepEqual(summarizeSubmissionReviews([isp, isr], [{ submission_id: 'isr', reviewer_comment: 'checked' }]), { forChecking: 0, checked: 0, reviewable: 0 });
});
test('document type totals include ISP and ISR uploads', () => {
    assert.deepEqual(documentTypeCounts([
        { ...sub, id: 'dll', doc_type: 'DLL' },
        { ...sub, id: 'isp', doc_type: 'ISP' },
        { ...sub, id: 'isr', doc_type: 'ISR' },
    ]), [{ label: 'DLP', value: 1 }, { label: 'ISP', value: 1 }, { label: 'ISR', value: 1 }]);
});
test('review status uses remarks, independently of lateness', () => {
        for (const remark of ['', 'review comment', '  ']) {
            const rows = buildRequirements([load], calendar, [sub], [{ submission_id: 's', reviewer_comment: remark }], now);
            assert.equal(rows[1].review, remark.trim() ? 'checked' : 'for-checking'); assert.equal(rows[1].status, 'late');
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
test('only DLL and DLP are weekly compliance document types', () => {
    assert.equal(isWeeklyComplianceDocType('DLL'), true);
    assert.equal(isWeeklyComplianceDocType('DLP'), true);
    assert.equal(isWeeklyComplianceDocType('ISP'), false);
    assert.equal(isWeeklyComplianceDocType('ISR'), false);
});
test('same subject in different grades is two requirements', () => {
    const rows = buildRequirements([load, { ...load, id: 'grade6', grade_level: 'Grade 6' }], [calendar[1]], [sub], [], now);
    assert.equal(rows.length, 2); assert.equal(rows[1].status, 'missing');
});
test('Kindergarten learning areas appear separately and a DLP fulfills its assigned load', () => {
    const kinderLoads = [
        { ...load, id: 'kinder-language', grade_level: 'Kinder', subject: 'Literacy, Language, and Communication' },
        { ...load, id: 'kinder-math', grade_level: 'Kindergarten', subject: 'Mathematics' },
    ];
    const kinderSubmission = { ...sub, teaching_load_id: 'kinder-math', doc_type: 'DLP' };
    const rows = buildRequirements(kinderLoads, [calendar[1]], [kinderSubmission], [], now);
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.load.id === 'kinder-language').status, 'missing');
    assert.equal(rows.find(row => row.load.id === 'kinder-math').submission?.id, 's');
    assert.equal(summarizeRequirements(rows, now).submitted, 1);
});
test('district calendar overrides global duplicate and excludes other districts', () => {
    const district = { ...calendar[0], id: 'district', district_id: 'd1' };
    const rows = scopedCalendar([calendar[0], district, { ...calendar[1], district_id: 'd2' }], 'd1');
    assert.deepEqual(rows, [district]);
});
test('closing a calendar period keeps it in compliance history', () => {
    const closed = { ...calendar[0], is_active: false };
    assert.deepEqual(scopedCalendar([closed]), [closed]);
    assert.deepEqual(currentCompliancePeriod([closed], now), { term: '1', week: '1' });
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
