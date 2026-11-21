import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const dir=resolve('tmp/report-test-modules');mkdirSync(dir,{recursive:true});
const modules=['deadlineRules','compliance','schoolYear','reportRequest','excelExport','wordExport','submissionReport','chatReports','chatQueryPlan','chatUploadFacts','systemHelp','chatbot'];
for(const name of modules){
    let source=readFileSync(`src/lib/utils/${name}.ts`,'utf8');
    for(const imported of modules)source=source.replaceAll(`'./${imported}'`,`'./${imported}.mjs'`).replaceAll(`"./${imported}"`,`"./${imported}.mjs"`);
    source=source.replace("import intentModel from '../models/intent_classifier_model.json';",`const intentModel=${readFileSync('src/lib/models/intent_classifier_model.json','utf8')};`);
    writeFileSync(`${dir}/${name}.mjs`,ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
}
const {parseReportRequest,isReportRequest,resolveReportPeriod}=await import(pathToFileURL(`${dir}/reportRequest.mjs`));
const {createChatReport,readReportRows}=await import(pathToFileURL(`${dir}/chatReports.mjs`));
const {getCurrentSchoolYear}=await import(pathToFileURL(`${dir}/schoolYear.mjs`));
const {processQuery,intentClassifier}=await import(pathToFileURL(`${dir}/chatbot.mjs`));
const {planChatDataQuestion}=await import(pathToFileURL(`${dir}/chatQueryPlan.mjs`));
const year=getCurrentSchoolYear();
const profile={id:'head',role:'School Head',full_name:'School Head',school_id:'s1',district_id:'d1'};
const district={...profile,id:'supervisor',role:'District Supervisor',school_id:null};
function fixture(){return {
    districts:[{id:'d1',name:'Calapan East District'},{id:'d2',name:'Other District'}],
    schools:[{id:'s1',name:'Bulusan Elementary School',district_id:'d1'},{id:'s2',name:'Salong Elementary School',district_id:'d1'},{id:'s3',name:'Other Elementary School',district_id:'d2'}],
    profiles:[{id:'a',full_name:'Teacher A',school_id:'s1',role:'Teacher',is_active:true},{id:'b',full_name:'Teacher B',school_id:'s2',role:'Teacher',is_active:true},{id:'c',full_name:'Teacher C',school_id:'s3',role:'Teacher',is_active:true}],
    teaching_loads:[{id:'ma',user_id:'a',subject:'Mathematics',grade_level:'Grade 3',is_active:true},{id:'sa',user_id:'a',subject:'Science',grade_level:'Grade 3',is_active:true},{id:'mb',user_id:'b',subject:'Mathematics',grade_level:'Grade 3',is_active:true}],
    academic_calendar:[{id:'w7',school_year:year,term:2,week_number:7,deadline_date:'2026-10-26T02:00:00Z',district_id:'d1',is_active:false,is_published:true},{id:'w8',school_year:year,term:2,week_number:8,deadline_date:'2026-11-02T02:00:00Z',district_id:'d1',is_active:true,is_published:true}],
    submissions:[{id:'sub',user_id:'a',teaching_load_id:'ma',school_year:year,term_number:2,week_number:7,doc_type:'DLL',compliance_status:'on-time',created_at:'2026-10-25T02:00:00Z'},{id:'extra',user_id:'a',teaching_load_id:'ma',school_year:year,term_number:2,week_number:7,doc_type:'DLL',compliance_status:'supplementary',created_at:'2026-10-26T02:00:00Z'}],
    submission_leave_requests:[{id:'leave',user_id:'a',teaching_load_id:'sa',school_year:year,term_number:2,week_number:7,status:'approved'}],
    document_review_current:[{id:'review',submission_id:'sub',status:'checked',comment:''}],
    dll_reviews:[{id:'review',submission_id:'sub',status:'checked',reviewer_comment:'Reviewed'}]
};}
function mockDb(tables){const calls=[];return {calls,from(table){const filters=[];let lo=0,hi=499;const q=new Proxy({}, {get(_target,key){if(key==='then')return resolve=>{
    const result=(tables[table]||[]).filter(row=>filters.every(([method,field,value])=>method==='eq'?row[field]===value:method==='in'?value.includes(row[field]):true));
    resolve({data:result.slice(lo,hi+1),error:null});
};return (...args)=>{calls.push([table,key,...args]);if(key==='eq'||key==='in')filters.push([key,...args]);if(key==='range')[lo,hi]=args;return q;};}});return q;}};}

test('report requests preserve filters on format follow-up, but reset for a new report',()=>{
    const a=parseReportRequest('Create a narrative report for term 2 week 7 Mathematics Grade 3 Bulusan Elementary School');
    assert.equal(a.week,7);assert.equal(a.term,2);assert.equal(a.subject,'Mathematics');assert.equal(a.grade,'Grade 3');
    const b=parseReportRequest('Same report but in Word',a);assert.equal(b.format,'word');assert.equal(b.week,7);assert.equal(b.subject,'Mathematics');
    const c=parseReportRequest('Now for term 3',b);assert.equal(c.term,3);assert.equal(c.week,undefined);
    const d=parseReportRequest('Create a new report for Science',c);assert.equal(d.term,undefined);assert.equal(d.subject,'Science');assert.equal(d.format,'chat');
    assert.equal(isReportRequest('What about Science?','create_report'),true);
    const nextSubject=parseReportRequest('What about Science?',b);assert.equal(nextSubject.subject,'Science');assert.equal(nextSubject.week,7);
    assert.equal(isReportRequest('In Word','create_report'),true);
    assert.equal(parseReportRequest('Report for this school year').scope,undefined);
});
test('English, Tagalog, typos, bullets, and file formats route to reporting',()=>{
    for(const q of ['Gumawa ng ulat ngayong linggo','Create a sentneces reprot for term 2','Summarize Mathematics this term','Excel for week 7','Word file for the district'])assert.equal(isReportRequest(q),true,q);
    assert.equal(parseReportRequest('Create both Excel and Word reports in bullets').format,'both');
    assert.equal(parseReportRequest('Gumawa ng ulat sa pangungusap').style,'sentences');
});
test('this week uses the Philippine academic week even after Monday deadline',()=>{
    const calendar=[{term:2,week_number:7,deadline_date:'2026-10-26T02:00:00Z'},{term:2,week_number:8,deadline_date:'2026-11-02T02:00:00Z'}];
    const now=Date.parse('2026-10-29T12:00:00+08:00');
    assert.equal(resolveReportPeriod(parseReportRequest('Report this week'),calendar,now).week,7);
    assert.equal(resolveReportPeriod(parseReportRequest('Report last week'),calendar,Date.parse('2026-11-04T12:00:00+08:00')).week,7);
    assert.equal(resolveReportPeriod(parseReportRequest('Report this term'),calendar,now).term,2);
    assert.ok(resolveReportPeriod(parseReportRequest('Report this week'),[],now).error);
});
test('district report counts real requirements, approved leave, closed history, shared checks, and extras correctly',async()=>{
    const reply=await createChatReport(mockDb(fixture()),district,district.id,parseReportRequest('Write a report for term 2 week 7 for my district in bullets'));
    assert.match(reply.answer,/Of 2 expected submissions, 1 has been submitted/);assert.match(reply.answer,/50%/);
    assert.match(reply.answer,/1 approved leave/);assert.match(reply.answer,/checked documents total 1/);assert.match(reply.answer,/• /);
    assert.doesNotMatch(reply.answer,/Teacher C|Other Elementary/);assert.equal(reply.attachments,undefined);
});
test('subject and school filters affect every total and all-leave scope is N/A',async()=>{
    const science=await createChatReport(mockDb(fixture()),profile,profile.id,parseReportRequest('Report for Science term 2 week 7'));
    assert.match(science.answer,/0 expected submissions/);assert.match(science.answer,/completion is N\/A/);
    const school=await createChatReport(mockDb(fixture()),district,district.id,parseReportRequest('Report for Salong Elementary School term 2 week 7 Mathematics'));
    assert.match(school.answer,/Of 1 expected submissions, 0/);assert.match(school.answer,/Salong/);assert.doesNotMatch(school.answer,/Bulusan/);
    const genericDistrict=await createChatReport(mockDb(fixture()),district,district.id,parseReportRequest('Report for Mathematics in my district term 2 week 7'));
    assert.match(genericDistrict.answer,/50%/);
});
test('unauthorized and unknown scopes never silently become broader reports',async()=>{
    const denied=await createChatReport(mockDb(fixture()),profile,profile.id,parseReportRequest('Report for my district'));
    assert.match(denied.answer,/requires/);
    const unknown=await createChatReport(mockDb(fixture()),district,district.id,parseReportRequest('Report for Unknown Elementary School'));
    assert.match(unknown.answer,/could not match/);
    const teacher={...profile,id:'a',role:'Teacher'};
    const own=await createChatReport(mockDb(fixture()),teacher,teacher.id,parseReportRequest('Report term 2 week 7'));
    assert.match(own.answer,/Teacher A|School Head/);assert.doesNotMatch(own.answer,/Teacher B/);
    const noDistrict=await createChatReport(mockDb(fixture()),{...district,district_id:null},district.id,parseReportRequest('Report term 2'));
    assert.match(noDistrict.answer,/needs a district/);
});
test('pagination reads all records and query errors do not produce partial reports',async()=>{
    const data=Array.from({length:501},(_,i)=>({id:i}));const db=mockDb({rows:data});
    assert.equal((await readReportRows(()=>db.from('rows'))).length,501);assert.equal(db.calls.filter(c=>c[1]==='range').length,2);
    await assert.rejects(readReportRows(()=>({range:()=>Promise.resolve({data:null,error:{message:'offline'}})})),/could not be loaded/);
});
test('curriculum subject labels and abbreviations match actual teaching loads',async()=>{
    const tables=fixture();tables.teaching_loads[1].subject='EPP/TLE';
    const reply=await createChatReport(mockDb(tables),profile,profile.id,parseReportRequest('Report for EPP term 2 week 7'));
    assert.match(reply.answer,/Subject: EPP\/TLE/);assert.match(reply.answer,/completion is N\/A/);
    tables.teaching_loads[1].subject='Language and Literacy';
    const language=await createChatReport(mockDb(tables),profile,profile.id,parseReportRequest('Report for Language and Literacy term 2 week 7'));
    assert.match(language.answer,/Subject: Language and Literacy/);
});
test('Word narrative and Excel details contain the same filtered totals',async()=>{
    const result=await createChatReport(mockDb(fixture()),profile,profile.id,parseReportRequest('Create Excel and Word reports for Mathematics term 2 week 7 in sentences'));
    assert.equal(result.attachments?.length,2,result.answer);
    const JSZip=(await import('jszip')).default;
    const word=result.attachments.find(a=>a.fileName.endsWith('.docx'));
    const zip=await JSZip.loadAsync(await word.blob.arrayBuffer());const xml=await zip.file('word/document.xml').async('string');
    assert.match(xml,/Of 1 expected submissions, 1 has been submitted/);assert.match(xml,/100%/);assert.doesNotMatch(xml,/<w:tbl>|No data available/);
    const ExcelModule=await import('exceljs');const ExcelJS=ExcelModule.default||ExcelModule;const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(await result.attachments.find(a=>a.fileName.endsWith('.xlsx')).blob.arrayBuffer());
    const contents=JSON.stringify(workbook.worksheets[0].getSheetValues());
    assert.match(contents,/Mathematics/);assert.match(contents,/Bulusan/);assert.match(contents,/100%/);assert.doesNotMatch(contents,/Salong|Teacher B/);
});
test('every role receives scoped Excel details and a sentence-based Word report',async()=>{
    const roles=[
        {role:'Teacher',profile:{id:'a',role:'Teacher',full_name:'Teacher A',school_id:'s1',district_id:'d1'},allowed:['Teacher A']},
        {role:'Master Teacher',profile:{id:'master',role:'Master Teacher',full_name:'Master Teacher',school_id:'s1',district_id:'d1'},allowed:['Teacher A']},
        {role:'School Head',profile,allowed:['Teacher A']},
        {role:'District Supervisor',profile:district,allowed:['Teacher A','Teacher B']},
        {role:'Admin',profile:{...district,id:'admin',role:'Admin'},allowed:['Teacher A','Teacher B']},
    ];
    const ExcelModule=await import('exceljs');const ExcelJS=ExcelModule.default||ExcelModule;
    const JSZip=(await import('jszip')).default;
    for(const {role,profile:person,allowed} of roles){
        const db=mockDb(fixture());
        if(role==='Admin')db.rpc=(_fn,args)=>db.from('submission_leave_requests').eq('school_year',args.p_school_year).in('user_id',args.p_user_ids);
        const reply=await createChatReport(db,person,person.id,parseReportRequest('Create Excel and Word compliance reports for term 2 week 7 in sentences'));
        assert.equal(reply.attachments?.length,2,`${role}: ${reply.answer}`);
        const excel=reply.attachments.find(a=>a.fileName.endsWith('.xlsx'));
        const word=reply.attachments.find(a=>a.fileName.endsWith('.docx'));
        const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await excel.blob.arrayBuffer());
        assert.equal(workbook.worksheets[0].name,'Overview',role);
        assert.ok(workbook.getWorksheet('Requirements'),role);
        if(['Master Teacher','School Head'].includes(role))assert.ok(workbook.getWorksheet('Saved upload statuses'),role);
        const details=JSON.stringify(workbook.getWorksheet('Requirements').getSheetValues());
        for(const name of allowed)assert.match(details,new RegExp(name),role);
        for(const name of ['Teacher A','Teacher B','Teacher C'].filter(name=>!allowed.includes(name)))assert.doesNotMatch(details,new RegExp(name),role);
        assert.ok(workbook.getWorksheet('Requirements').autoFilter,role);
        assert.match(workbook.getWorksheet('Requirements').pageSetup.printArea,/^A1:J\d+$/,role);
        const zip=await JSZip.loadAsync(await word.blob.arrayBuffer());
        const xml=await zip.file('word/document.xml').async('string');
        assert.match(xml,/Report findings/);assert.match(xml,/expected submissions/);assert.doesNotMatch(xml,/<w:tbl>/);
        for(const name of ['Teacher B','Teacher C'].filter(name=>!allowed.includes(name)))assert.doesNotMatch(xml,new RegExp(name),role);
    }
});
test('chat integration and subsequent file requests retain the original report filters',async()=>{
    const ctx={supabase:mockDb(fixture()),userId:profile.id,profile};
    const first=await processQuery('Write a report for Mathematics term 2 week 7 in sentences',ctx);
    assert.equal(first.intent,'create_report');assert.match(first.answer,/100%/);
    const next=await processQuery('Same report but in Word',{...ctx,memory:{lastIntent:first.intent,lastSlots:first.slots,lastLang:first.lang}});
    assert.equal(next.attachments?.[0].fileName.endsWith('.docx'),true,next.answer);assert.match(next.answer,/100%/);
});

