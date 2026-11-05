export type ReportRequest = {
    question:string; format:'chat'|'excel'|'word'|'both'; style:'sentences'|'bullets';
    week?:number; term?:number; relativeWeek?:'current'|'previous'; currentTerm?:boolean;
    subject?:string; grade?:string; schoolYear?:string; scope?:'self'|'school'|'district'; error?:string;
    allSubjects?:boolean;
};
const subjectNames: [RegExp,string][] = [
    [/\b(?:mathematics|math|matematika)\b/i,'Mathematics'],[/\bscience\b/i,'Science'],[/\benglish\b/i,'English'],
    [/\bfilipino\b/i,'Filipino'],[/\bgmrc\b/i,'GMRC'],[/\b(?:hgp|homeroom guidance)\b/i,'HGP'],
    [/\bmapeh\b/i,'MAPEH'],[/\bmakabansa\b/i,'Makabansa'],[/\b(?:araling panlipunan|ap)\b/i,'Araling Panlipunan'],
    [/\bepp\b/i,'EPP'],[/\bnumeracy\b/i,'Numeracy'],[/\blanguage\b/i,'Language'],[/\breading(?: and literacy)?\b/i,'Reading'],
    [/\bmusic\b/i,'Music'],[/\barts\b/i,'Arts'],[/\b(?:physical education|pe)\b/i,'PE'],[/\bhealth\b/i,'Health']
];
export const normalizeReportName=(value:string)=>value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();

export function isReportRequest(text:string, previousIntent?:string) {
    return /\b(?:reports?|reprots?|ulat|buod|narrative|excel|xlsx|docx|word document|word file|summari[sz]e|summary)\b/i.test(text)
        || (previousIntent==='create_report' && (/\b(?:week|term|quarter|subject|school|district|word|bullets?|sentences?|pangungusap|linggo|termino|paaralan|instead|same|naman)\b/i.test(text)||subjectNames.some(([pattern])=>pattern.test(text))));
}

