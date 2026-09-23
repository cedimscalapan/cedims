// Role-specific copy for the SystemWalkthrough tour. Each step's `target`
// matches a `data-nav` (nav items) or `data-tour` (header controls) attribute
// in the live DOM, so the walkthrough highlights the real element instead of
// just describing it in a modal.
export interface WalkthroughStep {
    title: string;
    content: string;
    tip?: string;
    target?: string | null;
}

export interface WalkthroughGuide {
    emoji: string;
    intro: string;
    navSteps: WalkthroughStep[];
}

export const walkthroughGuides: Record<string, WalkthroughGuide> = {
    Teacher: {
        emoji: "🍎",
        intro: "Let's explore the main tabs and features you'll use every day.",
        navSteps: [
            {
                title: "Tracker",
                content: "Your submission tracker. Shows what is submitted, missing, late, or waiting for review.",
                tip: "Check here every morning.",
                target: "dashboard",
            },
            {
                title: "Upload",
                content: "Upload → confirm the detected teaching load → choose your file → done. Submit before the deadline.",
                tip: "Deadline-aware uploads keep you on track.",
                target: "upload",
            },
            {
                title: "Archives",
                content: "View every submission you've made. Status badges show On-time, Due soon, or Late.",
                tip: "Track your compliance history here.",
                target: "archive",
            },
        ],
    },
    "Master Teacher": {
        emoji: "👨‍🏫",
        intro: "You manage your own teaching load AND oversee school compliance. Let's explore your key tabs.",
        navSteps: [
            {
                title: "Tracker",
                content: "Your own submission tracker plus documents waiting for your review.",
                tip: "Identify who needs support at a glance.",
                target: "dashboard",
            },
            {
                title: "Upload",
                content: "Upload your Daily Lesson Plan (with teaching load), or an ISP — Instructional Supervisory Plan / ISR — Instructional Supervisory Report for your school.",
                tip: "ISP — Instructional Supervisory Plan and ISR — Instructional Supervisory Report do not need a teaching load.",
                target: "upload",
            },
            {
                title: "Compliance",
                content: "See who is compliant, missing, late, or waiting for review in one focused list.",
                tip: "Use this for fast follow-up.",
                target: "compliance",
            },
            {
                title: "Archives",
                content: "All school submissions in one place. Filter, sort, add remarks, and export reports.",
                tip: "Reports impress your principal.",
                target: "documents",
            },
        ],
    },
    "School Head": {
        emoji: "🏫",
        intro: "You oversee school compliance and document management. Let's master the key tabs.",
        navSteps: [
            {
                title: "Tracker",
                content: "Your review tracker for documents that still need checking.",
                tip: "Great to reference in staff meetings.",
                target: "dashboard",
            },
            {
                title: "Upload",
                content: "Submit your ISP — Instructional Supervisory Plan or ISR — Instructional Supervisory Report. No teaching load needed.",
                tip: "Your District Supervisor reviews these.",
                target: "upload",
            },
            {
                title: "Compliance",
                content: "See who is compliant, missing, late, or waiting for review in one focused list.",
                tip: "Your main tool for staff follow-up.",
                target: "compliance",
            },
            {
                title: "Archives",
                content: "All school Daily Lesson Plans plus Master Teacher ISP — Instructional Supervisory Plan / ISR — Instructional Supervisory Report. Filter, sort, add remarks, and approve.",
                tip: "Guide improvement with clear remarks.",
                target: "submissions",
            },
        ],
    },
    "District Supervisor": {
        emoji: "🏛️",
        intro: "You oversee every school in the district. Let's explore your district-wide tools.",
        navSteps: [
            {
                title: "Tracker",
                content: "District compliance rate, totals, and school rankings: your executive summary.",
                tip: "Handy when preparing reports.",
                target: "dashboard",
            },
            {
                title: "Schools",
                content: "All schools ranked by compliance. Schools below 70% need your attention first.",
                tip: "Prioritize support where it's needed most.",
                target: "schools",
            },
            {
                title: "Archives",
                content: "All ISP — Instructional Supervisory Plan / ISR — Instructional Supervisory Report from School Heads and Master Teachers. Filter, sort, add remarks, and approve.",
                tip: "Your remarks drive real improvement.",
                target: "submissions",
            },
            {
                title: "Admin",
                content: "Manage system settings and user accounts: create teachers and staff, adjust roles, and configure submission rules.",
                tip: "This is also where you create new accounts.",
                target: "admin",
            },
        ],
    },
};

export const walkthroughHeaderSteps: WalkthroughStep[] = [
    {
        title: "Notifications",
        content: "Real-time alerts for new submissions, remarks, and upcoming deadlines land here.",
        target: "notifications",
    },
    {
        title: "Theme",
        content: "Switch between light and dark mode any time, your preference is remembered.",
        target: "theme-toggle",
    },
    {
        title: "Profile & Sign Out",
        content: "Manage your profile, change your password, and sign out from here.",
        target: "profile-menu",
    },
    {
        title: "Meet Gabay",
        content: "Your CEDIMS assistant. Ask Gabay about your compliance rate, deadlines, or how to do something: it answers using your live data.",
        tip: "Try: “When is the next deadline?”",
        target: "chatbot",
    },
];
