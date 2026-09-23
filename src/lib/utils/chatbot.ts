import intentModel from '../models/intent_classifier_model.json';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentSchoolYear as getDynamicSchoolYear } from './schoolYear';

// Text Normalization
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

// Language Detection
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

// Human-like Phrasing
function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

const OPENERS: Record<Lang, string[]> = {
    "en": [
        "Certainly."
    ],
    "tl": [
        "Narito po ang impormasyon."
    ]
};
const LOW_CONFIDENCE_PREFIXES: Record<Lang, string[]> = {
    "en": [
        "Please confirm whether your question concerns"
    ],
    "tl": [
        "Pakikumpirma po kung ang inyong tanong ay tungkol sa"
    ]
};
const LOW_CONFIDENCE_SUFFIXES: Record<Lang, string[]> = {
    "en": [
        "If you meant a different topic, please clarify your question."
    ],
    "tl": [
        "Kung ibang paksa po ang inyong tinutukoy, pakilinaw ang inyong tanong."
    ]
};
const INTENT_TOPIC_LABELS: Record<Lang, Record<Intent, string>> = {
    en: {
        ask_compliance: 'your compliance status',
        check_deadline: 'upcoming deadlines',
        find_dll: 'finding a Daily Lesson Plan',
        school_compare: 'school comparisons',
        teacher_stats: 'teacher statistics',
        calendar_info: 'the academic calendar',
        how_to_upload: 'how to upload a document',
        create_report: 'generating a report',
        general_help: 'general help'
    },
    tl: {
        ask_compliance: 'compliance status mo',
        check_deadline: 'mga paparating na deadline',
        find_dll: 'paghahanap ng Daily Lesson Plan',
        school_compare: 'paghahambing ng paaralan',
        teacher_stats: 'istatistika ng guro',
        calendar_info: 'academic calendar',
        how_to_upload: 'kung paano mag-upload ng dokumento',
        create_report: 'paggawa ng report',
        general_help: 'pangkalahatang tulong'
    }
};
const CONFUSED_RESPONSES: Record<Lang, string[]> = {
    "en": [
        "I could not determine your request. Please rephrase your question or ask about CEDIMS submissions, deadlines, or compliance."
    ],
    "tl": [
        "Paumanhin po, hindi ko matukoy ang inyong kahilingan. Pakilinaw ang inyong tanong tungkol sa submissions, deadlines, o compliance sa CEDIMS."
    ]
};

