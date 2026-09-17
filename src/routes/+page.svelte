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
        Lock,
        LogIn,
        Mail,
        MapPin,
        MessageSquareText,
        PenLine,
        Phone,
        QrCode,
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
    // seeded in db/complete_schema.sql, not a sample of a longer list — the
    // landing page is public and pre-auth, so it is stated here rather than
    // fetched. Each carries its own school seal rather than a generic icon.
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
                    <span class="block truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.18em] text-gov-blue">
                        Powered by Smart E-Vision
                    </span>
                </span>
            </a>

            <nav aria-label="Sections" class="hidden items-center gap-7 text-sm font-medium text-text-secondary md:flex">
                <a href="#features" class="transition-colors hover:text-gov-blue">Features</a>
                <a href="#roles" class="transition-colors hover:text-gov-blue">Roles</a>
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
        <section class="relative overflow-hidden border-b border-border-subtle bg-gradient-to-b from-gov-blue/[0.05] via-surface-white to-surface-white">
            <!-- Watermark: the five schools this deployment actually serves,
                 sealed into the page the way an official record carries its
                 institution's mark — not decoration for its own sake. Kept
                 to a faint, low-opacity scatter so it reads as texture, not
                 as competing content, and never sits under the copy itself
                 (that column stays on the plain gradient). -->
            <div class="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block" aria-hidden="true">
                <img src="/school-bulusan.jpg" alt="" class="absolute -right-8 -top-10 h-52 w-52 rotate-[8deg] rounded-full object-cover opacity-[0.07] xl:h-64 xl:w-64" />
                <img src="/school-guinobatan.jpg" alt="" class="absolute right-[18%] top-[58%] h-40 w-40 rotate-[-6deg] rounded-full object-cover opacity-[0.06] xl:h-48 xl:w-48" />
                <img src="/school-salong.jpg" alt="" class="absolute -bottom-12 right-[2%] h-56 w-56 rotate-[-10deg] rounded-full object-cover opacity-[0.06] xl:h-72 xl:w-72" />
                <img src="/school-suqui.jpg" alt="" class="absolute bottom-[22%] right-[42%] h-28 w-28 rotate-[12deg] rounded-full object-cover opacity-[0.05] xl:h-32 xl:w-32" />
                <img src="/school-ibaba.jpg" alt="" class="absolute -top-6 right-[36%] h-24 w-24 rotate-[-4deg] rounded-full object-cover opacity-[0.05] xl:h-28 xl:w-28" />
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
                                <img
                                    src={school.logo}
                                    alt=""
                                    class="h-7 w-7 shrink-0 rounded-full border border-border-subtle object-cover"
                                />
                                <span class="text-sm leading-6 text-text-secondary">{school.name}</span>
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
                            <p class="mt-1 text-xs leading-5 text-text-secondary">Quality Education, UN Sustainable Development Goals</p>
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

        <!-- The path a document takes, and why the record it leaves holds up -->
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

                <!-- Compact trust strip — every record this path produces stays
                     verifiable, stated as three short facts rather than its own
                     full section. -->
                <ul class="mt-10 grid gap-3 border-t border-border-subtle pt-8 sm:mt-12 sm:grid-cols-3 sm:gap-4">
                    {#each assurances as item}
                        <li class="flex items-start gap-3 rounded-xl bg-surface-muted p-4">
                            <span class="inline-flex shrink-0 rounded-lg bg-gov-blue/10 p-2 text-gov-blue">
                                <svelte:component this={item.icon} size={16} strokeWidth={1.75} />
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