function uploadFixture(){
    const data=fixture();
    data.submissions=data.submissions.map((s,i)=>({...s,file_name:`Lesson-${i}.pdf`,file_path:`documents/Term_2/Lesson-${i}.pdf`}));
    data.submissions.push({id:'late',user_id:'b',subject:'Mathematics',teaching_load_id:'mb',school_year:year,term_number:2,week_number:7,file_name:'Late.pdf',file_path:'documents/Term_2/Late.pdf',doc_type:'DLL',compliance_status:'late',created_at:'2026-10-27T00:00:00Z'});
    data.profiles.push({id:'head',full_name:'School Head',school_id:'s1',role:'School Head',is_active:true});
    data.submissions.push({id:'isp',user_id:'head',subject:'Administration',school_year:year,term_number:2,week_number:7,file_name:'ISP.pdf',file_path:'documents/Term_2/ISP.pdf',doc_type:'ISP',compliance_status:'compliant',created_at:'2026-10-25T00:00:00Z'});
    data.submissions.push({id:'placeholder',user_id:'b',school_year:year,term_number:2,week_number:7,doc_type:'DLL',compliance_status:'missing',file_hash:'nc_missing'});
    return data;
}
test('main reports include every saved submission status and document type for each role',async()=>{
    const roles=[
        {person:{id:'a',role:'Teacher',full_name:'Teacher A',school_id:'s1',district_id:'d1'},count:2},
        {person:{id:'master',role:'Master Teacher',full_name:'Master Teacher',school_id:'s1',district_id:'d1'},count:3},
        {person:profile,count:3},
        {person:district,count:4},
        {person:{...district,id:'admin',role:'Admin'},count:4},
    ];
    const ExcelModule=await import('exceljs');const ExcelJS=ExcelModule.default||ExcelModule;
    const JSZip=(await import('jszip')).default;
    for(const {person,count} of roles){
        const data=uploadFixture();
        data.submissions.push({id:'outside',user_id:'c',school_year:year,term_number:2,week_number:7,file_name:'Outside.pdf',file_path:'documents/Outside.pdf',doc_type:'DLL',compliance_status:'compliant',created_at:'2026-10-25T00:00:00Z'});
        const reply=await createChatReport(mockDb(data),person,person.id,parseReportRequest('Create Excel and Word reports for term 2 week 7'));
        assert.equal(reply.attachments?.length,2,`${person.role}: ${reply.answer}`);
        assert.equal(reply.facts?.uploads?.total,count,person.role);
        const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await reply.attachments.find(a=>a.fileName.endsWith('.xlsx')).blob.arrayBuffer());
        for(const sheet of ['Saved upload statuses','Document types','Review statuses','Saved upload details'])assert.ok(workbook.getWorksheet(sheet),`${person.role}: ${sheet}`);
        const statuses=JSON.stringify(workbook.getWorksheet('Saved upload statuses').getSheetValues());
        for(const status of ['Compliant','On time','Late','Supplementary','Extra'])assert.match(statuses,new RegExp(status),person.role);
        assert.match(statuses,new RegExp(`Total saved[^\\]]*${count}`),person.role);
        const details=JSON.stringify(workbook.getWorksheet('Saved upload details').getSheetValues());
        assert.doesNotMatch(details,/Outside\.pdf|Teacher C|Other Elementary School/,person.role);
        if(count>=3)assert.match(details,/ISP\.pdf|ISP/,person.role);
        if(count>=4)assert.match(details,/Late\.pdf/,person.role);
        const word=reply.attachments.find(a=>a.fileName.endsWith('.docx'));
        const xml=await (await JSZip.loadAsync(await word.blob.arrayBuffer())).file('word/document.xml').async('string');
        assert.match(xml,new RegExp(`Saved uploads.*${count} total`),person.role);
        assert.match(xml,/Exact file statuses are/);assert.doesNotMatch(xml,/Outside\.pdf|Teacher C|Other Elementary School|<w:tbl>/,person.role);
    }
});
test('an administrative-only period still produces both report formats',async()=>{
    const data=uploadFixture();
    data.teaching_loads=[];
    data.submissions=data.submissions.filter(row=>row.id==='isp');
    const reply=await createChatReport(mockDb(data),profile,profile.id,parseReportRequest('Create Excel and Word reports for term 2 week 7'));
    assert.equal(reply.attachments?.length,2,reply.answer);
    assert.equal(reply.facts?.summary.expected,0);
    assert.equal(reply.facts?.uploads?.total,1);
});
test('uploaded-document Excel and Word exports honor each role and use prose',async()=>{
    const roles=[
        {person:{id:'a',role:'Teacher',full_name:'Teacher A',school_id:'s1',district_id:'d1'},allowed:['Teacher A']},
        {person:{id:'master',role:'Master Teacher',full_name:'Master Teacher',school_id:'s1',district_id:'d1'},allowed:['Teacher A','School Head']},
        {person:profile,allowed:['Teacher A','School Head']},
        {person:district,allowed:['Teacher A','Teacher B','School Head']},
        {person:{...district,id:'admin',role:'Admin'},allowed:['Teacher A','Teacher B','School Head']},
    ];
    const ExcelModule=await import('exceljs');const ExcelJS=ExcelModule.default||ExcelModule;
    const JSZip=(await import('jszip')).default;
    for(const {person,allowed} of roles){
        const data=uploadFixture();
        data.submissions.push({id:'other',user_id:'c',school_year:year,term_number:2,week_number:7,file_name:'Other-school.pdf',file_path:'documents/Other-school.pdf',doc_type:'DLL',compliance_status:'on-time',created_at:'2026-10-25T00:00:00Z'});
        const question=person.role==='Teacher'?'my uploaded documents week 7 in Excel and Word':'week 7 total uploaded documents by school in Excel and Word';
        const reply=await processQuery(question,{supabase:mockDb(data),profile:person,userId:person.id});
        assert.equal(reply.attachments?.length,2,`${person.role}: ${reply.answer}`);
        const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await reply.attachments.find(a=>a.fileName.endsWith('.xlsx')).blob.arrayBuffer());
        assert.ok(workbook.getWorksheet('Submission statuses'),person.role);
        assert.ok(workbook.getWorksheet('Document types'),person.role);
        const rows=JSON.stringify(workbook.getWorksheet('Uploaded documents').getSheetValues());
        for(const name of allowed)assert.match(rows,new RegExp(name),person.role);
        assert.doesNotMatch(rows,/Other-school|Teacher C/,person.role);
        const word=reply.attachments.find(a=>a.fileName.endsWith('.docx'));
        const xml=await (await JSZip.loadAsync(await word.blob.arrayBuffer())).file('word/document.xml').async('string');
        assert.match(xml,/Report findings/);assert.doesNotMatch(xml,/<w:tbl>|Other Elementary School|Teacher C/,person.role);
        if(person.role!=='Teacher')assert.match(xml,/accounts for \d+ uploaded document/,person.role);
    }
});
test('the exact reported failure returns a live uploaded-file total including supplementary and administrative files',async()=>{
    const ctx={supabase:mockDb(uploadFixture()),userId:district.id,profile:district};
    const result=await processQuery('week 7 total uploaded documents',ctx);
    assert.match(result.answer,/has 4 uploaded documents/);assert.match(result.answer,/1 supplementary lesson-plan upload/);assert.match(result.answer,/1 administrative document/);
    assert.doesNotMatch(result.answer,/drag and drop|open the Upload|Uploading a Daily Lesson Plan/);
    assert.equal(JSON.parse(result.slots.dataPlan).operation,'uploads');
});
test('counting, procedural help, overdue work, and status breakdowns are different operations',()=>{
    for(const q of ['how many files were uploaded in week 7','week 7 total uploaded documents','ilang na-upload na dokumento sa week 7','week seven total uploaded documents'])assert.equal(planChatDataQuestion(q)?.operation,'uploads',q);
    assert.equal(planChatDataQuestion('How do I upload a lesson plan?'),null);
    assert.equal(planChatDataQuestion('week 7 wrong file uploaded'),null);
    assert.equal(planChatDataQuestion('week 7 missing')?.operation,'compliance');
    assert.equal(planChatDataQuestion('total uploads week 7 by status')?.operation,'status-overview');
    assert.equal(planChatDataQuestion('how many supplementary week 7')?.metric,'supplementary');
    assert.equal(planChatDataQuestion('how many compliant documents week 7')?.metric,'on-time');
    const prior=planChatDataQuestion('week 7 total uploaded documents');
    const breakdown=planChatDataQuestion('break it down by status',prior);assert.equal(breakdown.operation,'status-overview');assert.equal(breakdown.request.week,7);
    assert.equal(planChatDataQuestion('only late',prior)?.metric,'late');
});
test('late, supplementary, compliant, missing and overdue counts are computed without counting placeholders as uploads',async()=>{
    const ctx={supabase:mockDb(uploadFixture()),userId:district.id,profile:district};
    const late=await processQuery('week 7 total late uploads',ctx);assert.match(late.answer,/has 1 late uploaded document/);
    const extra=await processQuery('week 7 supplementary uploads count',ctx);assert.match(extra.answer,/has 1 supplementary uploaded document/);
    const status=await processQuery('total uploads week 7 by status',ctx);assert.match(status.answer,/has 4 uploaded documents/);assert.match(status.answer,/Saved-file statuses:/);assert.match(status.answer,/Unsubmitted requirements: 0 overdue/);
    const missing=await processQuery('week 7 missing',ctx);assert.match(missing.answer,/overdue unsubmitted requirements/);assert.doesNotMatch(missing.answer,/drag and drop/);
    const follow=await processQuery('What about supplementary?',{...ctx,memory:{lastIntent:missing.intent,lastSlots:missing.slots,lastLang:missing.lang}});
    assert.match(follow.answer,/has 1 supplementary uploaded document/);
});
test('conversational scope and export follow-ups retain the same measurement',async()=>{
    const ctx={supabase:mockDb(uploadFixture()),userId:district.id,profile:district};
    const first=await processQuery('week 7 total uploaded documents',ctx);
    const memory={lastIntent:first.intent,lastSlots:first.slots,lastLang:first.lang};
    const next=await processQuery('What about week 8?',{...ctx,memory});assert.match(next.answer,/Week 8/);assert.match(next.answer,/has 0 uploaded documents/);
    const explain=await processQuery('Explain that count',{...ctx,memory});assert.match(explain.answer,/I counted confirmed submission records/);assert.match(explain.answer,/has 4 uploaded documents/);
    assert.match(explain.answer,/Week 7/);
    const word=await processQuery('Same count in Word',{...ctx,memory});assert.equal(word.attachments?.[0].fileName.endsWith('.docx'),true,word.answer);assert.match(word.answer,/has 4 uploaded documents/);
});
test('overdue requirements and pending leave never inflate uploaded-file totals',async()=>{
    const data=uploadFixture();data.submissions=data.submissions.filter(r=>r.id!=='late');data.submission_leave_requests[0].status='pending';
    const ctx={supabase:mockDb(data),userId:district.id,profile:district};
    const result=await processQuery('week 7 total uploads by status',ctx);
    assert.match(result.answer,/has 3 uploaded documents/);assert.match(result.answer,/Unsubmitted requirements: 2 overdue/);assert.match(result.answer,/1 have a pending leave request/);
});
test('administrative type filters and subject counts survive conversational follow-ups',async()=>{
    const ctx={supabase:mockDb(uploadFixture()),userId:district.id,profile:district};
    const isp=await processQuery('week 7 total ISP uploads',ctx);assert.match(isp.answer,/has 1 uploaded document/);
    const explain=await processQuery('Why that count?',{...ctx,memory:{lastIntent:isp.intent,lastSlots:isp.slots,lastLang:isp.lang}});
    assert.match(explain.answer,/has 1 uploaded document/);assert.match(explain.answer,/ISP/);
    const subject=await processQuery('week 7 total Mathematics uploads',ctx);assert.match(subject.answer,/has 3 uploaded documents/);
    const compliant=await processQuery('week 7 total compliant uploads',ctx);assert.match(compliant.answer,/has 2 on-time uploaded documents/);
    const own=await processQuery('How many files did I upload in week 7?',{supabase:mockDb(uploadFixture()),userId:profile.id,profile});
    assert.match(own.answer,/has 1 uploaded document/);assert.match(own.answer,/School Head/);
});

