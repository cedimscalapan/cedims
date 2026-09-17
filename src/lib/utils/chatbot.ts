import intentModel from '../models/intent_classifier_model.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentSchoolYear as getDynamicSchoolYear } from './schoolYear';

// ─── Text Normalization ────────────────────────────────────────────────────
// Makes the bot robust to typos, wrong grammar, repeated characters, emojis,
// and diacritics. All light-weight, pure string ops — no heavy model.

const DIACRITIC_MAP: Record<string, string> = {
    'á': 'a', 'à': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a', 'ā': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e', 'ẽ': 'e', 'ē': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i', 'ī': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o', 'ō': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u', 'ū': 'u',
    'ñ': 'n', 'ç': 'c', 'š': 's', 'ž': 'z', 'ý': 'y', 'ÿ': 'y', 'ß': 'ss'
};

function stripDiacritics(text: string): string {
    return text.replace(/[áàâäãåāéèêëẽēíìîïīóòôöõōúùûüūñçšžýÿß]/g, ch => DIACRITIC_MAP[ch] || ch);
}

function removeEmojis(text: string): string {
    return text.replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{FE0F}\u{2190}-\u{21FF}]/gu, ' ');
}

function collapseRepeats(text: string): string {
    return text.replace(/(\w)\1{2,}/g, '$1$1');
}