export function parseReportRequest(text:string, previous?:ReportRequest):ReportRequest {
    const numbers:Record<string,number>={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,i:1,ii:2,iii:3,iv:4,v:5,vi:6,vii:7,viii:8,ix:9,x:10,xi:11,xii:12,isa:1,dalawa:2,tatlo:3,apat:4,lima:5,anim:6,pito:7,walo:8,siyam:9,sampu:10};
    text=text.replace(/\b(week|wk|term|quarter|linggo|termino)\s+([a-z]+)\b/gi,(match,label,value)=>numbers[value.toLowerCase()]?`${label} ${numbers[value.toLowerCase()]}`:match);
    const follow=!!previous && (/^(?:same|that|it\b|export|download|make it|put (?:it|that)|in (?:word|excel)|as (?:a |an )?(?:word|excel)|now|what about|how about|for |this |week |term |gawin|sa |paki.*naman)/i.test(text.trim())||/\b(?:naman|instead)\b/i.test(text));
    const request:ReportRequest=follow ? {...previous} : {question:text,format:'chat',style:'sentences'};
    request.question=follow ? `${previous!.question}\n${text}` : text;
    if(follow && /\bschool\b(?!\s+year)|\b(?:district|paaralan|distrito)\b/i.test(text))request.question=text;
    delete request.error;
    const excel=/\b(?:excel|xlsx|spreadsheet)\b/i.test(text), word=/\b(?:word|docx)\b/i.test(text);
    if(excel || word) request.format=excel&&word?'both':excel?'excel':'word';
    if(/\b(?:chat|here|dito|no file|without.*file)\b/i.test(text)) request.format='chat';
    if(/\b(?:bullet|bullets|list form)\b/i.test(text)) request.style='bullets';
    if(/\b(?:sentence|sentences|paragraph|narrative|pangungusap|talata)\b/i.test(text)) request.style='sentences';
    const week=text.match(/\b(?:week|wk|linggo)\s*#?\s*(\d+)\b/i), term=text.match(/\b(?:term|quarter|termino)\s*#?\s*(\d+)\b/i);
    if(week){request.week=Number(week[1]);delete request.relativeWeek;}
    if(term){request.term=Number(term[1]);delete request.currentTerm;if(!week){delete request.week;delete request.relativeWeek;}}
    if(/\b(?:this|current) week\b|ngayong linggo|kasalukuyang linggo/i.test(text)){request.relativeWeek='current';delete request.week;}
    if(/\b(?:last|previous) week\b|nakaraang linggo/i.test(text)){request.relativeWeek='previous';delete request.week;}
    if(/\b(?:this|current) (?:term|quarter)\b|kasalukuyang termino/i.test(text)){request.currentTerm=true;delete request.term;if(!week&&!/\b(?:this|current) week\b/i.test(text)){delete request.week;delete request.relativeWeek;}}
    if(/\ball (?:weeks|terms|periods)\b|whole school year/i.test(text)){delete request.week;delete request.term;delete request.relativeWeek;delete request.currentTerm;}
    const sy=text.match(/\b(20\d{2})\s*[-–/]\s*(20\d{2})\b/); if(sy)request.schoolYear=`${sy[1]}-${sy[2]}`;
    const grade=text.match(/\b(?:grade|baitang)\s*(\d+)\b|\b(kinder(?:garten)?)\b/i);
    if(grade)request.grade=grade[2]?'Kindergarten':`Grade ${grade[1]}`;
    const subject=subjectNames.find(([pattern])=>pattern.test(text)); if(subject){request.subject=subject[1];delete request.allSubjects;}
    const namedSubject=text.match(/\bsubject\s*[:=]\s*([a-z][a-z ]*?)(?=\s+(?:term|week|grade|for|in)\b|[.,;]|$)/i);
    if(namedSubject){request.subject=namedSubject[1].trim();delete request.allSubjects;}
    if(/\ball subjects\b|lahat ng asignatura/i.test(text)){delete request.subject;request.allSubjects=true;}
    if(/\b(?:my own|personal|sarili|my (?:uploads?|uploaded documents?|documents?|files?|submissions?)|(?:did|have) i (?:upload(?:ed)?|submit(?:ted)?)|na[ -]?upload ko|naisumite ko)\b/i.test(text))request.scope='self';
    else if(/\b(?:district|distrito)\b/i.test(text))request.scope='district';
    else if(/\bschool\b(?!\s+year)|\bpaaralan\b/i.test(text))request.scope='school';
    if(request.week!==undefined && (!Number.isInteger(request.week)||request.week<1||request.week>53))request.error='Please choose a week from 1 to 53.';
    if(request.term!==undefined && ![1,2,3].includes(request.term))request.error='Please choose Term 1, 2, or 3.';
    if(request.schoolYear && Number(request.schoolYear.slice(5))!==Number(request.schoolYear.slice(0,4))+1)request.error='Please use a consecutive school year, for example 2026-2027.';
    return request;
}

/** Match the academic period belonging to the current Philippine calendar week. */
export function resolveReportPeriod(request:ReportRequest, calendar:{term:number;week_number:number;deadline_date:string}[], now=Date.now()) {
    const monday=(date:number)=>{
        const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
        const part=(type:string)=>Number(parts.find(p=>p.type===type)?.value);
        const day=new Date(Date.UTC(part('year'),part('month')-1,part('day')));
        return day.getTime()-((day.getUTCDay()+6)%7)*86400000;
    };
    const current=calendar.filter(c=>Number.isFinite(Date.parse(c.deadline_date)) && monday(Date.parse(c.deadline_date))===monday(now));
    const periods=[...new Map(current.map(c=>[`${c.term}|${c.week_number}`,c])).values()];
    const result={...request};
    if(result.relativeWeek || result.currentTerm){
        if(periods.length!==1) return {error:'I could not identify one current academic period. Please specify the term and week from Tracker.'};
        const currentPeriod=periods[0];
        result.term=currentPeriod.term;
        if(result.relativeWeek==='previous'){
            const prior=calendar.filter(c=>Date.parse(c.deadline_date)<Date.parse(currentPeriod.deadline_date) && `${c.term}|${c.week_number}`!==`${currentPeriod.term}|${currentPeriod.week_number}`).sort((a,b)=>Date.parse(b.deadline_date)-Date.parse(a.deadline_date))[0];
            if(!prior)return {error:'No previous academic week is available. Please specify the term and week.'};
            result.week=prior.week_number;result.term=prior.term;
        }else if(result.relativeWeek)result.week=currentPeriod.week_number;
    }
    if(result.week!==undefined && result.term===undefined){
        const terms=[...new Set(calendar.filter(c=>c.week_number===result.week).map(c=>c.term))];
        if(terms.length===1)result.term=terms[0];
        else if(periods.length===1 && terms.includes(periods[0].term))result.term=periods[0].term;
        else return {error:`Week ${result.week} occurs in multiple terms or is unavailable. Please specify its term.`};
    }
    return result;
}
