<script lang="ts">
    import { ArrowLeft, FileText, ShieldCheck, LogIn } from "lucide-svelte";

    // Shown to the reader and used for the <time> value. A policy page with no
    // date gives a reader no way to tell whether what they agreed to has since
    // changed — the one fact a terms page cannot omit.
    const effectiveDate = "2026-09-01";
    const effectiveLabel = "1 September 2026";

    // Drives the contents list. Each id is set on the matching <section>, so
    // the list is also what makes individual clauses linkable in an email.
    const sections = [
        { id: "who", title: "Who may use it" },
        { id: "acceptable-use", title: "Acceptable use" },
        { id: "accuracy", title: "Accuracy of submissions" },
        { id: "records", title: "Records and integrity" },
        { id: "availability", title: "Availability" },
        { id: "personal-data", title: "Personal data" },
        { id: "suspension", title: "Suspension" },
        { id: "contact", title: "Contact" },
    ];
</script>

<svelte:head>
    <title>Terms of Use — CEDIMS</title>
    <meta
        name="description"
        content="Terms of Use for CEDIMS, the Calapan East District Instructional Monitoring System."
    />
</svelte:head>

<div class="min-h-dvh bg-surface-muted px-4 py-10 sm:px-6 lg:px-8">
    <div class="mx-auto max-w-3xl">
        <a
            href="/"
            class="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-text-muted transition-colors hover:text-gov-blue"
        >
            <ArrowLeft size={16} strokeWidth={2} />
            Back to CEDIMS
        </a>

        <article class="rounded-2xl border border-border-subtle bg-surface-white p-6 shadow-sm sm:p-10">
            <header class="border-b border-border-subtle pb-6">
                <div class="flex items-center gap-3">
                    <div class="rounded-xl bg-gov-blue/10 p-2.5 text-gov-blue">
                        <FileText size={22} strokeWidth={2} />
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold text-text-primary">Terms of Use</h1>
                        <p class="text-sm text-text-secondary">CEDIMS — DepEd Calapan East District</p>
                    </div>
                </div>

                <dl class="mt-5 flex flex-wrap gap-x-8 gap-y-2 text-xs">
                    <div class="flex gap-2">
                        <dt class="font-semibold uppercase tracking-[0.12em] text-text-muted">Effective</dt>
                        <dd class="font-semibold text-text-primary">
                            <time datetime={effectiveDate}>{effectiveLabel}</time>
                        </dd>
                    </div>
                    <div class="flex gap-2">
                        <dt class="font-semibold uppercase tracking-[0.12em] text-text-muted">Applies to</dt>
                        <dd class="font-semibold text-text-primary">
                            The 5 schools of Calapan East District
                        </dd>
                    </div>
                </dl>
            </header>

            <!-- Contents. Eight clauses is past the point where a reader on a
                 phone can find one by scrolling. -->
            <nav aria-label="Contents" class="border-b border-border-subtle py-5">
                <h2 class="text-xs font-semibold uppercase tracking-[0.14em] text-text-muted">Contents</h2>
                <ol class="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
                    {#each sections as section, i}
                        <li class="text-[15px] leading-6">
                            <a
                                href="#{section.id}"
                                class="text-text-secondary transition-colors hover:text-gov-blue hover:underline"
                            >
                                <span class="font-semibold text-text-muted">{i + 1}.</span>
                                {section.title}
                            </a>
                        </li>
                    {/each}
                </ol>
            </nav>

            <div class="space-y-7 pt-6 text-[15px] leading-7 text-text-secondary">
                <p>
                    CEDIMS is an official system of the DepEd Calapan East District Office. By
                    signing in, you agree to the terms below.
                </p>

                <section id="who" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">1. Who may use it</h2>
                    <p>
                        Accounts are issued by the District Office to Teachers, Master Teachers,
                        School Heads and District Supervisors, and are scoped to the school or
                        district on your account. Accounts are personal. Do not share your
                        password or let another person work under your account — any submission
                        or remark made under it is treated as yours.
                    </p>
                </section>

                <section id="acceptable-use" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">2. Acceptable use</h2>
                    <ul class="list-disc space-y-1.5 pl-5">
                        <li>Upload only genuine instructional documents that are yours to submit.</li>
                        <li>Do not upload content unrelated to instructional monitoring.</li>
                        <li>
                            Do not attempt to access records belonging to other schools or
                            districts, or to bypass the system's access limits.
                        </li>
                        <li>Do not upload material that infringes another person's rights.</li>
                    </ul>
                </section>

                <section id="accuracy" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">3. Accuracy of submissions</h2>
                    <p>
                        You are responsible for the accuracy and completeness of what you submit,
                        including the teaching load, week and document type attached to it. The
                        system reads details from your document automatically to save you time,
                        but the detected values are a suggestion — confirm them before archiving.
                    </p>
                </section>

                <section id="records" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">4. Records and integrity</h2>
                    <p>
                        Submissions are archived as official records. Each is fingerprinted and
                        carries a verification code, and reviewer remarks are kept as a history
                        rather than overwritten. Records are not deleted on request once archived,
                        since they form part of the District's monitoring trail.
                    </p>
                </section>

                <section id="availability" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">5. Availability</h2>
                    <p>
                        The system is provided as-is for official use. It runs in a web browser on
                        a phone, tablet or computer, and may be unavailable during maintenance or
                        network interruption. Uploads made without a connection are held on your
                        device and sent automatically once a connection returns — keep the app
                        installed and open it periodically so pending work can finish.
                    </p>
                </section>

                <section id="personal-data" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">6. Personal data</h2>
                    <p>
                        Handling of personal information is described in the
                        <a href="/privacy" class="font-semibold text-gov-blue hover:underline">Privacy Notice</a>,
                        issued under the Data Privacy Act of 2012 (RA 10173). Your use of CEDIMS is
                        also subject to that notice.
                    </p>
                </section>

                <section id="suspension" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">7. Suspension</h2>
                    <p>
                        The District Office may suspend or withdraw access for misuse, for breach
                        of these terms, or when a user leaves the district.
                    </p>
                </section>

                <section id="contact" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">8. Contact</h2>
                    <address class="not-italic">
                        Calapan East District Office, Calapan City, Oriental Mindoro<br />
                        Email:
                        <a href="mailto:support@cedims.gov.ph" class="font-semibold text-gov-blue hover:underline">
                            support@cedims.gov.ph
                        </a>
                        · Phone:
                        <a href="tel:+63432881234" class="font-semibold text-gov-blue hover:underline">
                            (043) 288-1234
                        </a>
                    </address>
                </section>

                <p class="border-t border-border-subtle pt-5 text-xs text-text-muted">
                    These terms may be updated as the system changes. Continued use after an update
                    means acceptance of the revised terms.
                </p>
            </div>
        </article>

        <!-- Both policy documents and the way back in, so a reader who lands
             here from a link is not left at a dead end. -->
        <nav
            aria-label="Related pages"
            class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border-subtle bg-surface-white px-5 py-4 text-sm"
        >
            <a href="/privacy" class="inline-flex items-center gap-2 font-semibold text-gov-blue hover:underline">
                <ShieldCheck size={16} strokeWidth={2} />
                Privacy Notice
            </a>
            <a
                href="/auth/login"
                class="inline-flex items-center gap-2 font-medium text-text-muted transition-colors hover:text-gov-blue"
            >
                <LogIn size={16} strokeWidth={2} />
                Back to sign in
            </a>
        </nav>
    </div>
</div>