test('school head and master teacher suggestions return only school compliance and reports',async()=>{
    for(const role of ['School Head','Master Teacher']){
        const actor={...profile,id:role==='School Head'?'head':'mt',role};
        const ctx={supabase:mockDb(fixture()),userId:actor.id,profile:actor};
        const report=await processQuery('Create a report for my school this school year',ctx);
        assert.match(report.answer,/Bulusan Elementary School/);
        assert.match(report.answer,/Teacher: Teacher A/);
        assert.doesNotMatch(report.answer,/Teacher B|Teacher C|Salong Elementary School|Other Elementary School/);
        const compliance=await processQuery("What is my school's lesson plan compliance rate?",ctx);
        assert.match(compliance.answer,/Bulusan Elementary School/);
        assert.doesNotMatch(compliance.answer,/Teacher B|Teacher C|Salong Elementary School/);
        const count=await processQuery('How many teachers have overdue lesson plans in my school this school year?',ctx);
        assert.match(count.answer,/teachers with overdue requirements/);
        const names=await processQuery('Which teachers have overdue lesson plans in my school?',ctx);
        assert.match(names.answer,/Teacher A/);
        assert.doesNotMatch(names.answer,/Teacher B|Teacher C/);
        const denied=await processQuery('Create a report for my district',ctx);
        assert.match(denied.answer,/district-wide report requires/);
    }
});

