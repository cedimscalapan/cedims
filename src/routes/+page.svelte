<script lang="ts">
    import { profile, authLoading } from "$lib/utils/auth";
    import { goto } from "$app/navigation";
    import { onMount } from "svelte";
    import { theme } from "$lib/stores/theme";
    import {
        ArrowRight,
        BarChart3,
        BellRing,
        ClipboardCheck,
        FileCheck2,
        FileUp,
        History,
        Laptop,
        LogIn,
        Mail,
        MapPin,
        MessageSquareText,
        PenLine,
        Phone,
        QrCode,
        School,
        ShieldCheck,
        Smartphone,
        WifiOff,
    } from "lucide-svelte";
    import { fly } from "svelte/transition";

    // What the system actually does, one card per capability. Each line is a
    // feature a user can point at in the app — not a general claim.
    const features = [
        {
            title: "DLL monitoring",
            description:
                "Track Daily Lesson Log submissions and see who is on time, late, or missing for the week.",
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
            title: "QR verification",
            description:
                "Every export carries a QR stamp, so any printed copy can be checked against the original record.",
            icon: QrCode,
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

    // How the system maps onto SDG 4, stated against the actual UN target
    // numbers rather than as a general claim about education.
    const sdgTargets = [
        {
            target: "4.c",
            title: "Supply of qualified teachers",
            contribution:
                "Master Teachers and School Heads review lesson logs and leave remarks, so supervision becomes continuous coaching instead of an annual check.",
        },
        {
            target: "4.1",
            title: "Effective learning outcomes",
            contribution:
                "Tracking Daily Lesson Log completion against deadlines keeps lesson planning consistent across every class in the district.",
        },
        {
            target: "4.5",
            title: "Equal access",
            contribution:
                "Uploads work on low-bandwidth mobile connections and finish on their own once signal returns, so remote schools are monitored on the same footing.",
        },
        {
            target: "4.a",
            title: "Effective learning environments",
            contribution:
                "District-wide compliance data shows which schools need support, directing attention to where instruction needs strengthening.",
        },
    ];

    // The five schools CEDIMS is deployed against. This is the pilot scope
    // seeded in db/complete_schema.sql, not a sample of a longer list — the
    // landing page is public and pre-auth, so it is stated here rather than
    // fetched.
    const schools = [
        "Bulusan Elementary School",
        "Guinobatan Elementary School",
        "Ibaba Elementary School",
        "Salong Elementary School",
        "Suqui Elementary School",
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
            title: "Works on weak signal",
            description: "Submissions queue offline and upload once the connection returns.",
            icon: WifiOff,
        },
    ];

    onMount(() => {
        theme.init();

        const unsubscribe = profile.subscribe((p) => {
            if (p) {
                goto("/dashboard");
            }
        });

        return unsubscribe;
    });
</script>

<svelte:head>
    <title>CEDIMS — Calapan East District Instructional Monitoring System · Powered by Smart E-VISION</title>
    <meta
        name="description"
        content="CEDIMS is the Calapan East District Instructional Monitoring System for submitting, checking, and tracking compliance of Daily Lesson Logs."
    />
</svelte:head>

<div class="min-h-dvh bg-surface-muted text-text-primary">
    <header class="sticky top-0 z-40 border-b border-border-subtle bg-surface-white/85 backdrop-blur">
        <div class="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
            <a href="/" class="flex min-w-0 items-center gap-2.5">
                <img src="/app_icon.png" alt="" class="h-9 w-9 shrink-0 rounded-lg sm:h-10 sm:w-10" />
                <span class="min-w-0">
                    <span class="block text-sm font-semibold leading-tight text-text-primary">CEDIMS</span>
                    <span class="block truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.22em] text-gov-blue">
                        Instructional Monitoring
                    </span>
                </span>
            </a>

            <nav aria-label="Sections" class="hidden items-center gap-7 text-sm font-medium text-text-secondary md:flex">
                <a href="#features" class="transition-colors hover:text-gov-blue">Features</a>
                <a href="#roles" class="transition-colors hover:text-gov-blue">Roles</a>
                <a href="#sdg" class="transition-colors hover:text-gov-blue">SDG 4</a>
                <a href="#how-it-works" class="transition-colors hover:text-gov-blue">How it works</a>
                <a href="#contact" class="transition-colors hover:text-gov-blue">Contact</a>
            </nav>

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
        </div>
    </header>

    <main>
        <!-- Hero — what it is, who it is for, and the way in -->
        <section class="border-b border-border-subtle bg-surface-white">
            <div class="mx-auto grid max-w-7xl items-center gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:px-8">
                <div in:fly={{ y: 16, duration: 450 }}>
                    <p class="inline-flex items-center gap-2 rounded-full border border-gov-blue/20 bg-gov-blue/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-gov-blue sm:text-xs">
                        DepEd · Calapan East District
                    </p>

                    <h1 class="mt-5 text-3xl font-bold leading-[1.15] tracking-tight text-text-primary sm:text-4xl lg:text-5xl">
                        Instructional monitoring the whole district can keep up with.
                    </h1>

                    <p class="mt-4 max-w-xl text-base leading-8 text-text-secondary sm:mt-5 sm:text-lg">
                        CEDIMS is where Daily Lesson Logs are submitted, checked, and tracked —
                        so teachers know what is due, supervisors can leave remarks in one place,
                        and the district can see compliance without chasing paper.
                    </p>

                    <div class="mt-7 flex flex-wrap items-center gap-3 sm:mt-8">
                        <button
                            onclick={() => goto($profile ? "/dashboard" : "/auth/login")}
                            class="gov-btn-primary inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm sm:w-auto"
                        >
                            <span>{$profile ? "Go to dashboard" : "Sign in to CEDIMS"}</span>
                            <ArrowRight size={16} />
                        </button>
                        <a href="#how-it-works" class="gov-btn-secondary inline-flex w-full items-center justify-center gap-2 px-5 py-3 text-sm sm:w-auto">
                            See how it works
                        </a>
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

                <!-- What the system actually covers. The SDG mark stays, at the size
                     of a credential rather than a hero image. -->
                <aside
                    in:fly={{ y: 20, duration: 450, delay: 120 }}
                    class="mx-auto w-full max-w-sm rounded-3xl border border-border-subtle bg-surface-white p-5 shadow-sm sm:p-6 lg:mx-0 lg:max-w-md"
                >
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
                                <School size={16} strokeWidth={1.75} class="shrink-0 text-gov-blue" aria-hidden="true" />
                                <span class="text-sm leading-6 text-text-secondary">{school}</span>
                            </li>
                        {/each}
                    </ul>

                    <div class="mt-4 flex items-start gap-3 rounded-2xl bg-surface-muted p-3.5">
                        <img
                            src="/sdg-4-quality-education.svg"
                            alt="United Nations Sustainable Development Goal 4: Quality Education"
                            width="64"
                            height="64"
                            class="h-14 w-14 shrink-0 rounded-lg"
                        />
                        <div>
                            <p class="text-sm font-semibold text-text-primary">Built to serve SDG 4</p>
                            <a
                                href="#sdg"
                                class="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-gov-blue hover:underline"
                            >
                                See the four targets
                                <ArrowRight size={13} />
                            </a>
                        </div>
                    </div>
                </aside>
            </div>
        </section>

        <!-- What the system does -->
        <section id="features" class="scroll-mt-20 border-b border-border-subtle">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">What it does</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Everything monitoring needs, and nothing that gets in the way.
                    </h2>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
                    {#each features as feature}
                        <li class="rounded-2xl border border-border-subtle bg-surface-white p-5 shadow-sm transition-shadow hover:shadow-md sm:p-6">
                            <span class="inline-flex rounded-xl bg-gov-blue/10 p-3 text-gov-blue">
                                <svelte:component this={feature.icon} size={20} strokeWidth={1.75} />
                            </span>
                            <h3 class="mt-4 text-base font-semibold text-text-primary">{feature.title}</h3>
                            <p class="mt-2 text-sm leading-7 text-text-secondary">{feature.description}</p>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- Who holds an account, and what each role can actually do -->
        <section id="roles" class="scroll-mt-20 border-b border-border-subtle bg-surface-white">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">Who uses it</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Four roles, each with its own view.
                    </h2>
                    <p class="mt-3 text-sm leading-7 text-text-secondary sm:text-base sm:leading-8">
                        Accounts are issued by the District Office. What you can upload, check and
                        see follows the role on your account — the limits are enforced by the
                        system, not just hidden from the screen.
                    </p>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-4">
                    {#each roles as role}
                        <li class="flex flex-col rounded-2xl border border-border-subtle bg-surface-muted p-5 sm:p-6">
                            <span class="inline-flex w-fit rounded-xl bg-gov-blue/10 p-2.5 text-gov-blue">
                                <svelte:component this={role.icon} size={18} strokeWidth={1.75} />
                            </span>
                            <h3 class="mt-4 text-base font-semibold text-text-primary">{role.name}</h3>
                            <p class="mt-0.5 text-xs font-semibold uppercase tracking-[0.12em] text-gov-blue">
                                {role.summary}
                            </p>
                            <p class="mt-2.5 text-sm leading-7 text-text-secondary">{role.description}</p>
                        </li>
                    {/each}
                </ul>

                <!-- What it runs on. Stated as the devices a teacher already has,
                     because "mobile" alone understated it — CEDIMS is a browser
                     app that installs on any of the three. -->
                <div class="mt-6 rounded-2xl border border-border-subtle bg-surface-muted p-5 sm:mt-8 sm:p-6">
                    <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
                        <div>
                            <h3 class="text-sm font-semibold text-text-primary sm:text-base">
                                Runs on what you already carry
                            </h3>
                            <p class="mt-1.5 text-sm leading-7 text-text-secondary">
                                No download from a store and nothing to install on a school computer.
                                Open it in a browser, or add it to your home screen and it opens like an app —
                                including when there is no signal.
                            </p>
                        </div>
                        <ul class="flex flex-wrap gap-2.5 lg:shrink-0">
                            {#each [
                                { label: "Android phone", icon: Smartphone },
                                { label: "iPhone & iPad", icon: Smartphone },
                                { label: "Laptop & desktop", icon: Laptop },
                                { label: "Offline", icon: WifiOff },
                            ] as device}
                                <li class="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-surface-white px-3.5 py-2 text-xs font-semibold text-text-primary">
                                    <svelte:component this={device.icon} size={14} strokeWidth={1.75} class="text-gov-blue" />
                                    {device.label}
                                </li>
                            {/each}
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- SDG 4 alignment, target by target -->
        <section id="sdg" class="scroll-mt-20 border-b border-border-subtle">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="max-w-3xl">
                    <p class="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-gov-red sm:text-sm">
                        <span class="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gov-red text-xs font-bold text-white">4</span>
                        Quality Education
                    </p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Four UN targets the district can act on.
                    </h2>
                    <p class="mt-3 max-w-2xl text-sm leading-7 text-text-secondary sm:text-base sm:leading-8">
                        Sustainable Development Goal 4 is broad. These are the specific targets CEDIMS
                        was designed against, and what the system contributes to each.
                    </p>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5">
                    {#each sdgTargets as item}
                        <li class="rounded-2xl border border-border-subtle bg-surface-white p-5 sm:p-6">
                            <p class="text-xs font-bold uppercase tracking-[0.14em] text-gov-red">Target {item.target}</p>
                            <h3 class="mt-2 text-base font-semibold text-text-primary">{item.title}</h3>
                            <p class="mt-2 text-sm leading-7 text-text-secondary">{item.contribution}</p>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- The path a document takes -->
        <section id="how-it-works" class="scroll-mt-20 border-b border-border-subtle bg-surface-white">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">How it works</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        One path from upload to district report.
                    </h2>
                </div>

                <ol class="relative mt-8 grid gap-6 sm:mt-12 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4">
                    <div
                        class="pointer-events-none absolute left-6 right-6 top-6 hidden h-px bg-gov-blue/25 lg:block"
                        aria-hidden="true"
                    ></div>
                    {#each steps as step, index}
                        <li class="relative">
                            <div class="relative z-10 flex h-12 w-12 items-center justify-center rounded-full border border-border-subtle bg-surface-white text-gov-blue shadow-sm">
                                <svelte:component this={step.icon} size={20} strokeWidth={1.75} />
                            </div>
                            <p class="mt-4 text-xs font-bold uppercase tracking-[0.14em] text-text-muted">Step {index + 1}</p>
                            <h3 class="mt-1 text-base font-semibold text-text-primary">{step.title}</h3>
                            <p class="mt-2 text-sm leading-7 text-text-secondary">{step.description}</p>
                        </li>
                    {/each}
                </ol>
            </div>
        </section>

        <!-- Why the records hold up -->
        <section class="border-b border-border-subtle">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="max-w-2xl">
                    <p class="text-xs font-semibold uppercase tracking-[0.22em] text-gov-blue sm:text-sm">Records you can trust</p>
                    <h2 class="mt-3 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
                        Every document stays verifiable.
                    </h2>
                </div>

                <ul class="mt-8 grid gap-4 sm:mt-10 sm:gap-5 lg:grid-cols-3">
                    {#each assurances as item}
                        <li class="flex items-start gap-4 rounded-2xl border border-border-subtle bg-surface-white p-5 sm:p-6">
                            <span class="inline-flex shrink-0 rounded-xl bg-gov-blue/10 p-3 text-gov-blue">
                                <svelte:component this={item.icon} size={20} strokeWidth={1.75} />
                            </span>
                            <div>
                                <h3 class="text-sm font-semibold text-text-primary sm:text-base">{item.title}</h3>
                                <p class="mt-1.5 text-sm leading-7 text-text-secondary">{item.description}</p>
                            </div>
                        </li>
                    {/each}
                </ul>
            </div>
        </section>

        <!-- Way in, and who to ask -->
        <section id="contact" class="scroll-mt-20">
            <div class="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
                <div class="overflow-hidden rounded-3xl border border-border-subtle bg-gov-blue text-white shadow-sm">
                    <div class="grid gap-8 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:gap-12">
                        <div>
                            <h2 class="text-2xl font-semibold tracking-tight sm:text-3xl">Ready to log in?</h2>
                            <p class="mt-3 max-w-md text-sm leading-7 text-slate-100 sm:text-base sm:leading-8">
                                Accounts are issued by the district office. Sign in with your DepEd email,
                                or reach the office below if you need access.
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
                            <ul class="mt-4 space-y-3 text-sm text-slate-100">
                                <li>
                                    <a href="mailto:support@cedims.gov.ph" class="inline-flex items-center gap-3 transition-colors hover:text-white hover:underline">
                                        <Mail size={16} class="shrink-0" />
                                        support@cedims.gov.ph
                                    </a>
                                </li>
                                <li>
                                    <a href="tel:+63432881234" class="inline-flex items-center gap-3 transition-colors hover:text-white hover:underline">
                                        <Phone size={16} class="shrink-0" />
                                        (043) 288-1234
                                    </a>
                                </li>
                                <li class="inline-flex items-center gap-3">
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
                    <p class="mt-1 text-xs text-text-muted">Powered by Smart E-VISION</p>
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
