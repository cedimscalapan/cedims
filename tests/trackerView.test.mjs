import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const deadline=url(readFileSync('src/lib/utils/deadlineRules.ts','utf8'));
const view=await import(url(readFileSync('src/lib/utils/trackerView.ts','utf8').replace("from './deadlineRules'",`from '${deadline}'`)));
const compliance=await import(url(readFileSync('src/lib/utils/compliance.ts','utf8').replace("from './deadlineRules'",`from '${deadline}'`)));
const offlineSource=readFileSync('src/lib/utils/offline.ts','utf8');
const {calculateComplianceStatus}=await import(url(`import {effectiveDeadlineForSubject} from '${deadline}';\n`+offlineSource.slice(offlineSource.indexOf('export function calculateComplianceStatus('),offlineSource.indexOf('export { deadlineAtTenAM }'))));
const row=(status,submission=undefined)=>({status,submission,calendar:{deadline_date:'2026-10-26T02:00:00Z'},load:{subject:'Mathematics'},review:'none'});
test('closed periods never appear as pending uploads',()=>{
 assert.equal(view.trackerLabel(row('missing'),false),'Closed');
 assert.equal(view.trackerLabel(row('upcoming'),true),'Pending');
 assert.equal(view.trackerLabel(row('missing'),true),'Overdue · Open');
 assert.equal(view.trackerLabel(row('late',{}),false),'Submitted · Late');
});

test('a Day 1 upload more than three days late still satisfies its original open weekly requirement as late',()=>{
 const submittedAt='2026-11-02T03:00:00Z';
 const calendar={id:'week7',school_year:'2026-2027',term:2,week_number:7,deadline_date:'2026-10-26T02:00:00Z',is_active:true};
 const load={id:'math3',user_id:'teacher',subject:'Mathematics',grade_level:'Grade 3',is_active:true};
 const status=calculateComplianceStatus(new Date(submittedAt),new Date(calendar.deadline_date),load.subject);
 assert.equal(status,'late');
 const submission={id:'day1',user_id:'teacher',teaching_load_id:load.id,school_year:calendar.school_year,term_number:2,week_number:7,doc_type:'DLL',compliance_status:status,created_at:submittedAt};
 const rows=compliance.buildRequirements([load],[calendar],[submission,{...submission,id:'extra',compliance_status:'supplementary'}],[],Date.parse(submittedAt));
 assert.equal(rows[0].status,'late');
 const totals=compliance.summarizeRequirements(rows,Date.parse(submittedAt));
 assert.equal(totals.expected,1);assert.equal(totals.submitted,1);assert.equal(totals.late,1);assert.equal(totals.missing,0);
 assert.equal(view.trackerLabel(rows[0],true),'Submitted · Late');
});
test('unsubmitted work appears before completed work without mutating source',()=>{
 const source=[row('on-time',{}),row('missing'),row('on-leave')];
 assert.equal(view.prioritizeTrackerRows(source)[0].status,'missing');assert.equal(source[0].status,'on-time');
});
test('tracker orders pending work by the subject and school deadline',()=>{
 const friday={...row('upcoming'),load:{subject:'HGP',school_name:'Bulusan Elementary School'}};
 const tuesday={...row('missing'),load:{subject:'MAPEH',school_name:'Bulusan Elementary School'}};
 assert.deepEqual(view.prioritizeTrackerRows([friday,tuesday]),[tuesday,friday]);
});
test('only approved leave reduces expected submissions',()=>{
 const result=compliance.summarizeRequirements([row('leave-requested'),row('on-leave'),row('on-time',{})]);
 assert.equal(result.expected,2);assert.equal(result.submitted,1);assert.equal(result.onLeave,1);assert.equal(result.leavePending,1);
});
test('one current shared remark is selected regardless of reviewer role',()=>{
 const reviews=[{id:'a',reviewer_role:'Master Teacher',created_at:'2026-10-26T01:00:00Z',comment:'Initial guidance'},{id:'b',reviewer_role:'School Head',created_at:'2026-10-26T02:00:00Z',comment:'Updated shared guidance'}];
 assert.equal(view.currentDocumentReview(reviews).comment,'Updated shared guidance');
 assert.equal(view.documentReviewLabel(reviews),'Checked');assert.equal(view.documentReviewLabel([]),'For checking');
 assert.equal(reviews.length,2);assert.equal(reviews[0].id,'a');
});
test('reviews allow optional guidance and reject revision requests',()=>{
 assert.ok(view.validateReview('needs-revision','   '));assert.equal(view.validateReview('checked',''),null);
 assert.ok(view.validateReview('needs-revision','Please correct the learning objectives.'));
 assert.ok(view.validateReview('approved','fine'));assert.ok(view.validateReview('checked','x'.repeat(5001)));
 assert.equal(view.documentReviewLabel([{reviewer_role:'School Head',status:'needs-revision'},{reviewer_role:'Master Teacher',status:'checked'}]),'Checked');
});


