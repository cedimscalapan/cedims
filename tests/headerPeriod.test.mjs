import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const compilerOptions={module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022};
const url=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions}).outputText).toString('base64')}`;
const deadline=url(readFileSync('src/lib/utils/deadlineRules.ts','utf8'));
const headerUrl=url(readFileSync('src/lib/utils/headerPeriod.ts','utf8').replace("from './deadlineRules'",`from '${deadline}'`));
const {readHeaderPeriod,resolveHeaderUploadPeriod,resolveUniqueOpenUploadPeriod}=await import(headerUrl);
const year='2026-2027';
const entry=(id,term,week,date,active=true)=>({id,term,week_number:week,deadline_date:date,is_active:active,school_year:year});
const calendar=[entry('oct26',2,7,'2026-10-26T02:00:00Z'),entry('nov2',2,8,'2026-11-02T02:00:00Z')];
const match=(text,rows=calendar,extra={})=>resolveHeaderUploadPeriod(text,rows,{schoolYear:year,subject:'Mathematics',...extra});
test('explicit header term and week select the exact Open entry',()=>{
 assert.equal(match('Term 2\nWeek 7').id,'oct26');assert.equal(match('Ikalawang Markahan\nIka-7 Linggo').id,'oct26');
});
test('October 25 header date matches the October 26 deadline',()=>{
 for(const text of ['Teaching Date: October 25, 2026','Petsa: Oct.25,2026','Date: October 25'])assert.equal(match(text).id,'oct26');
});
test('date fallback includes three days late, but not four days late for that entry',()=>{
 for(const day of [26,27,28,29])assert.equal(match(`Date: October ${day}, 2026`,[calendar[0]]).id,'oct26');
 assert.equal(match('Date: October 30, 2026',[calendar[0]]),null);
});
test('late dates match the original deadline instead of the next week',()=>{
 assert.equal(match('Date: October 28, 2026').id,'oct26');assert.equal(match('Date: October 29, 2026').id,'oct26');
});
test('explicit term/week wins over a conflicting date hint',()=>{
 assert.equal(match('Term 2\nWeek 8\nDate: October 25, 2026').id,'nov2');
});
test('a closed explicit period is never redirected into another Open week',()=>{
 assert.equal(match('Term 2\nWeek 7\nDate: November 1, 2026',[{...calendar[0],is_active:false},calendar[1]]),null);
});
test('date matching excludes Closed entries and other school years',()=>{
 assert.equal(match('Date: October 25, 2026',[{...calendar[0],is_active:false}]),null);
 assert.equal(match('Date: October 25, 2026',[{...calendar[0],school_year:'2025-2026'}]),null);
});
test('week numbers repeated in different terms are disambiguated with header dates',()=>{
 const rows=[entry('early',1,7,'2026-09-07T02:00:00Z'),calendar[0]];
 assert.equal(match('Week 7',rows),null);assert.equal(match('Week 7\nDate: October 25, 2026',rows).id,'oct26');
});
test('a week without a term does not invent a term number',()=>{
 assert.equal(readHeaderPeriod('Week 7').termNumber,null);
});
test('date ranges spanning the deadline match that week',()=>{
 assert.equal(match('Teaching Dates: October 25-29, 2026').id,'oct26');
 assert.equal(match('Teaching Dates: October 30-November 3, 2026').id,'nov2');
});
test('dates without a year use the available calendar year across New Year',()=>{
 const rows=[entry('jan4',2,16,'2027-01-04T02:00:00Z')];assert.equal(match('Date: January 3',rows).id,'jan4');assert.equal(match('Date: December 31',rows).id,'jan4');
});
test('explicit wrong year or impossible date cannot be silently reassigned',()=>{
 assert.equal(match('Date: October 25,2025'),null);assert.equal(match('Date: February 30,2027',[entry('mar1',3,25,'2027-03-01T02:00:00Z')]),null);
});
test('conflicting header terms/weeks and tied date matches require confirmation',()=>{
 assert.equal(match('Term 1\nTerm 2\nWeek 7\nDate: October 25,2026'),null);
 assert.equal(match('Week 7\nWeek 8\nDate: October 25,2026'),null);
 assert.equal(match('Date: October 25,2026',[calendar[0],{...calendar[0],id:'duplicate',term:1}]),null);
});
test('lesson-body references do not supply a header period',()=>{
 assert.equal(match('DAILY LESSON LOG\nI. OBJECTIVES\nTerm 2 Week 7\nOctober 25,2026'),null);
});
test('ISO and unambiguous numeric dates are accepted; ambiguous dates require confirmation',()=>{
 assert.equal(match('Date: 2026-10-25').id,'oct26');assert.equal(match('Date: 10/25/2026').id,'oct26');assert.equal(match('Petsa: 25/10/2026').id,'oct26');assert.equal(match('Date: 10/11/2026'),null);
});
test('subject-specific deadlines use the same Philippine dates as the displayed calendar',()=>{
 assert.equal(match('Date: October 30,2026',[calendar[0]],{subject:'HGP',schoolName:'Other School'}).id,'oct26');
 assert.equal(match('Date: October 31,2026',[calendar[0]],{subject:'HGP',schoolName:'Other School'}),null);
});
test('an explicit different school year cannot select current-year records',()=>{
 assert.equal(match('School Year: 2025-2026\nTerm 2 Week 7\nOctober 25'),null);
});

test('a Closed original deadline cannot be silently reassigned to the next Open week',()=>{
 assert.equal(match('Date: October 28,2026',[{...calendar[0],is_active:false},calendar[1]]),null);
});
test('unreadable term and week fall back to the single Open period in this school year',()=>{
 const rows=[{...calendar[0],is_active:false},calendar[1],{...calendar[0],id:'last-year',school_year:'2025-2026',is_active:true}];
 assert.equal(resolveUniqueOpenUploadPeriod('DAILY LESSON LOG\nGrade Level: Kinder',rows,year)?.id,'nov2');
 assert.equal(resolveUniqueOpenUploadPeriod('Term 2',rows,year)?.id,'nov2');
 assert.equal(resolveUniqueOpenUploadPeriod('Week 8',rows,year)?.id,'nov2');
 assert.equal(resolveUniqueOpenUploadPeriod('Teaching Date: October 10, 2026',rows,year)?.id,'nov2');
});
test('open-period fallback never overrides explicit conflicts or guesses between multiple Open weeks',()=>{
 const one=[{...calendar[0],is_active:false},calendar[1]];
 for(const text of ['Term 1','Week 7','Term 2\nWeek 7','Date: October 28, 2026','Date: October 25, 2025','Term 1\nTerm 2','School Year: 2025-2026'])
  assert.equal(resolveUniqueOpenUploadPeriod(text,one,year),null,text);
 assert.equal(resolveUniqueOpenUploadPeriod('DAILY LESSON LOG',calendar,year),null);
 assert.equal(resolveUniqueOpenUploadPeriod('DAILY LESSON LOG',[{...calendar[0],is_active:false}],year),null);
 assert.equal(resolveUniqueOpenUploadPeriod('DAILY LESSON LOG',[{...calendar[0],is_active:true,school_year:'2025-2026'}],year),null);
});
