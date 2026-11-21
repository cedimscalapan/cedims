import {readReportRows,resolveChatScope,createChatReport} from './chatReports';
import {getCurrentSchoolYear} from './schoolYear';
import {submissionTerm,type CalendarSlot} from './compliance';
import {normalizeReportName,resolveReportPeriod,type ReportRequest} from './reportRequest';
import type {ChatDataPlan} from './chatQueryPlan';
import type {ChatContext} from './chatbot';
import {savedReviewStatus,summarizeSavedReportRows} from './submissionReport';

export async function answerUploadFacts(plan:ChatDataPlan,ctx:ChatContext|undefined,lang:'en'|'tl'){
    if(plan.operation==='queue')return {answer:lang==='tl'?'Hindi pa successful uploads ang mga queued o syncing na file. Tingnan ang Upload para sa pending sync. Maaari kong bilangin ang confirmed records sa Archives.':'Queued or syncing files are not confirmed uploads yet. Check Upload for pending sync. I can count the confirmed records saved in Archives.'};
    try{
        const access=await resolveChatScope(ctx?.supabase,ctx?.profile,ctx?.userId,plan.request,lang,true);
        if('answer' in access)return {answer:access.answer!};
        const {schools,districts,teachers:people}=access;
        const db=ctx!.supabase,year=plan.request.schoolYear||getCurrentSchoolYear();
        const calendar=await readReportRows(()=>db.from('academic_calendar').select('id,school_year,term,week_number,deadline_date,district_id,is_active').eq('school_year',year).eq('is_published',true).order('id'));
        const resolution=resolveReportPeriod({...plan.request,schoolYear:year},calendar.filter(c=>!c.district_id||schools.some(s=>s.district_id===c.district_id)) as CalendarSlot[]);
        if(resolution.error)return {answer:resolution.error};
        const request=resolution as ReportRequest;
        const rows:Record<string,any>[]=[];
        const ids=people.map(p=>p.id);
        for(let i=0;i<ids.length;i+=100){
            rows.push(...await readReportRows(()=>{
                let q=db.from('submissions').select('id,user_id,subject,teaching_load_id,school_year,term_number,week_number,file_name,file_path,file_hash,doc_type,compliance_status,created_at').in('user_id',ids.slice(i,i+100)).eq('school_year',year).order('id');
                if(request.week)q=q.eq('week_number',request.week);
                if(request.term)q=q.or(`term_number.eq.${request.term},term_number.is.null`);
                return q;
            }));
        }
        // Count saved uploads, including supplementary and administrative documents.
        // Missing placeholders and local/queued files are never uploaded-document facts.
        let selected=[...new Map(rows.map(row=>[row.id,row])).values()].filter(r=>['DLL','DLP','ISP','ISR'].includes(r.doc_type)&&r.compliance_status!=='missing'&&!String(r.file_hash||'').startsWith('nc_')&&(r.file_name||r.file_path)&&(!request.term||submissionTerm(r)===request.term));
        const loads:Record<string,any>[]=[];
        if(request.subject||request.grade||plan.group==='subject'){
            for(let i=0;i<ids.length;i+=100)loads.push(...await readReportRows(()=>db.from('teaching_loads').select('id,grade_level,subject').in('user_id',ids.slice(i,i+100)).order('id')));
        }
        const loadMap=new Map(loads.map(l=>[l.id,l]));
        const subjectOf=(row:Record<string,any>)=>loadMap.get(row.teaching_load_id)?.subject||row.subject||'';
        const canonical=(value:string)=>{
            const n=normalizeReportName(value||'').replace(/^physical education\b/,'pe');
            const aliases:Record<string,string>={math:'mathematics',ap:'araling panlipunan',hgp:'homeroom guidance',tle:'epp','epp tle':'epp'};
            return aliases[n]||n;
        };
        if(request.subject){
            const wanted=canonical(request.subject);
            selected=selected.filter(r=>canonical(subjectOf(r))===wanted || canonical(subjectOf(r)).startsWith(wanted+' '));
        }
        if(request.grade){
            const grade=(v:string)=>/^kinder/i.test(v)?'kindergarten':normalizeReportName(v||'').replace(/^grade /,'');
            const loadIds=new Set(loads.filter(l=>grade(l.grade_level)===grade(request.grade!)).map(l=>l.id));
            selected=selected.filter(r=>loadIds.has(r.teaching_load_id));
        }
        const requestedType=plan.documentType;
        if(requestedType)selected=selected.filter(r=>['DLL','DLP'].includes(requestedType)?['DLL','DLP'].includes(r.doc_type):r.doc_type===requestedType);
        const allCount=selected.length;
        let matches=selected;
        if(plan.metric==='late')matches=selected.filter(r=>r.compliance_status==='late');
        if(plan.metric==='on-time')matches=selected.filter(r=>['compliant','on-time'].includes(r.compliance_status));
        if(plan.metric==='supplementary')matches=selected.filter(r=>['supplementary','extra'].includes(r.compliance_status));
        if(plan.metric==='checked'||plan.metric==='for-checking'){
            const reviews:Record<string,any>[]=[];
            for(let i=0;i<selected.length;i+=100)reviews.push(...await readReportRows(()=>db.from('dll_reviews').select('id,submission_id,status,reviewer_comment').in('submission_id',selected.slice(i,i+100).map(r=>r.id)).order('id')));
            const byId=new Map(reviews.map(review=>[review.submission_id,review]));
            matches=selected.filter(row=>savedReviewStatus(row,byId.get(row.id))===(plan.metric==='checked'?'Checked':'For checking'));
        }
        const period=[`School Year ${year}`,request.term?`Term ${request.term}`:'all terms',request.week?`Week ${request.week}`:'all weeks',request.subject,request.grade,requestedType].filter(Boolean).join(' · ');
        const schoolNames=schools.map(s=>s.name).join(', ');
        const scope=ctx!.profile!.role==='Teacher'||request.scope==='self'?ctx!.profile!.full_name:(schools.length===1?schoolNames:districts.filter(d=>schools.some(s=>s.district_id===d.id)).map(d=>d.name).join(', '));
        const count=plan.measure==='people'?new Set(matches.map(r=>r.user_id)).size:matches.length;
        const status=plan.metric==='total'?'':plan.metric==='for-checking'?' awaiting checking':` ${plan.metric}`;
        const unit=plan.measure==='people'?(count===1?'uploader':'uploaders'):(count===1?'uploaded document':'uploaded documents');
        const supplementary=matches.filter(r=>['DLL','DLP'].includes(r.doc_type)&&['supplementary','extra'].includes(r.compliance_status)).length;
        const administrative=matches.filter(r=>['ISP','ISR'].includes(r.doc_type)).length;
        const weekly=matches.filter(r=>['DLL','DLP'].includes(r.doc_type)&&!['supplementary','extra'].includes(r.compliance_status)).length;
        let answer=lang==='tl'
            ? `Para sa ${period}, may ${count}${status} ${plan.measure==='people'?'natatanging uploader':'na-upload na dokumento'} sa ${scope}.`
            : `For ${period}, ${scope} has ${count}${status} ${unit}.`;
        if(plan.measure==='people')answer+=lang==='tl'?` Binilang ang bawat uploader nang isang beses; may ${matches.length} tugmang dokumento.`:` Each uploader is counted once across ${matches.length} matching documents.`;
        else if(plan.metric==='total')answer+=lang==='tl'?` Kasama rito ang ${weekly} regular weekly lesson plans, ${supplementary} supplementary lesson-plan uploads, at ${administrative} administrative documents (ISP/ISR).`:` The breakdown is ${weekly} regular weekly lesson ${weekly===1?'plan':'plans'}, ${supplementary} supplementary lesson-plan ${supplementary===1?'upload':'uploads'}, and ${administrative} administrative ${administrative===1?'document':'documents'} (ISP/ISR).`;
        else answer+=lang==='tl'?` May ${allCount} confirmed uploads sa napiling saklaw bago ang status filter.`:` There are ${allCount} confirmed uploads in this scope before the status filter.`;
        answer+=lang==='tl'?' Bilang ito ng saved uploads, hindi ng expected compliance requirements.':' This is a saved-upload count, not a count of expected compliance requirements.';
        const personMap=new Map(people.map(p=>[p.id,p]));const schoolMap=new Map(schools.map(s=>[s.id,s.name]));
        const group=(row:Record<string,any>)=>plan.group==='school'?schoolMap.get(personMap.get(row.user_id)?.school_id)||'School':plan.group==='subject'?subjectOf(row)||'Unspecified subject':(['DLL','DLP'].includes(row.doc_type)?'Daily Lesson Plan':row.doc_type);
        const grouped=new Map<string,Set<string>>();
        if(plan.group)for(const row of matches){const key=group(row);const entries=grouped.get(key)||new Set<string>();entries.add(plan.measure==='people'?row.user_id:row.id);grouped.set(key,entries);}
        const breakdown=[...grouped].map(([label,entries])=>[label,entries.size] as const).sort((a,b)=>b[1]-a[1]);
        if(breakdown.length)answer+='\n\n'+breakdown.slice(0,20).map(([label,n])=>`• ${label}: ${n} ${unit}`).join('\n');
        if(plan.operation==='status-overview'){
            const required=await createChatReport(db,ctx!.profile,ctx!.userId,{...request,format:'chat'},lang);
            if(!required.facts)return {answer:answer+'\n\nThe uploaded-file count above is confirmed, but missing/overdue requirement counts could not be verified: '+required.answer};
            const f=required.facts;
            answer+=lang==='tl'?`\n\nMga status ng saved files: ${selected.filter(r=>['on-time','compliant'].includes(r.compliance_status)).length} on time/compliant; ${selected.filter(r=>r.compliance_status==='late').length} late; ${selected.filter(r=>['supplementary','extra'].includes(r.compliance_status)).length} supplementary.\nMga requirement na wala pang upload: ${f.overdue} overdue; ${f.summary.upcoming} upcoming; ${f.summary.onLeave} approved leave na hindi kasama sa expected. Ang ${f.pendingOverdue} overdue requirements ay may pending leave request.`
            :`\n\nSaved-file statuses: ${selected.filter(r=>['on-time','compliant'].includes(r.compliance_status)).length} on time/compliant; ${selected.filter(r=>r.compliance_status==='late').length} late; ${selected.filter(r=>['supplementary','extra'].includes(r.compliance_status)).length} supplementary.\nUnsubmitted requirements: ${f.overdue} overdue; ${f.summary.upcoming} upcoming; ${f.summary.onLeave} approved leave excluded from expected work. Of the overdue requirements, ${f.pendingOverdue} have a pending leave request.`;
        }
        if(breakdown.length>20)answer+=`\n${breakdown.length-20} more groups are included in the exported report.`;
        if(plan.explain)answer+=lang==='tl'?'\n\nKinuha ko ang confirmed submission rows sa database gamit ang inyong access at ang napiling year, term, week, subject, at grade. Hindi kasama ang missing placeholders, naburang records, o files na nagsi-sync pa.':'\n\nI counted confirmed submission records from the database using your permitted scope and selected year, term, week, subject, and grade. Missing placeholders, deleted records, and files still syncing locally are excluded.';
        const result:{answer:string;resolvedRequest:ReportRequest;attachments?:{fileName:string;blob:Blob}[]}={answer,resolvedRequest:request};
        if(request.format!=='chat'){
            const base=`CEDIMS-upload-count-${year}${request.term?`-T${request.term}`:''}${request.week?`-W${request.week}`:''}`;
            const statusSummary=summarizeSavedReportRows(matches);
            const groupSentence=(line:string)=>{
                const match=line.replace(/^•\s*/, '').match(/^(.+?):\s*(\d+)\s+(.+)$/);
                return match ? `${match[1]} accounts for ${match[2]} ${match[3]}.` : line;
            };
            const paragraphs=answer.split('\n\n').flatMap(part=>part.split('\n')).map(groupSentence)
                .concat(breakdown.slice(20).map(([label,n])=>groupSentence(`${label}: ${n} ${unit}`)))
                .concat(`The exported files have these saved submission statuses: ${statusSummary.statusRows.map(row=>`${row.label}: ${row.count}`).join('; ')}. Document types are ${statusSummary.typeRows.map(row=>`${row.type}: ${row.count}`).join('; ')}.`);
            const options={title:'Uploaded Documents Report',subtitle:`${scope} · ${period}`,paragraphs,meta:[{label:'Measure',value:unit},{label:'Total',value:String(count)},{label:'Source',value:'Confirmed saved CEDIMS submissions'}],tables:[
                {title:'Summary',headers:['Measure','Value'],rows:[['Matching uploads',statusSummary.total],['Unique uploaders',new Set(matches.map(row=>row.user_id)).size]]},
                {title:'Submission statuses',headers:['Status','Files'],rows:statusSummary.statusRows.map(row=>[row.label,row.count]),totalsRow:['Total saved',statusSummary.total]},
                {title:'Document types',headers:['Type','Files'],rows:statusSummary.typeRows.map(row=>[row.type,row.count]),totalsRow:['Total saved',statusSummary.total]},
                {title:'Uploaded documents',headers:['File','Uploader','School','Subject','Type','Term','Week','Status','Submitted'],rows:matches.map(r=>[r.file_name||'Document',personMap.get(r.user_id)?.full_name||'User',schoolMap.get(personMap.get(r.user_id)?.school_id)||'School',r.subject||'—',r.doc_type,submissionTerm(r)||'—',r.week_number||'—',r.compliance_status,new Date(r.created_at).toLocaleString('en-PH',{timeZone:'Asia/Manila'})])}
            ]};
            result.attachments=[];
            if(['excel','both'].includes(request.format)){const {buildReportWorkbook}=await import('./excelExport');const buffer=await buildReportWorkbook({...options,fileName:`${base}.xlsx`});result.attachments.push({fileName:`${base}.xlsx`,blob:new Blob([buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})});}
            if(['word','both'].includes(request.format)){const {buildReportDocument}=await import('./wordExport');result.attachments.push({fileName:`${base}.docx`,blob:await buildReportDocument({...options,tables:[],fileName:`${base}.docx`})});}
        }
        return result;
    }catch{return {answer:lang==='tl'?'Hindi ko makumpleto ang bilang mula sa database ngayon. Pakisuri ang koneksyon at subukan muli; hindi ako magbibigay ng tinantiyang bilang.':'I could not complete the database count right now. Check your connection and try again; I will not substitute an estimated total.'};}
}