test('teacher suggestions stay with own requirements and urgent system help',async()=>{
    const actor={...profile,id:'a',full_name:'Teacher A',role:'Teacher'};
    const ctx={supabase:mockDb(fixture()),userId:actor.id,profile:actor};
    const report=await processQuery('Create a report of my lesson plan compliance this school year',ctx);
    assert.match(report.answer,/Teacher A/);
    assert.doesNotMatch(report.answer,/Teacher B|Teacher C/);
    const compliance=await processQuery('What is my lesson plan compliance rate?',ctx);
    assert.match(compliance.answer,/Teacher A/);
    assert.doesNotMatch(compliance.answer,/Teacher B|Teacher C/);
    const denied=await processQuery('Create a report for my school',ctx);
    assert.match(denied.answer,/Teacher reports cover your own submissions/);
    const late=await processQuery('Can I still upload after the deadline?',ctx);
    assert.match(late.answer,/Open|open/);
    const remarks=await processQuery('How do I check remarks on my submitted lesson plan?',ctx);
    assert.match(remarks.answer,/Tracker|Archives/);
});

test('school reports and compliance answers separate every saved upload status from required work',async()=>{
    const data=fixture();
    data.profiles.push({id:'head',full_name:'School Head',school_id:'s1',role:'School Head',is_active:true});
    data.submissions[0].file_path='documents/Term_2/Lesson.pdf';
    data.submissions[1].file_path='documents/Term_2/Extra.pdf';
    data.submissions.push(
        {id:'late-school',user_id:'a',teaching_load_id:'sa',school_year:year,term_number:2,week_number:7,doc_type:'DLP',compliance_status:'late',file_path:'documents/Term_2/Late.pdf',created_at:'2026-10-27T02:00:00Z'},
        {id:'isp-school',user_id:'head',school_year:year,term_number:2,week_number:7,doc_type:'ISP',compliance_status:'compliant',file_path:'documents/Term_2/ISP.pdf',created_at:'2026-10-27T02:00:00Z'},
        {id:'isr-school',user_id:'head',school_year:year,term_number:2,week_number:7,doc_type:'ISR',compliance_status:'compliant',file_path:'documents/Term_2/ISR.pdf',created_at:'2026-10-27T02:00:00Z'},
        {id:'other-school',user_id:'b',school_year:year,term_number:2,week_number:7,doc_type:'DLL',compliance_status:'late',file_path:'documents/Term_2/Other.pdf',created_at:'2026-10-27T02:00:00Z'}
    );
    for(const role of ['School Head','Master Teacher']){
        const actor={...profile,id:role==='School Head'?'head':'mt',role};
        const ctx={supabase:mockDb(data),userId:actor.id,profile:actor};
        const report=await processQuery('Create a report for my school this school year',ctx);
        assert.match(report.answer,/Saved uploads.*5 total; 3 on time\/compliant, 1 late, 1 supplementary/);
        assert.match(report.answer,/By document type: 3 DLL\/DLP, 1 ISP, 1 ISR/);
        assert.doesNotMatch(report.answer,/Other\.pdf|Teacher B|Salong Elementary School/);
        const compliance=await processQuery("What is my school's lesson plan compliance rate?",ctx);
        assert.match(compliance.answer,/5 total; 3 on time\/compliant, 1 late, 1 supplementary/);
        assert.equal((compliance.answer.match(/Saved uploads/g)||[]).length,1);
        assert.match(compliance.answer,/supplementary uploads do not increase required lesson-plan completion/);
        const statuses=await processQuery("Show my school's uploaded documents by status this school year",ctx);
        assert.match(statuses.answer,/has 5 uploaded documents/);
        assert.match(statuses.answer,/Saved-file statuses: 3 on time\/compliant; 1 late; 1 supplementary/);
        const extra=await processQuery('How many supplementary uploads does my school have this school year?',ctx);
        assert.match(extra.answer,/has 1 supplementary uploaded document/);
    }
    const exported=await createChatReport(mockDb(data),profile,profile.id,parseReportRequest('Create Excel and Word reports for my school this school year'));
    assert.equal(exported.attachments?.length,2,exported.answer);
    const JSZip=(await import('jszip')).default;
    const word=exported.attachments.find(file=>file.fileName.endsWith('.docx'));
    const xml=await (await JSZip.loadAsync(await word.blob.arrayBuffer())).file('word/document.xml').async('string');
    assert.match(xml,/Saved uploads/);assert.match(xml,/1 supplementary/);
    const ExcelModule=await import('exceljs');const ExcelJS=ExcelModule.default||ExcelModule;
    const workbook=new ExcelJS.Workbook();
    await workbook.xlsx.load(await exported.attachments.find(file=>file.fileName.endsWith('.xlsx')).blob.arrayBuffer());
    assert.match(JSON.stringify(workbook.getWorksheet('Saved upload statuses').getSheetValues()),/SAVED UPLOAD STATUSES/);
});

