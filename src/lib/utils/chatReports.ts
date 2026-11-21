import {buildRequirements, scopedCalendar, submissionTerm, summarizeRequirements, type Requirement, type CalendarSlot} from './compliance';
import {getCurrentSchoolYear} from './schoolYear';
import {normalizeReportName, resolveReportPeriod, type ReportRequest} from './reportRequest';
import {effectiveDeadlineForSubject} from './deadlineRules';
import {savedReviewStatus, summarizeSavedReportRows} from './submissionReport';
import type {ReportTable} from './excelExport';

type Profile={id:string;role:string;full_name:string;school_id:string|null;district_id:string|null};
type RecordRow=Record<string,any>;
type Attachment={fileName:string;blob:Blob};
export type UploadSummary=ReturnType<typeof summarizeSavedReportRows>;
export type ReportFacts={summary:ReturnType<typeof summarizeRequirements>;scope:string;period:string;overdue:number;overdueTeachers:number;pendingOverdue:number;request:ReportRequest;teacherBacklog:{name:string;count:number}[];uploads?:UploadSummary};
const dateLabel=(value:number|string)=>new Date(value).toLocaleString('en-PH',{timeZone:'Asia/Manila',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
export function uploadStatusText(summary:UploadSummary,lang:'en'|'tl'){
    const statuses=summary.statusRows.map(row=>`${row.label}: ${row.count}`).join('; ');
    const types=summary.typeRows.map(row=>`${row.type}: ${row.count}`).join('; ');
    return lang==='tl'
        ? `Mga saved upload (hiwalay sa compliance requirements): ${summary.total} kabuuan; ${summary.onTime} on time/compliant, ${summary.late} late, ${summary.supplementary} supplementary, ${summary.otherStatus} iba pang saved status. Ayon sa uri: ${summary.lessonPlans} DLL/DLP, ${summary.isp} ISP, ${summary.isr} ISR. Eksaktong mga status: ${statuses}. Mga uri ng dokumento: ${types}. Sa mga lesson plan na kailangang suriin, ${summary.checked} ang checked at ${summary.forChecking} ang for checking. Isang beses lang binilang ang bawat saved file; hindi nadaragdagan ng supplementary uploads ang required lesson-plan completion.`
        : `Saved uploads (separate from required lesson-plan compliance): ${summary.total} total; ${summary.onTime} on time/compliant, ${summary.late} late, ${summary.supplementary} supplementary, ${summary.otherStatus} other saved status. By document type: ${summary.lessonPlans} DLL/DLP, ${summary.isp} ISP, ${summary.isr} ISR. Exact file statuses are ${statuses}. Document types are ${types}. Among reviewable lesson-plan uploads, ${summary.checked} ${summary.checked===1?'is':'are'} checked and ${summary.forChecking} ${summary.forChecking===1?'is':'are'} for checking. Each saved file is counted once; supplementary uploads do not increase required lesson-plan completion. Missing requirements are reported separately.`;
}
async function scopedSavedUploads(db:any,schools:RecordRow[],year:string,request:ReportRequest,calendar:RecordRow[],matchingLoadIds:string[],restrictUserId?:string){
    const uploaders=await rowsForIds(db,'profiles','id,full_name,school_id','school_id',schools.map(s=>s.id));
    const people=new Map(uploaders.map(person=>[person.id,person]));
    const schoolNames=new Map(schools.map(school=>[school.id,school.name]));
    const ids=uploaders.filter(person=>!restrictUserId||person.id===restrictUserId).map(person=>person.id);
    const saved:RecordRow[]=[];
    for(let i=0;i<ids.length;i+=100){
        saved.push(...await readReportRows(()=>{
            let q=db.from('submissions').select('id,user_id,teaching_load_id,calendar_id,school_year,term_number,week_number,file_name,file_path,file_hash,doc_type,compliance_status,created_at,subject').in('user_id',ids.slice(i,i+100)).eq('school_year',year).order('id');
            if(request.week)q=q.eq('week_number',request.week);
            return q;
        }));
    }
    const calendarById=new Map(calendar.map(slot=>[slot.id,slot]));
    const selected=[...new Map(saved.map(row=>[row.id,row])).values()].filter(row=>{
        if(!['DLL','DLP','ISP','ISR'].includes(row.doc_type)||row.compliance_status==='missing'||String(row.file_hash||'').startsWith('nc_')||!(row.file_path||row.file_name))return false;
        if(request.term && (submissionTerm(row) ?? calendarById.get(row.calendar_id)?.term)!==request.term)return false;
        if(request.subject||request.grade)return matchingLoadIds.includes(row.teaching_load_id)&&['DLL','DLP'].includes(row.doc_type);
        return true;
    });
    const reviewableIds=selected.filter(row=>savedReviewStatus(row)!=='Not applicable').map(row=>row.id);
    const reviews=await rowsForIds(db,'dll_reviews','id,submission_id,status,reviewer_comment','submission_id',reviewableIds);
    const reviewById=new Map(reviews.map(review=>[review.submission_id,review]));
    const detailed:RecordRow[]=selected.map(row=>({
        ...row,uploader:people.get(row.user_id)?.full_name||'User',school:schoolNames.get(people.get(row.user_id)?.school_id)||'School',
        review_status:savedReviewStatus(row,reviewById.get(row.id))
    }));
    return {summary:summarizeSavedReportRows(detailed),rows:detailed};
}

// Read every page or fail explicitly. A truncated query must never become a complete report.
export async function readReportRows(query:()=>any):Promise<RecordRow[]> {
    const result:RecordRow[]=[];
    for(let start=0;start<50000;start+=500){
        const {data,error}=await query().range(start,start+499);
        if(error)throw new Error('Report records could not be loaded. Please check your connection and try again.');
        result.push(...(data||[]));
        if((data||[]).length<500)return result;
    }
    throw new Error('This report is too large to load completely. Please narrow the term, week, subject, or school.');
}
async function rowsForIds(db:any,table:string,select:string,field:string,ids:string[],year?:string,period?:ReportRequest){
    const result:RecordRow[]=[];
    for(let i=0;i<ids.length;i+=100){
        result.push(...await readReportRows(()=>{
            let q=db.from(table).select(select).in(field,ids.slice(i,i+100)).order('id');
            if(year)q=q.eq('school_year',year);
            if(period?.week)q=q.eq('week_number',period.week);
            // Build against all terms first so a legacy submission without
            // term metadata cannot be assigned to an ambiguous week.
            if(period?.term && table!=='submissions')q=q.eq('term_number',period.term);
            if(table==='submissions')q=q.in('doc_type',['DLL','DLP']);
            return q;
        }));
    }
    return result;
}
function mentioned(rows:RecordRow[],question:string){
    const text=` ${normalizeReportName(question)} `;
    // Full names and unambiguous school stems come from actual visible records.
    const matches=rows.filter(row=>{
        const name=normalizeReportName(row.name||'');
        const stem=name.replace(/\s+(?:elementary school|integrated school|national high school|high school)$/,'');
        return name && (text.includes(` ${name} `)||(stem.length>=4 && text.includes(` ${stem} `)));
    });
    const lastLine=question.split('\n').at(-1)||question;
    const recent=matches.filter(row=>normalizeReportName(lastLine).includes(normalizeReportName(row.name||'').replace(/\s+(?:elementary school|integrated school|national high school|high school)$/, '')));
    return recent.length?recent:matches;
}
export function makeReportSnapshot(requirements:Requirement[],teachers:RecordRow[],schools:RecordRow[],request:ReportRequest,now=Date.now()){
    const summary=summarizeRequirements(requirements,now);
    const schoolMap=new Map(schools.map(s=>[s.id,s.name]));
    const teacherMap=new Map(teachers.map(t=>[t.id,t]));
    const details=requirements.map(r=>({
        teacher:teacherMap.get(r.teacherId)?.full_name||'Teacher',school:schoolMap.get(teacherMap.get(r.teacherId)?.school_id)||'School',
        subject:r.load.subject,grade:r.load.grade_level||'—',term:r.calendar.term,week:r.calendar.week_number,
        status:r.status,review:r.submission ? r.review : '—',deadline:dateLabel(r.calendar.deadline_date),
        submitted:r.submission?.created_at?dateLabel(r.submission.created_at):'—'
    }));
    const groupBy=(field:'school'|'subject')=>[...new Set(details.map(row=>row[field]))].sort().map(name=>{
        const selected=requirements.filter((_r,i)=>details[i][field]===name);
        return {name,...summarizeRequirements(selected,now)};
    });
    const teacherGroups=[...new Set(requirements.map(r=>r.teacherId))].map(id=>({
        name:teacherMap.get(id)?.full_name||'Teacher',
        ...summarizeRequirements(requirements.filter(row=>row.teacherId===id),now)
    })).sort((a,b)=>a.name.localeCompare(b.name));
    return {summary,details,schools:groupBy('school'),subjects:groupBy('subject'),teachers:teacherGroups,teacherCount:teacherGroups.length,request,generatedAt:now};
}
export function reportNarrative(snapshot:ReturnType<typeof makeReportSnapshot>,scope:string,lang:'en'|'tl'='en'){
    const {summary:s,request:r}=snapshot;
    const period=[r.schoolYear,r.term?`Term ${r.term}`:'All terms',r.week?`Week ${r.week}`:'All weeks',r.subject,r.grade].filter(Boolean).join(' · ');
    const rate=s.rate===null?'N/A':`${s.rate}%`;
    const dueRate=s.dueRate===null?'N/A':`${s.dueRate}%`;
    const paragraphs=lang==='tl' ? [
        `Ulat ng lesson plan compliance para sa ${scope}. Saklaw: ${period}. Inihanda noong ${dateLabel(snapshot.generatedAt)} (oras sa Pilipinas), mula sa kasalukuyang CEDIMS records.`,
        `May ${snapshot.teacherCount} guro at ${snapshot.schools.length} paaralan na may tugmang requirements. Sa ${s.expected} inaasahang submission, ${s.submitted} ang naisumite: ${s.onTime} on time at ${s.late} late. May ${s.missing} overdue na hindi pa naisumite at ${s.upcoming} paparating na requirement. Ang completion rate ay ${rate}; para sa mga due na requirement, ${dueRate}.`,
        `May ${s.onLeave} approved leave na hindi kasama sa expected submissions. May ${s.leavePending} pending leave request; kasama pa rin ang mga ito sa expected submissions. Sa mga naisumiteng requirement, ${s.checked} ang checked at ${s.forChecking} ang for checking.`,
        s.missing?`Kailangang i-follow up ang ${s.missing} overdue requirement. Suriin ang Tracker para sa bukas na submission periods at ang mga dokumentong for checking.`:'Walang requirement na may Missing status sa napiling saklaw. Hiwalay na nakatala ang pending leave requests.',
        'Ang report ay para sa weekly lesson plans. Hindi nadaragdagan ang compliance count dahil sa supplementary copies o administrative ISP/ISR documents. Ang N/A ay nangangahulugang walang naaangkop na denominator; hindi ito 0%.'
    ] : [
        `Lesson plan compliance report for ${scope}. Scope: ${period}. Generated on ${dateLabel(snapshot.generatedAt)} (Philippine time) from current CEDIMS records.`,
        `The report covers ${snapshot.teacherCount} ${snapshot.teacherCount===1?'teacher':'teachers'} and ${snapshot.schools.length} ${snapshot.schools.length===1?'school':'schools'} with matching requirements. Of ${s.expected} expected submissions, ${s.submitted} ${s.submitted===1?'has':'have'} been submitted: ${s.onTime} on time and ${s.late} late. Overdue missing requirements total ${s.missing}, and upcoming requirements total ${s.upcoming}. Overall completion is ${rate}; completion among requirements already due is ${dueRate}.`,
        `${s.onLeave} approved leave requirements are excluded from expected submissions. Pending leave requests total ${s.leavePending} and remain expected. Among submitted requirements, checked documents total ${s.checked}, and documents for checking total ${s.forChecking}.`,
        s.missing?`Follow-up is needed for ${s.missing} overdue requirements. Use Tracker to check open submission periods and documents awaiting checking.`:'No requirement is currently marked Missing within the selected scope. Pending leave requests are reported separately.',
        'This report covers weekly lesson plans. Supplementary copies and administrative ISP/ISR documents do not increase the compliance count. N/A means there is no applicable denominator; it does not mean 0%.'
    ];
    const groups=[...snapshot.schools.map(g=>({label:lang==='tl'?'Paaralan':'School',...g})),...snapshot.subjects.map(g=>({label:lang==='tl'?'Asignatura':'Subject',...g}))].map(g=>
        lang==='tl'?`${g.label}: ${g.name}. Naisumite ang ${g.submitted} sa ${g.expected} expected; on time ${g.onTime}, late ${g.late}, overdue missing ${g.missing}, upcoming ${g.upcoming}, approved leave ${g.onLeave}; completion ${g.rate===null?'N/A':`${g.rate}%`}.`
        :`${g.label}: ${g.name}. ${g.submitted} of ${g.expected} expected requirements were submitted; ${g.onTime} on time, ${g.late} late, ${g.missing} overdue missing, ${g.upcoming} upcoming, and ${g.onLeave} approved leave; completion ${g.rate===null?'N/A':`${g.rate}%`}.`);
    return {paragraphs,groups,period};
}

export async function resolveChatScope(db:any,profile:Profile|undefined|null,userId:string|undefined,request:ReportRequest,lang:'en'|'tl'='en',allUploaders=false){
    if(!userId||!profile)return {answer:lang==='tl'?'Mag-sign in muna para makagawa ng report mula sa inyong records.':'Please sign in to create a report from your permitted records.'};
    if(request.error)return {answer:request.error};
    const roles=['Teacher','Master Teacher','School Head','District Supervisor','Admin'];
    if(!roles.includes(profile.role))return {answer:'Your account is not authorized to generate this report.'};
    if(profile.role==='Teacher' && request.scope && request.scope!=='self')return {answer:'Teacher reports cover your own submissions. School or district reports require an authorized supervisory account.'};
    if(['Master Teacher','School Head'].includes(profile.role)&&request.scope==='district')return {answer:'Your report access covers your school. A district-wide report requires an authorized District Supervisor or Admin account.'};
    if(['Teacher','Master Teacher','School Head'].includes(profile.role)&&!profile.school_id)return {answer:'Your account needs a school assignment before this report can be generated.'};
    if(profile.role==='District Supervisor'&&!profile.district_id)return {answer:'Your account needs a district assignment before this report can be generated.'};
        let schools=await readReportRows(()=>{
            let q=db.from('schools').select('id,name,district_id').order('id');
            if(['Teacher','Master Teacher','School Head'].includes(profile.role))q=q.eq('id',profile.school_id);
            if(['District Supervisor','Admin'].includes(profile.role)&&profile.district_id)q=q.eq('district_id',profile.district_id);
            return q;
        });
        if(!schools.length)return {answer:'No schools are available within your permitted report scope.'};
        const districtIds=[...new Set(schools.map(s=>s.district_id).filter(Boolean))];
        const districts=await rowsForIds(db,'districts','id,name','id',districtIds);
        if(/\b(?:my|this|our) district\b/i.test(request.question)){
            if(!profile.district_id && districts.length>1)return {answer:'Which district should I use? Please enter its exact CEDIMS district name.'};
            if(profile.district_id)schools=schools.filter(s=>s.district_id===profile.district_id);
        }
        const selectedDistricts=mentioned(districts,request.question);
        const namedDistrict=request.question.match(/\b(?:for|in|of)\s+([a-z][a-z -]{2,60}\bdistrict)\b/i)?.[1];
        if(namedDistrict && !/\b(?:my|this|our|the|whole|entire|all)\s+district$/i.test(namedDistrict) && !/^(?:my|this|our|the|whole|entire|all)\b/i.test(namedDistrict) && !selectedDistricts.length)return {answer:'I could not match that district within your access. Please use a district available to your account.'};
        if(selectedDistricts.length)schools=schools.filter(s=>selectedDistricts.some(d=>d.id===s.district_id));
        const selectedSchools=mentioned(schools,request.question);
        if(selectedSchools.length)schools=selectedSchools;
        else if(/\b(?:elementary school|integrated school|high school)\b/i.test(request.question))return {answer:'I could not match the named school within your access. Please use its exact school name from CEDIMS.'};
        if(/\bthis school\b|paaralan namin/i.test(request.question)&&!profile.school_id&&schools.length>1)return {answer:'Which school should I use? Please enter its name as shown in CEDIMS.'};
        if(profile.school_id && /\bthis school\b|paaralan namin/i.test(request.question))schools=schools.filter(s=>s.id===profile.school_id);
        let teachers=await rowsForIds(db,'profiles','id,full_name,school_id,role,is_active','school_id',schools.map(s=>s.id));
        teachers=teachers.filter(t=>t.is_active!==false && (allUploaders || ['Teacher','Master Teacher'].includes(t.role)));
        if(profile.role==='Teacher'||request.scope==='self')teachers=teachers.filter(t=>t.id===userId);
        if(!teachers.length)return {answer:'No active teachers match your permitted report scope.'};

        return {schools,districts,teachers};
}

export async function createChatReport(db:any,profile:Profile|undefined|null,userId:string|undefined,request:ReportRequest,lang:'en'|'tl'='en'):Promise<{answer:string;attachments?:Attachment[];facts?:ReportFacts}> {
    try{
        const access=await resolveChatScope(db,profile,userId,request,lang);
        if('answer' in access)return {answer:access.answer!};
        if(!profile||!userId) return {answer:'Please sign in.'};
        const {schools,districts,teachers}=access;
        const year=request.schoolYear||getCurrentSchoolYear();
        const ids=teachers.map(t=>t.id);
        const [allLoads,calendar]=await Promise.all([
            rowsForIds(db,'teaching_loads','id,user_id,subject,grade_level,is_active','user_id',ids),
            readReportRows(()=>db.from('academic_calendar').select('id,school_year,term,week_number,deadline_date,district_id,is_active').eq('school_year',year).eq('is_published',true).order('id'))
        ]);
        const scopedPeriods=calendar.filter(c=>!c.district_id||schools.some(s=>s.district_id===c.district_id));
        const resolved=resolveReportPeriod({...request,schoolYear:year},scopedPeriods as CalendarSlot[]);
        if(resolved.error)return {answer:resolved.error};
        const r=resolved as ReportRequest;
        const canonicalSubject=(subject:string)=>{
            const value=normalizeReportName(subject).replace(/^physical education\b/,'pe');
            const aliases:Record<string,string>={ap:'araling panlipunan',math:'mathematics',hgp:'homeroom guidance','epp tle':'epp',tle:'epp'};
            return aliases[value]||value;
        };
        const availableSubjects=[...new Set(allLoads.filter(l=>l.is_active!==false).map(l=>String(l.subject||'')))];
        if(r.subject){
            const text=` ${normalizeReportName(r.question.split('\n').at(-1)||r.question)} `;
            const fullMatch=availableSubjects.sort((a,b)=>b.length-a.length).find(s=>s.length>2 && canonicalSubject(s).startsWith(canonicalSubject(r.subject!)) && text.includes(` ${normalizeReportName(s)} `));
            if(fullMatch && normalizeReportName(fullMatch).length>normalizeReportName(r.subject).length)r.subject=fullMatch;
            const requested=canonicalSubject(r.subject);
            if(!availableSubjects.some(s=>canonicalSubject(s)===requested)){
                const expanded=availableSubjects.filter(s=>canonicalSubject(s).startsWith(`${requested} `));
                if(expanded.length===1)r.subject=expanded[0];
                else if(expanded.length>1)return {answer:`Which subject do you mean: ${expanded.join(', ')}? Please use the full teaching-load subject name.`};
            }
        }
        if(!r.subject && !r.allSubjects){
            const text=` ${normalizeReportName(r.question)} `;
            r.subject=[...new Set(allLoads.map(l=>String(l.subject||'')))].sort((a,b)=>b.length-a.length).find(s=>s.length>2&&text.includes(` ${normalizeReportName(s)} `));
            if(!r.subject && /\bthis subject\b|asignaturang ito/i.test(r.question))return {answer:'Which subject should I use? Please enter the teaching-load subject name.'};
        }
        const subjectMatch=(subject:string)=>{
            const normalized=normalizeReportName(subject);
            if(!r.subject)return true;
            if(r.subject==='Mathematics')return /^(?:math|mathematics)$/.test(normalized);
            if(r.subject==='Reading')return normalized.startsWith('reading');
            return canonicalSubject(subject)===canonicalSubject(r.subject);
        };
        const gradeName=(value:string)=>/^kinder/i.test(value)?'kindergarten':normalizeReportName(value).replace(/^grade /,'');
        const loads=allLoads.filter(l=>l.is_active!==false&&subjectMatch(l.subject||'')&&(!r.grade||gradeName(l.grade_level||'')===gradeName(r.grade)));
        if(!loads.length&&(r.subject||r.grade))return {answer:'No active teaching loads match these filters within your access. Please check the subject, grade, or school.'};
        const loadIds=loads.map(l=>l.id);
        const [submissions,leaves]=await Promise.all([
            rowsForIds(db,'submissions','id,user_id,teaching_load_id,school_year,term_number,week_number,calendar_id,file_path,doc_type,compliance_status,created_at,subject','teaching_load_id',loadIds,year,r),
            rowsForIds(db,'submission_leave_requests','*','user_id',[...new Set(loads.map(l=>l.user_id))],year)
        ]);
        const weekly=submissions.filter(s=>['DLL','DLP'].includes(s.doc_type));
        const reviews=await rowsForIds(db,'dll_reviews','id,submission_id,status,reviewer_comment','submission_id',weekly.map(s=>s.id));
        const requirements=teachers.flatMap(t=>{
            const school=schools.find(s=>s.id===t.school_id);
            return buildRequirements(loads.filter(l=>l.user_id===t.id).map(l=>({...l,school_name:school?.name})) as any,
                scopedCalendar(calendar as CalendarSlot[],school?.district_id),
                weekly.filter(s=>s.user_id===t.id) as any,reviews as any,Date.now(),leaves.sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))) as any);
        }).filter(row=>(!r.term||row.calendar.term===r.term)&&(!r.week||row.calendar.week_number===r.week));
        const snapshot=makeReportSnapshot(requirements,teachers,schools,r);
        const savedUploads=await scopedSavedUploads(db,schools,year,r,calendar,loadIds,
            profile.role==='Teacher'||r.scope==='self'?userId:undefined);
        const districtNames=districts.filter(d=>schools.some(s=>s.district_id===d.id)).map(d=>d.name).join(', ');
        const scope=profile.role==='Teacher'||r.scope==='self'?profile.full_name:(r.scope==='district'?`${districtNames} (${schools.length} schools)`:(schools.length<=3?schools.map(s=>s.name).join(', '):`${schools.length} schools in ${districtNames}`));
        const narrative=reportNarrative(snapshot,scope,lang);
        const overdue=requirements.filter(row=>!row.submission && row.status!=='on-leave' && effectiveDeadlineForSubject(row.calendar.deadline_date,row.load.subject,row.load.school_name).getTime()<=snapshot.generatedAt);
        const backlog=new Map<string,number>();
        for(const row of overdue)backlog.set(row.teacherId,(backlog.get(row.teacherId)||0)+1);
        const teacherBacklog=[...backlog].map(([id,count])=>({name:teachers.find(t=>t.id===id)?.full_name||'Teacher',count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));
        const facts:ReportFacts={summary:snapshot.summary,scope,period:narrative.period,overdue:overdue.length,overdueTeachers:teacherBacklog.length,pendingOverdue:overdue.filter(row=>row.status==='leave-requested').length,request:r,teacherBacklog,uploads:savedUploads.summary};
        const prefix=r.style==='bullets'?'• ':'';
        let answer=narrative.paragraphs.map(p=>prefix+p).join('\n\n');
        answer+='\n\n'+prefix+uploadStatusText(savedUploads.summary,lang);
        const teacherLines=['School Head','Master Teacher'].includes(profile.role)?snapshot.teachers.map(t=>`Teacher: ${t.name}. ${t.submitted} of ${t.expected} expected lesson plans submitted; ${t.missing} overdue missing, ${t.upcoming} upcoming, ${t.onLeave} approved leave; completion ${t.rate===null?'N/A':`${t.rate}%`}.`):[];
        const groupLines=[...narrative.groups,...teacherLines];
        answer+='\n\n'+groupLines.slice(0,20).map(p=>prefix+p).join('\n\n');
        if(groupLines.length>20)answer+=`\n\n${groupLines.length-20} additional group summaries are available in the Word or Excel export.`;
        if(r.format==='chat')return {answer,facts};
        const tables:ReportTable[]=[
            {title:'Summary',headers:['Expected','Submitted','On time','Late','Overdue missing','Upcoming','Approved leave','Pending leave','Checked','For checking','Completion'],rows:[[snapshot.summary.expected,snapshot.summary.submitted,snapshot.summary.onTime,snapshot.summary.late,snapshot.summary.missing,snapshot.summary.upcoming,snapshot.summary.onLeave,snapshot.summary.leavePending,snapshot.summary.checked,snapshot.summary.forChecking,snapshot.summary.rate===null?'N/A':`${snapshot.summary.rate}%`]]},
            {title:'Requirements',headers:['Teacher','School','Subject','Grade','Term','Week','Status','Review','Deadline (Philippines)','Submitted (Philippines)'],rows:snapshot.details.map(d=>[d.teacher,d.school,d.subject,d.grade,d.term,d.week,d.status,d.review,d.deadline,d.submitted])}
        ];
        const u=savedUploads.summary;
        tables.push({title:'Saved upload statuses',headers:['Status','Files'],rows:u.statusRows.map(row=>[row.label,row.count]),totalsRow:['Total saved',u.total]});
        tables.push({title:'Document types',headers:['Type','Files'],rows:u.typeRows.map(row=>[row.type,row.count]),totalsRow:['Total saved',u.total]});
        tables.push({title:'Review statuses',headers:['Review status','Files'],rows:[['Checked',u.checked],['For checking',u.forChecking],['Not applicable',u.notApplicable]],totalsRow:['Total saved',u.total]});
        tables.push({title:'Saved upload details',headers:['File','Uploader','School','Subject','Type','Submission status','Review status','Term','Week','Submitted (Philippines)'],rows:savedUploads.rows.map(row=>[row.file_name||'Document',row.uploader,row.school,row.subject||'—',row.doc_type,row.compliance_status||'Unspecified',row.review_status,submissionTerm(row)||'—',row.week_number||'—',dateLabel(row.created_at)])});
        const base=`CEDIMS-report-${year}${r.term?`-T${r.term}`:''}${r.week?`-W${r.week}`:''}-${new Date().toISOString().slice(0,10)}`;
        const options={title:'Submissions and Compliance Report',subtitle:`${scope} · ${narrative.period}`,meta:[{label:'Prepared by',value:profile.full_name},{label:'Source',value:'Current CEDIMS records; Philippine time'}],paragraphs:[...narrative.paragraphs,uploadStatusText(savedUploads.summary,lang),...narrative.groups,...teacherLines],tables};
        const attachments:Attachment[]=[];
        if(r.format==='excel'||r.format==='both'){
            const {buildReportWorkbook}=await import('./excelExport');
            const buffer=await buildReportWorkbook({...options,fileName:`${base}.xlsx`});
            attachments.push({fileName:`${base}.xlsx`,blob:new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});
        }
        if(r.format==='word'||r.format==='both'){
            const {buildReportDocument}=await import('./wordExport');
            attachments.push({fileName:`${base}.docx`,blob:await buildReportDocument({...options,tables:[],fileName:`${base}.docx`})});
        }
        return {answer,attachments,facts};
    }catch(error){return {answer:error instanceof Error?error.message:'The report could not be completed. Please try again.'};}
}
