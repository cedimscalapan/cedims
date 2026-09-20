<script lang="ts">
    import { profile, authLoading } from "$lib/utils/auth";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { theme } from "$lib/stores/theme";
    import GabayMascot from "$lib/components/GabayMascot.svelte";
    import {
        ArrowRight,
        BarChart3,
        BellRing,
        CheckCircle2,
        ClipboardCheck,
        FileCheck2,
        FileUp,
        GraduationCap,
        History,
        Lock,
        LogIn,
        Mail,
        MapPin,
        Menu,
        MessageSquareText,
        Moon,
        PenLine,
        Phone,
        QrCode,
        ShieldCheck,
        Sparkles,
        Sun,
        Users,
        X,
    } from "lucide-svelte";
    import { fly, slide } from "svelte/transition";

    // Toggles the SDG 4 definition panel in the hero card — collapsed by
    // default so the card stays a credential, not a wall of text; tapping
    // it is an explicit choice to read the definition.
    let sdgDefinitionOpen = $state(false);

    // The desktop nav links are hidden below `md` with nothing to replace
    // them, so a phone visitor had no way to reach Features/Roles/How it
    // works/Contact except scrolling past them one section at a time.
    let mobileMenuOpen = $state(false);

    const navLinks = [
        { id: "features", href: "#features", label: "Features" },
        { id: "roles", href: "#roles", label: "Roles" },
        { id: "how-it-works", href: "#how-it-works", label: "How it works" },
        { id: "contact", href: "#contact", label: "Contact" },
    ];

    // Which section is currently in view, so the header nav reflects scroll
    // position instead of staying static for the whole page.
    let activeSection = $state<string | null>(null);

    // Fades and lifts an element into place the first time it enters the
    // viewport. The observer disconnects after firing once, so it never
    // re-triggers on scroll-back — a section that has already been seen
    // stays put instead of replaying its entrance every time.
    function reveal(node: HTMLElement, params: { delay?: number } = {}) {
        if (typeof IntersectionObserver === "undefined") return {};
        node.classList.add("reveal-pending");
        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (!entry.isIntersecting) continue;
                    setTimeout(() => node.classList.add("reveal-shown"), params.delay ?? 0);
                    observer.disconnect();
                }
            },
            { threshold: 0.15 },
        );
        observer.observe(node);
        return {
            destroy() {
                observer.disconnect();
            },
        };
    }

    // What the system actually does, one card per capability. Each line is a
    // feature a user can point at in the app — not a general claim. The
    // first entry is the flagship capability and is given a larger bento
    // tile below; order matters.
    const features = [
        {
            title: "DLL monitoring",
            description:
                "Track Daily Lesson Log submissions and see who is on time, late, or missing for the week, across every school in the district in one live view.",
            icon: FileCheck2,
        },
        {
            title: "Remarks & checking",
            description:
                "Supervisors record remarks and set a checking status; teachers revise without losing the earlier notes.",
            icon: MessageSquareText,
        },
        {
            title: "Compliance overview",
            description:
                "School and district compliance stays visible in one weekly view instead of scattered spreadsheets.",
            icon: ClipboardCheck,
        },
        {
            title: "Archive & history",
            description:
                "Past submissions and every remark are preserved, so a document's full history stays reviewable.",
            icon: History,
        },
        {
            title: "Notifications",
            description:
                "Alerts on submission, checking, and approaching deadlines keep follow-up from depending on memory.",
            icon: BellRing,
        },
    ];

    // The five schools CEDIMS is deployed against. This is the pilot scope
    // seeded in db/complete_schema.sql, not a sample of a longer list.
    const schools = [
        { name: "Bulusan Elementary School", logo: "/school-bulusan.jpg" },
        { name: "Guinobatan Elementary School", logo: "/school-guinobatan.jpg" },
        { name: "Ibaba Elementary School", logo: "/school-ibaba.jpg" },
        { name: "Salong Elementary School", logo: "/school-salong.jpg" },
        { name: "Suqui Elementary School", logo: "/school-suqui.jpg" },
    ];

    // The four roles accounts are issued for. These are the values the
    // `profiles.role` check constraint allows, minus Admin, which is
    // district-office account administration rather than a monitoring
    // participant. What each one can do is taken from
    // lib/utils/documentPermissions.ts, so the page does not promise a
    // capability the system withholds.
    const roles = [
        {
            name: "Teacher",
            summary: "Submits and revises",
            description:
                "Uploads the Daily Lesson Log against their teaching load, sees what is due, and re-uploads after remarks. Sees their own records only.",
            icon: FileUp,
        },
        {
            name: "Master Teacher",
            summary: "Submits and checks",
            description:
                "Uploads their own DLL and supervisory plans, and leaves remarks on lesson logs from their school.",
            icon: PenLine,
        },
        {
            name: "School Head",
            summary: "Checks the school",
            description:
                "Uploads supervisory plans and reports, and follows every submission from their school in one view.",
            icon: ClipboardCheck,
        },
        {
            name: "District Supervisor",
            summary: "Reviews the district",
            description:
                "Does not upload. Reads submissions across all five schools, records remarks, and reports district compliance.",
            icon: BarChart3,
        },
    ];

    // A scannable, factual beat between the hero's pitch and the fuller
    // sections below — every figure here matches an array already defined
    // on this page (schools, roles) rather than an unverifiable claim.
    const stats = [
        { label: "Schools onboarded", value: "5", icon: GraduationCap },
        { label: "Account roles", value: "4", icon: Users },
        { label: "Document types tracked", value: "3", icon: FileCheck2 },
        { label: "District office", value: "1", icon: MapPin },
    ];

    const steps = [
        {
            title: "Teacher uploads",
            description: "The DLL is submitted from a phone or laptop, online or offline.",
            icon: FileUp,
        },
        {
            title: "Supervisor checks",
            description: "Remarks are recorded and a checking status is set on the submission.",
            icon: ClipboardCheck,
        },
        {
            title: "Teacher revises",
            description: "Revisions are uploaded against the same record; earlier remarks remain.",
            icon: PenLine,
        },
        {
            title: "District reports",
            description: "Compliance is rolled up per school for the district office.",
            icon: BarChart3,
        },
    ];

    const assurances = [
        {
            title: "QR stamp on every export",
            description: "A scannable code ties each printed copy back to its record.",
            icon: QrCode,
        },
        {
            title: "Tamper detection",
            description: "A file hash is stored with the document, so changes are detectable.",
            icon: ShieldCheck,
        },
        {
            title: "Role-scoped access",
            description: "You only ever see what your role and school/district allows.",
            icon: Lock,
        },
    ];

    onMount(() => {
        theme.init();

        const unsubscribe = profile.subscribe((p) => {
            if (p) {
                goto("/dashboard");
            }
        });

        // Scrollspy: mirrors scroll position in the header nav. A band
        // through the vertical middle of the viewport, rather than the
        // top edge, is what a section is "currently being read" means.
        const sectionObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        activeSection = entry.target.id;
                    }
                }
            },
            { rootMargin: "-45% 0px -45% 0px" },
        );
        for (const link of navLinks) {
            const el = document.getElementById(link.id);
            if (el) sectionObserver.observe(el);
        }

        return () => {
            unsubscribe();
            sectionObserver.disconnect();
        };
    });