test('next deadline uses assigned school district and names the first open future term and week',async()=>{
    const data=fixture();
    const future=new Date(Date.now()+7*86400000).toISOString();
    const later=new Date(Date.now()+14*86400000).toISOString();
    data.academic_calendar=[
        {id:'closed',school_year:year,term:2,week_number:9,deadline_date:future,district_id:'d1',is_active:false,is_published:true},
        {id:'next',school_year:year,term:2,week_number:10,deadline_date:later,district_id:'d1',is_active:true,is_published:true},
        {id:'outside',school_year:year,term:2,week_number:11,deadline_date:future,district_id:'d2',is_active:true,is_published:true}
    ];
    const actor={...profile,id:'head',district_id:'d2'};
    const reply=await processQuery('When is the next deadline?',{supabase:mockDb(data),userId:actor.id,profile:actor});
    assert.match(reply.answer,/Term 2, Week 10/);
    assert.match(reply.answer,/Philippine time/);
    assert.match(reply.answer,/Open/);
    assert.doesNotMatch(reply.answer,/Week 9|Week 11/);
});

test('teacher next deadline uses the subject-specific due day in the assigned school',async()=>{
    const data=fixture();
    const phNow=new Date(Date.now()+8*3600000);
    const daysUntilMonday=((8-phNow.getUTCDay())%7)||7;
    const nextMonday=new Date(Date.UTC(phNow.getUTCFullYear(),phNow.getUTCMonth(),phNow.getUTCDate()+daysUntilMonday,2)).toISOString();
    data.academic_calendar=[{id:'hgp-week',school_year:year,term:2,week_number:10,deadline_date:nextMonday,district_id:'d1',is_active:true,is_published:true}];
    data.teaching_loads=[{id:'hgp',user_id:'a',subject:'HGP',grade_level:'Grade 3',is_active:true}];
    const actor={...profile,id:'a',full_name:'Teacher A',role:'Teacher'};
    const reply=await processQuery('When is my next submission deadline?',{supabase:mockDb(data),userId:actor.id,profile:actor});
    assert.match(reply.answer,/Term 2, Week 10 · HGP/);
    const friday=new Date(Date.parse(nextMonday)+4*86400000).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'long',day:'numeric',hour:'numeric',minute:'2-digit',hour12:true});
    assert.ok(reply.answer.includes(friday),reply.answer);
});

test('school heads and district supervisors see the latest Open week when its deadline has passed',async()=>{
    const data=fixture();
    data.academic_calendar=[
        {id:'open-past',school_year:year,term:2,week_number:10,deadline_date:new Date(Date.now()-4*86400000).toISOString(),district_id:'d1',is_active:true,is_published:true},
        {id:'unpublished-future',school_year:year,term:2,week_number:11,deadline_date:new Date(Date.now()+4*86400000).toISOString(),district_id:'d1',is_active:false,is_published:false}
    ];
    for(const actor of [profile,district]){
        const reply=await processQuery('When is the next submission deadline?',{supabase:mockDb(data),userId:actor.id,profile:actor});
        assert.match(reply.answer,/Term 2, Week 10 is still Open/);
        assert.match(reply.answer,/marked Late/);
        assert.doesNotMatch(reply.answer,/Term 2, Week 11/);
    }
});
