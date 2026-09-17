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
                title: "Home",
                content: "Your home base. Shows your compliance rate, upcoming deadlines, and recent feedback.",
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
                title: "Home",
                content: "Your compliance, school compliance, top teachers, and at-risk teachers — your command center.",
                tip: "Identify who needs support at a glance.",
                target: "dashboard",
            },
            {
                title: "Upload",
                content: "Upload your DLL (with teaching load), or an ISP/ISR for your school.",
                tip: "ISP and ISR don't need a teaching load.",
                target: "upload",
            },
            {
                title: "School",
                content: "See all teachers ranked by compliance. Open a teacher to view their DLLs and add remarks.",
                tip: "Support and recognize excellence here.",
                target: "school",
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
                title: "Home",
                content: "School compliance rate, compliant/late DLLs, top teachers, and trends — your performance center.",
                tip: "Great to reference in staff meetings.",
                target: "dashboard",
            },
            {
                title: "Upload",
                content: "Submit your ISP (School Plan) or ISR (School Report). No teaching load needed.",
                tip: "Your District Supervisor reviews these.",
                target: "upload",
            },
            {
                title: "Staff",
                content: "All teachers ranked by compliance. Open any teacher to view submissions and add remarks.",
                tip: "Your main tool for staff development.",
                target: "staff",
            },
            {
                title: "Archives",
                content: "All school DLLs plus Master Teacher ISP/ISR. Filter, sort, add remarks, and approve.",
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
                title: "Home",
                content: "District compliance rate, totals, and school rankings — your executive summary.",
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
                content: "All ISP/ISR from School Heads and Master Teachers. Filter, sort, add remarks, and approve.",
                tip: "Your remarks drive real improvement.",
                target: "submissions",
            },
            {
                title: "Analytics",
                content: "Compliance trends, forecasts, performance clusters, and at-risk schools — investigate and act fast.",
                tip: "Stay ahead of compliance problems.",
                target: "alerts",
            },
            {
                title: "Admin",
                content: "Manage system settings and user accounts — create teachers and staff, adjust roles, and configure submission rules.",
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
        content: "Switch between light and dark mode any time — your preference is remembered.",
        target: "theme-toggle",
    },
    {
        title: "Profile & Sign Out",
        content: "Manage your profile, change your password, and sign out from here.",
        target: "profile-menu",
    },
    {
        title: "Meet Gabay",
        content: "Your CEDIMS assistant. Ask Gabay about your compliance rate, deadlines, or how to do something — it answers using your live data.",
        tip: "Try: “When is the next deadline?”",
        target: "chatbot",
    },
];
