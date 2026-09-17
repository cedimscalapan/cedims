<script lang="ts">
    import { ArrowLeft, ShieldCheck, FileText, LogIn } from "lucide-svelte";

    // Shown to the reader and used for the <time> value. Set this to the date
    // the District Office actually issued the notice — a data-privacy notice
    // with no date gives a data subject no way to tell what they were told.
    const effectiveDate = "2026-09-01";
    const effectiveLabel = "1 September 2026";

    // Drives the contents list; each id is set on the matching <section>, so a
    // single clause can be linked to directly.
    const sections = [
        { id: "what-we-collect", title: "Information we collect" },
        { id: "why", title: "Why we collect it" },
        { id: "who-sees-it", title: "Who can see your information" },
        { id: "protection", title: "How it is protected" },
        { id: "retention", title: "How long it is kept" },
        { id: "your-rights", title: "Your rights" },
        { id: "recaptcha", title: "Security verification" },
        { id: "contact", title: "Contact and complaints" },
    ];
</script>

<svelte:head>
    <title>Privacy Notice — CEDIMS</title>
    <meta
        name="description"
        content="How CEDIMS collects and handles personal information, under the Data Privacy Act of 2012 (RA 10173)."
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
                        <ShieldCheck size={22} strokeWidth={2} />
                    </div>
                    <div>
                        <h1 class="text-2xl font-bold text-text-primary">Privacy Notice</h1>
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
                        <dt class="font-semibold uppercase tracking-[0.12em] text-text-muted">Controller</dt>
                        <dd class="font-semibold text-text-primary">DepEd Calapan East District Office</dd>
                    </div>
                </dl>
            </header>

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
                    This notice explains what personal information CEDIMS collects, why it is
                    collected, and how it is handled. It is issued in line with the
                    <strong class="text-text-primary">Data Privacy Act of 2012 (Republic Act No. 10173)</strong>
                    and its Implementing Rules and Regulations. It covers accounts and submissions
                    across the five public elementary schools of Calapan East District — Bulusan,
                    Guinobatan, Ibaba, Salong and Suqui.
                </p>

                <section id="what-we-collect" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">1. Information we collect</h2>
                    <ul class="list-disc space-y-1.5 pl-5">
                        <li>
                            <strong class="text-text-primary">Account details</strong> — your name,
                            email address, assigned role, school and district.
                        </li>
                        <li>
                            <strong class="text-text-primary">Teaching assignment</strong> — the
                            subjects and grade levels assigned to you.
                        </li>
                        <li>
                            <strong class="text-text-primary">Documents you submit</strong> — Daily
                            Lesson Logs, Instructional Supervisory Plans and Reports, including text
                            read from them for search and automatic detection of subject, grade
                            level and week.
                        </li>
                        <li>
                            <strong class="text-text-primary">Submission records</strong> — dates,
                            deadlines, compliance status, and the remarks your reviewers leave.
                        </li>
                        <li>
                            <strong class="text-text-primary">Profile photo</strong> — only if you
                            choose to upload one.
                        </li>
                    </ul>
                </section>

                <section id="why" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">2. Why we collect it</h2>
                    <p>
                        Your information is processed solely for instructional monitoring and
                        supervision within DepEd Calapan East District — recording submissions,
                        tracking compliance against deadlines, enabling supervisory review and
                        remarks, and producing school and district reports. It is not used for
                        advertising, and it is not sold or shared with third parties for their own
                        purposes.
                    </p>
                </section>

                <section id="who-sees-it" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">3. Who can see your information</h2>
                    <p class="mb-2">Access follows your role and the school or district you belong to:</p>
                    <ul class="list-disc space-y-1.5 pl-5">
                        <li>
                            <strong class="text-text-primary">Teachers</strong> see only their own
                            submissions and records.
                        </li>
                        <li>
                            <strong class="text-text-primary">Master Teachers and School Heads</strong>
                            see submissions from their own school.
                        </li>
                        <li>
                            <strong class="text-text-primary">District Supervisors</strong> see
                            submissions across the five schools in the district.
                        </li>
                    </ul>
                    <p class="mt-2">
                        These limits are enforced by the system itself, not only by the screens you
                        see.
                    </p>
                </section>

                <section id="protection" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">4. How it is protected</h2>
                    <ul class="list-disc space-y-1.5 pl-5">
                        <li>Access requires an account and password; sessions are encrypted in transit.</li>
                        <li>
                            Each document is fingerprinted (SHA-256) so any alteration is
                            detectable, and carries a QR code for verification.
                        </li>
                        <li>Review actions are recorded so the history of a document cannot be quietly rewritten.</li>
                        <li>Documents are held in access-controlled storage, not in a public location.</li>
                    </ul>
                </section>

                <section id="retention" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">5. How long it is kept</h2>
                    <p>
                        Submissions and their compliance records are retained for as long as the
                        District Office requires them for monitoring, reporting and recordkeeping,
                        consistent with DepEd retention rules. Accounts are deactivated when a user
                        leaves the district.
                    </p>
                </section>

                <section id="your-rights" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">6. Your rights</h2>
                    <p class="mb-2">
                        Under the Data Privacy Act you have the right to be informed, to access your
                        personal data, to correct inaccurate entries, to object to certain
                        processing, to request erasure or blocking where the law allows, to data
                        portability, and to seek redress for a violation.
                    </p>
                    <p>
                        To exercise any of these, contact the District Office using the details
                        below. Requests involving official submission records may be subject to
                        DepEd retention and audit requirements.
                    </p>
                </section>

                <section id="recaptcha" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">7. Security verification</h2>
                    <p>
                        The sign-in page uses Google reCAPTCHA to distinguish real users from
                        automated attempts. Google may process device and usage signals for this
                        purpose, subject to Google's own privacy policy and terms.
                    </p>
                </section>

                <section id="contact" class="scroll-mt-6">
                    <h2 class="mb-2 text-base font-bold text-text-primary">8. Contact and complaints</h2>
                    <p class="mb-2">
                        Questions about this notice, and requests to exercise the rights above,
                        should be addressed to the Data Protection Officer of the Calapan East
                        District Office:
                    </p>
                    <address class="not-italic">
                        Data Protection Officer, Calapan East District Office<br />
                        Calapan City, Oriental Mindoro<br />
                        Email:
                        <a href="mailto:support@cedims.gov.ph" class="font-semibold text-gov-blue hover:underline">
                            support@cedims.gov.ph
                        </a>
                        · Phone:
                        <a href="tel:+63432881234" class="font-semibold text-gov-blue hover:underline">
                            (043) 288-1234
                        </a>
                    </address>
                    <p class="mt-2">
                        If a concern is not resolved, you may also lodge a complaint with the
                        National Privacy Commission.
                    </p>
                </section>

                <p class="border-t border-border-subtle pt-5 text-xs text-text-muted">
                    This notice may be updated as the system changes. Material changes will be
                    communicated through the District Office.
                </p>
            </div>
        </article>

        <nav
            aria-label="Related pages"
            class="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-border-subtle bg-surface-white px-5 py-4 text-sm"
        >
            <a href="/terms" class="inline-flex items-center gap-2 font-semibold text-gov-blue hover:underline">
                <FileText size={16} strokeWidth={2} />
                Terms of Use
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