</script>

<svelte:head>
    <title>CEDIMS: Calapan East District Instructional Monitoring System · Powered by Smart E-VISION</title>
    <meta
        name="description"
        content="CEDIMS is the Calapan East District Instructional Monitoring System for submitting, checking, and tracking compliance of Daily Lesson Logs."
    />
</svelte:head>

<div class="min-h-dvh bg-surface-muted text-text-primary">
    <header class="sticky top-0 z-40 border-b border-border-subtle bg-surface-white/80 backdrop-blur-lg">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <a href="/" class="flex min-w-0 items-center gap-2.5">
                <img src="/app_icon.png" alt="" class="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10" />
                <span class="min-w-0">
                    <span class="block text-sm font-semibold leading-tight text-text-primary">CEDIMS</span>
                    <span class="block truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.18em] text-gov-blue">
                        Powered by Smart E-Vision
                    </span>
                </span>
            </a>

            <nav aria-label="Sections" class="hidden items-center gap-7 text-sm font-medium text-text-secondary md:flex">
                {#each navLinks as link}
                    <a
                        href={link.href}
                        class="relative pb-1 transition-colors hover:text-gov-blue {activeSection === link.id ? 'text-gov-blue' : ''}"
                    >
                        {link.label}
                        <span
                            class="absolute inset-x-0 -bottom-0.5 h-0.5 origin-left rounded-full bg-gov-blue transition-transform duration-300 {activeSection === link.id ? 'scale-x-100' : 'scale-x-0'}"
                            aria-hidden="true"
                        ></span>
                    </a>
                {/each}
            </nav>

            <div class="flex shrink-0 items-center gap-1.5 sm:gap-2">
                <button
                    type="button"
                    onclick={() => theme.toggle()}
                    class="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-gov-blue/10 hover:text-gov-blue sm:inline-flex"
                    aria-label={$theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                >
                    {#if $theme === "dark"}
                        <Sun size={18} strokeWidth={1.75} />
                    {:else}
                        <Moon size={18} strokeWidth={1.75} />
                    {/if}
                </button>

                {#if !$authLoading}
                    {#if $profile}
                        <button onclick={() => goto("/dashboard")} class="gov-btn-secondary shrink-0 whitespace-nowrap px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm">
                            Go to dashboard
                        </button>
                    {:else}
                        <button
                            onclick={() => goto("/auth/login")}
                            class="gov-btn-primary inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm"
                        >
                            <LogIn size={15} />
                            <span>Sign in</span>
                        </button>
                    {/if}
                {/if}

                <button
                    type="button"
                    onclick={() => (mobileMenuOpen = !mobileMenuOpen)}
                    class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle text-text-secondary transition-colors hover:border-gov-blue hover:text-gov-blue md:hidden"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="mobile-nav"
                    aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                >
                    {#if mobileMenuOpen}
                        <X size={18} />
                    {:else}
                        <Menu size={18} />
                    {/if}
                </button>
            </div>
        </div>

        {#if mobileMenuOpen}
            <nav
                id="mobile-nav"
                aria-label="Sections"
                transition:slide={{ duration: 200 }}
                class="border-t border-border-subtle bg-surface-white px-4 py-3 md:hidden"
            >
                <ul class="flex flex-col gap-1 text-sm font-medium text-text-secondary">
                    {#each navLinks as link}
                        <li>
                            <a
                                href={link.href}
                                onclick={() => (mobileMenuOpen = false)}
                                class="block rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-muted hover:text-gov-blue {activeSection === link.id ? 'text-gov-blue' : ''}"
                            >
                                {link.label}
                            </a>
                        </li>
                    {/each}
                    <li>
                        <button
                            type="button"
                            onclick={() => theme.toggle()}
                            class="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-muted hover:text-gov-blue"
                        >
                            {#if $theme === "dark"}
                                <Sun size={16} strokeWidth={1.75} />
                                <span>Switch to light mode</span>
                            {:else}
                                <Moon size={16} strokeWidth={1.75} />
                                <span>Switch to dark mode</span>
                            {/if}
                        </button>
                    </li>
                </ul>
            </nav>
        {/if}
    </header>

    <main>
        <!-- Hero — what it is, who it is for, and the way in -->
        <section class="relative overflow-hidden border-b border-border-subtle bg-surface-white">
            <!-- Decorative mesh: two soft, blurred color fields plus a faint dot
                 grid. Purely atmospheric — kept out of the text column and given
                 a slow drift so the hero doesn't feel static, with the drift
                 switched off for reduced-motion users. -->
            <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
                <div class="hero-grid"></div>
                <div class="hero-blob hero-blob--one"></div>
                <div class="hero-blob hero-blob--two"></div>
            </div>

            <div class="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8">
                <div in:fly={{ y: 16, duration: 450 }}>
                    <div class="inline-flex items-center gap-2.5 rounded-full border border-gov-blue/20 bg-gov-blue/10 py-1.5 pl-1.5 pr-3.5">
                        <span class="flex -space-x-2">
                            <img
                                src="/deped-official.png"
                                alt="Department of Education"
                                class="h-6 w-6 rounded-full border-2 border-surface-white bg-white object-contain sm:h-7 sm:w-7"
                            />
                            <img
                                src="/deped-calapan.jpg"
                                alt="Schools Division of Calapan City"
                                class="h-6 w-6 rounded-full border-2 border-surface-white object-cover sm:h-7 sm:w-7"
                            />
                            <img
                                src="/deped-calapan-east-district.jpg"
                                alt="Calapan East District"
                                class="h-6 w-6 rounded-full border-2 border-surface-white object-cover sm:h-7 sm:w-7"
                            />
                        </span>
                        <span class="text-[11px] font-bold uppercase leading-tight tracking-[0.1em] text-gov-blue sm:text-xs">
                            DepEd · Schools Division of Calapan City · Calapan East District
                        </span>
                    </div>

                    <p class="mt-5 flex items-baseline gap-0.5 text-2xl font-extrabold tracking-tight sm:text-3xl">
                        <span class="text-gov-blue-dark">CE</span><span class="text-gov-blue-vibrant">DIMS</span>
                    </p>
                    <p class="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-text-muted sm:text-sm">
                        Calapan East District Instructional Monitoring System
                    </p>

                    <h1 class="mt-3 text-3xl font-bold leading-[1.12] tracking-tight text-text-primary sm:text-4xl lg:text-[3.25rem]">
                        Instructional monitoring the
                        <span class="hero-gradient-text">whole district can keep up with</span>.
                    </h1>

                    <p class="mt-5 max-w-xl text-base leading-8 text-text-secondary sm:text-lg">
                        CEDIMS is where Daily Lesson Logs are submitted, checked, and tracked,
                        so teachers know what is due, supervisors can leave remarks in one place,
                        and the district can see compliance without chasing paper.
                    </p>

                    <div class="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
                        <button
                            onclick={() => goto($profile ? "/dashboard" : "/auth/login")}
                            class="gov-btn-primary inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm shadow-lg shadow-gov-blue/20 sm:w-auto"
                        >
                            <span>{$profile ? "Go to dashboard" : "Sign in to CEDIMS"}</span>
                            <ArrowRight size={16} />
                        </button>
                        <a href="#how-it-works" class="gov-btn-secondary inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm sm:w-auto">
                            See how it works
                        </a>
                    </div>

                    <div class="mt-5 inline-flex max-w-xl items-center gap-2.5 rounded-full border border-border-subtle bg-surface-white/70 py-1.5 pl-1.5 pr-4">
                        <GabayMascot size={28} wave={false} />
                        <p class="text-xs leading-5 text-text-secondary">
                            Stuck? <span class="font-semibold text-gov-blue">Ask Gabay</span> — the chat assistant in the
                            corner answers in English or Tagalog.
                        </p>
                    </div>

                    <dl class="mt-9 grid max-w-xl gap-x-6 gap-y-5 border-t border-border-subtle pt-6 sm:grid-cols-3">
                        <div>
                            <dt class="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">For</dt>
                            <dd class="mt-1.5 text-sm font-semibold leading-6 text-text-primary">
                                Teachers, Master Teachers, School Heads &amp; District Supervisors
                            </dd>
                            <p class="mt-1 text-xs leading-5 text-text-secondary">
                                <a href="#roles" class="font-semibold text-gov-blue hover:underline">What each role does</a>
                            </p>
                        </div>
                        <div>
                            <dt class="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Covers</dt>
                            <dd class="mt-1.5 text-sm font-semibold leading-6 text-text-primary">DLL, ISP &amp; ISR</dd>
                            <p class="mt-1 text-xs leading-5 text-text-secondary">
                                Daily Lesson Logs, and Instructional Supervisory Plans &amp; Reports
                            </p>
                        </div>
                        <div>
                            <dt class="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Works on</dt>
                            <dd class="mt-1.5 text-sm font-semibold leading-6 text-text-primary">
                                Phone, tablet or computer
                            </dd>
                            <p class="mt-1 text-xs leading-5 text-text-secondary">
                                Any modern browser. Install it, and keep submitting offline.
                            </p>
                        </div>
                    </dl>
                </div>

                <!-- What the system actually covers, staged as a floating card
                     stack: the credential card in the middle, a "live" status
                     chip overlapping its top corner, and a roles chip
                     overlapping the bottom — depth without inventing content. -->
                <div in:fly={{ y: 20, duration: 450, delay: 120 }} class="relative mx-auto w-full max-w-sm lg:mx-0 lg:max-w-md">
                    <div
                        class="absolute -top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-white px-3.5 py-1.5 text-xs font-semibold text-text-primary shadow-md sm:right-8"
                    >
                        <span class="live-dot" aria-hidden="true"></span>
                        Live compliance tracking
                    </div>

                    <aside class="w-full rounded-3xl border border-border-subtle bg-surface-white p-5 shadow-sm sm:p-6">
                        <div class="flex items-start justify-between gap-3">
                            <div>
                                <p class="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Now in scope</p>
                                <p class="mt-1 text-base font-semibold text-text-primary">Calapan East District</p>
                            </div>
                            <p class="shrink-0 rounded-full bg-gov-blue/10 px-3 py-1.5 text-xs font-bold text-gov-blue">
                                5 schools
                            </p>
                        </div>

                        <ul class="mt-4 divide-y divide-border-subtle border-y border-border-subtle">
                            {#each schools as school}
                                <li class="flex items-center gap-3 py-2.5">
                                    <img
                                        src={school.logo}
                                        alt=""
                                        class="h-7 w-7 shrink-0 rounded-full border border-border-subtle object-cover"
                                    />
                                    <span class="text-sm leading-6 text-text-secondary">{school.name}</span>
                                </li>
                            {/each}
                        </ul>

                        <div class="mt-4 rounded-2xl bg-surface-muted p-3.5">
                            <button
                                type="button"
                                onclick={() => (sdgDefinitionOpen = !sdgDefinitionOpen)}
                                aria-expanded={sdgDefinitionOpen}
                                aria-controls="sdg-4-definition"
                                class="flex w-full items-start gap-3 text-left"
                            >
                                <img
                                    src="/sdg-4-quality-education.svg"
                                    alt="United Nations Sustainable Development Goal 4: Quality Education"
                                    width="64"
                                    height="64"
                                    class="h-14 w-14 shrink-0 rounded-lg"
                                />
                                <span class="min-w-0 flex-1">
                                    <span class="block text-sm font-semibold text-text-primary">Built to serve SDG 4</span>
                                    <span class="mt-1 block text-xs leading-5 text-text-secondary">
                                        Quality Education, UN Sustainable Development Goals
                                    </span>
                                    <span class="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-gov-blue">
                                        {sdgDefinitionOpen ? "Hide definition" : "What is SDG 4?"}
                                        <ArrowRight size={12} class="transition-transform {sdgDefinitionOpen ? '-rotate-90' : 'rotate-90'}" />
                                    </span>
                                </span>
                            </button>

                            {#if sdgDefinitionOpen}
                                <div
                                    id="sdg-4-definition"
                                    transition:slide={{ duration: 200 }}
                                    class="mt-3 border-t border-border-subtle pt-3 text-xs leading-6 text-text-secondary"
                                >
                                    <p>
                                        <strong class="text-text-primary">SDG 4: Quality Education</strong> is one of the
                                        17 United Nations Sustainable Development Goals, adopted in 2015 as part of the
                                        2030 Agenda for Sustainable Development. Its stated aim is to
                                        "ensure inclusive and equitable quality education and promote lifelong learning
                                        opportunities for all."
                                    </p>
                                    <p class="mt-2">
                                        CEDIMS supports it by keeping lesson planning and instructional supervision
                                        consistent and trackable across every school in the district: the monitoring
                                        side of delivering on that goal.
                                    </p>
                                </div>
                            {/if}
                        </div>
                    </aside>

                    <div
                        class="absolute -bottom-4 left-4 z-10 inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-white px-3.5 py-1.5 text-xs font-semibold text-text-primary shadow-md sm:left-8"
                    >
                        <Users size={13} class="text-gov-blue" />
                        4 account roles
                    </div>
                </div>
            </div>
        </section>

        <!-- Logo strip — the five schools, presented as a plain trust bar
             rather than repeated inside the hero, so each place the schools
             appear does one job. -->
        <section class="border-b border-border-subtle bg-surface-white">
            <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <p use:reveal class="text-center text-xs font-semibold uppercase tracking-[0.22em] text-text-muted">
                    Serving five schools across Calapan East District
                </p>
                <ul class="mt-6 flex flex-wrap items-center justify-center gap-x-9 gap-y-5">
                    {#each schools as school, index}
                        <li use:reveal={{ delay: index * 60 }} class="flex items-center gap-2.5">
                            <img
                                src={school.logo}
                                alt={school.name}
                                class="h-8 w-8 shrink-0 rounded-full border border-border-subtle object-cover grayscale transition-all duration-300 hover:grayscale-0"
                            />
                            <span class="text-sm font-medium text-text-secondary">{school.name}</span>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- Quick facts — a scannable, animated beat between the hero's
             pitch and the fuller features/roles sections below. -->
        <section class="border-b border-border-subtle bg-surface-muted">
            <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                <ul class="grid grid-cols-2 gap-4 sm:grid-cols-4">
                    {#each stats as stat, index}
                        <li
                            use:reveal={{ delay: index * 90 }}
                            class="stat-card flex items-center gap-3 rounded-2xl border border-border-subtle bg-surface-white p-4 shadow-sm"
                        >
                            <span class="inline-flex shrink-0 rounded-xl bg-gradient-to-br from-gov-blue to-gov-blue-vibrant p-2.5 text-white">
                                <stat.icon size={18} strokeWidth={1.75} />
                            </span>
                            <div>
                                <p class="text-lg font-bold leading-none text-text-primary">{stat.value}</p>
                                <p class="mt-1 text-xs leading-4 text-text-secondary">{stat.label}</p>
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- What the system does, as an asymmetric bento grid: the flagship
             capability (DLL monitoring) gets the wide tile, the rest sit
             underneath at equal weight. -->
        <section id="features" class="scroll-mt-20 border-b border-border-subtle bg-surface-white">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div use:reveal class="max-w-2xl">
                    <p class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">
                        <Sparkles size={14} />
                        What it does
                    </p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Everything monitoring needs, and nothing that gets in the way.
                    </h2>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                    {#each features as feature, index}
                        <li
                            use:reveal={{ delay: (index % 3) * 90 }}
                            class="feature-card group rounded-2xl border border-border-subtle bg-surface-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg sm:p-6 {index === 0 ? 'sm:col-span-2 xl:col-span-2' : ''}"
                        >
                            <span class="inline-flex rounded-xl bg-gov-blue/10 p-3 text-gov-blue transition-colors group-hover:bg-gov-blue group-hover:text-white">
                                <feature.icon size={20} strokeWidth={1.75} />
                            </span>
                            <h3 class="mt-4 text-base font-semibold text-text-primary sm:text-lg">{feature.title}</h3>
                            <p class="mt-2 max-w-lg text-sm leading-7 text-text-secondary">{feature.description}</p>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- Who holds an account, and what each role can actually do -->
        <section id="roles" class="scroll-mt-20 border-b border-border-subtle bg-surface-muted">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div use:reveal class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">Who uses it</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Four roles, each with its own view.
                    </h2>
                    <p class="mt-3 text-sm leading-7 text-text-secondary sm:text-base sm:leading-8">
                        Accounts are issued by the District Office. What you can upload, check and
                        see follows the role on your account: the limits are enforced by the
                        system, not just hidden from the screen.
                    </p>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
                    {#each roles as role, index}
                        <li
                            use:reveal={{ delay: (index % 4) * 90 }}
                            class="role-card group relative flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-white p-5 transition-all hover:-translate-y-1 hover:shadow-md sm:p-6"
                        >
                            <span class="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-gov-blue to-gov-blue-vibrant opacity-70"></span>
                            <span class="inline-flex w-fit rounded-xl bg-gov-blue/10 p-2.5 text-gov-blue">
                                <role.icon size={18} strokeWidth={1.75} />
                            </span>
                            <h3 class="mt-4 text-base font-semibold text-text-primary">{role.name}</h3>
                            <p class="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-gov-blue">
                                {role.summary}
                            </p>
                            <p class="mt-2.5 text-sm leading-7 text-text-secondary">{role.description}</p>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- The path a document takes, and why the record it leaves holds up -->
        <section id="how-it-works" class="scroll-mt-20 border-b border-border-subtle bg-surface-white">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div use:reveal class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">How it works</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        One path from upload to district report.
                    </h2>
                </div>

                <ol class="relative mt-8 grid gap-6 sm:mt-12 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
                    <div
                        class="pointer-events-none absolute left-6 right-6 top-6 hidden h-px bg-gradient-to-r from-gov-blue/40 via-gov-blue/15 to-gov-blue/40 lg:block"
                        aria-hidden="true"
                    ></div>
                    {#each steps as step, index}
                        <li use:reveal={{ delay: index * 110 }} class="relative">
                            <div class="step-ring relative z-10 flex h-12 w-12 items-center justify-center rounded-full text-gov-blue">
                                <span class="flex h-full w-full items-center justify-center rounded-full bg-surface-white">
                                    <step.icon size={20} strokeWidth={1.75} />
                                </span>
                            </div>
                            <p class="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-text-muted">Step {index + 1}</p>
                            <h3 class="mt-1 text-base font-semibold text-text-primary">{step.title}</h3>
                            <p class="mt-2 text-sm leading-7 text-text-secondary">{step.description}</p>
                        </li>
                    {/each}
                </ol>

                <!-- Compact trust strip — every record this path produces stays
                     verifiable, stated as three short facts rather than its own
                     full section. -->
                <ul class="mt-10 grid gap-3 border-t border-border-subtle pt-8 sm:mt-12 sm:grid-cols-3 sm:gap-4">
                    {#each assurances as item, index}
                        <li use:reveal={{ delay: index * 90 }} class="flex items-start gap-3 rounded-xl bg-surface-muted p-4">
                            <span class="inline-flex shrink-0 rounded-lg bg-gov-blue/10 p-2 text-gov-blue">
                                <item.icon size={16} strokeWidth={1.75} />
                            </span>
                            <div>
                                <h3 class="text-sm font-semibold text-text-primary">{item.title}</h3>
                                <p class="mt-1 text-xs leading-5 text-text-secondary">{item.description}</p>
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- Way in, and who to ask -->
        <section id="contact" class="scroll-mt-20 bg-surface-muted">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div
                    use:reveal
                    class="relative overflow-hidden rounded-3xl border border-border-subtle bg-gradient-to-br from-gov-blue-dark via-gov-blue to-gov-blue-vibrant text-white shadow-lg"
                >
                    <div class="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-3xl" aria-hidden="true"></div>
                    <div class="pointer-events-none absolute -bottom-20 left-10 h-56 w-56 rounded-full bg-white/10 blur-3xl" aria-hidden="true"></div>

                    <div class="relative grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
                        <div>
                            <p class="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
                                <CheckCircle2 size={14} />
                                Accounts issued by the district office
                            </p>
                            <h2 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">Ready to log in?</h2>
                            <p class="mt-3 max-w-md text-sm leading-7 text-slate-100 sm:text-base sm:leading-8">
                                Sign in with your DepEd email, or reach the office below if you need access.
                            </p>
                            <button
                                onclick={() => goto($profile ? "/dashboard" : "/auth/login")}
                                class="mt-6 inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-gov-blue shadow-sm transition-colors hover:bg-slate-100"
                            >
                                <span>{$profile ? "Go to dashboard" : "Sign in to CEDIMS"}</span>
                                <ArrowRight size={16} />
                            </button>
                        </div>

                        <div class="lg:border-l lg:border-white/20 lg:pl-12">
                            <p class="text-xs font-semibold uppercase tracking-[0.22em] text-slate-200">Calapan East District Office</p>
                            <ul class="mt-4 space-y-2.5 text-sm text-slate-100">
                                <li>
                                    <a
                                        href="mailto:support@cedims.gov.ph"
                                        class="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 transition-colors hover:border-white/30 hover:bg-white/10"
                                    >
                                        <Mail size={16} class="shrink-0" />
                                        support@cedims.gov.ph
                                    </a>
                                </li>
                                <li>
                                    <a
                                        href="tel:+63432881234"
                                        class="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 transition-colors hover:border-white/30 hover:bg-white/10"
                                    >
                                        <Phone size={16} class="shrink-0" />
                                        (043) 288-1234
                                    </a>
                                </li>
                                <li class="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5">
                                    <MapPin size={16} class="shrink-0" />
                                    Calapan City, Oriental Mindoro
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    </main>

    <footer class="border-t border-border-subtle bg-surface-white">
        <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
            <div class="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <div class="flex items-center gap-2.5">
                        <img src="/app_icon.png" alt="" class="h-8 w-8 rounded-lg" />
                        <p class="text-sm font-semibold text-text-primary">CEDIMS</p>
                    </div>
                    <p class="mt-2 text-sm text-text-secondary">
                        Calapan East District Instructional Monitoring System
                    </p>
                    <p class="mt-1 text-xs font-semibold text-gov-blue">Powered by Smart E-Vision</p>
                </div>

                <div class="text-xs text-text-muted sm:text-right">
                    <p class="flex flex-wrap gap-x-4 gap-y-1 sm:justify-end">
                        <a href="/terms" class="font-medium transition-colors hover:text-gov-blue">Terms of Use</a>
                        <a href="/privacy" class="font-medium transition-colors hover:text-gov-blue">Privacy Notice</a>
                    </p>
                    <p class="mt-2">&copy; 2026 CEDIMS · Department of Education</p>
                </div>
            </div>
        </div>
    </footer>
</div>

<style>
    /* Paired with the `reveal` action in the script block: the action adds
       `.reveal-pending` immediately, then swaps in `.reveal-shown` the
       first time the element crosses into the viewport. */
    :global(.reveal-pending) {
        opacity: 0;
        transform: translateY(18px);
    }

    :global(.reveal-shown) {
        opacity: 1;
        transform: translateY(0);
        transition:
            opacity 550ms var(--ease-out),
            transform 550ms var(--ease-out);
    }

    /* Hero decorative mesh: a faint dot grid plus two soft color fields.
       Confined to the hero's own layer, behind the text column, and never
       intercepts pointer events. */
    .hero-grid {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle, var(--color-border-subtle) 1px, transparent 1px);
        background-size: 26px 26px;
        opacity: 0.5;
        mask-image: linear-gradient(to bottom, black, transparent 85%);
    }

    .hero-blob {
        position: absolute;
        border-radius: 9999px;
        filter: blur(60px);
        opacity: 0.35;
    }

    .hero-blob--one {
        top: -10%;
        right: -8%;
        height: 22rem;
        width: 22rem;
        background: radial-gradient(circle, var(--color-gov-blue-vibrant), transparent 70%);
        animation: drift-one 16s ease-in-out infinite;
    }

    .hero-blob--two {
        bottom: -14%;
        left: -6%;
        height: 20rem;
        width: 20rem;
        background: radial-gradient(circle, var(--color-gov-blue), transparent 70%);
        animation: drift-two 18s ease-in-out infinite;
    }

    @keyframes drift-one {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(-18px, 14px); }
    }

    @keyframes drift-two {
        0%, 100% { transform: translate(0, 0); }
        50% { transform: translate(16px, -12px); }
    }

    .hero-gradient-text {
        background: linear-gradient(120deg, var(--color-gov-blue) 0%, var(--color-gov-blue-vibrant) 60%, var(--color-gov-blue-light) 100%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        color: var(--color-gov-blue);
    }

    .live-dot {
        display: inline-block;
        height: 7px;
        width: 7px;
        border-radius: 9999px;
        background: var(--color-gov-blue-vibrant);
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-gov-blue-vibrant) 60%, transparent);
        animation: live-pulse 2.2s ease-out infinite;
    }

    @keyframes live-pulse {
        0% {
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-gov-blue-vibrant) 45%, transparent);
        }
        70% {
            box-shadow: 0 0 0 7px color-mix(in srgb, var(--color-gov-blue-vibrant) 0%, transparent);
        }
        100% {
            box-shadow: 0 0 0 0 color-mix(in srgb, var(--color-gov-blue-vibrant) 0%, transparent);
        }
    }

    .stat-card,
    .feature-card,
    .role-card {
        transition:
            transform 300ms var(--ease-out),
            box-shadow 300ms var(--ease-out),
            border-color 300ms var(--ease-out);
    }

    .step-ring {
        background: linear-gradient(135deg, var(--color-gov-blue), var(--color-gov-blue-vibrant));
        padding: 2px;
        box-shadow: 0 1px 2px 0 color-mix(in srgb, var(--color-gov-blue) 25%, transparent);
    }

    @media (prefers-reduced-motion: reduce) {
        :global(.reveal-pending) {
            opacity: 1;
            transform: none;
        }

        .hero-blob--one,
        .hero-blob--two,
        .live-dot {
            animation: none;
        }
    }
</style>
