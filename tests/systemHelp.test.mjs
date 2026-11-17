import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const url=source=>`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`;
const source=path=>readFileSync(path,'utf8');
const helpUrl=url(source('src/lib/utils/systemHelp.ts'));
const {answerSystemHelp}=await import(helpUrl);
const deadlineUrl=url(source('src/lib/utils/deadlineRules.ts'));
const complianceUrl=url(source('src/lib/utils/compliance.ts').replace("from './deadlineRules'",`from '${deadlineUrl}'`));
const yearUrl=url(source('src/lib/utils/schoolYear.ts'));
const requestUrl=url(source('src/lib/utils/reportRequest.ts'));
const planUrl=url(source('src/lib/utils/chatQueryPlan.ts').replace("from './reportRequest'",`from '${requestUrl}'`));
const chatbotSource=source('src/lib/utils/chatbot.ts')
    .replace("import intentModel from '../models/intent_classifier_model.json';",`const intentModel=${source('src/lib/models/intent_classifier_model.json')};`)
    .replace("from './systemHelp'",`from '${helpUrl}'`)
    .replace("from './reportRequest'",`from '${requestUrl}'`)
    .replace("from './chatQueryPlan'",`from '${planUrl}'`)
    .replace("from './schoolYear'",`from '${yearUrl}'`)
    .replace("from './deadlineRules'",`from '${deadlineUrl}'`)
    .replace("from './compliance'",`from '${complianceUrl}'`);
const {processQuery}=await import(url(chatbotSource));

test('workflow guidance covers actual current upload and review rules',()=>{
    const cases=[
        ['Can I upload more than 3 days after the deadline?', 'late', /explicitly closed/],
        ['I uploaded HGP but only have GMRC','hgp',/same grade/],
        ['Why does the fuzzy classifier show mismatch?','matching',/Learning Area/],
        ['I chose the wrong file','replacement',/should clear/],
        ['Duplicate upload after I deleted the document','duplicates',/database/],
        ['It is still syncing, is it successful?','sync',/not yet confirmed/],
        ['How do I create a remark?','remarks',/one shared/],
        ['Do I have to revise and resubmit?','remarks',/does not require/],
        ['Why is my grade unassigned?','loads',/active assigned/],
        ['How do I reset my password?','password',/address you entered/],
        ['How do I enlarge text?','zoom',/floating Aa icon/],
        ['What tabs can each role use?','roles',/throughout your school/]
    ];
    for(const [q,topic,expected] of cases){
        const result=answerSystemHelp(q,'en');
        assert.equal(result?.topic,topic,q);assert.match(result.answer,expected,q);
    }
});
test('Tagalog and contextual follow-up remain on the correct topic',async()=>{
    const first=await processQuery('Paano po mag reset ng password?');
    assert.equal(first.lang,'tl');assert.match(first.answer,/nakarehistro/);
    const follow=await processQuery('paano po?',{memory:{lastLang:first.lang,lastSlots:first.slots}});
    assert.equal(follow.slots.helpTopic,'password');assert.equal(follow.lang,'tl');
});
test('live record questions bypass static guidance',()=>{
    for(const q of ['How many checked documents do I have?','Find my lesson plans in Archives','Show teachers with pending reviews','What is my compliance rate?','When is the next deadline?','When is my next submission deadline?']){
        assert.equal(answerSystemHelp(q,'en'),null,q);
    }
});
test('specific guidance wins even if the legacy classifier predicts another intent',async()=>{
    for(const q of ['Can I upload after the deadline?', 'How do I reset my password?', 'How do I upload a Daily Lesson Plan?']){
        const reply=await processQuery(q);assert.equal(reply.confidence,100,q);assert.equal(reply.intent,'general_help');assert.ok(reply.slots.helpTopic);
    }
});
test('current account records are never promised before sign-in',async()=>{
    const reply=await processQuery('What is my compliance rate?');
    assert.match(reply.answer,/sign in|Which part/);assert.doesNotMatch(reply.answer,/Let me check|One moment/);
});

function mockDb(tables) {
    const calls=[];
    return {calls,from(table){
        const filters=[];
        const query=new Proxy({}, {get(_target,key){
            if(key==='then') return resolve=>resolve({data:tables[table]||[],error:null});
            return (...args)=>{filters.push([key,...args]);calls.push([table,key,...args]);return query;};
        }});
        return query;
    }};
}
test('next deadline checks the assigned school and published calendar',async()=>{
    const db=mockDb({schools:[{id:'school',district_id:'district',name:'Test School'}],academic_calendar:[],teaching_loads:[]});
    await processQuery('When is the next deadline?',{supabase:db,userId:'teacher',profile:{role:'Teacher',school_id:'school',district_id:'district'}});
    assert.ok(db.calls.some(([table,method,field,value])=>table==='schools'&&method==='eq'&&field==='id'&&value==='school'));
    assert.ok(db.calls.some(([table,method,field,value])=>table==='academic_calendar'&&method==='eq'&&field==='is_published'&&value===true));
});