function normalizeText(text: string): string {
    return stripDiacritics(removeEmojis(text))
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function levenshtein(a: string, b: string): number {
    const m = a.length, n = b.length;
    if (m === 0) return n;
    if (n === 0) return m;
    const dp: number[] = new Array(n + 1).fill(0).map((_, j) => j);
    for (let i = 1; i <= m; i++) {
        let prev = dp[0];
        dp[0] = i;
        for (let j = 1; j <= n; j++) {
            const tmp = dp[j];
            dp[j] = Math.min(
                dp[j] + 1,
                dp[j - 1] + 1,
                prev + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
            prev = tmp;
        }
    }
    return dp[n];
}

/** Best fuzzy word match against a dictionary, returning the matched word + score. */
function fuzzyMatch(token: string, dictionary: string[], maxDist: number = 1): string | null {
    const t = collapseRepeats(token);
    for (const word of dictionary) {
        if (word === t) return word;
    }
    if (t.length < 3) return null;
    let best: string | null = null;
    let bestDist = maxDist + 1;
    for (const word of dictionary) {
        const d = levenshtein(t, word);
        if (d <= maxDist && d < bestDist) {
            bestDist = d;
            best = word;
        }
    }
    return best;
}

// Common dictionary used for fuzzy slot extraction & knowledge matching.
const FUZZY_DICT = [
    'compliant', 'compliance', 'complience', 'submission', 'submissions', 'late', 'missing',
    'deadline', 'deadlines', 'week', 'weeks', 'grade', 'teacher', 'teachers', 'school',
    'district', 'dll', 'dlls', 'calendar', 'upload', 'uploading', 'compare', 'comparison',
    'ranking', 'statistics', 'stats', 'calendar', 'fractions', 'mathematics', 'science',
    'english', 'filipino', 'grade', 'year', 'term', 'quarter', 'today', 'this', 'next'
];

// ─── Language Detection ────────────────────────────────────────────────────
// Lightweight, no external model: count how many tokens are common Tagalog
// function words. Good enough to route between English and Tagalog reply
// sets for Taglish-heavy input, without needing a real language ID model.
export type Lang = 'en' | 'tl';

const TAGALOG_MARKERS = new Set([
    'ako', 'ko', 'mo', 'niya', 'namin', 'natin', 'nila', 'ninyo', 'ikaw', 'siya',
    'kami', 'tayo', 'sila', 'kayo', 'akin', 'iyo', 'kanya', 'atin',
    'ang', 'ng', 'nang', 'sa', 'mga', 'ito', 'iyan', 'iyon', 'dito', 'diyan', 'doon',
    'ba', 'po', 'opo', 'oo', 'hindi', 'wala', 'meron', 'mayroon', 'may',
    'paano', 'ano', 'saan', 'kailan', 'bakit', 'sino', 'alin', 'gaano', 'ilan',
    'kumusta', 'kamusta', 'salamat', 'pakiusap', 'pakisuyo', 'paki',
    'na', 'pa', 'naman', 'lang', 'din', 'rin', 'daw', 'raw', 'kasi', 'dahil',
    'kung', 'kapag', 'kailangan', 'gusto', 'puwede', 'pwede', 'maaari',
    'nasaan', 'nasa', 'para', 'tungkol', 'kanino', 'kelan', 'magkano',
    'ganito', 'ganyan', 'ganoon', 'noon', 'ngayon', 'bukas', 'kahapon',
    'linggo', 'buwan', 'taon', 'araw', 'oras', 'sige', 'tara', 'ayos',
    'hanapin', 'ipakita', 'ipaliwanag', 'suriin', 'ihambing', 'tingnan', 'tignan',
    'bagong', 'lahat', 'bawat', 'kanina', 'medyo', 'talaga'
]);

/**
 * Guess whether a message is (Taglish-)Tagalog or English, so replies come
 * back in whichever language the user is actually speaking. Threshold is
 * deliberately low (any 2+ marker words, or >=20% of tokens) since even a
 * short Taglish sentence ("kumusta yung compliance ko?") should route to
 * Tagalog phrasing rather than defaulting to English.
 */
export function detectLanguage(text: string): Lang {
    const lower = normalizeText(text);
    const tokens = lower.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return 'en';
    let tlCount = 0;
    for (const tok of tokens) {
        const clean = tok.replace(/[^a-z]/g, '');
        if (clean && TAGALOG_MARKERS.has(clean)) tlCount++;
    }
    if (tlCount >= 2) return 'tl';
    return tlCount / tokens.length >= 0.2 ? 'tl' : 'en';
}

// ─── Human-like Phrasing ───────────────────────────────────────────────────
function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

const OPENERS: Record<Lang, string[]> = {
    en: [
        'Here you go!', 'Got it.', 'Sure thing!', 'Here’s what I found:', 'Of course!',
        'Alright, let’s see.', 'No problem, here’s what I have.',
        'Okay, pulled it up for you.', 'Here’s the latest.', 'Right, here we go.'
    ],
    tl: [
        'Heto na!', 'Ayan, nakuha ko na.', 'Sige, tignan natin.', 'Eto ang nakita ko:',
        'Ok lang, ayos na.', 'Heto, nakuha ko na ang kailangan mo.', 'Sandali, eto na.',
        'Ayan, updated na.', 'Ito ang bagong data.'
    ]
};
const LOW_CONFIDENCE_PREFIXES: Record<Lang, string[]> = {
    en: [
        'I think you might be asking about',
        'I’m not 100% sure, but this looks related to',
        'If I understand you correctly, you’re asking about',
        'I think you mean',
        'Correct me if I’m wrong — sounds like you’re asking about',
        'Let me take a guess — this seems to be about'
    ],
    tl: [
        'Sa tingin ko, tungkol ito sa',
        'Medyo hindi ako sigurado, pero mukhang tungkol ito sa',
        'Kung tama ang pagkaunawa ko, tinatanong mo ang tungkol sa',
        'Baka ito ang ibig mong sabihin:',
        'Tama ba kung tungkol ito sa'
    ]
};
const LOW_CONFIDENCE_SUFFIXES: Record<Lang, string[]> = {
    en: [
        'If that wasn’t what you meant, just rephrase it and I’ll give it another go.',
        'Let me know if I got that right.',
        'If I misread you, try rephrasing in a different way.',
        'Does that sound about right?',
        'Feel free to correct me if I’m off.',
        'Just say the word if you meant something else.'
    ],
    tl: [
        'Sabihin mo lang kung mali ako, aayusin ko agad.',
        'Sabihin mo kung tama ba ‘to.',
        'Kung mali ang pagkakaintindi ko, ulitin mo na lang sa ibang paraan.',
        'Tama ba ang nahulaan ko?',
        'Puwede mo akong itama kung kailangan.'
    ]
};
const INTENT_TOPIC_LABELS: Record<Lang, Record<Intent, string>> = {
    en: {
        ask_compliance: 'your compliance status',
        check_deadline: 'upcoming deadlines',
        find_dll: 'finding a DLL',
        school_compare: 'school comparisons',
        teacher_stats: 'teacher statistics',
        calendar_info: 'the academic calendar',
        how_to_upload: 'how to upload a document',
        general_help: 'general help'
    },
    tl: {
        ask_compliance: 'compliance status mo',
        check_deadline: 'mga paparating na deadline',
        find_dll: 'paghahanap ng DLL',
        school_compare: 'paghahambing ng paaralan',
        teacher_stats: 'istatistika ng guro',
        calendar_info: 'academic calendar',
        how_to_upload: 'kung paano mag-upload ng dokumento',
        general_help: 'pangkalahatang tulong'
    }
};
const CONFUSED_RESPONSES: Record<Lang, string[]> = {
    en: [
        'Hmm, I’m not quite sure I caught that. Could you rephrase it for me?',
        'I didn’t quite understand that. Try asking in a different way.',
        'That one’s a little fuzzy for me. Can you say it another way?',
        'I’m having trouble parsing that. Try something like, “What is my compliance rate?”',
        'I’m drawing a blank on that one — mind rewording it?',
        'That went a little over my head. Try asking about compliance, deadlines, DLLs, or schools?'
    ],
    tl: [
        'Pasensya na, hindi ko masyadong nakuha ‘yan. Puwede mo bang ulitin sa ibang paraan?',
        'Hindi ko masyadong naintindihan ‘yan. Subukan mong itanong sa ibang paraan.',
        'Medyo malabo sa akin ‘yan. Puwede mo bang sabihin ulit?',
        'Nahihirapan akong intindihin ‘yan. Subukan mo, “Ano ang compliance rate ko?”',
        'Blangko ako diyan — puwede mo bang i-rephrase?'
    ]
};

// ─── Knowledge Base (lightweight FAQ corpus) ───────────────────────────────
// Every topic maps to *multiple* phrasings per language, picked at random
// each time, so asking the same question twice in one session doesn't come
// back sounding copy-pasted — and the language picked matches how the user
// actually asked, not a coin flip.
interface KnowledgeEntry {
    keywords: string[];
    answers: Record<Lang, string[]>;
}

const KNOWLEDGE_BASE: KnowledgeEntry[] = [
    {
        keywords: ['dll', 'daily lesson log', 'weekly lesson log', 'lingguhang aralin', 'lesson plan', 'banghay'],
        answers: {
            en: [
                'A DLL (Daily Lesson Log) is the DepEd weekly lesson planning document that teachers prepare and submit for compliance monitoring. Each one covers the learning area, grade level, teaching dates, and week for your teaching load.',
                'DLL stands for Daily Lesson Log — it’s the weekly lesson plan every teacher submits per subject. The system checks its subject, grade, and week against your teaching load to see if you’re compliant.',
                'Think of a DLL as your weekly proof of teaching plans — one per subject, per week.'
            ],
            tl: [
                'Ang DLL (Daily Lesson Log) ay ang lingguhang banghay-aralin na kailangan mong i-submit para sa bawat asignatura, ginagamit para i-monitor ang compliance mo.',
                'Ang DLL ay ang lesson plan mo bawat linggo, per subject. Chinecheck ng system ang subject, grade, at week nito laban sa teaching load mo.',
                'DLL ang tawag sa lingguhang lesson plan — isa ito bawat subject, bawat linggo, kailangan i-submit para sa compliance.'
            ]
        }
    },
    {
        keywords: ['isp', 'instructional supervisory plan'],
        answers: {
            en: [
                'An ISP (Instructional Supervisory Plan) is the school’s supervisory blueprint — it lists program improvement areas, targets, strategies, and the timeframe for instructional monitoring and support.',
                'ISP = Instructional Supervisory Plan. It’s usually uploaded by a School Head or Master Teacher and outlines how instructional supervision will run for the term.'
            ],
            tl: [
                'Ang ISP (Instructional Supervisory Plan) ay ang plano ng paaralan para sa supervision — naglalaman ito ng mga target, estratehiya, at timeline para sa instructional monitoring.',
                'Karaniwang ini-upload ito ng School Head o Master Teacher — nagsasaad kung paano gagawin ang supervision sa buong term.'
            ]
        }
    },
    {
        keywords: ['isr', 'instructional supervisory report'],
        answers: {
            en: [
                'An ISR (Instructional Supervisory Report) is the report a Master Teacher files after observing a classroom — it records the teacher observed, findings, and the technical assistance given.',
                'ISR stands for Instructional Supervisory Report. It’s filed monthly after a classroom observation, and it’s separate from your regular DLL submissions.'
            ],
            tl: [
                'Ang ISR (Instructional Supervisory Report) ay ang report na isinusumite ng Master Teacher matapos mag-observe ng klase — naka-record dito ang guro, findings, at tulong na ibinigay.',
                'Buwanang isinusumite ito matapos mag-classroom observation, at hiwalay ito sa regular na DLL submissions.'
            ]
        }
    },
    {
        keywords: ['compliance', 'calculated', 'computed', 'rate', 'percent'],
        answers: {
            en: [
                'Compliance is your actual submissions divided by your expected submissions — expected being your active teaching loads × the weeks defined in the academic calendar. On time = compliant, after the deadline = late, never submitted = missing.',
                'Here’s the formula in plain terms: (compliant + late submissions) ÷ (teaching loads × calendar weeks) × 100. Submitting late still counts toward the rate — it’s only the ones you never submit that drag it down.'
            ],
            tl: [
                'Ang compliance ay ang aktwal mong na-submit hinati sa inaasahan — ang inaasahan ay ang active teaching loads mo × bilang ng linggo sa academic calendar. On time = compliant, huli = late, hindi na-submit = missing.',
                'Simpleng bersyon: kung ilan sa mga inaasahang DLL mo ang na-submit mo, on time man o late — iyan ang compliance rate mo. Extra ("Supplementary") DLLs ay hindi nakakaapekto rito.'
            ]
        }
    },
    {
        keywords: ['offline', 'internet', 'connect', 'sync', 'no network'],
        answers: {
            en: [
                'You can keep working offline — anything you upload while disconnected is saved locally and syncs automatically the moment you’re back online.',
                'No signal? No problem. The app queues your uploads on your device and pushes them to the server as soon as you reconnect — you don’t need to redo anything.'
            ],
            tl: [
                'Puwede ka pa ring mag-upload kahit walang internet — ise-save muna ito sa iyong device, tapos automatic na mag-sync pagbalik ng connection.',
                'Walang signal? Okay lang. Ise-save muna ng app ang upload mo sa device mo, tapos ipapadala ito sa server pagbalik ng koneksyon — hindi mo na kailangang ulitin.'
            ]
        }
    },
    {
        keywords: ['role', 'master teacher', 'school head', 'district supervisor', 'administrator'],
        answers: {
            en: [
                'Each role gets its own view: Teachers manage their own DLLs, Master Teachers review and endorse, School Heads monitor their whole school, and District Supervisors compare across every school in the district.',
                'It depends on who’s logged in — Teachers see their own uploads, School Heads see their staff, and District Supervisors see the district-wide picture with Analytics and Admin access on top.'
            ],
            tl: [
                'Iba-iba ang view depende sa role: Teachers para sa sariling DLLs, Master Teachers para sa review at endorsement, School Heads para sa buong paaralan, at District Supervisors para sa buong distrito.',
                'Depende sa naka-login — nakikita ng Teacher ang sariling upload, nakikita ng School Head ang staff niya, at nakikita ng District Supervisor ang buong distrito kasama ang Analytics at Admin.'
            ]
        }
    },
    {
        keywords: ['for checking', 'checked', 'reviewer comment', 'remark', 'remarks'],
        answers: {
            en: [
                'In the Archive, a document sits as "For Checking" until a reviewer leaves a remark on it — once a remark exists, it flips to "Checked." There’s no separate approval click; adding the remark is the review.',
                'Two states only: "For Checking" (no remark yet) and "Checked" (a reviewer has commented on it).'
            ],
            tl: [
                'Sa Archive, "For Checking" muna ang isang dokumento hanggang may maidagdag na remark ang reviewer — pag may remark na, magiging "Checked" ito. Walang hiwalay na approval, ang pagdagdag ng remark na mismo ang review.',
                'Dalawa lang ang status: "For Checking" (wala pang remark) at "Checked" (may naikomento na ang reviewer). Simple lang — walang ibang approval step.'
            ]
        }
    },
    {
        keywords: ['supplementary', 'extra dll', 'another dll', 'duplicate submission'],
        answers: {
            en: [
                'A "Supplementary" submission is an extra DLL for a week/subject that already has one on file — it’s kept for reference but never counts toward your compliance rate, upload totals, or a "missing" mark.',
                'Nag-upload ka ba ng pangalawang DLL sa parehong linggo at subject? That extra one gets tagged "Supplementary" — it’s just extra documentation, it won’t hurt or help your compliance number.'
            ],
            tl: [
                'Ang "Supplementary" ay dagdag na DLL para sa linggo/subject na may na-submit na — itinatago ito bilang reference pero hindi ito nabibilang sa compliance rate, total uploads, o "missing" mark.',
                'Nag-upload ka ba ng pangalawang DLL sa parehong linggo at subject? Ito ay tatawaging "Supplementary" — extra documentation lang ito, hindi nakakaapekto sa compliance number mo.'
            ]
        }
    },
    {
        keywords: ['deadline', 'when', 'due', 'cutoff', 'cut off', 'date'],
        answers: {
            en: [
                'Deadlines follow the academic calendar your district sets up. Ask me “When is the next deadline?” and I’ll pull the exact date for you.',
                'That depends on the week — ask me about a specific week or the next one coming up, and I’ll check the academic calendar live.'
            ],
            tl: [
                'Ang mga deadline ay batay sa academic calendar na itinakda ng distrito mo. Tanungin mo ako ng “Kailan ang susunod na deadline?” at kukunin ko agad ang eksaktong petsa.',
                'Depende sa linggo — tanungin mo ako tungkol sa specific na linggo o sa susunod, at che-check ko agad ang academic calendar.'
            ]
        }
    },
    {
        keywords: ['greeting', 'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'kamusta', 'kumusta'],
        answers: {
            en: [
                'Hello! I’m Gabay, your CEDIMS assistant. I can check your compliance, find DLLs, look up deadlines, compare schools, and show teacher stats. What would you like to know?',
                'Hey there! Ask me anything about your submissions, deadlines, or how the system works — happy to help.'
            ],
            tl: [
                'Kumusta! Ako si Gabay. Puwede mo akong tanungin tungkol sa compliance mo, deadlines, o kahit ano tungkol sa CEDIMS.',
                'Hoy, kumusta! Itanong mo lang sa akin ang tungkol sa submissions, deadlines, o kung paano gumagana ang system — masaya akong tumulong.'
            ]
        }
    },
    {
        keywords: ['salamat', 'thanks', 'thank you', 'maraming salamat', 'thank u'],
        answers: {
            en: [
                'You’re welcome! Anything else I can help you check?',
                'Happy to help! Let me know if you need anything else.',
                'Anytime! Ask me if anything else comes up.'
            ],
            tl: [
                'Walang anuman! May iba ka pa bang gustong i-check?',
                'Masaya akong makatulong! Sabihin mo lang kung may kailangan ka pa.',
                'Ayos lang yan! Tanungin mo lang ako kung may iba ka pang katanungan.'
            ]
        }
    },
    {
        keywords: ['who are you', 'your name', 'about yourself', 'what are you', 'sino ka', 'tell me about you'],
        answers: {
            en: [
                'I’m Gabay — Filipino for "guide." I live right in the app and answer using live data, no separate internet bill needed. Ask me anything about compliance, DLLs, deadlines, or school performance!'
            ],
            tl: [
                'Gabay ang pangalan ko — parang katulong mong laging nasa app, tutulong sayo mag-check ng compliance, maghanap ng DLL, o mag-alam ng deadlines.',
                'Ako si Gabay, ang CEDIMS assistant mo. Nabubuhay ako dito mismo sa app at sumasagot gamit ang live na datos — tanungin mo lang ako ng kahit ano tungkol sa system.'
            ]
        }
    },
    {
        keywords: ['status', 'compliant', 'late', 'missing', 'pending', 'under review'],
        answers: {
            en: [
                'The statuses you’ll see are: Compliant (submitted on time), Late (submitted after the deadline but still counted), Missing (never submitted), Supplementary (an extra, non-required copy), and Pending/Under Review while it’s being processed.',
                'Quick rundown: green means Compliant, gold/amber means Late, red means Missing, and blue usually means Supplementary or Under Review.'
            ],
            tl: [
                'Ang mga status na makikita mo: Compliant (naisumite sa oras), Late (naisumite pero pagkatapos ng deadline), Missing (hindi pa naisusumite), Supplementary (dagdag na kopya), at Pending/Under Review habang pinoproseso.',
                'Mabilisang gabay: berde ay Compliant, ginto/amber ay Late, pula ay Missing, at asul ay karaniwang Supplementary o Under Review.'
            ]
        }
    },
    {
        keywords: ['cedims', 'smarte vision', 'smart e vision', 'what does this app do', 'what is this app', 'what is this platform', 'purpose of this app'],
        answers: {
            en: [
                'CEDIMS stands for Calapan East District Instructional Monitoring System — it’s where teachers submit DLLs and supervisors track compliance across schools. SmartE Vision is the broader platform name behind it.',
                'This is CEDIMS — basically a digital home for DLL submissions, deadline tracking, and compliance monitoring, so nobody has to chase paperwork around anymore.'
            ],
            tl: [
                'Ang CEDIMS ay Calapan East District Instructional Monitoring System — dito nagsusumite ng DLL ang mga guro at sinusubaybayan ng mga supervisor ang compliance sa buong paaralan.',
                'Ito ang CEDIMS — parang digital na tahanan para sa DLL submissions, pagsubaybay ng deadline, at compliance monitoring, para wala nang kailangang maghabol ng papeles.'
            ]
        }
    },
    {
        keywords: ['dashboard', 'main page', 'home page', 'tabs', 'navigation'],
        answers: {
            en: [
                'Your Dashboard is the home screen — it shows your (or your school’s/district’s) compliance rate, recent activity, and quick stats. The tabs around it change depending on your role.',
                'The bottom (or side) nav is your main way around — Dashboard for the overview, Archive/Submissions for documents, Analytics for trends and clusters if you’re a supervisor, and Settings for your account.'
            ],
            tl: [
                'Ang Dashboard ay ang home screen — dito makikita ang compliance rate mo (o ng paaralan/distrito), recent activity, at mabilisang stats. Nagbabago ang mga tab depende sa role mo.',
                'Ang nav sa ibaba (o gilid) ang pangunahing daan mo — Dashboard para sa overview, Archive/Submissions para sa dokumento, Analytics para sa trends kung supervisor ka, at Settings para sa account mo.'
            ]
        }
    },
    {
        keywords: ['archive', 'my files', 'search files', 'sort files', 'filter documents', 'export excel', 'export csv', 'download report'],
        answers: {
            en: [
                'The Archive is where every submitted document lives — you can search by name or teacher, filter by "For Checking"/"Checked", sort by date, name, or size, and export the whole list to Excel or CSV.',
                'In Archive/My Files, use the search bar and status filter to narrow things down, the sort dropdown to reorder (Date, Name, or Size), and the green buttons to export a report.'
            ],
            tl: [
                'Ang Archive ay kung saan naka-imbak ang lahat ng na-submit na dokumento — puwede kang maghanap gamit ang pangalan o guro, i-filter ayon sa "For Checking"/"Checked", i-sort ayon sa petsa, pangalan, o laki, at i-export sa Excel o CSV.',
                'Sa Archive/My Files, gamitin ang search bar at status filter para mas mapaikli ang listahan, ang sort dropdown para ayusin (Petsa, Pangalan, o Laki), at ang berdeng buttons para mag-export ng report.'
            ]
        }
    },
    {
        keywords: ['analytics', 'trend', 'forecast', 'k-means', 'kmeans', 'clustering', 'high performer', 'at-risk', 'at risk entities'],
        answers: {
            en: [
                'The Analytics page (School Head and District Supervisor only) shows compliance trends over time, a short forecast, a document-type breakdown, and a K-Means clustering view that groups teachers or schools into High Performers, Average, and At-Risk based on their submission behavior.',
                'Analytics groups people/schools automatically using a clustering algorithm — it looks at compliance rate and submission frequency and buckets everyone into performance tiers.'
            ],
            tl: [
                'Ang Analytics page (para lang sa School Head at District Supervisor) ay nagpapakita ng compliance trends, maikling forecast, breakdown ng doc types, at K-Means clustering na naghahati sa mga guro o paaralan sa High Performers, Average, at At-Risk.',
                'Awtomatikong ginugrupo ng Analytics ang mga tao/paaralan gamit ang clustering algorithm — tinitingnan nito ang compliance rate at dalas ng submission para malaman kung sino ang nangangailangan ng tulong.'
            ]
        }
    },
    {
        keywords: ['academic calendar', 'school year', 'term', 'week schedule', 'open week', 'scheduled week', 'generate calendar', 'deped calendar'],
        answers: {
            en: [
                'The Academic Calendar (under Admin, for District Supervisors) is where each week’s submission deadline gets set. A week starts "Scheduled" (hidden from teachers) until it’s toggled "Open" — only open weeks count toward compliance.',
                'District Supervisors manage the calendar — they can add weeks one by one or generate the full DepEd school-year calendar in one click, then open each week as it becomes active.'
            ],
            tl: [
                'Ang Academic Calendar (nasa ilalim ng Admin, para sa District Supervisors) ay kung saan itinatakda ang deadline ng bawat linggo. "Scheduled" muna ang isang linggo (nakatago sa guro) hanggang i-toggle itong "Open" — mga bukas na linggo lang ang binibilang sa compliance.',
                'Pinapamahalaan ng District Supervisor ang calendar — puwede niyang idagdag ang bawat linggo isa-isa o i-generate ang buong DepEd school-year calendar sa isang click.'
            ]
        }
    },
    {
        keywords: ['admin panel', 'admin tab', 'user management', 'create account', 'add teacher account', 'change role'],
        answers: {
            en: [
                'The Admin panel (District Supervisors only) has three tabs: Settings for system-wide options, Users for creating accounts and managing roles, and Calendar for the academic calendar.',
                'Need to add a new teacher account or change someone’s role/school? That’s all in Admin → Users.'
            ],
            tl: [
                'Ang Admin panel (para lang sa District Supervisors) ay may tatlong tab: Settings para sa system-wide options, Users para sa paggawa ng account at pamamahala ng role, at Calendar para sa academic calendar.',
                'Gusto mong magdagdag ng bagong teacher account o baguhin ang role/school ng isang tao? Nasa Admin → Users ang lahat niyan.'
            ]
        }
    },
    {
        keywords: ['notification', 'notifications', 'alert me', 'bell icon'],
        answers: {
            en: [
                'You’ll get a notification whenever a deadline is updated or a new week opens for submissions — check the bell icon in the header for your recent alerts.',
                'Notifications fire mainly around deadline changes — a supervisor opens or updates a week, and everyone affected gets pinged.'
            ],
            tl: [
                'May notification ka kapag na-update ang deadline o may bagong linggo na bumukas para sa submissions — tingnan ang bell icon sa taas para sa mga alerto mo.',
                'Karaniwang tumutunog ang notification kapag may binago sa deadline — nag-o-open o nag-a-update ang supervisor ng linggo, at nade-notify ang lahat ng apektado.'
            ]
        }
    },
    {
        keywords: ['dark mode', 'light mode', 'theme', 'night mode'],
        answers: {
            en: [
                'There’s a light/dark mode toggle (the moon/sun icon) in the header — tap it to switch themes anytime.',
                'Yes, dark mode is built in — look for the toggle near the notification bell.'
            ],
            tl: [
                'May light/dark mode toggle (ang moon/sun icon) sa taas — pindutin mo lang para lumipat ng theme kahit kailan.',
                'Oo, meron dark mode — hanapin mo ang toggle malapit sa notification bell.'
            ]
        }
    },
    {
        keywords: ['qr code', 'scan', 'scanner'],
        answers: {
            en: [
                'The QR scanner lets you quickly verify a document’s authenticity by scanning the code printed on it — look for the scan option in your navigation.',
                'Scanning a document’s QR code pulls up its verification page, so anyone can confirm it’s a genuine, unaltered submission.'
            ],
            tl: [
                'Ang QR scanner ay nagpapahintulot sa iyong i-verify agad ang tunay na dokumento sa pamamagitan ng pag-scan ng code dito — hanapin mo ang scan option sa navigation.',
                'Kapag na-scan ang QR code ng dokumento, lalabas ang verification page nito, para masiguro ng lahat na tunay at hindi binago ang submission.'
            ]
        }
    },
    {
        keywords: ['teaching load', 'subjects', 'assigned subjects', 'grade level assignment'],
        answers: {
            en: [
                'Your teaching loads are the subject + grade-level combinations assigned to you — they’re what "expected submissions" is calculated from, so make sure yours are accurate and marked active.',
                'Each active teaching load is one more expected DLL per week. If your compliance math looks off, it’s worth double-checking your teaching loads are set up correctly.'
            ],
            tl: [
                'Ang teaching loads mo ay ang kombinasyon ng subject at grade level na naka-assign sa iyo — dito hinahango ang "expected submissions", kaya siguraduhing tama at active ang mga ito.',
                'Bawat active na teaching load ay isa pang inaasahang DLL kada linggo. Kung mukhang mali ang compliance mo, siguraduhing tama ang setup ng teaching loads mo.'
            ]
        }
    },
    {
        keywords: [
            'forgot password', 'forgot my password', 'reset password', 'reset my password',
            'change password', 'change my password',
            'cant login', "can't login", 'cant log in', "can't log in", 'locked out',
            'nakalimutan ko ang password', 'nakalimutan ang password', 'i-reset ang password',
            'i-reset ko ang password', 'hindi ako makapag-login', 'hindi makapag-login', 'naka-lock'
        ],
        answers: {
            en: [
                'You can reset your password from the login screen’s "Forgot Password" link, or ask your District Supervisor — they can reset it for you from the Admin → Users panel.',
                'Locked out? Try "Forgot Password" on the login page first. If that doesn’t work, your district supervisor can reset your account from Admin.'
            ],
            tl: [
                'Puwede mong i-reset ang password mo sa "Forgot Password" na link sa login screen, o hilingin sa District Supervisor mo — puwede niyang i-reset ito mula sa Admin → Users.',
                'Naka-lock ka ba? Subukan mo muna ang "Forgot Password" sa login page. Kung hindi gumana, puwedeng i-reset ng district supervisor mo ang account mo mula sa Admin.'
            ]
        }
    },
    {
        keywords: ['privacy', 'who can see my', 'confidential', 'visible to'],
        answers: {
            en: [
                'Visibility follows your role and hierarchy — Teachers see only their own documents, School Heads see their school, and District Supervisors see the whole district. ISP/ISR have their own tighter rules on top of that.',
                'Nobody outside your school/district chain can see your submissions — access is scoped strictly by role.'
            ],
            tl: [
                'Ang visibility ay nakabatay sa role at hierarchy mo — nakikita lang ng Teacher ang sariling dokumento, nakikita ng School Head ang paaralan niya, at nakikita ng District Supervisor ang buong distrito.',
                'Walang makakakita ng submissions mo sa labas ng school/district chain mo — mahigpit itong nakabatay sa role.'
            ]
        }
    },
    {
        keywords: [
            'missed deadline', 'what happens if late', 'consequence of missing', 'penalty',
            'if i miss a deadline', 'what happens if i miss', 'miss a deadline', 'missing a deadline',
            'ma-miss ko ang deadline', 'kung ma-miss ko', 'mahuli sa deadline', 'ano ang mangyayari kung ma-miss'
        ],
        answers: {
            en: [
                'Missing a deadline marks that week’s submission as "Late" if you eventually submit it, or "Missing" if you never do — either way it affects your compliance rate, but the system itself doesn’t lock you out or penalize beyond that.',
                'Late is still better than missing — a late submission still counts toward your compliance rate, but an un-submitted one counts as missing and drags your rate down further.'
            ],
            tl: [
                'Kapag na-miss mo ang deadline, magiging "Late" ang submission mo kapag na-submit mo rin, o "Missing" kung hindi — pareho itong nakakaapekto sa compliance rate mo, pero hindi ka i-loloko o pipenalize ng system.',
                'Mas mabuti pa rin ang late kaysa missing — nabibilang pa rin ang late submission sa compliance rate mo, pero ang hindi na-submit ay bumababa nang husto ang rate mo.'
            ]
        }
    }
];

export type Intent =
    | 'ask_compliance'
    | 'check_deadline'
    | 'find_dll'
    | 'school_compare'
    | 'teacher_stats'
    | 'calendar_info'
    | 'how_to_upload'
    | 'general_help';

export interface ChatResponse {
    intent: Intent;
    confidence: number;
    answer: string;
    slots: Record<string, string>;
    lang: Lang;
}

export interface ChatContext {
    supabase: SupabaseClient;
    userId?: string;
    profile?: {
        id: string;
        full_name: string;
        role: string;
        school_id: string | null;
        district_id: string | null;
    } | null;
    /** Short-term conversation memory for follow-up questions. */
    memory?: {
        lastIntent?: Intent;
        lastSlots?: Record<string, string>;
        lastLang?: Lang;
    };
}

interface IntentModelData {
    version: string;
    intents: string[];
    vocabulary: Record<string, number>;
    coefficients: Record<string, Record<string, number>>;
    intercepts: Record<string, number>;
    classes_: string[];
}

interface DllDocument {
    id: string;
    subject: string;
    grade: string;
    week: number;
    teacher: string;
    school: string;
    bodyText: string;
    fileHash: string;
}

class IntentClassifier {
    private model: IntentModelData;
    private vocabSize: number;

    constructor(model: IntentModelData) {
        this.model = model;
        this.vocabSize = Object.keys(model.vocabulary).length;
    }

    private generateCharNgrams(text: string, minN: number = 2, maxN: number = 5): string[] {
        const cleaned = normalizeText(text);
        const ngrams: string[] = [];
        for (let n = minN; n <= maxN; n++) {
            for (let i = 0; i <= cleaned.length - n; i++) {
                ngrams.push(cleaned.substring(i, i + n));
            }
        }
        return ngrams;
    }

    private featureVector(text: string): number[] {
        const vec = new Array(this.vocabSize).fill(0);
        const ngrams = this.generateCharNgrams(text);
        for (const ngram of ngrams) {
            const idx = this.model.vocabulary[ngram];
            if (idx !== undefined) {
                vec[idx]++;
            }
        }
        return vec;
    }

    public predict(text: string): { intent: Intent; confidence: number } {
        if (!text || text.trim().length === 0) {
            return { intent: 'general_help', confidence: 0 };
        }

        const vec = this.featureVector(text);

        const intents = this.model.intents as Intent[];
        let bestIntent: Intent = 'general_help';
        let bestScore = -Infinity;

        const scores: number[] = [];
        for (const intent of intents) {
            const intercept = this.model.intercepts[intent] || 0;
            const coefs = this.model.coefficients[intent] || {};
            let score = intercept;
            for (const [word, idx] of Object.entries(this.model.vocabulary)) {
                const coef = coefs[word];
                if (coef !== undefined) {
                    score += coef * (vec[idx as number] || 0);
                }
            }
            scores.push(score);
            if (score > bestScore) {
                bestScore = score;
                bestIntent = intent;
            }
        }

        const maxScore = Math.max(...scores);
        const expScores = scores.map(s => Math.exp(s - maxScore));
        const sumExp = expScores.reduce((a, b) => a + b, 0);
        const confidence = sumExp > 0 ? Math.round((expScores[intents.indexOf(bestIntent)] / sumExp) * 100) : 0;

        return { intent: bestIntent as Intent, confidence };
    }
}

function extractSlots(text: string, intent: Intent, memory?: ChatContext['memory']): Record<string, string> {
    const slots: Record<string, string> = {};
    const lower = normalizeText(text);

    // Inherit slots from conversation memory, but only when continuing the
    // same line of questioning (e.g. "what about week 4?" right after "what's
    // my compliance rate?"). A topic switch starts with a clean slate —
    // otherwise a school or grade mentioned several turns ago would silently
    // keep filtering a completely unrelated question today.
    if (memory?.lastSlots && memory.lastIntent === intent) {
        Object.assign(slots, memory.lastSlots);
    }

    const weekMatch = lower.match(/week\s*(\d+)/i) || lower.match(/(\d+)\s*(?:st|nd|rd|th)?\s*week/i);
    if (weekMatch) slots.week = weekMatch[1];

    const gradeMatch = lower.match(/grade\s*(\d+)/i);
    if (gradeMatch) slots.grade = gradeMatch[1];

    const subjects = ['mathematics', 'math', 'science', 'english', 'filipino',
        'gmrc', 'mapeh', 'makabansa', 'ap', 'epp', 'reading', 'language',
        'numeracy', 'arts', 'music', 'pe', 'health'];
    for (const subj of subjects) {
        if (lower.includes(subj) || lower.includes(subj.slice(0, 3))) {
            slots.subject = subj === 'math' ? 'Mathematics' : subj === 'pe' ? 'PE' : subj.charAt(0).toUpperCase() + subj.slice(1);
            break;
        }
    }

    // Capture up to 3 words after "teacher" (surnames are often multi-word,
    // e.g. "Teacher Dela Cruz") while trimming off trailing query words that
    // aren't part of the name ("teacher santos stats" -> "santos").
    const TEACHER_NAME_STOPWORDS = new Set([
        'stats', 'statistics', 'records', 'submissions', 'compliance',
        'performance', 'ranking', 'rate', 'status', 'progress', 'report', 'data'
    ]);
    const teacherMatch = lower.match(/teacher\s+([a-z]+(?:\s+[a-z]+){0,2})/i)
        || lower.match(/(?:for|of|about)\s+(\w[\w\s]+?)(?:'s|\s+stats|\s+records|\s+submissions)/i);
    if (teacherMatch) {
        const nameWords = teacherMatch[1].trim().split(/\s+/).filter(w => !TEACHER_NAME_STOPWORDS.has(w));
        if (nameWords.length > 0) slots.teacher = nameWords.join(' ');
    }

    const schoolNames = ['bulusan', 'guinobatan', 'ibaba', 'salong', 'suqui', 'camalig', 'manito', 'bacacay'];
    for (const school of schoolNames) {
        if (lower.includes(school)) {
            slots.school = school.charAt(0).toUpperCase() + school.slice(1) + ' Elementary School';
            break;
        }
    }

    // Fuzzy-match "week"/"grade" tokens for typos like "wekk 4"
    if (!slots.week) {
        for (const tok of lower.split(/\s+/)) {
            const num = tok.match(/\d+/);
            if (num) {
                const fuzzyWeek = fuzzyMatch(tok.replace(/\d+/g, ''), ['week', 'wk', 'weeks']);
                if (fuzzyWeek) { slots.week = num[0]; break; }
            }
        }
    }

    return slots;
}

function generateTemplateResponse(intent: Intent, slots: Record<string, string>, lang: Lang = 'en'): string {
    const templatesEn: Record<Intent, () => string> = {
        ask_compliance: () => pick(["Let me check your compliance data — one moment.", "On it! Checking your compliance records now.", "Sure, pulling up your compliance status."]),
        check_deadline: () => pick(["Let me look up the deadlines from the academic calendar.", "Checking the calendar for deadlines.", "On it — grabbing the deadline dates for you."]),
        find_dll: () => {
            let filters = '';
            if (slots.subject) filters += ` for ${slots.subject}`;
            if (slots.grade) filters += `, Grade ${slots.grade}`;
            if (slots.week) filters += `, Week ${slots.week}`;
            return pick([`Searching DLLs${filters}...`, `Looking for DLLs${filters}...`, `Let me find those DLLs${filters} for you.`]);
        },
        school_compare: () => {
            if (slots.school) return pick([`Let me pull up the compliance data for ${slots.school}.`, `Checking how ${slots.school} is doing.`]);
            return pick(["Let me compare the compliance rates across schools in your district.", "Comparing schools in your district now.", "Gathering the school comparison data."]);
        },
        teacher_stats: () => {
            if (slots.teacher) return pick([`Let me look up the submission records for ${slots.teacher}.`, `Checking ${slots.teacher}'s stats.`]);
            return pick(["Let me gather the teacher submission statistics.", "Pulling up teacher stats.", "Fetching teacher performance data."]);
        },
        calendar_info: () => pick(["Let me check the academic calendar for you.", "Looking at the school calendar now.", "Let me pull up the academic calendar."]),
        how_to_upload: () => "Uploading a DLL is simple. Head over to the Upload page, then drag and drop your .docx or .pdf file. The system will automatically detect the subject, grade level, and week from the document. You will have a chance to review the extracted information before finalizing the upload. If you are offline, no worries — the document will be saved locally and will sync automatically once you are back online.",
        general_help: () => "I’m here to help with a bunch of things. I can check your compliance rate, look up deadlines, find DLLs, compare schools, or show teacher stats. Try asking something like, “What is my compliance rate?” or “When is the next deadline?”"
    };

    const templatesTl: Record<Intent, () => string> = {
        ask_compliance: () => pick(["Sandali lang, che-check ko ang compliance data mo.", "Sige! Tinitignan ko na ang compliance records mo.", "Ok, kinukuha ko ang compliance status mo."]),
        check_deadline: () => pick(["Titignan ko ang mga deadline sa academic calendar.", "Chineck ko ang calendar para sa deadlines.", "Sige, kinukuha ko ang deadline dates mo."]),
        find_dll: () => {
            let filters = '';
            if (slots.subject) filters += ` para sa ${slots.subject}`;
            if (slots.grade) filters += `, Grade ${slots.grade}`;
            if (slots.week) filters += `, Week ${slots.week}`;
            return pick([`Hinahanap ko ang mga DLL${filters}...`, `Naghahanap ng DLL${filters}...`, `Hanapin ko ang mga DLL${filters} para sa'yo.`]);
        },
        school_compare: () => {
            if (slots.school) return pick([`Kinukuha ko ang compliance data para sa ${slots.school}.`, `Chineck ko kung kumusta ang ${slots.school}.`]);
            return pick(["Ihahambing ko ang compliance rates ng mga paaralan sa distrito mo.", "Kinukumpara ko ngayon ang mga paaralan sa distrito.", "Kinukuha ko ang school comparison data."]);
        },
        teacher_stats: () => {
            if (slots.teacher) return pick([`Hinahanap ko ang submission records ni ${slots.teacher}.`, `Chineck ko ang stats ni ${slots.teacher}.`]);
            return pick(["Kinukuha ko ang teacher submission statistics.", "Kinukuha ko ang teacher stats.", "Kinukuha ko ang performance data ng mga guro."]);
        },
        calendar_info: () => pick(["Titignan ko ang academic calendar para sa'yo.", "Tinitignan ko na ang school calendar.", "Kinukuha ko ang academic calendar."]),
        how_to_upload: () => "Madali lang mag-upload ng DLL. Pumunta ka sa Upload page, tapos i-drag and drop ang .docx o .pdf file mo. Awtomatikong made-detect ng system ang subject, grade level, at linggo mula sa dokumento. Puwede mo pang i-review ang na-extract na impormasyon bago i-finalize ang upload. Kung offline ka, huwag mag-alala — mase-save muna ito sa device mo at awtomatikong mag-sy-sync pagbalik ng internet.",
        general_help: () => "Nandito ako para tumulong sa maraming bagay. Puwede kong i-check ang compliance rate mo, hanapin ang mga deadline, maghanap ng DLL, ikumpara ang mga paaralan, o ipakita ang teacher stats. Subukan mong itanong, “Ano ang compliance rate ko?” o “Kailan ang susunod na deadline?”"
    };

    const templates = lang === 'tl' ? templatesTl : templatesEn;
    const generator = templates[intent];
    return generator ? generator() : pick(CONFUSED_RESPONSES[lang]);
}

function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function isCompliant(status: string | null | undefined): boolean {
    return !status || status === 'compliant' || status === 'on-time';
}

async function queryCompliance(
    db: SupabaseClient,
    userId: string | undefined,
    profile: ChatContext['profile'],
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<string> {
    if (!userId) return lang === 'tl' ? 'Mag-login ka muna para ma-check ang compliance rate mo.' : 'Please log in to check your compliance rate.';

    const role = profile?.role;
    const schoolYear = getDynamicSchoolYear();
    const districtId = profile?.district_id;

    // Determine scope: which teachers to look up
    let userFilter: string[] | null = null;
    let scopeLabel: string;
    if (role === 'Teacher' || role === 'Master Teacher' || !role) {
        userFilter = [userId];
        scopeLabel = lang === 'tl' ? 'Ang' : 'Your';
    } else if (role === 'School Head' && profile?.school_id) {
        const { data: teacherIds } = await db
            .from('profiles')
            .select('id')
            .eq('school_id', profile.school_id);
        if (!teacherIds || teacherIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa paaralan mo.' : 'No teachers found in your school.';
        userFilter = teacherIds.map((t: any) => t.id);
        scopeLabel = lang === 'tl' ? 'Ang compliance ng paaralan mo' : 'Your school\'s';
    } else if (role === 'District Supervisor' && districtId) {
        const { data: schoolIds } = await db
            .from('schools')
            .select('id')
            .eq('district_id', districtId);
        if (!schoolIds || schoolIds.length === 0) return lang === 'tl' ? 'Walang nahanap na paaralan sa distrito mo.' : 'No schools found in your district.';
        const { data: teacherIds } = await db
            .from('profiles')
            .select('id')
            .in('school_id', schoolIds.map((s: any) => s.id));
        if (!teacherIds || teacherIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa distrito mo.' : 'No teachers found in your district.';
        userFilter = teacherIds.map((t: any) => t.id);
        scopeLabel = lang === 'tl' ? 'Ang compliance ng distrito mo' : 'Your district\'s';
    } else {
        return lang === 'tl' ? 'Hindi ma-determine ang scope mo. Mag-login gamit ang valid na account.' : 'Unable to determine your scope. Please log in with a valid account.';
    }

    // ── Calculate expected count (matches dashboard: teachingLoadsCount × definedWeeks) ──
    const loadsFilter: any = { user_id: userFilter.length === 1 ? userFilter[0] : undefined };
    let teachingLoadsCount = 0;
    let uniqueSubjects: string[] = [];

    if (slots.grade) {
        loadsFilter.grade_level = slots.grade.length === 1 ? `Grade ${slots.grade}` : slots.grade;
    }

    if (userFilter.length === 1) {
        loadsFilter.user_id = userFilter[0];
        const { data: loads } = await db
            .from('teaching_loads')
            .select('subject')
            .eq('is_active', true)
            .eq('user_id', userFilter[0]);
        if (loads) {
            uniqueSubjects = [...new Set(loads.map((l: any) => l.subject))];
            teachingLoadsCount = uniqueSubjects.length;
        }
    } else {
        const { data: loads } = await db
            .from('teaching_loads')
            .select('user_id, subject')
            .eq('is_active', true)
            .in('user_id', userFilter);
        if (loads) {
            const userSubjects = new Map<string, Set<string>>();
            for (const l of loads as any[]) {
                if (!userSubjects.has(l.user_id)) userSubjects.set(l.user_id, new Set());
                userSubjects.get(l.user_id)!.add(l.subject);
            }
            teachingLoadsCount = 0;
            for (const subjects of userSubjects.values()) {
                teachingLoadsCount += subjects.size;
            }
            uniqueSubjects = [...new Set(loads.map((l: any) => l.subject))];
        }
    }

    // Get defined weeks from academic calendar
    let definedWeeks = 1;
    if (!slots.week) {
        let calQuery = db
            .from('academic_calendar')
            .select('week_number', { count: 'exact', head: true })
            .eq('school_year', schoolYear);
        if (districtId) {
            calQuery = calQuery.or(`district_id.eq.${districtId},district_id.is.null`);
        }
        const { count } = await calQuery;
        definedWeeks = count || 1;
    }

    // Filter teaching loads count by subject if subject slot is provided
    if (slots.subject && uniqueSubjects.length > 0) {
        const matched = uniqueSubjects.filter(s => s.toLowerCase().includes(slots.subject!.toLowerCase()));
        if (matched.length === 0) {
            return lang === 'tl'
                ? `Walang nahanap na teaching load para sa "${slots.subject}".`
                : `I couldn't find a teaching load for "${slots.subject}".`;
        }
        teachingLoadsCount = matched.length;
    }

    const expectedTotal = teachingLoadsCount * definedWeeks;

    // ── Fetch actual submissions ──
    let query = db
        .from('submissions')
        .select('compliance_status, week_number, subject')
        .not('file_hash', 'like', 'nc_%');

    if (userFilter) query = query.in('user_id', userFilter);
    if (slots.week) query = query.eq('week_number', parseInt(slots.week));
    if (slots.subject) query = query.ilike('subject', `%${slots.subject}%`);

    if (slots.grade) {
        const gradeLabel = slots.grade.length === 1 ? `Grade ${slots.grade}` : slots.grade;
        const { data: tlData } = await db
            .from('teaching_loads')
            .select('id')
            .eq('grade_level', gradeLabel)
            .in('user_id', userFilter || [userId]);
        if (tlData && tlData.length > 0) {
            query = query.in('teaching_load_id', tlData.map((tl: any) => tl.id));
        } else {
            return lang === 'tl' ? `Walang nahanap na submissions para sa ${gradeLabel}.` : `I couldn't find any submissions for ${gradeLabel}.`;
        }
    }

    const { data, error } = await query;

    if (error) return lang === 'tl' ? 'Pasensya na, hindi ma-access ngayon ang compliance data. Subukan ulit.' : "Sorry, I couldn't access the compliance data right now. Please try again.";

    // ── Calculate compliance against expected ──
    const actualSubmissions = data || [];
    const compliant = actualSubmissions.filter((s: any) => isCompliant(s.compliance_status)).length;
    const late = actualSubmissions.filter((s: any) => s.compliance_status === 'late').length;
    const actualUploads = compliant + late;
    const nonCompliant = Math.max(0, expectedTotal - actualUploads);
    const rate = expectedTotal > 0 ? Math.round((actualUploads / expectedTotal) * 100) : 0;

    const pendingReview = actualSubmissions.filter((s: any) => !s.compliance_status).length;
    const compliantExplicit = actualSubmissions.filter((s: any) => s.compliance_status === 'compliant' || s.compliance_status === 'on-time').length;

    // ── Build response ──
    let response: string;
    if (lang === 'tl') {
        if (slots.week) {
            response = `Para sa Week ${slots.week}${slots.subject ? ` (${slots.subject})` : ''}, ang compliance rate ay ${rate}% (${actualUploads} sa ${expectedTotal}).`;
            if (compliant > 0) response += ` ${compliant} submission ang compliant.`;
            if (late > 0) response += ` ${late} submission ang late.`;
            if (nonCompliant > 0) response += ` ${nonCompliant} submission pa ang missing.`;
        } else {
            response = `${scopeLabel} ay ${rate}% (${actualUploads} sa ${expectedTotal} na inaasahang submissions).`;
            response += ` May ${compliant} na compliant`;
            if (late > 0) response += `, ${late} late`;
            response += `, at ${nonCompliant} missing na submission.`;
            if (pendingReview > 0 && compliantExplicit < compliant) {
                response += ` ${pendingReview} submission ang na-upload pero hinihintay pa ang official review.`;
            }
            if (rate >= 90) response += ' ' + pick([
                'Ang galing — halos wala nang kulang!',
                'Napakagaling — sige lang nang ganyan!',
                'Magaling — malapit ka nang perfect.'
            ]);
            else if (rate >= 75) response += ' ' + pick([
                'Malapit ka na — konti na lang kulang.',
                'Maganda ang takbo mo, konti na lang at tapos ka na.',
                'Ayos, patuloy lang nang kaunti pa.'
            ]);
            else response += ' ' + pick([
                'Puwede pang bawian — subukan mong ma-catch up ang mga kulang na DLL kapag may oras.',
                'May puwang pa para umangat — walang rush, pero try mong asikasuhin ang mga kulang.',
                'Konting push pa lang at aangat ang rate mo — kaya mo yan.'
            ]);
        }
        return response;
    }

    if (slots.week) {
        response = `For Week ${slots.week}${slots.subject ? ` (${slots.subject})` : ''}, the compliance rate is ${rate}% (${actualUploads} out of ${expectedTotal}).`;
        if (compliant > 0) response += ` ${compliant} submission${compliant !== 1 ? 's are' : ' is'} compliant.`;
        if (late > 0) response += ` ${late} submission${late !== 1 ? 's are' : ' is'} late.`;
        if (nonCompliant > 0) response += ` ${nonCompliant} submission${nonCompliant !== 1 ? 's are' : ' is'} still missing.`;
    } else {
        response = `${scopeLabel} compliance rate is ${rate}% (${actualUploads} out of ${expectedTotal} expected submissions).`;
        response += ` There ${compliant === 1 ? 'is' : 'are'} ${compliant} compliant`;
        if (late > 0) response += `, ${late} late`;
        response += `, and ${nonCompliant} missing submission${nonCompliant !== 1 ? 's' : ''}.`;
        if (pendingReview > 0 && compliantExplicit < compliant) {
            response += ` ${pendingReview} submission${pendingReview > 1 ? 's are' : ' is'} uploaded but awaiting official review.`;
        }
        if (rate >= 90) response += ' ' + pick([
            'You’re doing excellently — keep it up!',
            'Great work, that’s a strong rate.',
            'Excellent — you’re nearly perfect.'
        ]);
        else if (rate >= 75) response += ' ' + pick([
            'You’re on the right track — just a few more to go.',
            'Solid progress, just a bit more and you’re there.',
            'Nice pace — keep it going.'
        ]);
        else response += ' ' + pick([
            'There’s room for improvement — try to catch up on the missing DLLs when you can.',
            'A few more submissions would really help your rate — no rush, just when you’re able.',
            'A little more effort and your rate will climb — you’ve got this.'
        ]);
    }

    return response;
}

async function queryDeadline(
    db: SupabaseClient,
    districtId: string | undefined,
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<string> {
    let query = db
        .from('academic_calendar')
        .select('*')
        .order('deadline_date', { ascending: true });

    if (districtId) {
        query = query.or(`district_id.eq.${districtId},district_id.is.null`);
    }
    if (slots.week) query = query.eq('week_number', parseInt(slots.week));
    if (!slots.week) query = query.limit(5);

    const { data, error } = await query;

    if (error) return lang === 'tl' ? 'Pasensya na, hindi ma-access ngayon ang academic calendar.' : "Sorry, I couldn't access the academic calendar right now.";
    if (!data || data.length === 0) {
        if (slots.week) return lang === 'tl' ? `Walang nahanap na deadline para sa Week ${slots.week} sa academic calendar.` : `I couldn't find a deadline for Week ${slots.week} in the academic calendar.`;
        return lang === 'tl' ? 'Walang paparating na deadline. Baka hindi pa naka-set up ang academic calendar para sa distrito mo.' : 'No upcoming deadlines found. The academic calendar may not be set up yet for your district.';
    }

    if (slots.week) {
        const entry = data[0] as any;
        return lang === 'tl'
            ? `Ang deadline para sa Week ${entry.week_number}${entry.school_year ? ` (${entry.school_year})` : ''} ay ${formatDate(entry.deadline_date)}.`
            : `The deadline for Week ${entry.week_number}${entry.school_year ? ` (${entry.school_year})` : ''} is ${formatDate(entry.deadline_date)}.`;
    }

    const lines = (data as any[]).map((d: any) =>
        `${formatDate(d.deadline_date)}${d.description ? ' — ' + d.description : ''}`
    );
    return lang === 'tl'
        ? `Narito ang mga paparating na deadline:\n${lines.join('\n')}`
        : `Here are the upcoming deadlines:\n${lines.join('\n')}`;
}

async function queryDlls(
    db: SupabaseClient,
    slots: Record<string, string>,
    queryText?: string,
    lang: Lang = 'en'
): Promise<string> {
    // Prefer TF-IDF semantic search when the user asked a free-text question
    const hasStructuredSlots = !!(slots.subject || slots.week || slots.grade);
    if (!hasStructuredSlots && queryText && queryText.trim().length > 3) {
        try {
            if (!dllEngineLoaded) {
                await loadDllDocumentsFromSupabase(db);
                dllEngineLoaded = true;
            }
            const semantic = dllSearchEngine.search(queryText.trim(), 5);
            if (semantic.length > 0) {
                const lines = semantic.map((r, i) => {
                    const d = r.doc;
                    const grade = d.grade ? ` (${d.grade})` : '';
                    const week = d.week ? ` Week ${d.week}` : '';
                    return `${i + 1}. ${d.subject}${grade}${week} — ${d.teacher}`;
                });
                let summary = lang === 'tl'
                    ? `May nahanap akong ${semantic.length} DLL na tugma sa "${queryText.trim()}":\n${lines.join('\n')}`
                    : `Found ${semantic.length} DLL${semantic.length > 1 ? 's' : ''} matching "${queryText.trim()}":\n${lines.join('\n')}`;
                if (semantic.length === 5) summary += lang === 'tl' ? '\n\nPara sa mas eksaktong resulta, subukan ang mas specific na paghahanap.' : '\n\nFor more precise results, try a more specific search.';
                return summary;
            }
        } catch (e) {
            console.warn('[chatbot] Semantic search unavailable, falling back to SQL:', e);
        }
    }

    let query = db
        .from('submissions')
        .select(`
            id, file_name, week_number, subject, created_at,
            profile:profiles(full_name),
            teaching_load:teaching_loads(grade_level)
        `)
        .eq('doc_type', 'DLL')
        .order('created_at', { ascending: false });

    if (slots.subject) query = query.ilike('subject', `%${slots.subject}%`);
    if (slots.week) query = query.eq('week_number', parseInt(slots.week));

    if (slots.grade) {
        const gradeLabel = slots.grade.length === 1 ? `Grade ${slots.grade}` : slots.grade;
        const { data: tlData } = await db
            .from('teaching_loads')
            .select('id')
            .eq('grade_level', gradeLabel);

        if (tlData && tlData.length > 0) {
            query = query.in('teaching_load_id', tlData.map((t: any) => t.id));
        } else {
            return lang === 'tl' ? `Walang nahanap na DLL para sa ${gradeLabel}.` : `I couldn't find any DLLs for ${gradeLabel}.`;
        }
    }

    query = query.limit(5);
    const { data, error } = await query;

    if (error) return lang === 'tl' ? 'Pasensya na, hindi mahanap ngayon ang mga DLL.' : "Sorry, I couldn't search DLLs right now.";
    if (!data || data.length === 0) {
        const parts: string[] = [];
        if (slots.subject) parts.push(slots.subject);
        if (slots.grade) parts.push(`Grade ${slots.grade}`);
        if (slots.week) parts.push(`Week ${slots.week}`);
        if (lang === 'tl') {
            let msg = 'Walang nahanap na DLL';
            if (parts.length > 0) msg += ` na tugma sa ${parts.join(' ')}`;
            return msg + '.';
        }
        let msg = "I couldn't find any DLLs";
        if (parts.length > 0) msg += ` matching ${parts.join(' ')}`;
        return msg + '.';
    }

    const lines = (data as any[]).map((d: any, i: number) => {
        const teacher = d.profile?.full_name || (lang === 'tl' ? 'Hindi kilalang guro' : 'Unknown teacher');
        const grade = d.teaching_load?.grade_level || '';
        const subj = d.subject || (lang === 'tl' ? 'Hindi kilalang subject' : 'Unknown subject');
        const week = d.week_number ? ` Week ${d.week_number}` : '';
        return `${i + 1}. ${subj}${grade ? ' (' + grade + ')' : ''}${week} — ${teacher}`;
    });

    const parts: string[] = [];
    if (slots.subject) parts.push(slots.subject);
    if (slots.grade) parts.push(`Grade ${slots.grade}`);
    if (slots.week) parts.push(`Week ${slots.week}`);

    let summary = lang === 'tl'
        ? `May nahanap akong ${data.length} DLL`
        : `Found ${data.length} DLL${data.length > 1 ? 's' : ''}`;
    if (parts.length > 0) summary += lang === 'tl' ? ` para sa ${parts.join(' ')}` : ` for ${parts.join(' ')}`;
    summary += `:\n${lines.join('\n')}`;
    if (data.length === 5) summary += lang === 'tl' ? '\n\nPara sa mas eksaktong resulta, subukan ang mas specific na paghahanap.' : '\n\nFor more precise results, try a more specific search.';

    return summary;
}

async function querySchoolCompare(
    db: SupabaseClient,
    districtId: string | undefined,
    profile: ChatContext['profile'],
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<string> {
    const effectiveDistrictId = districtId || profile?.district_id;

    if (!effectiveDistrictId) {
        return lang === 'tl' ? 'Kailangan ko ng distrito para ikumpara ang mga paaralan. Mag-login gamit ang district-level account.' : 'I need a district to compare schools. Please log in with a district-level account.';
    }

    // 1. Get schools in the district
    let schoolQuery = db.from('schools').select('id, name');
    if (slots.school) {
        schoolQuery = schoolQuery.ilike('name', `%${slots.school.replace('Elementary School', '').trim()}%`);
    }
    schoolQuery = schoolQuery.eq('district_id', effectiveDistrictId);

    const { data: schools, error: schoolErr } = await schoolQuery;
    if (schoolErr || !schools || schools.length === 0) {
        if (slots.school) return lang === 'tl' ? `Walang nahanap na paaralang tugma sa "${slots.school}" sa distrito mo.` : `I couldn't find a school matching "${slots.school}" in your district.`;
        return lang === 'tl' ? 'Walang nahanap na paaralan sa distrito mo.' : 'No schools found in your district.';
    }

    // 2. Get teachers at these schools
    const schoolIds = (schools as any[]).map((s: any) => s.id);
    const { data: teachers } = await db
        .from('profiles')
        .select('id, school_id')
        .eq('role', 'Teacher')
        .in('school_id', schoolIds);

    if (!teachers || teachers.length === 0) {
        return lang === 'tl' ? 'Walang nahanap na guro sa mga paaralang ito.' : 'No teachers found in these schools.';
    }

    // 3. Get submissions for these teachers (exclude NC placeholders)
    const teacherIds = (teachers as any[]).map((t: any) => t.id);
    const { data: submissions } = await db
        .from('submissions')
        .select('user_id, compliance_status')
        .in('user_id', teacherIds)
        .not('file_hash', 'like', 'nc_%');

    // 4. Build teacher → school mapping
    const teacherSchool = new Map<string, string>();
    for (const t of teachers as any[]) {
        teacherSchool.set(t.id, t.school_id);
    }

    // 5. Aggregate per school
    const schoolMap = new Map<string, { total: number; compliant: number }>();
    for (const school of schools as any[]) {
        schoolMap.set(school.name, { total: 0, compliant: 0 });
    }

    for (const s of (submissions || []) as any[]) {
        const schoolId = teacherSchool.get(s.user_id);
        if (!schoolId) continue;
        const school = (schools as any[]).find((sc: any) => sc.id === schoolId);
        if (!school) continue;
        const entry = schoolMap.get(school.name)!;
        entry.total++;
        if (isCompliant(s.compliance_status)) {
            entry.compliant++;
        }
    }

    const sorted = [...schoolMap.entries()]
        .map(([name, stats]) => ({
            name,
            rate: stats.total > 0 ? Math.round((stats.compliant / stats.total) * 100) : 0,
            total: stats.total,
            compliant: stats.compliant
        }))
        .sort((a, b) => b.rate - a.rate);

    if (sorted.length === 0 || sorted.every(s => s.total === 0)) {
        return lang === 'tl' ? 'Wala pang available na submission data para sa paghahambing ng paaralan.' : 'No submission data available for school comparison yet.';
    }

    if (slots.school) {
        const match = sorted[0];
        if (match.total > 0) {
            return lang === 'tl'
                ? `Ang compliance para sa ${slots.school} ay ${match.rate}% (${match.compliant} sa ${match.total} submissions).`
                : `Compliance for ${slots.school} is ${match.rate}% (${match.compliant} out of ${match.total} submissions).`;
        }
        return lang === 'tl' ? `Walang nahanap na submission data para sa ${slots.school}.` : `I could not find submission data for ${slots.school}.`;
    }

    const lines = sorted.map((s, i) => {
        const rank = i === 0 ? '(1st)' : i === 1 ? '(2nd)' : i === 2 ? '(3rd)' : '';
        return `${rank ? rank + ' ' : ''}${s.name}: ${s.rate}% (${s.compliant} out of ${s.total})`;
    });

    return lang === 'tl'
        ? `Paghahambing ng compliance ng mga paaralan sa distrito mo:\n${lines.join('\n')}`
        : `School compliance comparison in your district:\n${lines.join('\n')}`;
}

async function queryTeacherStats(
    db: SupabaseClient,
    userId: string | undefined,
    profile: ChatContext['profile'],
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<string> {
    const role = profile?.role;
    if (!userId) return lang === 'tl' ? 'Mag-login ka muna para makita ang teacher statistics.' : 'Please log in to view teacher statistics.';

    // Determine which teachers to look up
    let userQuery = db.from('profiles').select('id, full_name, school_id, role');

    if (slots.teacher) {
        userQuery = userQuery.ilike('full_name', `%${slots.teacher}%`);
    } else if (role === 'Teacher' || role === 'Master Teacher') {
        userQuery = userQuery.eq('id', userId);
    } else if (role === 'School Head' && profile?.school_id) {
        const { data: schoolTeachers } = await db
            .from('profiles')
            .select('id')
            .eq('school_id', profile.school_id)
            .eq('role', 'Teacher');
        const tIds = (schoolTeachers || []).map((t: any) => t.id);
        if (tIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa paaralan mo.' : 'No teachers found in your school.';
        userQuery = userQuery.in('id', tIds);
    } else if (profile?.district_id) {
        const { data: schoolIds } = await db
            .from('schools')
            .select('id')
            .eq('district_id', profile.district_id);
        if (schoolIds && schoolIds.length > 0) {
            const { data: districtTeachers } = await db
                .from('profiles')
                .select('id')
                .in('school_id', schoolIds.map((s: any) => s.id))
                .eq('role', 'Teacher');
            const tIds = (districtTeachers || []).map((t: any) => t.id);
            if (tIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa distrito mo.' : 'No teachers found in your district.';
            userQuery = userQuery.in('id', tIds);
        }
    }

    const { data: teachers, error: tErr } = await userQuery;
    if (tErr || !teachers || teachers.length === 0) {
        if (slots.teacher) return lang === 'tl' ? `Walang nahanap na guro na "${slots.teacher}".` : `I couldn't find a teacher named "${slots.teacher}".`;
        return lang === 'tl' ? 'Walang nahanap na guro.' : 'No teachers found.';
    }

    const teacherIds = (teachers as any[]).map((t: any) => t.id);
    const { data: subs, error: sErr } = await db
        .from('submissions')
        .select('user_id, compliance_status')
        .in('user_id', teacherIds)
        .not('file_hash', 'like', 'nc_%');

    if (sErr) return lang === 'tl' ? 'Pasensya na, hindi ma-load ang submission data.' : "Sorry, I couldn't load submission data.";

    // Count submissions per teacher
    const teacherSubMap = new Map<string, { total: number; compliant: number; late: number }>();
    for (const t of teachers as any[]) {
        teacherSubMap.set(t.id, { total: 0, compliant: 0, late: 0 });
    }
    for (const s of (subs || []) as any[]) {
        const entry = teacherSubMap.get(s.user_id);
        if (entry) {
            entry.total++;
            if (isCompliant(s.compliance_status)) entry.compliant++;
            else if (s.compliance_status === 'late') entry.late++;
        }
    }

    const sorted = (teachers as any[])
        .map((t: any) => ({
            name: t.full_name,
            ...teacherSubMap.get(t.id) || { total: 0, compliant: 0, late: 0 },
            role: t.role
        }))
        .filter(t => t.total > 0 || slots.teacher)
        .sort((a: any, b: any) => b.total - a.total);

    if (sorted.length === 0) {
        if (slots.teacher) return lang === 'tl' ? `Wala pang submissions si "${slots.teacher}".` : `Teacher "${slots.teacher}" has no submissions yet.`;
        return lang === 'tl' ? 'Wala pang available na submission data.' : 'No submission data available yet.';
    }

    if (slots.teacher || sorted.length === 1) {
        const t = sorted[0] as any;
        const rate = t.total > 0 ? Math.round((t.compliant / t.total) * 100) : 0;
        const nonCompliant = t.total - t.compliant - t.late;
        if (lang === 'tl') {
            return `Si ${t.name} ay may ${t.total} submission na may compliance rate na ${rate}% (${t.compliant} compliant${t.late > 0 ? `, ${t.late} late` : ''}${nonCompliant > 0 ? `, ${nonCompliant} missing` : ''}).`;
        }
        return `${t.name} has ${t.total} submission${t.total !== 1 ? 's' : ''} with a compliance rate of ${rate}% (${t.compliant} compliant${t.late > 0 ? `, ${t.late} late` : ''}${nonCompliant > 0 ? `, ${nonCompliant} missing` : ''}).`;
    }

    const lines = sorted.slice(0, 10).map((t: any) => {
        const rate = t.total > 0 ? Math.round((t.compliant / t.total) * 100) : 0;
        return `${t.name}: ${rate}% (${t.compliant} out of ${t.total})`;
    });

    return lang === 'tl'
        ? `Istatistika ng submissions ng mga guro:\n${lines.join('\n')}`
        : `Teacher submission statistics:\n${lines.join('\n')}`;
}

async function queryCalendarInfo(
    db: SupabaseClient,
    districtId: string | undefined,
    lang: Lang = 'en'
): Promise<string> {
    let query = db
        .from('academic_calendar')
        .select('*')
        .order('deadline_date', { ascending: true });

    if (districtId) {
        query = query.or(`district_id.eq.${districtId},district_id.is.null`);
    }
    query = query.limit(20);

    const { data, error } = await query;

    if (error) return lang === 'tl' ? 'Pasensya na, hindi ma-access ngayon ang academic calendar.' : "Sorry, I couldn't access the academic calendar right now.";

    if (!data || data.length === 0) {
        return lang === 'tl'
            ? 'Hindi pa naka-set up ang academic calendar para sa distrito mo. Makipag-ugnayan sa district supervisor para i-configure ito.'
            : "The academic calendar hasn't been set up for your district yet. Contact your district supervisor to configure it.";
    }

    const entries = data as any[];
    const terms = [...new Set(entries.map((e: any) => `Term ${e.term}`))].join(', ');
    const weeks = entries.length;
    const first = entries[0];
    const nextDeadline = entries.find((e: any) => new Date(e.deadline_date) > new Date());

    let response: string;
    if (lang === 'tl') {
        response = `Sinasaklaw ng academic calendar ang ${terms} na may ${weeks} linggong naka-schedule`;
        if (first?.school_year) response += ` para sa school year ${first.school_year}`;
        response += '.';
        if (nextDeadline) {
            response += `\n\nAng susunod na deadline ay para sa Week ${nextDeadline.week_number}, sa ${formatDate(nextDeadline.deadline_date)}`;
            if (nextDeadline.description) response += ` — ${nextDeadline.description}`;
            response += '.';
        }
        return response;
    }

    response = `The academic calendar covers ${terms} and has ${weeks} weeks scheduled`;
    if (first?.school_year) response += ` for the school year ${first.school_year}`;
    response += '.';

    if (nextDeadline) {
        response += `\n\nThe next deadline is for Week ${nextDeadline.week_number}, falling on ${formatDate(nextDeadline.deadline_date)}`;
        if (nextDeadline.description) response += ` — ${nextDeadline.description}`;
        response += '.';
    }

    return response;
}

async function generateDatabaseResponse(
    intent: Intent,
    slots: Record<string, string>,
    ctx: ChatContext,
    rawText?: string,
    lang: Lang = 'en'
): Promise<string> {
    const { supabase: db, userId, profile } = ctx;

    try {
        switch (intent) {
            case 'ask_compliance':
                return await queryCompliance(db, userId, profile, slots, lang);
            case 'check_deadline':
                return await queryDeadline(db, profile?.district_id ?? undefined, slots, lang);
            case 'find_dll':
                return await queryDlls(db, slots, rawText, lang);
            case 'school_compare':
                return await querySchoolCompare(db, profile?.district_id ?? undefined, profile, slots, lang);
            case 'teacher_stats':
                return await queryTeacherStats(db, userId, profile, slots, lang);
            case 'calendar_info':
                return await queryCalendarInfo(db, profile?.district_id ?? undefined, lang);
            default:
                return generateTemplateResponse(intent, slots, lang);
        }
    } catch (err) {
        console.error('[chatbot] DB response error:', err);
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (lang === 'tl') {
            return offline
                ? "Mukhang offline ka ngayon, kaya hindi ko ma-check ang live data para diyan — pero nandito pa rin ako! Tanungin mo ulit ako pag-online ka na, o subukan ang general na tanong sa ngayon."
                : "Hmm, hindi ko na-fetch iyan ngayon. Subukan mo ulit mamaya — nandito lang ako.";
        }
        return offline
            ? "Looks like you're offline right now, so I can't check the live data for that — but I'm still here! Ask me again once you're back online, or try a general question in the meantime."
            : "Hmm, I couldn't fetch that just now. Give it another try in a moment — I'll be right here.";
    }
}

class DllSearchEngine {
    private documents: DllDocument[] = [];

    setDocuments(docs: DllDocument[]) {
        this.documents = docs;
    }

    private buildTermVector(text: string): Map<string, number> {
        const vec = new Map<string, number>();
        const tokens = normalizeText(text).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
        for (const token of tokens) {
            vec.set(token, (vec.get(token) || 0) + 1);
        }
        return vec;
    }

    // Jaccard-over-typo-tolerant-tokens: helps find docs even with misspelled queries.
    private tokenJaccard(a: Map<string, number>, b: Map<string, number>): number {
        const aKeys = [...a.keys()];
        const bKeys = [...b.keys()];
        if (aKeys.length === 0 || bKeys.length === 0) return 0;
        let inter = 0;
        for (const k of aKeys) {
            if (bKeys.includes(k)) inter++;
            else if (bKeys.some(bk => bk.length >= 4 && levenshtein(k, bk) <= 1)) inter += 0.5;
        }
        const union = new Set([...aKeys, ...bKeys]).size;
        return union === 0 ? 0 : inter / union;
    }

    private docFreq(token: string): number {
        let count = 0;
        for (const doc of this.documents) {
            if (doc.bodyText.toLowerCase().includes(token)) count++;
        }
        return count;
    }

    private tfidf(vec: Map<string, number>): Map<string, number> {
        const result = new Map<string, number>();
        const totalDocs = this.documents.length || 1;
        for (const [token, tf] of vec) {
            const df = this.docFreq(token);
            const idf = Math.log((totalDocs + 1) / (df + 1)) + 1;
            result.set(token, tf * idf);
        }
        return result;
    }

    private cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
        let dot = 0, normA = 0, normB = 0;
        for (const [key, val] of a) {
            normA += val * val;
            const bVal = b.get(key) || 0;
            dot += val * bVal;
        }
        for (const val of b.values()) normB += val * val;
        const denom = Math.sqrt(normA) * Math.sqrt(normB);
        return denom === 0 ? 0 : dot / denom;
    }

    search(query: string, topK: number = 3): { doc: DllDocument; score: number }[] {
        if (this.documents.length === 0) return [];

        const qVec = this.tfidf(this.buildTermVector(query));
        const results: { doc: DllDocument; score: number }[] = [];

        for (const doc of this.documents) {
            const dVec = this.tfidf(this.buildTermVector(doc.bodyText));
            const cosine = this.cosineSimilarity(qVec, dVec);
            const jaccard = this.tokenJaccard(qVec, dVec);
            // Hybrid ranking: prefer semantic (TF-IDF) but blend typo-tolerant Jaccard.
            const score = cosine * 0.7 + jaccard * 0.3;
            if (score > 0.01) {
                results.push({ doc, score: Math.round(score * 1000) / 1000 });
            }
        }

        return results.sort((a, b) => b.score - a.score).slice(0, topK);
    }
}

export const intentClassifier = new IntentClassifier(intentModel as unknown as IntentModelData);
export const dllSearchEngine = new DllSearchEngine();
let dllEngineLoaded = false;

export async function processQuery(text: string, ctx?: ChatContext): Promise<ChatResponse> {
    const { intent, confidence } = intentClassifier.predict(text);
    const slots = extractSlots(text, intent, ctx?.memory);

    // Detect language from THIS message. A short reply like "oo" or "sige"
    // has too few Tagalog markers to confidently classify on its own, so a
    // continued conversation falls back to the language of the last turn
    // rather than snapping back to English every time the user is terse.
    let lang = detectLanguage(text);
    if (lang === 'en' && ctx?.memory?.lastLang === 'tl' && text.trim().split(/\s+/).length <= 3) {
        lang = 'tl';
    }

    let answer: string;

    // 1. Greetings / small talk / quick facts hit the knowledge base first.
    // how_to_upload is deliberately excluded from this override: its own
    // template already covers the upload flow (including offline/sync), and
    // routing it through the KB let an unrelated single-keyword hit (e.g.
    // "dll" inside "how do I upload a dll?" matching the generic DLL
    // definition entry) hijack a clear how-to-upload question with a
    // definition answer instead of the actual steps.
    const kbHit = matchKnowledgeBase(text, lang);
    if (kbHit && (intent === 'general_help' || confidence < 40)) {
        answer = kbHit;
    } else if (ctx?.supabase) {
        answer = await generateDatabaseResponse(intent, slots, ctx, text, lang);
    } else {
        answer = generateTemplateResponse(intent, slots, lang);
    }

    // 2. Humanize: prefix confident answers with a natural opener, hedge low-confidence ones.
    // Crucially, the hedge applies no matter which intent the classifier landed on —
    // a low-confidence "ask_compliance" guess used to skip straight to confidently
    // quoting real compliance numbers with zero uncertainty signal, which is more
    // misleading than a wrong "general_help" guess ever was. The two branches below
    // also deliberately share one boundary (60%) rather than leaving a silent middle
    // band where a misfired guess got neither a confident tone nor an uncertainty
    // flag — that gap is precisely where a wrong answer looked most convincing.
    const greetingStarts = lang === 'tl'
        ? ['Kumusta', 'Hoy', 'Walang anuman', 'Gabay', 'Masaya akong makatulong', 'Ayos lang yan']
        : ['Hello', 'Hey there', 'You’re welcome', 'I’m Gabay', 'Happy to help', 'Anytime'];
    const looksLikeGreeting = greetingStarts.some(s => answer.startsWith(s));
    if (confidence >= 60 && !looksLikeGreeting) {
        answer = `${pick(OPENERS[lang])} ${answer}`;
    } else if (confidence < 60 && !kbHit) {
        if (intent === 'general_help') {
            const topics = lang === 'tl'
                ? ['compliance status mo', 'paghahanap ng DLL', 'mga paparating na deadline', 'paghahambing ng paaralan', 'istatistika ng guro', 'kung paano mag-upload ng dokumento']
                : ['your compliance status', 'finding a DLL', 'upcoming deadlines', 'school comparisons', 'teacher statistics', 'how to upload a document'];
            answer = `${pick(LOW_CONFIDENCE_PREFIXES[lang])} ${pick(topics)}. ${pick(LOW_CONFIDENCE_SUFFIXES[lang])}`;
        } else {
            const closer = lang === 'tl' ? 'eto ang nakita ko' : 'here’s what I found';
            answer = `${pick(LOW_CONFIDENCE_PREFIXES[lang])} ${INTENT_TOPIC_LABELS[lang][intent]}, ${closer}:\n\n${answer}\n\n${pick(LOW_CONFIDENCE_SUFFIXES[lang])}`;
        }
    }

    return { intent, confidence, answer, slots, lang };
}

// Common short function words that must never be treated as fuzzy-match
// candidates against a KB keyword: at length 3-4 they sit within edit
// distance 1 of unrelated short keywords by pure chance (e.g. "can" vs
// "scan", "all" vs "dll"), which previously hijacked ordinary questions
// like "What can you help me with?" into an unrelated QR-scanner answer.
// Exact matches still work; only speculative fuzzy correction is blocked.
const KB_FUZZY_STOPWORDS = new Set([
    'can', 'all', 'the', 'and', 'are', 'was', 'has', 'not', 'you', 'who', 'how',
    'why', 'out', 'get', 'let', 'yes', 'see', 'use', 'for', 'but', 'yet', 'own',
    'ang', 'ng', 'sa', 'mo', 'ko', 'ba', 'na', 'pa', 'din', 'rin', 'may', 'oo', 'ka'
]);

function matchKnowledgeBase(text: string, lang: Lang = 'en'): string | null {
    const lower = normalizeText(text);
    const tokens = lower.split(/\s+/);

    // Score every entry instead of returning the first hit: a generic
    // single-word keyword (like "deadline" or "tabs") shouldn't win over a
    // more specific multi-word phrase from a later entry just because it
    // happens to appear first in the array — e.g. "What happens if I miss a
    // deadline?" should hit the dedicated missed-deadline entry, not the
    // generic deadline-lookup one, and "Analytics tab" shouldn't fall back
    // to the Dashboard entry's generic "tabs" keyword. Exact/substring hits
    // score by keyword length (longer = more specific); fuzzy token hits
    // score lower so an exact match always outranks a fuzzy one of similar
    // length.
    let bestEntry: KnowledgeEntry | null = null;
    let bestScore = 0;
    for (const entry of KNOWLEDGE_BASE) {
        let entryScore = 0;
        for (const kw of entry.keywords) {
            if (kw.includes(' ') || kw.length > 6) {
                if (lower.includes(kw)) {
                    entryScore = Math.max(entryScore, kw.length * 2);
                }
            } else {
                for (const tok of tokens) {
                    if (tok === kw) {
                        entryScore = Math.max(entryScore, kw.length * 2);
                        break;
                    }
                    if (!KB_FUZZY_STOPWORDS.has(tok) && fuzzyMatch(tok, [kw], 1)) {
                        entryScore = Math.max(entryScore, kw.length);
                    }
                }
            }
        }
        if (entryScore > bestScore) {
            bestScore = entryScore;
            bestEntry = entry;
        }
    }
    return bestEntry ? pick(bestEntry.answers[lang]) : null;
}

export function searchDlls(query: string, topK: number = 3) {
    return dllSearchEngine.search(query, topK);
}

export function loadDllDocuments(docs: DllDocument[]) {
    dllSearchEngine.setDocuments(docs);
}

export async function loadDllDocumentsFromSupabase(db: SupabaseClient, schoolYear?: string): Promise<number> {
    const year = schoolYear || getDynamicSchoolYear();
    const { data, error } = await db
        .from('submissions')
        .select('id, subject, week_number, file_hash, raw_text, profiles!inner(full_name)')
        .not('raw_text', 'is', null)
        .not('raw_text', 'eq', '')
        .eq('school_year', year)
        .limit(1000);

    if (error || !data) {
        console.warn('[chatbot] Failed to load DLL documents:', error?.message);
        return 0;
    }

    const docs: DllDocument[] = data.map((r: any) => ({
        id: r.id,
        subject: r.subject || '',
        grade: '',
        week: r.week_number || 0,
        teacher: r.profiles?.full_name || 'Unknown',
        school: r.profiles?.schools?.name || 'Unknown',
        bodyText: r.raw_text,
        fileHash: r.file_hash
    }));

    dllSearchEngine.setDocuments(docs);
    console.log(`[chatbot] Loaded ${docs.length} documents into search engine`);
    return docs.length;
}
