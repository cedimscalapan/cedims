import {parseReportRequest,type ReportRequest} from './reportRequest';

export type ChatDataPlan={operation:'uploads'|'compliance'|'queue'|'status-overview';metric:'total'|'late'|'on-time'|'supplementary'|'missing'|'checked'|'for-checking';measure:'documents'|'people';group?:'school'|'subject'|'type';documentType?:string;explain?:boolean;request:ReportRequest};

/** Identify the requested operation and unit before choosing a response. */
export function planChatDataQuestion(text:string,previous?:ChatDataPlan):ChatDataPlan|null{
    const q=text.toLowerCase().replace(/\s+/g,' ').trim();
    const count=/\b(?:how many|total|count|number|ilan|ilang|bilang|dami)\b/.test(q);
    const records=/\b(?:upload(?:ed|s)?|documents?|files?|submissions?|dlls?|dlps?|isps?|isrs?|na[ -]?upload|nai[ -]?upload|naisumite|dokumento)\b/.test(q);
    const howTo=/^(?:how (?:do|can|to|should)|paano)\b/.test(q)&&!count;
    if(howTo && !/\b(?:word|excel|docx|xlsx)\b/.test(q))return null;
    const overview=/\b(?:all (?:types|statuses)|status breakdown|each status|by status)\b/.test(q);
    const follow=!!previous && (overview || /^(?:what about|how about|and |now|same|that|it\b|week |term |for |by |only |just |late\b|missing\b|overdue\b|supplementary\b|compliant\b|break(?: it| that)? down|in (?:word|excel)|export|put (?:it|that)|why|explain|sa |gawin|bakit|paano naman|(?:can|could) you (?:put|export|make|write|give)|please (?:put|export|make))/.test(q));
    const ranking=records&&/\b(?:most|least|breakdown|per school|per subject|by school|by subject)\b/.test(q);
    const shortPeriod=/\b(?:uploaded|uploads|documents|files|submissions|missing|overdue|late|compliants?|supplementary|checked)\b/.test(q)&&/\b(?:week|term|linggo)\s*(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b/.test(q)&&!/\b(?:failed|error|cannot|can't|mismatch|duplicate|wrong|replace)\b/.test(q);
    if(!(count&&(records||/\b(?:missing|overdue|late|checked|pending|compliance|compliants?|supplementary)\b/.test(q)))&&!ranking&&!shortPeriod&&!follow&&!(overview&&records))return null;
    let operation:ChatDataPlan['operation']=follow?previous!.operation:'uploads';
    if(/\b(?:pending (?:uploads?|sync)|queued (?:files?|uploads?)|upload queue)\b/.test(q))operation='queue';
    else if(overview||(/\b(?:missing|overdue)\b/.test(q)&&/\b(?:late|supplementary|compliant)\b/.test(q)))operation='status-overview';
    else if(/\b(?:missing|overdue|required|expected|compliance|completion|leave)\b/.test(q))operation='compliance';
    else if(records)operation='uploads';
    if(!overview && /\b(?:late|on[ -]?time|compliants?|supplementary|checked|for checking)\b/.test(q) && !/\b(?:missing|overdue|required|expected|compliance|completion)\b/.test(q))operation='uploads';
    const request=parseReportRequest(follow?`same ${text}`:text,follow?previous?.request:undefined);
    // Answers default to chat; files are generated only when explicitly requested.
    if(!/\b(?:excel|xlsx|word|docx)\b/.test(q))request.format='chat';
    let metric:ChatDataPlan['metric']=follow?previous!.metric:'total';
    if(/\b(?:for checking|unchecked|not checked|unreviewed)\b/.test(q))metric='for-checking';
    else if(/\bchecked\b/.test(q))metric='checked';
    else if(/\blate\b/.test(q))metric='late';
    else if(/\b(?:on[ -]?time|compliants?)\b/.test(q))metric='on-time';
    else if(/\b(?:supplementary|extras?)\b/.test(q))metric='supplementary';
    else if(/\b(?:missing|overdue)\b/.test(q))metric='missing';
    else if(/\b(?:total|all uploads|all documents)\b/.test(q))metric='total';
    const measure=/\b(?:how many|number of|count|ilang|bilang ng)\s+(?:active )?(?:teachers|users|uploaders|guro)\b/.test(q)?'people':(follow?previous!.measure:'documents');
    if(operation==='status-overview')metric='total';
    let group=follow?previous?.group:undefined;
    if(/\b(?:by|per|each) school\b|which school|pinakamaraming paaralan/.test(q))group='school';
    if(/\b(?:by|per|each) subject\b/.test(q))group='subject';
    if(/\b(?:by|per|each) (?:document )?type\b/.test(q))group='type';
    let documentType=text.match(/\b(DLL|DLP|ISP|ISR)s?\b/i)?.[1]?.toUpperCase()||(follow?previous?.documentType:undefined);
    if(/\ball (?:document )?types\b/.test(q))documentType=undefined;
    return {operation,metric,measure,group,documentType,request,explain:/^(?:why|explain|bakit)|how.*count/.test(q)};
}
