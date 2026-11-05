import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const compilerOptions = { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 };
const url = source => `data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions }).outputText).toString('base64')}`;
const deadlines = url(readFileSync('src/lib/utils/deadlineRules.ts', 'utf8'));
const { buildRequirements, summarizeRequirements, leaveCoversDeadline } = await import(url(readFileSync('src/lib/utils/compliance.ts', 'utf8').replace("from './deadlineRules'", `from '${deadlines}'`)));
const { phDateKey } = await import(deadlines);
const dates = await import(url(readFileSync('src/lib/utils/leaveDates.ts', 'utf8')));

const year = '2026-2027';
// Week of Monday, November 2, 2026. The calendar stores the deadline as a Philippine date.
const week = { id: 'w', school_year: year, term: 2, week_number: 8, deadline_date: '2026-11-01T16:00:00Z', is_active: true };
const math = { id: 'math', user_id: 't', subject: 'Mathematics', grade_level: 'Grade 5' };
const math6 = { id: 'math6', user_id: 't', subject: 'Mathematics', grade_level: 'Grade 6' };
const mapeh = { id: 'mapeh', user_id: 't', subject: 'MAPEH', grade_level: 'Grade 5' };
const after = Date.parse('2026-11-05T02:00:00Z');
const leave = (start_date, end_date, status = 'approved', extra = {}) => ({ id: `${start_date}-${status}`, user_id: 't', teaching_load_id: null, term_number: null, week_number: null, school_year: year, start_date, end_date, status, ...extra });
const statuses = rows => Object.fromEntries(rows.map(row => [row.load.id, row.status]));

test('approved Monday to Wednesday leave excuses every subject and grade that week', () => {
    const rows = buildRequirements([math, math6, mapeh], [week], [], [], after, [leave('2026-11-02', '2026-11-04')]);
    assert.deepEqual(statuses(rows), { math: 'on-leave', math6: 'on-leave', mapeh: 'on-leave' });
    const summary = summarizeRequirements(rows, after);
    assert.equal(summary.expected, 0);
    assert.equal(summary.missing, 0);
    assert.equal(summary.onLeave, 3);
});

test('Tuesday-only leave excuses Tuesday deadlines but not work due on Monday', () => {
    const rows = buildRequirements([math, mapeh], [week], [], [], after, [leave('2026-11-03', '2026-11-03')]);
    assert.deepEqual(statuses(rows), { math: 'missing', mapeh: 'on-leave' });
});

test('leave with no deadline inside its dates does not change compliance', () => {
    const rows = buildRequirements([math, mapeh], [week], [], [], after, [leave('2026-11-04', '2026-11-05')]);
    assert.deepEqual(statuses(rows), { math: 'missing', mapeh: 'missing' });
});

test('Friday HGP deadlines at Bulusan follow the same rule', () => {
    const hgp = { id: 'hgp', user_id: 't', subject: 'HGP', grade_level: 'Grade 5', school_name: 'Bulusan Elementary School' };
    assert.equal(leaveCoversDeadline(leave('2026-11-06', '2026-11-06'), week.deadline_date, hgp.subject, hgp.school_name), true);
    assert.equal(leaveCoversDeadline(leave('2026-11-06', '2026-11-06'), week.deadline_date, math.subject), false);
    assert.equal(buildRequirements([hgp], [week], [], [], Date.parse('2026-11-07T00:00:00Z'), [leave('2026-11-06', '2026-11-06')])[0].status, 'on-leave');
});

test('pending stays expected, cancelled is ignored, and declined becomes overdue', () => {
    const pending = buildRequirements([math], [week], [], [], after, [leave('2026-11-02', '2026-11-02', 'pending')]);
    assert.equal(pending[0].status, 'leave-requested');
    assert.equal(summarizeRequirements(pending, after).expected, 1);
    assert.equal(buildRequirements([math], [week], [], [], after, [leave('2026-11-02', '2026-11-02', 'cancelled')])[0].status, 'missing');
    const declined = buildRequirements([math], [week], [], [], after, [leave('2026-11-02', '2026-11-02', 'rejected')]);
    assert.equal(declined[0].status, 'missing');
    assert.equal(declined[0].leaveRequest.status, 'rejected');
    assert.equal(buildRequirements([math], [week], [], [], Date.parse('2026-10-30T00:00:00Z'), [leave('2026-11-02', '2026-11-02', 'rejected')])[0].status, 'leave-rejected');
});