// Knowledge Base (lightweight FAQ corpus)
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
        keywords: ['dll', 'daily lesson plan', 'weekly lesson log', 'lingguhang aralin', 'lesson plan', 'banghay'],
        answers: {
            en: [
                'A Daily Lesson Plan is the DepEd weekly lesson planning document that teachers prepare and submit for compliance monitoring. Each one covers the learning area, grade level, teaching dates, and week for your teaching load.',
                'Daily Lesson Plan: it’s the weekly lesson plan every teacher submits per subject. The system checks its subject, grade, and week against your teaching load to see if you’re compliant.',
                'Think of a Daily Lesson Plan as your weekly proof of teaching plans: one per subject, per week.'
            ],
            tl: [
                'Ang Daily Lesson Plan ay ang lingguhang banghay-aralin na kailangan ninyong i-submit para sa bawat asignatura, ginagamit para i-monitor ang compliance ninyo.',
                'Ang Daily Lesson Plan ay ang lesson plan ninyo bawat linggo, per subject. Chinecheck ng system ang subject, grade, at week nito laban sa teaching load ninyo.',
                'Daily Lesson Plan ang tawag sa lingguhang lesson plan: isa ito bawat subject, bawat linggo, kailangan i-submit para sa compliance.'
            ]
        }
    },
    {
        keywords: ['isp', 'instructional supervisory plan'],
        answers: {
            en: [
                'An ISP (Instructional Supervisory Plan) is the school’s supervisory blueprint: it lists program improvement areas, targets, strategies, and the timeframe for instructional monitoring and support.',
                'ISP = Instructional Supervisory Plan. It’s usually uploaded by a School Head or Master Teacher and outlines how instructional supervision will run for the term.'
            ],
            tl: [
                'Ang ISP (Instructional Supervisory Plan) ay ang plano ng paaralan para sa supervision: naglalaman ito ng mga target, estratehiya, at timeline para sa instructional monitoring.',
                'Karaniwang ini-upload ito ng School Head o Master Teacher: nagsasaad kung paano gagawin ang supervision sa buong term.'
            ]
        }
    },
    {
        keywords: ['isr', 'instructional supervisory report'],
        answers: {
            en: [
                'An ISR (Instructional Supervisory Report) is the report a Master Teacher files after observing a classroom: it records the teacher observed, findings, and the technical assistance given.',
                'ISR stands for Instructional Supervisory Report. It’s filed monthly after a classroom observation, and it’s separate from your regular Daily Lesson Plan submissions.'
            ],
            tl: [
                'Ang ISR (Instructional Supervisory Report) ay ang report na isinusumite ng Master Teacher matapos mag-observe ng klase: naka-record dito ang guro, findings, at tulong na ibinigay.',
                'Buwanang isinusumite ito matapos mag-classroom observation, at hiwalay ito sa regular na Daily Lesson Plan submissions.'
            ]
        }
    },
    {
        keywords: ['compliance', 'calculated', 'computed', 'rate', 'percent'],
        answers: {
            en: [
                'Compliance is your actual submissions divided by your expected submissions (expected being your active teaching loads × the weeks defined in the academic calendar). On time = compliant, after the deadline = late, never submitted = missing.',
                'Here’s the formula in plain terms: (on-time submissions + late submissions) ÷ (teaching loads × calendar weeks) × 100. Both on-time and late submissions are fulfilled, while only missing submissions reduce the rate.'
            ],
            tl: [
                'Ang compliance ay ang aktwal ninyong na-submit hinati sa inaasahan (ang inaasahan ay ang active teaching loads ninyo × bilang ng linggo sa academic calendar). On time = compliant, huli = late, hindi na-submit = missing.',
                'Simpleng bersyon: kung ilan sa mga inaasahang Daily Lesson Plan ninyo ang na-submit ninyo, on time man o late, iyan ang compliance rate ninyo. Extra ("Supplementary") Daily Lesson Plans ay hindi nakakaapekto rito.'
            ]
        }
    },
    {
        keywords: ['offline', 'internet', 'connect', 'sync', 'no network'],
        answers: {
            en: [
                'You can keep working offline: anything you upload while disconnected is saved locally and syncs automatically the moment you’re back online.',
                'No signal? No problem. The app queues your uploads on your device and pushes them to the server as soon as you reconnect. You don’t need to redo anything.'
            ],
            tl: [
                'Puwede kayo pa ring mag-upload kahit walang internet: ise-save muna ito sa inyong device, tapos automatic na mag-sync pagbalik ng connection.',
                'Kung walang koneksyon, Ise-save muna ng app ang upload ninyo sa device ninyo, tapos ipapadala ito sa server pagbalik ng koneksyon. Hindi ninyo na kailangang ulitin.'
            ]
        }
    },
    {
        keywords: ['role', 'master teacher', 'school head', 'district supervisor', 'administrator'],
        answers: {
            en: [
                'Each role gets its own view: Teachers manage their own Daily Lesson Plans, Master Teachers review and endorse, School Heads monitor their whole school, and District Supervisors compare across every school in the district.',
                'It depends on who’s logged in: Teachers see their own tracker, Master Teachers and School Heads use Compliance Monitoring, and District Supervisors see the district-wide picture with Admin access on top.'
            ],
            tl: [
                'Iba-iba ang view depende sa role: Teachers para sa sariling Daily Lesson Plans, Master Teachers para sa review at endorsement, School Heads para sa buong paaralan, at District Supervisors para sa buong distrito.',
                'Depende sa naka-login: nakikita ng Teacher ang sariling tracker, ginagamit ng Master Teacher at School Head ang Compliance Monitoring, at nakikita ng District Supervisor ang buong distrito kasama ang Admin.'
            ]
        }
    },
    {
        keywords: ['for checking', 'checked', 'reviewer comment', 'remark', 'remarks'],
        answers: {
            en: [
                'In the Archive, a document sits as "For Checking" until a reviewer leaves a remark on it. Once a remark exists, it flips to "Checked." There’s no separate approval click; adding the remark is the review.',
                'Two states only: "For Checking" (no remark yet) and "Checked" (a reviewer has commented on it).'
            ],
            tl: [
                'Sa Archive, "For Checking" muna ang isang dokumento hanggang may maidagdag na remark ang reviewer. Pag may remark na, magiging "Checked" ito. Walang hiwalay na approval, ang pagdagdag ng remark na mismo ang review.',
                'Dalawa lang ang status: "For Checking" (wala pang remark) at "Checked" (may naikomento na ang reviewer). Walang hiwalay na approval step.'
            ]
        }
    },
    {
        keywords: ['supplementary', 'extra dll', 'another dll', 'duplicate submission'],
        answers: {
            en: [
                'A "Supplementary" submission is an extra Daily Lesson Plan for a week/subject that already has one on file: it’s kept for reference but never counts toward your compliance rate, upload totals, or a "missing" mark.',
                'Nag-upload kayo ba ng pangalawang Daily Lesson Plan sa parehong linggo at subject? That extra one gets tagged "Supplementary": it’s just extra documentation, it won’t hurt or help your compliance number.'
            ],
            tl: [
                'Ang "Supplementary" ay dagdag na Daily Lesson Plan para sa linggo/subject na may na-submit na: itinatago ito bilang reference pero hindi ito nabibilang sa compliance rate, total uploads, o "missing" mark.',
                'Nag-upload kayo ba ng pangalawang Daily Lesson Plan sa parehong linggo at subject? Ito ay tatawaging "Supplementary": extra documentation lang ito, hindi nakakaapekto sa compliance number ninyo.'
            ]
        }
    },
    {
        keywords: ['deadline', 'when', 'due', 'cutoff', 'cut off', 'date'],
        answers: {
            en: [
                'Deadlines follow the academic calendar your district sets up. Ask me “When is the next deadline?” and I’ll pull the exact date for you.',
                'That depends on the week: ask me about a specific week or the next one coming up, and I’ll check the academic calendar live.'
            ],
            tl: [
                'Ang mga deadline ay batay sa academic calendar na itinakda ng distrito ninyo. Tanungin ninyo ako ng “Kailan ang susunod na deadline?” at kukunin ko agad ang eksaktong petsa.',
                'Depende sa linggo: tanungin ninyo ako tungkol sa specific na linggo o sa susunod, at che-check ko agad ang academic calendar.'
            ]
        }
    },
    {
        keywords: ['greeting', 'hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'kamusta', 'kumusta'],
        answers: {
            en: [
                'Hello. I’m Gabay, your CEDIMS assistant. I can check your compliance, find Daily Lesson Plans, look up deadlines, compare schools, and show teacher stats. What would you like to know?',
                'Hello. You may ask about your submissions, deadlines, or how the system works.'
            ],
            tl: [
                'Magandang araw po. Ako si Gabay, ang CEDIMS assistant. Paano ko po kayo matutulungan sa compliance, submissions, o deadlines?',
                'Magandang araw po. Maaari ninyo akong tanungin tungkol sa submissions, deadlines, at paggamit ng CEDIMS.'
            ]
        }
    },
    {
        keywords: ['salamat', 'thanks', 'thank you', 'maraming salamat', 'thank u'],
        answers: {
            en: [
                'You are welcome. May I assist you with another CEDIMS question?',
                'I am pleased to assist. Please let me know if you have another CEDIMS question.',
                'You are welcome. Please let me know if you require further assistance.'
            ],
            tl: [
                'Walang anuman po. May iba pa po ba kayong nais suriin?',
                'Ikinagagalak ko pong makatulong. Mangyaring ipaalam kung may kailangan pa kayo.',
                'Walang anuman po. Maaari kayong magtanong tungkol sa iba pang feature ng CEDIMS.'
            ]
        }
    },
    {
        keywords: ['who are you', 'your name', 'about yourself', 'what are you', 'sino ka', 'tell me about you'],
        answers: {
            en: [
                'I am Gabay, the CEDIMS assistant. I can help with submissions, compliance, deadlines, and the records available to your role.'
            ],
            tl: [
                'Ako po si Gabay, ang CEDIMS assistant. Makakatulong ako sa pagsusuri ng compliance, paghahanap ng Daily Lesson Plan, at pagtukoy ng deadlines.',
                'Ako po si Gabay, ang CEDIMS assistant. Maaari ninyo akong tanungin tungkol sa mga feature at tala na saklaw ng inyong account.'
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
                'Ang mga status na makikita ninyo: Compliant (naisumite sa oras), Late (naisumite pero pagkatapos ng deadline), Missing (hindi pa naisusumite), Supplementary (dagdag na kopya), at Pending/Under Review habang pinoproseso.',
                'Mabilisang gabay: berde ay Compliant, ginto/amber ay Late, pula ay Missing, at asul ay karaniwang Supplementary o Under Review.'
            ]
        }
    },
    {
        keywords: ['cedims', 'smarte vision', 'smart e vision', 'what does this app do', 'what is this app', 'what is this platform', 'purpose of this app'],
        answers: {
            en: [
                'CEDIMS stands for Calapan East District Instructional Monitoring System: it’s where teachers submit Daily Lesson Plans and supervisors track compliance across schools. SmartE Vision is the broader platform name behind it.',
                'This is CEDIMS: basically a digital home for Daily Lesson Plan submissions, deadline tracking, and compliance monitoring, so nobody has to chase paperwork around anymore.'
            ],
            tl: [
                'Ang CEDIMS ay Calapan East District Instructional Monitoring System: dito nagsusumite ng Daily Lesson Plan ang mga guro at sinusubaybayan ng mga supervisor ang compliance sa buong paaralan.',
                'Ang CEDIMS ay isang sistema para sa Daily Lesson Plan submissions, pagsubaybay sa deadlines, at compliance monitoring ng paaralan at distrito.'
            ]
        }
    },
    {
        keywords: ['dashboard', 'main page', 'home page', 'tabs', 'navigation'],
        answers: {
            en: [
                'Tracker is your main screen: Teachers see their submission checklist, reviewers see pending reviews, and supervisors see the right summary for their role.',
                'The bottom (or side) nav is your main way around: Tracker for day-to-day status, Compliance for school follow-up, Archives for documents, and Settings for your account.'
            ],
            tl: [
                'Ang Tracker ang pangunahing screen: nakikita ng Teacher ang submission checklist, nakikita ng reviewers ang kailangang i-check, at nakikita ng supervisors ang summary para sa role nila.',
                'Ang nav sa ibaba (o gilid) ang pangunahing daan ninyo: Tracker para sa status, Compliance para sa school follow-up, Archives para sa dokumento, at Settings para sa account ninyo.'
            ]
        }
    },
    {
        keywords: ['archive', 'my files', 'search files', 'sort files', 'filter documents', 'export excel', 'export csv', 'download report'],
        answers: {
            en: [
                'The Archive is where submitted documents are organized. You can search by file name, open folders, filter by "For Checking" or "Checked", sort by date, name, or size, then view, download, share, or read remarks for a document.',
                'In Archives, use the search bar, status filter, and sort controls to find records quickly. Each file keeps simple actions for viewing the document, viewing remarks, downloading, and sharing verification.'
            ],
            tl: [
                'Ang Archives ay kung saan nakaayos ang mga submitted documents. Puwede kang mag-search, magbukas ng folders, mag-filter ng "For Checking" o "Checked", mag-sort, at gumamit ng view, remarks, download, at share verification actions.',
                'Sa Archives, gamitin ang search bar, status filter, at sort controls para mabilis mahanap ang records. Bawat file ay may simpleng actions para tingnan ang document, remarks, download, at share verification.'
            ]
        }
    },
    {
        keywords: ['upload pipeline', 'ocr', 'conversion', 'word to pdf', 'metadata extraction', 'teaching load matching', 'sha-256', 'hash', 'duplicate detection', 'pending sync'],
        answers: {
            en: [
                'The upload pipeline checks your role and file type, converts Word files to PDF when needed, scans the document with OCR, detects metadata such as document type/subject/grade/week, compares it with your teaching load, creates a SHA-256 fingerprint, checks duplicates, uploads the file to cloud storage, and saves the record for tracking and archives.',
                'During upload, CEDIMS does more than store a file: it validates permissions, reads the document, detects useful fields, warns about mismatches, protects the file with a SHA-256 hash, prevents duplicates, and syncs the record to the archive and compliance tracker.'
            ],
            tl: [
                'Sa upload pipeline, chinecheck muna ng system ang role at file type, kino-convert ang Word file to PDF kung kailangan, binabasa gamit ang OCR, kinukuha ang document type/subject/grade/week, kinukumpara sa teaching load, gumagawa ng SHA-256 fingerprint, chinecheck ang duplicate, ina-upload sa cloud storage, at sine-save sa archive at tracker.',
                'Hindi lang file storage ang upload sa CEDIMS: may permission check, OCR scanning, metadata detection, mismatch warning, SHA-256 hash, duplicate prevention, cloud upload, at compliance tracking.'
            ]
        }
    },
    {
        keywords: ['fuzzy classifier', 'dice coefficient', 'ocr typo', 'subject detection', 'grade detection', 'document type detection'],
        answers: {
            en: [
                'CEDIMS uses a fuzzy classifier during OCR metadata detection. It compares noisy OCR text against known subjects, grade levels, and document types using character bigram similarity, so it can still recognize text with small scanning errors.',
                'The fuzzy classifier helps the upload scanner understand imperfect text. For example, if OCR slightly misspells a subject or document label, the classifier can still map it to the closest known value.'
            ],
            tl: [
                'Gumagamit ang CEDIMS ng fuzzy classifier sa OCR metadata detection. Kinukumpara nito ang noisy OCR text sa known subjects, grade levels, at document types gamit ang character similarity kaya kaya nitong mag-handle ng scanning errors.',
                'Tinutulungan ng fuzzy classifier ang scanner na maintindihan ang text kahit may OCR typo. Kapag medyo mali ang basa sa subject o document label, hinahanap nito ang pinakamalapit na tamang value.'
            ]
        }
    },
    {
        keywords: ['intent classifier', 'intent ai', 'chatbot model', 'model confidence', 'training data', 'gabay ai'],
        answers: {
            en: [
                'Gabay uses an intent classifier trained on CEDIMS questions. It reads the user message, predicts the intent such as upload help, compliance, deadlines, DLL search, teacher stats, school comparison, reports, or general help, then routes the answer to the right system logic.',
                'The chatbot AI is a lightweight intent model. It is trained offline, exported as a JSON model, and runs inside the app so Gabay can classify CEDIMS questions even without a cloud AI service.'
            ],
            tl: [
                'Si Gabay ay gumagamit ng intent classifier na trained sa CEDIMS questions. Binabasa nito ang tanong, hinuhulaan ang intent tulad ng upload help, compliance, deadlines, DLL search, teacher stats, school comparison, reports, o general help, tapos dinadala sa tamang sagot.',
                'Ang chatbot AI ay lightweight intent model. Trained ito offline, naka-export bilang JSON model, at tumatakbo sa app para ma-classify ni Gabay ang CEDIMS questions kahit walang cloud AI service.'
            ]
        }
    },
    {
        keywords: ['k-means', 'kmeans', 'compliance group', 'cluster', 'clustering', 'submission pattern', 'teacher grouping', 'school grouping'],
        answers: {
            en: [
                'K-Means groups teachers or schools with similar compliance behavior. It looks at fulfillment (on-time plus late submissions), consistency, completeness, and upload volume, then summarizes groups so supervisors can quickly see who is doing well and who may need support.',
                'K-Means does not punish or decide for users. It only groups similar submission patterns to help Master Teachers, School Heads, and District Supervisors monitor compliance more easily.'
            ],
            tl: [
                'Ang K-Means ay naggu-group ng teachers o schools na magkakapareho ang compliance behavior. Tinitingnan nito ang fulfillment (on-time at late submissions), consistency, completeness, at upload volume para makita agad kung sino ang maayos at sino ang kailangan ng support.',
                'Hindi nagpaparusa o gumagawa ng final decision ang K-Means. Ginagamit lang ito para i-group ang similar submission patterns at makatulong sa monitoring ng Master Teacher, School Head, at District Supervisor.'
            ]
        }
    },
    {
        keywords: ['upload failed', 'presigned url', 'session expired', 'converter failed', 'scanner cannot read', 'stuck upload', 'large file', 'wrong document type'],
        answers: {
            en: [
                'If upload fails, check your internet connection, make sure the file type and size are allowed, sign in again if your session expired, and retry. If Word conversion fails, try saving the document as PDF first and upload the PDF.',
                'For upload issues: refresh your session, confirm the document type matches your role, avoid very large files, and wait for pending sync if you were offline. If the scanner reads the wrong subject, review the selected teaching load before submitting.'
            ],
            tl: [
                'Kung failed ang upload, i-check ang internet connection, siguraduhing allowed ang file type at size, mag-sign in ulit kung expired ang session, tapos i-retry. Kung failed ang Word conversion, i-save muna bilang PDF at i-upload ang PDF.',
                'Para sa upload issues: i-refresh ang session, siguraduhing tugma ang document type sa role ninyo, iwasan ang sobrang laki na file, at hintayin ang pending sync kung galing offline. Kung mali ang subject na nabasa ng scanner, i-check muna ang selected teaching load bago mag-submit.'
            ]
        }
    },
    {
        keywords: ['compliance monitoring', 'analytics', 'trend', 'forecast', 'k-means', 'kmeans', 'clustering', 'high performer', 'at-risk', 'at risk entities'],
        answers: {
            en: [
                'Compliance Monitoring keeps the supervisor view simple: compliant, missing, late, for checking, and checked, with a teacher list and a short needs-attention queue.',
                'Instead of a separate analytics page, use Compliance Monitoring to see who needs follow-up and what action to take next.'
            ],
            tl: [
                'Pinapasimple ng Compliance Monitoring ang supervisor view: compliant, missing, late, for checking, at checked, kasama ang teacher list at needs-attention queue.',
                'Sa halip na hiwalay na analytics page, gamitin ang Compliance Monitoring para makita kung sino ang kailangang i-follow up at ano ang susunod na action.'
            ]
        }
    },
    {
        keywords: ['academic calendar', 'school year', 'term', 'week schedule', 'open week', 'scheduled week', 'generate calendar', 'deped calendar'],
        answers: {
            en: [
                'The Academic Calendar (under Admin, for District Supervisors) is where each week’s submission deadline gets set. A week starts "Scheduled" (hidden from teachers) until it’s toggled "Open." Only open weeks count toward compliance.',
                'District Supervisors manage the calendar: they can add weeks one by one or generate the full DepEd school-year calendar in one click, then open each week as it becomes active.'
            ],
            tl: [
                'Ang Academic Calendar (nasa ilalim ng Admin, para sa District Supervisors) ay kung saan itinatakda ang deadline ng bawat linggo. "Scheduled" muna ang isang linggo (nakatago sa guro) hanggang i-toggle itong "Open." Mga bukas na linggo lang ang binibilang sa compliance.',
                'Pinapamahalaan ng District Supervisor ang calendar: puwede niyang idagdag ang bawat linggo isa-isa o i-generate ang buong DepEd school-year calendar sa isang click.'
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
                'Gusto ninyong magdagdag ng bagong teacher account o baguhin ang role/school ng isang tao? Nasa Admin → Users ang lahat niyan.'
            ]
        }
    },
    {
        keywords: ['notification', 'notifications', 'alert me', 'bell icon'],
        answers: {
            en: [
                'You’ll get a notification whenever a deadline is updated or a new week opens for submissions. Check the bell icon in the header for your recent alerts.',
                'Notifications fire mainly around deadline changes: a supervisor opens or updates a week, and everyone affected gets pinged.'
            ],
            tl: [
                'May notification kayo kapag na-update ang deadline o may bagong linggo na bumukas para sa submissions. Tingnan ang bell icon sa taas para sa mga alerto ninyo.',
                'Karaniwang tumutunog ang notification kapag may binago sa deadline: nag-o-open o nag-a-update ang supervisor ng linggo, at nade-notify ang lahat ng apektado.'
            ]
        }
    },
    {
        keywords: ['dark mode', 'light mode', 'theme', 'night mode'],
        answers: {
            en: [
                'There’s a light/dark mode toggle (the moon/sun icon) in the header. Tap it to switch themes anytime.',
                'Yes, dark mode is built in. Look for the toggle near the notification bell.'
            ],
            tl: [
                'May light/dark mode toggle (ang moon/sun icon) sa taas. Pindutin ninyo lang para lumipat ng theme kahit kailan.',
                'Oo, meron dark mode. Hanapin ninyo ang toggle malapit sa notification bell.'
            ]
        }
    },
    {
        keywords: ['qr code', 'scan', 'scanner'],
        answers: {
            en: [
                'The QR scanner lets you quickly verify a document’s authenticity by scanning the code printed on it. Look for the scan option in your navigation.',
                'Scanning a document’s QR code pulls up its verification page, so anyone can confirm it’s a genuine, unaltered submission.'
            ],
            tl: [
                'Ang QR scanner ay nagpapahintulot sa inyong i-verify agad ang tunay na dokumento sa pamamagitan ng pag-scan ng code dito. Hanapin ninyo ang scan option sa navigation.',
                'Kapag na-scan ang QR code ng dokumento, lalabas ang verification page nito, para masiguro ng lahat na tunay at hindi binago ang submission.'
            ]
        }
    },
    {
        keywords: ['teaching load', 'subjects', 'assigned subjects', 'grade level assignment'],
        answers: {
            en: [
                'Your teaching loads are the subject + grade-level combinations assigned to you: they’re what "expected submissions" is calculated from, so make sure yours are accurate and marked active.',
                'Each active teaching load is one more expected Daily Lesson Plan per week. If your compliance math looks off, it’s worth double-checking your teaching loads are set up correctly.'
            ],
            tl: [
                'Ang teaching loads ninyo ay ang kombinasyon ng subject at grade level na naka-assign sa inyo: dito hinahango ang "expected submissions", kaya siguraduhing tama at active ang mga ito.',
                'Bawat active na teaching load ay isa pang inaasahang Daily Lesson Plan kada linggo. Kung mukhang mali ang compliance ninyo, siguraduhing tama ang setup ng teaching loads ninyo.'
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
                'You can reset your password from the login screen’s "Forgot Password" link, or ask your District Supervisor: they can reset it for you from the Admin → Users panel.',
                'Locked out? Try "Forgot Password" on the login page first. If that doesn’t work, your district supervisor can reset your account from Admin.'
            ],
            tl: [
                'Puwede ninyong i-reset ang password ninyo sa "Forgot Password" na link sa login screen, o hilingin sa District Supervisor ninyo: puwede niyang i-reset ito mula sa Admin → Users.',
                'Naka-lock kayo ba? Subukan ninyo muna ang "Forgot Password" sa login page. Kung hindi gumana, puwedeng i-reset ng district supervisor ninyo ang account ninyo mula sa Admin.'
            ]
        }
    },
    {
        keywords: ['privacy', 'who can see my', 'confidential', 'visible to'],
        answers: {
            en: [
                'Visibility follows your role and hierarchy: Teachers see only their own documents, School Heads see their school, and District Supervisors see the whole district. ISP — Instructional Supervisory Plan / ISR — Instructional Supervisory Report have their own tighter rules on top of that.',
                'Nobody outside your school/district chain can see your submissions. Access is scoped strictly by role.'
            ],
            tl: [
                'Ang visibility ay nakabatay sa role at hierarchy ninyo: nakikita lang ng Teacher ang sariling dokumento, nakikita ng School Head ang paaralan niya, at nakikita ng District Supervisor ang buong distrito.',
                'Walang makakakita ng submissions ninyo sa labas ng school/district chain ninyo. Mahigpit itong nakabatay sa role.'
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
                'Missing a deadline marks that week’s submission as "Late" if you eventually submit it, or "Missing" if you never do. Either way it affects your compliance rate, but the system itself doesn’t lock you out or penalize beyond that.',
                'Late is still better than missing: a late submission still counts toward your compliance rate, but an un-submitted one counts as missing and drags your rate down further.'
            ],
            tl: [
                'Ang dokumentong naisumite pagkatapos ng deadline ay may status na "Late". Ang inaasahang dokumentong hindi pa naisusumite ay "Missing". Nabibilang ang late submission sa compliance rate, ngunit hiwalay itong nakatala sa on-time submissions.',
                'Mas mabuti pa rin ang late kaysa missing: nabibilang pa rin ang late submission sa compliance rate ninyo, pero ang hindi na-submit ay bumababa nang husto ang rate ninyo.'
            ]
        }
    },
    // Regulatory references
    // Deliberately narrow: each entry states only what's directly confirmed
    // by DepEd's own published order (linked in the answer itself) rather
    // than paraphrasing specific clauses from memory. The link is there on
    // purpose — the answer's job is to point to the authoritative source,
    // not to stand in for it. Verified against deped.gov.ph, the Official
    // Gazette, and the National Privacy Commission as of September 2026;
    // if DepEd supersedes or amends one of these, this entry needs updating
    // to match — it is not self-updating.
    {
        keywords: [
            'do 42', 'deped order 42', 'legal basis of the dll', 'legal basis ng dll',
            'why is the dll required', 'bakit kailangan ang dll', 'dll policy',
            'basis for dll', 'batayan ng dll', 'requirement for dll', 'k to 12 lesson preparation policy'
        ],
        answers: {
            en: [
                'The requirement to prepare a Daily Lesson Plan (or a more detailed Lesson Plan) comes from DepEd Order No. 42, s. 2016, "Policy Guidelines on Daily Lesson Preparation for the K to 12 Basic Education Program," issued under RA 10533 (the Enhanced Basic Education Act of 2013). It sets out what a lesson plan needs to cover (objectives, content, learning resources, procedure, and reflection) and affirms the teacher\'s role as a facilitator of learning. Specific submission deadlines and monitoring (like what this system tracks) are set locally by your school/division, not by this order itself. Full text: https://www.deped.gov.ph/2016/06/17/do-42-s-2016-policy-guidelines-on-daily-lesson-preparation-for-the-k-to-12-basic-education-program/',
            ],
            tl: [
                'Ang requirement na maghanda ng Daily Lesson Plan (o mas detalyadong Lesson Plan) ay galing sa DepEd Order No. 42, s. 2016, "Policy Guidelines on Daily Lesson Preparation for the K to 12 Basic Education Program," base sa RA 10533 (Enhanced Basic Education Act of 2013). Nakasaad dito ang mga dapat nasa lesson plan: layunin, nilalaman, learning resources, proseso, at reflection. Ang mga specific na deadline at monitoring (tulad ng tina-track ng system na ito) ay itinatakda ng inyong paaralan/dibisyon, hindi ng order mismo. Buong teksto: https://www.deped.gov.ph/2016/06/17/do-42-s-2016-policy-guidelines-on-daily-lesson-preparation-for-the-k-to-12-basic-education-program/',
            ]
        }
    },
    {
        keywords: [
            'matatag', 'matatag curriculum', 'do 10 2024', 'deped order 10 2024',
            'new curriculum', 'bagong curriculum', 'curriculum guide 2024'
        ],
        answers: {
            en: [
                'The current national curriculum for Kindergarten through Grade 10 is the MATATAG Curriculum, established under DepEd Order No. 10, s. 2024, "Policy Guidelines on the Implementation of the MATATAG Curriculum" (later amended by DO 12, s. 2024). It rolls out in phases by grade level: SY 2024-2025 for Kinder, Grades 1, 4, and 7; SY 2025-2026 for Grades 2, 5, and 8; SY 2026-2027 for Grades 3, 6, and 9; SY 2027-2028 for Grade 10. Grades 11-12 are covered by a separate order. Official PDF: https://www.deped.gov.ph/wp-content/uploads/DO_s2024_010.pdf',
            ],
            tl: [
                'Ang kasalukuyang pambansang kurikulum mula Kindergarten hanggang Grade 10 ay ang MATATAG Curriculum, base sa DepEd Order No. 10, s. 2024, "Policy Guidelines on the Implementation of the MATATAG Curriculum" (kalaunang inamyendahan ng DO 12, s. 2024). Isinasagawa ito nang paunti-unti ayon sa grade level: SY 2024-2025 para sa Kinder, Grades 1, 4, at 7; SY 2025-2026 para sa Grades 2, 5, at 8; SY 2026-2027 para sa Grades 3, 6, at 9; SY 2027-2028 para sa Grade 10. May hiwalay na order para sa Grades 11-12. Opisyal na PDF: https://www.deped.gov.ph/wp-content/uploads/DO_s2024_010.pdf',
            ]
        }
    },
    {
        keywords: [
            'data privacy', 'privacy act', 'ra 10173', 'data privacy act', 'data protection',
            'proteksyon ng datos', 'privacy ng datos', 'saan napupunta ang data ko', 'data privacy law'
        ],
        answers: {
            en: [
                'The submissions and personal data this system handles fall under Republic Act No. 10173, the Data Privacy Act of 2012, which governs how personal information is collected, processed, and protected in the Philippines and established the National Privacy Commission as its regulator. It\'s the reason access here is scoped by role (Teacher/School Head/District Supervisor) rather than open to everyone. Official text: https://www.officialgazette.gov.ph/2012/08/15/republic-act-no-10173/ · National Privacy Commission: https://privacy.gov.ph/data-privacy-act/',
            ],
            tl: [
                'Ang mga submission at personal data na hinahawakan ng system na ito ay sakop ng Republic Act No. 10173, ang Data Privacy Act of 2012, na nagtatakda kung paano kinokolekta, pinoproseso, at pinoprotektahan ang personal information sa Pilipinas, at nagtatag ng National Privacy Commission bilang regulator nito. Ito ang dahilan kung bakit naka-scope ang access dito ayon sa role (Teacher/School Head/District Supervisor) at hindi bukas sa lahat. Opisyal na teksto: https://www.officialgazette.gov.ph/2012/08/15/republic-act-no-10173/ · National Privacy Commission: https://privacy.gov.ph/data-privacy-act/',
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
    | 'create_report'
    | 'general_help';

export interface ChatAttachment {
    fileName: string;
    blob: Blob;
}

export interface ChatResponse {
    intent: Intent;
    confidence: number;
    answer: string;
    slots: Record<string, string>;
    lang: Lang;
    /** Present when the reply includes a downloadable report file. */
    attachments?: ChatAttachment[];
    /** True when the question is outside Gabay's CEDIMS capabilities. */
    outOfScope?: boolean;
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
        ask_compliance: () => pick(["Let me check your compliance data. One moment.", "I will check your compliance records.", "I will retrieve your compliance status."]),
        check_deadline: () => pick(["Let me look up the deadlines from the academic calendar.", "Checking the calendar for deadlines.", "I will look up the submission deadlines."]),
        find_dll: () => {
            let filters = '';
            if (slots.subject) filters += ` for ${slots.subject}`;
            if (slots.grade) filters += `, Grade ${slots.grade}`;
            if (slots.week) filters += `, Week ${slots.week}`;
            return pick([`Searching Daily Lesson Plans${filters}...`, `Looking for Daily Lesson Plans${filters}...`, `Let me find those Daily Lesson Plans${filters} for you.`]);
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
        how_to_upload: () => "Uploading a Daily Lesson Plan is simple. Please open the Upload page, then drag and drop your .docx or .pdf file. The system will automatically detect the subject, grade level, and week from the document. You will have a chance to review the extracted information before finalizing the upload. If you are offline, the document will be saved locally and will sync automatically once you are back online.",
        create_report: () => "Generating a report needs a live connection so I can pull current compliance data. Please try again once you're back online.",
        general_help: () => "I can assist with CEDIMS-related questions. I can check your compliance rate, look up deadlines, find Daily Lesson Plans, compare schools, show teacher stats, or generate a compliance report. Try asking something like, “What is my compliance rate?” or “When is the next deadline?”"
    };

    const templatesTl: Record<Intent, () => string> = {
        ask_compliance: () => pick(["Susuriin ko po ang inyong compliance data.", "Susuriin ko po ang inyong compliance records.", "Kukunin ko po ang inyong compliance status."]),
        check_deadline: () => pick(["Titignan ko ang mga deadline sa academic calendar.", "Chineck ko ang calendar para sa deadlines.", "Kukunin ko po ang inyong mga deadline."]),
        find_dll: () => {
            let filters = '';
            if (slots.subject) filters += ` para sa ${slots.subject}`;
            if (slots.grade) filters += `, Grade ${slots.grade}`;
            if (slots.week) filters += `, Week ${slots.week}`;
            return pick([`Hinahanap ko ang mga Daily Lesson Plan${filters}...`, `Naghahanap ng Daily Lesson Plan${filters}...`, `Hanapin ko ang mga Daily Lesson Plan${filters} para sa'yo.`]);
        },
        school_compare: () => {
            if (slots.school) return pick([`Kinukuha ko ang compliance data para sa ${slots.school}.`, `Chineck ko kung kumusta ang ${slots.school}.`]);
            return pick(["Ihahambing ko ang compliance rates ng mga paaralan sa distrito ninyo.", "Kinukumpara ko ngayon ang mga paaralan sa distrito.", "Kinukuha ko ang school comparison data."]);
        },
        teacher_stats: () => {
            if (slots.teacher) return pick([`Hinahanap ko ang submission records ni ${slots.teacher}.`, `Chineck ko ang stats ni ${slots.teacher}.`]);
            return pick(["Kinukuha ko ang teacher submission statistics.", "Kinukuha ko ang teacher stats.", "Kinukuha ko ang performance data ng mga guro."]);
        },
        calendar_info: () => pick(["Titignan ko ang academic calendar para sa'yo.", "Tinitignan ko na ang school calendar.", "Kinukuha ko ang academic calendar."]),
        how_to_upload: () => "Upang mag-upload ng Daily Lesson Plan, buksan po ang Upload page at piliin ang inyong .docx o .pdf file. Susuriin ng system ang subject, grade level, at linggo sa dokumento. Pakisuri ang nakuhang impormasyon bago kumpirmahin ang submission. Kung offline, ise-save muna ang dokumento sa inyong device at magsi-sync kapag bumalik ang koneksyon.",
        create_report: () => "Kailangan po ng koneksyon upang makuha ang kasalukuyang compliance data para sa report. Mangyaring subukan muli kapag online na.",
        general_help: () => "Nandito ako para tumulong sa maraming bagay. Puwede kong i-check ang compliance rate ninyo, hanapin ang mga deadline, maghanap ng Daily Lesson Plan, ikumpara ang mga paaralan, ipakita ang teacher stats, o gumawa ng compliance report. Subukan ninyong itanong, “Ano ang compliance rate ko?” o “Kailan ang susunod na deadline?”"
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
    return !status || status === 'compliant' || status === 'on-time' || status === 'late';
}

async function queryCompliance(
    db: SupabaseClient,
    userId: string | undefined,
    profile: ChatContext['profile'],
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<string> {
    if (!userId) return lang === 'tl' ? 'Mangyaring mag-sign in upang masuri ang inyong compliance rate.' : 'Please log in to check your compliance rate.';

    const role = profile?.role;
    const schoolYear = getDynamicSchoolYear();
    const districtId = profile?.district_id;

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
        if (!teacherIds || teacherIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa paaralan ninyo.' : 'No teachers found in your school.';
        userFilter = teacherIds.map((t: any) => t.id);
        scopeLabel = lang === 'tl' ? 'Ang compliance ng paaralan ninyo' : 'Your school\'s';
    } else if (role === 'District Supervisor' && districtId) {
        const { data: schoolIds } = await db
            .from('schools')
            .select('id')
            .eq('district_id', districtId);
        if (!schoolIds || schoolIds.length === 0) return lang === 'tl' ? 'Walang nahanap na paaralan sa distrito ninyo.' : 'No schools found in your district.';
        const { data: teacherIds } = await db
            .from('profiles')
            .select('id')
            .in('school_id', schoolIds.map((s: any) => s.id));
        if (!teacherIds || teacherIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa distrito ninyo.' : 'No teachers found in your district.';
        userFilter = teacherIds.map((t: any) => t.id);
        scopeLabel = lang === 'tl' ? 'Ang compliance ng distrito ninyo' : 'Your district\'s';
    } else {
        return lang === 'tl' ? 'Hindi ma-determine ang scope ninyo. Mag-login gamit ang valid na account.' : 'Unable to determine your scope. Please log in with a valid account.';
    }

    // Calculate expected count (matches dashboard: teachingLoadsCount × definedWeeks)
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

    if (error) return lang === 'tl' ? 'Paumanhin po, hindi ma-access ngayon ang compliance data. Mangyaring subukan muli.' : "Sorry, I couldn't access the compliance data right now. Please try again.";

    // Calculate compliance against expected
    const actualSubmissions = data || [];
    const compliant = actualSubmissions.filter((s: any) => isCompliant(s.compliance_status)).length;
    const late = actualSubmissions.filter((s: any) => s.compliance_status === 'late').length;
    const actualUploads = compliant;
    const nonCompliant = Math.max(0, expectedTotal - actualUploads);
    const rate = expectedTotal > 0 ? Math.round((actualUploads / expectedTotal) * 100) : 0;

    const pendingReview = actualSubmissions.filter((s: any) => !s.compliance_status).length;
    const compliantExplicit = actualSubmissions.filter((s: any) => s.compliance_status === 'compliant' || s.compliance_status === 'on-time').length;

    let response: string;
    if (lang === 'tl') {
        if (slots.week) {
            response = `Para sa Week ${slots.week}${slots.subject ? ` (${slots.subject})` : ''}, ang compliance rate ay ${rate}% (${actualUploads} sa ${expectedTotal}).`;
            if (compliant > 0) response += ` ${compliant} submission ang compliant, kabilang ang late kung mayroon.`;
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
            if (nonCompliant > 0) response += ' Mangyaring suriin ang mga kulang na Daily Lesson Plan at ang mga itinakdang deadline.';
            else response += ' Naisumite na ang lahat ng inaasahang Daily Lesson Plan para sa saklaw na ito.';
        }
        return response;
    }

    if (slots.week) {
        response = `For Week ${slots.week}${slots.subject ? ` (${slots.subject})` : ''}, the compliance rate is ${rate}% (${actualUploads} out of ${expectedTotal}).`;
        if (compliant > 0) response += ` ${compliant} submission${compliant !== 1 ? 's are' : ' is'} compliant, including late if any.`;
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
        if (nonCompliant > 0) response += ' Please review the missing Daily Lesson Plans and their submission deadlines.';
        else response += ' All expected Daily Lesson Plans for this scope have been submitted.';
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

    if (error) return lang === 'tl' ? 'Paumanhin po, hindi ma-access ngayon ang academic calendar.' : "Sorry, I couldn't access the academic calendar right now.";
    if (!data || data.length === 0) {
        if (slots.week) return lang === 'tl' ? `Walang nahanap na deadline para sa Week ${slots.week} sa academic calendar.` : `I couldn't find a deadline for Week ${slots.week} in the academic calendar.`;
        return lang === 'tl' ? 'Walang paparating na deadline. Baka hindi pa naka-set up ang academic calendar para sa distrito ninyo.' : 'No upcoming deadlines found. The academic calendar may not be set up yet for your district.';
    }

    if (slots.week) {
        const entry = data[0] as any;
        return lang === 'tl'
            ? `Ang deadline para sa Week ${entry.week_number}${entry.school_year ? ` (${entry.school_year})` : ''} ay ${formatDate(entry.deadline_date)}.`
            : `The deadline for Week ${entry.week_number}${entry.school_year ? ` (${entry.school_year})` : ''} is ${formatDate(entry.deadline_date)}.`;
    }

    const lines = (data as any[]).map((d: any) =>
        `${formatDate(d.deadline_date)}${d.description ? ': ' + d.description : ''}`
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
                    return `${i + 1}. ${d.subject}${grade}${week}, ${d.teacher}`;
                });
                let summary = lang === 'tl'
                    ? `May nahanap akong ${semantic.length} Daily Lesson Plan na tugma sa "${queryText.trim()}":\n${lines.join('\n')}`
                    : `Found ${semantic.length} Daily Lesson Plan${semantic.length > 1 ? 's' : ''} matching "${queryText.trim()}":\n${lines.join('\n')}`;
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
            return lang === 'tl' ? `Walang nahanap na Daily Lesson Plan para sa ${gradeLabel}.` : `I couldn't find any Daily Lesson Plans for ${gradeLabel}.`;
        }
    }

    query = query.limit(5);
    const { data, error } = await query;

    if (error) return lang === 'tl' ? 'Paumanhin po, hindi mahanap ngayon ang mga Daily Lesson Plan.' : "Sorry, I couldn't search Daily Lesson Plans right now.";
    if (!data || data.length === 0) {
        const parts: string[] = [];
        if (slots.subject) parts.push(slots.subject);
        if (slots.grade) parts.push(`Grade ${slots.grade}`);
        if (slots.week) parts.push(`Week ${slots.week}`);
        if (lang === 'tl') {
            let msg = 'Walang nahanap na Daily Lesson Plan';
            if (parts.length > 0) msg += ` na tugma sa ${parts.join(' ')}`;
            return msg + '.';
        }
        let msg = "I couldn't find any Daily Lesson Plans";
        if (parts.length > 0) msg += ` matching ${parts.join(' ')}`;
        return msg + '.';
    }

    const lines = (data as any[]).map((d: any, i: number) => {
        const teacher = d.profile?.full_name || (lang === 'tl' ? 'Hindi kilalang guro' : 'Unknown teacher');
        const grade = d.teaching_load?.grade_level || '';
        const subj = d.subject || (lang === 'tl' ? 'Hindi kilalang subject' : 'Unknown subject');
        const week = d.week_number ? ` Week ${d.week_number}` : '';
        return `${i + 1}. ${subj}${grade ? ' (' + grade + ')' : ''}${week}, ${teacher}`;
    });

    const parts: string[] = [];
    if (slots.subject) parts.push(slots.subject);
    if (slots.grade) parts.push(`Grade ${slots.grade}`);
    if (slots.week) parts.push(`Week ${slots.week}`);

    let summary = lang === 'tl'
        ? `May nahanap akong ${data.length} Daily Lesson Plan`
        : `Found ${data.length} Daily Lesson Plan${data.length > 1 ? 's' : ''}`;
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

    // Get schools in the district
    let schoolQuery = db.from('schools').select('id, name');
    if (slots.school) {
        schoolQuery = schoolQuery.ilike('name', `%${slots.school.replace('Elementary School', '').trim()}%`);
    }
    schoolQuery = schoolQuery.eq('district_id', effectiveDistrictId);

    const { data: schools, error: schoolErr } = await schoolQuery;
    if (schoolErr || !schools || schools.length === 0) {
        if (slots.school) return lang === 'tl' ? `Walang nahanap na paaralang tugma sa "${slots.school}" sa distrito ninyo.` : `I couldn't find a school matching "${slots.school}" in your district.`;
        return lang === 'tl' ? 'Walang nahanap na paaralan sa distrito ninyo.' : 'No schools found in your district.';
    }

    // Get teachers at these schools
    const schoolIds = (schools as any[]).map((s: any) => s.id);
    const { data: teachers } = await db
        .from('profiles')
        .select('id, school_id')
        .eq('role', 'Teacher')
        .in('school_id', schoolIds);

    if (!teachers || teachers.length === 0) {
        return lang === 'tl' ? 'Walang nahanap na guro sa mga paaralang ito.' : 'No teachers found in these schools.';
    }

    // Exclude NC placeholders from the submissions query
    const teacherIds = (teachers as any[]).map((t: any) => t.id);
    const { data: submissions } = await db
        .from('submissions')
        .select('user_id, compliance_status')
        .in('user_id', teacherIds)
        .not('file_hash', 'like', 'nc_%');

    // Build teacher → school mapping
    const teacherSchool = new Map<string, string>();
    for (const t of teachers as any[]) {
        teacherSchool.set(t.id, t.school_id);
    }

    // Aggregate per school
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
        ? `Paghahambing ng compliance ng mga paaralan sa distrito ninyo:\n${lines.join('\n')}`
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
    if (!userId) return lang === 'tl' ? 'Mangyaring mag-sign in upang makita ang teacher statistics.' : 'Please log in to view teacher statistics.';

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
        if (tIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa paaralan ninyo.' : 'No teachers found in your school.';
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
            if (tIds.length === 0) return lang === 'tl' ? 'Walang nahanap na guro sa distrito ninyo.' : 'No teachers found in your district.';
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

    if (sErr) return lang === 'tl' ? 'Paumanhin po, hindi ma-load ang submission data.' : "Sorry, I couldn't load submission data.";

    const teacherSubMap = new Map<string, { total: number; compliant: number; late: number }>();
    for (const t of teachers as any[]) {
        teacherSubMap.set(t.id, { total: 0, compliant: 0, late: 0 });
    }
    for (const s of (subs || []) as any[]) {
        const entry = teacherSubMap.get(s.user_id);
        if (entry) {
            entry.total++;
            if (isCompliant(s.compliance_status)) entry.compliant++;
            if (s.compliance_status === 'late') entry.late++;
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
        // Late submissions are already included in compliant, so subtract them
        // only once when deriving the missing count.
        const nonCompliant = Math.max(0, t.total - t.compliant);
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

    if (error) return lang === 'tl' ? 'Paumanhin po, hindi ma-access ngayon ang academic calendar.' : "Sorry, I couldn't access the academic calendar right now.";

    if (!data || data.length === 0) {
        return lang === 'tl'
            ? 'Hindi pa naka-set up ang academic calendar para sa distrito ninyo. Makipag-ugnayan sa district supervisor para i-configure ito.'
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
            if (nextDeadline.description) response += `: ${nextDeadline.description}`;
            response += '.';
        }
        return response;
    }

    response = `The academic calendar covers ${terms} and has ${weeks} weeks scheduled`;
    if (first?.school_year) response += ` for the school year ${first.school_year}`;
    response += '.';

    if (nextDeadline) {
        response += `\n\nThe next deadline is for Week ${nextDeadline.week_number}, falling on ${formatDate(nextDeadline.deadline_date)}`;
        if (nextDeadline.description) response += `: ${nextDeadline.description}`;
        response += '.';
    }

    return response;
}

// ─── Report Generation (School Head / District Supervisor only) ───────────
// Bilingual phrase pools, picked randomly per compliance tier (same pick()
// pattern used throughout this file) so two reports generated back to back
// read as two differently-worded sentences describing the same numbers,
// rather than one fixed template with values swapped in.
type ReportTier = 'excellent' | 'good' | 'attention' | 'critical';

const REPORT_OPENERS: Record<Lang, Record<ReportTier, string[]>> = {
    en: {
        excellent: [
            'Compliance across {scope} is excellent this school year.',
            '{scope} is performing strongly: submissions are largely on track.',
            'The compliance picture for {scope} looks very healthy.'
        ],
        good: [
            'Compliance across {scope} is solid, with room to close a few gaps.',
            '{scope} is doing well overall, though a handful of submissions need follow-up.',
            'Most submissions for {scope} are on track this school year.'
        ],
        attention: [
            'Compliance across {scope} needs attention this school year.',
            '{scope} has a meaningful number of late or missing submissions to follow up on.',
            'There are compliance gaps in {scope} worth flagging to teachers.'
        ],
        critical: [
            'Compliance across {scope} is critically low and needs immediate follow-up.',
            '{scope} has a large share of late or missing submissions.',
            'This report flags a serious compliance shortfall in {scope}.'
        ]
    },
    tl: {
        excellent: [
            'Napakaganda ng compliance sa {scope} ngayong school year.',
            'Matatag ang performance ng {scope}: halos lahat ng submissions ay on track.',
            'Napakaayos ng compliance picture para sa {scope}.'
        ],
        good: [
            'Maayos ang compliance sa {scope}, may ilang gaps na lang na dapat asikasuhin.',
            'Mahusay naman ang {scope} sa kabuuan, pero may ilang submissions na kailangang i-follow up.',
            'Karamihan ng submissions para sa {scope} ay on track ngayong school year.'
        ],
        attention: [
            'Kailangan ng pansin ang compliance sa {scope} ngayong school year.',
            'Maraming late o missing submissions sa {scope} na kailangang i-follow up.',
            'May mga compliance gaps sa {scope} na dapat i-flag sa mga guro.'
        ],
        critical: [
            'Kritikal na mababa ang compliance sa {scope} at kailangan ng agarang follow-up.',
            'Malaki ang bahagi ng late o missing submissions sa {scope}.',
            'Binibigyang-diin ng report na ito ang seryosong compliance shortfall sa {scope}.'
        ]
    }
};

const REPORT_CLOSERS: Record<Lang, Record<ReportTier, string[]>> = {
    en: {
        excellent: ['Keep up the consistent submission habits.', 'No action needed right now, just keep the momentum going.'],
        good: ['A quick check-in with the teachers behind on submissions should close most of the gap.', 'Consider a reminder to the small group still catching up.'],
        attention: ['A follow-up with the affected teachers is recommended this week.', 'Consider reviewing the late/missing list in the report and reaching out directly.'],
        critical: ['Immediate outreach to the affected teachers is strongly recommended.', 'This warrants a closer look at what is blocking submissions.']
    },
    tl: {
        excellent: ['Ipagpatuloy ang pare-parehong pag-susumite.', 'Walang kailangang gawin sa ngayon, panatilihin lang ang momentum.'],
        good: ['Ang mabilisang check-in sa mga guro na huli sa submissions ay dapat makasara sa karamihan ng gaps.', 'Isaalang-alang ang paalala sa maliit na grupong nagki-catch up pa.'],
        attention: ['Inirerekomenda ang follow-up sa mga apektadong guro ngayong linggo.', 'Isaalang-alang ang pagsusuri sa late/missing list sa report at direktang pakikipag-ugnayan.'],
        critical: ['Mahigpit na inirerekomenda ang agarang pakikipag-ugnayan sa mga apektadong guro.', 'Kailangan ng mas malalim na pagsusuri kung ano ang humaharang sa mga submissions.']
    }
};

function reportTier(rate: number): ReportTier {
    if (rate >= 90) return 'excellent';
    if (rate >= 75) return 'good';
    if (rate >= 50) return 'attention';
    return 'critical';
}

async function queryCreateReport(
    db: SupabaseClient,
    profile: ChatContext['profile'],
    slots: Record<string, string>,
    lang: Lang = 'en'
): Promise<DbResponse> {
    const role = profile?.role;
    if (role !== 'School Head' && role !== 'District Supervisor') {
        return {
            answer: lang === 'tl'
                ? 'Paumanhin, available lang ang report generation para sa School Head at District Supervisor accounts.'
                : 'Sorry, report generation is only available for School Head and District Supervisor accounts.'
        };
    }

    // Same RPC the in-app Reports flow used — SECURITY DEFINER, scoped by
    // the caller's own profile (role/school/district) via auth.uid(), so
    // this can only ever return what this specific supervisor is already
    // authorized to see.
    const { data, error } = await db.rpc('get_compliance_report_rows', {});

    if (error) {
        console.error('[chatbot] create_report RPC error:', error);
        return {
            answer: lang === 'tl'
                ? "Paumanhin po, hindi ko makuha ang report data ngayon. Mangyaring subukan muli mamaya."
                : "Sorry, I couldn't pull the report data just now. Please try again in a moment."
        };
    }

    const rows = (data || []) as {
        teacher_name: string;
        school_name: string | null;
        district_name: string | null;
        doc_type: string;
        week_number: number | null;
        school_year: string;
        compliance_status: string;
        submitted_at: string;
    }[];

    if (rows.length === 0) {
        return {
            answer: lang === 'tl'
                ? 'Wala pang submission data na makikita para sa report na ito.'
                : 'There is no submission data available for this report yet.'
        };
    }

    const scopeName = (role === 'District Supervisor'
        ? rows.find(r => r.district_name)?.district_name
        : rows.find(r => r.school_name)?.school_name)
        || (lang === 'tl' ? 'ang saklaw ninyo' : 'your scope');

    const total = rows.length;
    const onTime = rows.filter(r => r.compliance_status === 'compliant' || r.compliance_status === 'on-time').length;
    const late = rows.filter(r => r.compliance_status === 'late').length;
    const fulfilled = onTime + late;
    const supplementary = rows.filter(r => r.compliance_status === 'supplementary').length;
    const rate = total > 0 ? Math.round((fulfilled / total) * 100) : 0;
    const tier = reportTier(rate);
    const reportSchoolYear = rows[0]?.school_year || '';

    const opener = pick(REPORT_OPENERS[lang][tier]).replace('{scope}', scopeName);
    const closer = pick(REPORT_CLOSERS[lang][tier]);

    const summary = lang === 'tl'
        ? `${opener}\n\nMayroong ${total} submissions ngayong school year ${reportSchoolYear}: ${fulfilled} fulfilled (${onTime} on-time at ${late} late), at ${supplementary} supplementary. Ang overall rate ay ${rate}%.\n\n${closer}\n\nInihanda ko ang isang detalyadong report sa Excel at Word: makikita sa ibaba.`
        : `${opener}\n\nThere are ${total} submissions for school year ${reportSchoolYear}: ${fulfilled} fulfilled (${onTime} on-time and ${late} late), and ${supplementary} supplementary. The overall rate is ${rate}%.\n\nI've prepared a detailed report in Excel and Word: see below.\n\n${closer}`;

    // Reuse the exact same shared, professionally-styled report builders the
    // app already uses elsewhere (excelExport.ts for Archive exports),
    // rather than a third, chat-specific format.
    const { buildReportWorkbook } = await import('./excelExport');
    const { buildReportDocument } = await import('./wordExport');

    const headers = role === 'District Supervisor'
        ? ['Teacher', 'School', 'District', 'Doc Type', 'Week', 'Status', 'Submitted']
        : ['Teacher', 'School', 'Doc Type', 'Week', 'Status', 'Submitted'];

    const tableRows = rows.map(r => {
        const base: (string | number)[] = [r.teacher_name, r.school_name || '—'];
        if (role === 'District Supervisor') base.push(r.district_name || '—');
        base.push(r.doc_type, r.week_number ?? '—', r.compliance_status, new Date(r.submitted_at).toLocaleString('en-PH'));
        return base;
    });

    const baseName = `compliance-report-${String(scopeName).replace(/\s+/g, '_')}-${reportSchoolYear}`;
    const reportOptions = {
        title: role === 'District Supervisor' ? 'District Compliance Report' : 'School Compliance Report',
        subtitle: `${scopeName} · School Year ${reportSchoolYear}`,
        meta: [
            { label: 'Scope', value: String(scopeName) },
            { label: 'Total Submissions', value: String(total) },
            { label: 'Overall Rate', value: `${rate}%` }
        ],
        tables: [{ title: 'Submissions', headers, rows: tableRows }]
    };

    const [excelBuffer, wordBlob] = await Promise.all([
        buildReportWorkbook({ ...reportOptions, fileName: `${baseName}.xlsx` }),
        buildReportDocument({ ...reportOptions, fileName: `${baseName}.docx` })
    ]);

    return {
        answer: summary,
        attachments: [
            {
                fileName: `${baseName}.xlsx`,
                blob: new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            },
            { fileName: `${baseName}.docx`, blob: wordBlob }
        ]
    };
}

interface DbResponse {
    answer: string;
    attachments?: ChatAttachment[];
}

async function generateDatabaseResponse(
    intent: Intent,
    slots: Record<string, string>,
    ctx: ChatContext,
    rawText?: string,
    lang: Lang = 'en'
): Promise<DbResponse> {
    const { supabase: db, userId, profile } = ctx;

    try {
        switch (intent) {
            case 'ask_compliance':
                return { answer: await queryCompliance(db, userId, profile, slots, lang) };
            case 'check_deadline':
                return { answer: await queryDeadline(db, profile?.district_id ?? undefined, slots, lang) };
            case 'find_dll':
                return { answer: await queryDlls(db, slots, rawText, lang) };
            case 'school_compare':
                return { answer: await querySchoolCompare(db, profile?.district_id ?? undefined, profile, slots, lang) };
            case 'teacher_stats':
                return { answer: await queryTeacherStats(db, userId, profile, slots, lang) };
            case 'calendar_info':
                return { answer: await queryCalendarInfo(db, profile?.district_id ?? undefined, lang) };
            case 'create_report':
                return await queryCreateReport(db, profile, slots, lang);
            default:
                return { answer: generateTemplateResponse(intent, slots, lang) };
        }
    } catch (err) {
        console.error('[chatbot] DB response error:', err);
        const offline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (lang === 'tl') {
            return {
                answer: offline
                    ? "Hindi ko po ma-access ang kasalukuyang datos. Pakisuri ang inyong koneksyon at subukan muli. Maaari pa rin akong magbigay ng pangkalahatang gabay sa paggamit ng CEDIMS."
                    : "Hmm, hindi ko na-fetch iyan ngayon. Subukan ninyo ulit mamaya. Nandito lang ako."
            };
        }
        return {
            answer: offline
                ? "Looks like you're offline right now, so I can't check the live data for that. But I'm still here! Ask me again once you're back online, or try a general question in the meantime."
                : "Hmm, I couldn't fetch that just now. Give it another try in a moment. I'll be right here."
        };
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

const OUT_OF_SCOPE_PATTERNS = [
    /\b(weather|forecast|temperature|rain|typhoon)\b/i,
    /\b(recipe|cook|cooking|food|restaurant|movie|song|music lyrics|joke)\b/i,
    /\b(president|politics|election|celebrity|news|stock|crypto|bitcoin)\b/i,
    /\b(homework|essay|school assignment|solve this equation|math problem)\b/i,
    /\b(write|debug|fix|generate)\s+(?:my\s+)?(?:code|program|script|html|css|javascript)\b/i,
    /\b(translate|translation)\b/i,
];
const CEDIMS_SCOPE_TERMS = /\b(cedims|gabay|compliance|compliant|submission|submissions|submit|deadline|dll|lesson plan|academic calendar|school year|teacher|school head|district supervisor|upload|report|school|district|missing|late)\b/i;

function isClearlyOutOfScope(text: string, intent: Intent, confidence: number): boolean {
    if (/^(?:(?:hello|hi|hey|good morning|good afternoon|good evening|kumusta|kamusta|magandang araw)|(?:thanks|thank you|salamat|maraming salamat))(?:\s+po)?[!.?\s]*$/i.test(text.trim())) return false;
    if (OUT_OF_SCOPE_PATTERNS.some((pattern) => pattern.test(text))) return true;
    return intent !== 'general_help' && confidence < 45 && !CEDIMS_SCOPE_TERMS.test(text);
}

export async function processQuery(text: string, ctx?: ChatContext): Promise<ChatResponse> {
    const prediction = intentClassifier.predict(text);
    const outOfScope = isClearlyOutOfScope(text, prediction.intent, prediction.confidence);
    const intent = prediction.intent;
    const confidence = outOfScope ? 0 : prediction.confidence;
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
    let attachments: ChatAttachment[] | undefined;

    // 1. Greetings / small talk / quick facts hit the knowledge base first.
    // how_to_upload is deliberately excluded from this override: its own
    // template already covers the upload flow (including offline/sync), and
    // routing it through the KB let an unrelated single-keyword hit (e.g.
    // "dll" inside "how do I upload a dll?" matching the generic DLL
    // definition entry) hijack a clear how-to-upload question with a
    // definition answer instead of the actual steps.
    const kbHit = matchKnowledgeBase(text, lang);
    const courtesy = /^(?:hello|hi|hey|good morning|good afternoon|good evening|kumusta|kamusta|magandang araw|thanks|thank you|salamat|maraming salamat)(?:\s+po)?[!.?\s]*$/i.test(text.trim());
    if (courtesy && kbHit) {
        return { intent: 'general_help', confidence, answer: kbHit, slots: {}, lang };
    }
    if (outOfScope) {
        answer = lang === 'tl'
            ? 'Paumanhin po, ang tanong na ito ay wala sa saklaw ng aking tulong sa CEDIMS. Ako si Gabay, ang CEDIMS assistant, at makakatulong ako sa compliance status, deadlines, paghahanap ng Daily Lesson Plan, school comparisons, teacher statistics, academic calendar, uploads, at compliance reports.'
            : 'I am sorry, but that question is outside my CEDIMS support scope. I’m Gabay, the CEDIMS assistant, and I can help with compliance status, submission deadlines, Daily Lesson Plan searches, school comparisons, teacher statistics, the academic calendar, uploads, and compliance reports.';
    } else if (kbHit && (intent === 'general_help' || confidence < 40)) {
        answer = kbHit;
    } else if (ctx?.supabase) {
        const dbResponse = await generateDatabaseResponse(intent, slots, ctx, text, lang);
        answer = dbResponse.answer;
        attachments = dbResponse.attachments;
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
        ? ['Kumusta', 'Magandang araw', 'Walang anuman', 'Gabay', 'Ikinagagalak kong makatulong']
        : ['Hello', 'You are welcome', 'I am Gabay', 'I’m Gabay', 'I am pleased to assist'];
    const looksLikeGreeting = greetingStarts.some(s => answer.startsWith(s));
    if (confidence >= 60 && !looksLikeGreeting) {
        answer = `${pick(OPENERS[lang])} ${answer}`;
    } else if (confidence < 60 && !kbHit && !outOfScope) {
        if (intent === 'general_help') {
            const topics = lang === 'tl'
                ? ['compliance status ninyo', 'paghahanap ng Daily Lesson Plan', 'mga paparating na deadline', 'paghahambing ng paaralan', 'istatistika ng guro', 'kung paano mag-upload ng dokumento']
                : ['your compliance status', 'finding a Daily Lesson Plan', 'upcoming deadlines', 'school comparisons', 'teacher statistics', 'how to upload a document'];
            answer = `${pick(LOW_CONFIDENCE_PREFIXES[lang])} ${pick(topics)}. ${pick(LOW_CONFIDENCE_SUFFIXES[lang])}`;
        } else {
            const closer = lang === 'tl' ? 'narito ang nahanap na impormasyon' : 'here’s what I found';
            answer = `${pick(LOW_CONFIDENCE_PREFIXES[lang])} ${INTENT_TOPIC_LABELS[lang][intent]}, ${closer}:\n\n${answer}\n\n${pick(LOW_CONFIDENCE_SUFFIXES[lang])}`;
        }
    }

    return { intent, confidence, answer, slots, lang, attachments, outOfScope };
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
    'ang', 'ng', 'sa', 'mo', 'ninyo', 'ko', 'ba', 'na', 'pa', 'din', 'rin', 'may', 'oo', 'ka', 'kayo'
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

// Keep one request/index build per academic year for the lifetime of the SPA.
// ChatBot is mounted in the root layout, but this guard also protects against
// duplicate opens and hot route remounts racing the same expensive query.
const dllDocumentsPromises = new Map<string, Promise<number>>();

export async function loadDllDocumentsFromSupabase(db: SupabaseClient, schoolYear?: string): Promise<number> {
    const year = schoolYear || getDynamicSchoolYear();
    const existing = dllDocumentsPromises.get(year);
    if (existing) return existing;

    const request = (async () => {
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
    })();

    dllDocumentsPromises.set(year, request);
    return request;
}
