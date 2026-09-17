import {
    LayoutDashboard,
    CloudUpload,
    Archive,
    Briefcase,
    ShieldCheck,
    Shield,
    Map,
    TrendingUp,
    Settings,
    QrCode,
    type Icon,
} from "lucide-svelte";
import { showQRScanner } from "$lib/stores/ui";

export interface NavItem {
    href: string;
    label: string;
    icon: typeof Icon;
    roles: string[];
    mobileNav?: boolean;
    onClick?: (e: Event) => void;
    priority?: number; // 1-5: higher = show first
    navKey?: string; // For quick guide targeting
}

// Single source of truth for role-based navigation.
// Consumed by both the mobile bottom nav (MobileTabBar.svelte) and the
// desktop top nav (AppHeader.svelte) so the two never drift apart.
export const navItems: NavItem[] = [
    // ========== SHARED ACROSS ALL ROLES ==========
    {
        href: "/dashboard",
        label: "Home",
        icon: LayoutDashboard,
        mobileNav: true,
        priority: 1,
        navKey: "dashboard",
        roles: ["Teacher", "School Head", "Master Teacher", "District Supervisor"],
    },

    // ========== TEACHER (4 tabs) ==========
    {
        href: "/dashboard/upload",
        label: "Upload",
        icon: CloudUpload,
        mobileNav: true,
        priority: 2,
        navKey: "upload",
        roles: ["Teacher"],
    },
    {
        href: "/dashboard/archive",
        label: "Archives",
        icon: Archive,
        mobileNav: true,
        priority: 3,
        navKey: "archive",
        roles: ["Teacher"],
    },
    {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        mobileNav: true,
        priority: 4,
        roles: ["Teacher"],
    },

    // ========== MASTER TEACHER (5 tabs) ==========
    {
        href: "/dashboard/upload",
        label: "Upload",
        icon: CloudUpload,
        mobileNav: true,
        priority: 2,
        navKey: "upload",
        roles: ["Master Teacher"],
    },
    {
        href: "/dashboard/monitoring/school",
        label: "School",
        icon: ShieldCheck,
        mobileNav: true,
        priority: 3,
        navKey: "school",
        roles: ["Master Teacher"],
    },
    {
        href: "/dashboard/archive",
        label: "Archives",
        icon: Archive,
        mobileNav: true,
        priority: 4,
        navKey: "documents",
        roles: ["Master Teacher"],
    },
    {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        mobileNav: true,
        priority: 5,
        roles: ["Master Teacher"],
    },

    // ========== SCHOOL HEAD (5 tabs) ==========
    {
        href: "/dashboard/upload",
        label: "Upload",
        icon: CloudUpload,
        mobileNav: true,
        priority: 2,
        navKey: "upload",
        roles: ["School Head"],
    },
    {
        href: "/dashboard/monitoring/school",
        label: "Staff",
        icon: Briefcase,
        mobileNav: true,
        priority: 3,
        navKey: "staff",
        roles: ["School Head"],
    },
    {
        href: "/dashboard/archive",
        label: "Archives",
        icon: Archive,
        mobileNav: true,
        priority: 4,
        navKey: "submissions",
        roles: ["School Head"],
    },
    {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        mobileNav: true,
        priority: 5,
        roles: ["School Head"],
    },

    // ========== DISTRICT SUPERVISOR (6 tabs) ==========
    {
        href: "/dashboard/monitoring/district",
        label: "Schools",
        icon: Map,
        mobileNav: true,
        priority: 2,
        navKey: "schools",
        roles: ["District Supervisor"],
    },
    {
        href: "/dashboard/archive",
        label: "Archives",
        icon: Archive,
        mobileNav: true,
        priority: 3,
        navKey: "submissions",
        roles: ["District Supervisor"],
    },
    {
        href: "/dashboard/analytics",
        label: "Analytics",
        icon: TrendingUp,
        mobileNav: true,
        priority: 4,
        navKey: "alerts",
        roles: ["District Supervisor"],
    },
    {
        href: "/dashboard/admin",
        label: "Admin",
        icon: Shield,
        mobileNav: true,
        priority: 5,
        navKey: "admin",
        roles: ["District Supervisor"],
    },
    {
        href: "/dashboard/settings",
        label: "Settings",
        icon: Settings,
        mobileNav: true,
        priority: 6,
        roles: ["District Supervisor"],
    },

    // ========== OPTIONAL TOOLS ==========
    {
        href: "#scan",
        label: "Scan",
        icon: QrCode,
        mobileNav: false, // Don't show in tab bar
        priority: 99,
        roles: ["Teacher", "School Head", "Master Teacher", "District Supervisor"],
        onClick: (e: Event) => {
            e.preventDefault();
            showQRScanner.set(true);
        },
    },
];

export function getNavItemsForRole(role: string | undefined | null): NavItem[] {
    // Exact match only — a substring check here (e.g. currentRole.includes(r))
    // would wrongly match "Master Teacher" against "Teacher"-only items, since
    // "master teacher" contains "teacher" as a substring, producing duplicate tabs.
    const currentRole = (role || "").trim().toLowerCase();
    return navItems
        .filter((item) => item.roles.some((r) => r.trim().toLowerCase() === currentRole))
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));
}