test('an approved request outranks an older declined one over the same dates', () => {
    const rows = buildRequirements([math], [week], [], [], after, [leave('2026-11-02', '2026-11-02', 'rejected'), leave('2026-11-02', '2026-11-03', 'approved')]);
    assert.equal(rows[0].status, 'on-leave');
});

test('supplementary uploads are untouched and never satisfy or cancel a leave', () => {
    const supplementary = { id: 's', user_id: 't', teaching_load_id: 'math', school_year: year, term_number: 2, week_number: 8, doc_type: 'DLL', compliance_status: 'supplementary', created_at: '2026-11-03T02:00:00Z' };
    const rows = buildRequirements([math], [week], [supplementary], [], after, [leave('2026-11-02', '2026-11-02')]);
    assert.equal(rows[0].status, 'on-leave');
    assert.equal(rows[0].submission, undefined);
});

test('a counted document uploaded after approved leave is not marked late', () => {
    const late = { id: 'd', user_id: 't', teaching_load_id: 'math', school_year: year, term_number: 2, week_number: 8, doc_type: 'DLL', compliance_status: 'late', created_at: '2026-11-04T02:00:00Z' };
    assert.equal(buildRequirements([math], [week], [late], [], after, [leave('2026-11-02', '2026-11-03')])[0].status, 'on-time');
    assert.equal(buildRequirements([math], [week], [late], [], after, [leave('2026-11-02', '2026-11-03', 'pending')])[0].status, 'late');
    assert.equal(buildRequirements([math], [week], [late], [], after, [])[0].status, 'late');
});

test('another teacher\'s leave and older per-subject requests keep their own scope', () => {
    const other = leave('2026-11-02', '2026-11-02', 'approved', { user_id: 'someone-else' });
    assert.equal(buildRequirements([math], [week], [], [], after, [other])[0].status, 'missing');
    const legacy = { id: 'l', user_id: 't', teaching_load_id: 'math', school_year: year, term_number: 2, week_number: 8, status: 'approved' };
    assert.deepEqual(statuses(buildRequirements([math, math6], [week], [], [], after, [legacy])), { math: 'on-leave', math6: 'missing' });
});

test('dates stay on the chosen Philippine day and show the day and month', () => {
    assert.equal(phDateKey('2026-11-01T16:00:00Z'), '2026-11-02');
    assert.equal(dates.mondayOf('2026-11-05'), '2026-11-02');
    assert.equal(dates.mondayOf('2026-11-08'), '2026-11-02');
    assert.deepEqual(dates.schoolWeek('2026-11-02').map(day => `${day.shortWeekday} ${day.date}`), ['Mon Nov 2', 'Tue Nov 3', 'Wed Nov 4', 'Thu Nov 5', 'Fri Nov 6']);
    assert.equal(dates.weekRangeLabel('2026-11-02'), 'Nov 2 to 6, 2026');
    assert.equal(dates.weekRangeLabel('2026-11-30'), 'Nov 30 to Dec 4, 2026');
    assert.equal(dates.formatLeaveRange('2026-11-02', '2026-11-04'), 'Monday, November 2 to Wednesday, November 4, 2026 (3 school days)');
    assert.equal(dates.formatLeaveRange('2026-11-02', '2026-11-02'), 'Monday, November 2, 2026 (1 school day)');
    assert.equal(dates.countSchoolDays('2026-11-06', '2026-11-09'), 2);
});

test('tapping days picks a start, then an end, then starts over', () => {
    let range = dates.nextLeaveSelection('', '', '2026-11-02');
    assert.deepEqual(range, { start: '2026-11-02', end: '2026-11-02' });
    range = dates.nextLeaveSelection(range.start, range.end, '2026-11-04');
    assert.deepEqual(range, { start: '2026-11-02', end: '2026-11-04' });
    range = dates.nextLeaveSelection(range.start, range.end, '2026-11-03');
    assert.deepEqual(range, { start: '2026-11-03', end: '2026-11-03' });
    assert.deepEqual(dates.nextLeaveSelection('2026-11-04', '2026-11-04', '2026-11-02'), { start: '2026-11-02', end: '2026-11-02' });
    assert.equal(dates.rangesOverlap('2026-11-02', '2026-11-04', '2026-11-04', '2026-11-05'), true);
    assert.equal(dates.rangesOverlap('2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'), false);
});
