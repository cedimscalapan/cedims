<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import { addToast } from "$lib/stores/toast";
    import { onMount } from "svelte";
    import { fly, fade } from "svelte/transition";
    import {
        Save,
        Clock,
        CheckCircle2,
        Info,
        CalendarDays,
    } from "lucide-svelte";

    interface Deadline {
        id?: string;
        week_number: number;
        deadline_date: string;
        description: string;
        is_active?: boolean;
    }

    let schoolYear = $state("2026-2027");
    let term = $state(1);
    let deadlines = $state<Deadline[]>([]);
    let loading = $state(true);
    let saving = $state(false);
    let generating = $state(false);
    let resolvedDistrictId = $state<string | null>(null);
    let yearOpen = $state(false);
    let termOpen = $state(false);

    const schoolYears = ["2026-2027", "2027-2028"];

    const terms = [
        { value: 1, label: "1st Term" },
        { value: 2, label: "2nd Term" },
        { value: 3, label: "3rd Term" },
    ];

    // DepEd SY 2026-2027 three-term calendar (DepEd Order No. 009, s. 2026).
    // Each submission deadline is the Monday of its week. Generated weeks start
    // scheduled (closed / not open) until a supervisor opens them to teachers.
    const DEPED_2026_WEEKS: { term: number; week_number: number; deadline_date: string }[] = [
        // Term 1 (Weeks 1–13, Jun 8 – Sep 15, 2026)
        ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map((w, i) => ({
            term: 1,
            week_number: w,
            deadline_date: new Date(2026, 5, 8 + i * 7).toISOString(),
        })),
        // Term 2 (Weeks 14–26, Sep 16 – Dec 18, 2026; first Monday Sep 21)
        ...[14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26].map((w, i) => ({
            term: 2,
            week_number: w,
            deadline_date: new Date(2026, 8, 21 + i * 7).toISOString(),
        })),
        // Term 3 (Weeks 27–39, Jan 4 – Apr 8, 2027)
        ...[27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39].map((w, i) => ({
            term: 3,
            week_number: w,
            deadline_date: new Date(2027, 0, 4 + i * 7).toISOString(),
        })),
    ];

    const isDistrictSupervisor = $derived(
        $profile?.role === "District Supervisor",
    );
    const canEdit = $derived(isDistrictSupervisor);

    onMount(async () => {
        try {
            // Resolve district ID — supervisors have it directly, teachers get it through their school
            if ($profile?.district_id) {
                resolvedDistrictId = $profile.district_id;
            } else if ($profile?.school_id) {
                const { data, error } = await supabase
                    .from("schools")
                    .select("district_id")
                    .eq("id", $profile.school_id)
                    .single();

                if (error) {
                    console.error(
                        "[calendar] Error resolving district from school:",
                        error,
                    );
                } else {
                    resolvedDistrictId = data?.district_id || null;
                }
            } else {
                console.error(
                    "[calendar] No district_id or school_id found in profile:",
                    $profile,
                );
            }

            if (resolvedDistrictId) {
                await loadDeadlines();
            } else {
                addToast(
                    "warning",
                    "Unable to load calendar for your school/district",
                );
            }
        } catch (err) {
            console.error("[calendar] Error in calendar onMount:", err);
            addToast("error", "Failed to load calendar");
        } finally {
            loading = false;
        }
    });

    async function loadDeadlines() {
        if (!resolvedDistrictId) return;

        const { data, error } = await supabase
            .from("academic_calendar")
            .select("*")
            .eq("school_year", schoolYear)
            .eq("term", term)
            .eq("district_id", resolvedDistrictId)
            .order("week_number", { ascending: true });

        if (error) {
            console.error("[calendar] Error loading calendar:", error);
            return;
        }

        // Always ensure we have 10 weeks
        const existingWeeks = data || [];
        deadlines = Array.from({ length: 10 }, (_, i) => {
            const weekNum = i + 1;
            const weekData = existingWeeks.find(
                (w: any) => w.week_number === weekNum,
            );
            return {
                id: weekData?.id,
                week_number: weekNum,
                deadline_date: weekData?.deadline_date
                    ? (weekData.deadline_date as string).split("T")[0]
                    : "",
                description:
                    weekData?.description || `Week ${weekNum} Submission`,
                is_active: weekData?.is_active ?? false,
            };
        });
    }

    async function saveWeek(weekData: any) {
        if (!canEdit) {
            addToast("error", "You don't have permission to edit the calendar");
            return;
        }

        if (!resolvedDistrictId) {
            addToast(
                "error",
                "Unable to determine your district. Please refresh the page.",
            );
            console.error("[calendar] Save error: No district ID resolved");
            return;
        }

        if (!weekData.deadline_date) {
            addToast("error", "Please set a deadline date for this week");
            return;
        }

        const payload = {
            ...(weekData.id ? { id: weekData.id } : {}),
            school_year: schoolYear,
            term: term,
            week_number: weekData.week_number,
            deadline_date: new Date(weekData.deadline_date).toISOString(),
            description: weekData.description,
            ...(typeof weekData.is_active === "boolean"
                ? { is_active: weekData.is_active }
                : {}),
            district_id: resolvedDistrictId,
        };

        const { data, error } = await supabase
            .from("academic_calendar")
            .upsert(payload)
            .select();

        if (error) {
            console.error("[calendar] Save error:", error);
            addToast(
                "error",
                `Failed to save Week ${weekData.week_number}: ${error.message}`,
            );
        } else {
            if (data && data[0]) {
                weekData.id = data[0].id;
                addToast("success", `Week ${weekData.week_number} deadline saved successfully`);

                // Notify all teachers in the district about the new deadline
                const { createNotification } = await import(
                    "$lib/utils/notificationSystem"
                );
                const { data: teachers } = await supabase
                    .from("profiles")
                    .select("id")
                    .eq("district_id", resolvedDistrictId)
                    .eq("role", "Teacher");

                if (teachers) {
                    await Promise.all(
                        teachers.map((t) =>
                            createNotification(
                                t.id,
                                "Deadline Updated",
                                `The submission deadline for Week ${weekData.week_number} has been updated to ${new Date(weekData.deadline_date).toLocaleDateString()}.`,
                                "info",
                                "/dashboard/calendar",
                            ),
                        ),
                    );
                }
            }
        }
    }

    $effect(() => {
        if (schoolYear || term) {
            loadDeadlines();
        }
    });

    async function toggleActive(d: Deadline) {
        if (!canEdit) return;
        if (!d.id) {
            addToast("error", "Save the week first before activating it");
            return;
        }
        const next = !d.is_active;
        const { error } = await supabase
            .from("academic_calendar")
            .update({ is_active: next })
            .eq("id", d.id);

        if (error) {
            console.error("[calendar] Toggle active error:", error);
            addToast(
                "error",
                `Failed to ${next ? "open" : "schedule"} Week ${d.week_number}: ${error.message}`,
            );
            return;
        }

        d.is_active = next;
        addToast(
            "success",
            next
                ? `Week ${d.week_number} is now open for submissions (visible to teachers)`
                : `Week ${d.week_number} is now scheduled (hidden from teachers)`,
        );

        if (next) {
            // Notify teachers in the district about the newly active deadline
            const { createNotification } = await import(
                "$lib/utils/notificationSystem"
            );
            const { data: teachers } = await supabase
                .from("profiles")
                .select("id")
                .eq("district_id", resolvedDistrictId)
                .eq("role", "Teacher");
            if (teachers) {
                await Promise.all(
                    teachers.map((t) =>
                        createNotification(
                            t.id,
                            "New Submission Deadline",
                            `The submission deadline for Week ${d.week_number} (Term ${term}) is now open. Due: ${new Date(d.deadline_date).toLocaleDateString()}.`,
                            "info",
                            "/dashboard/calendar",
                        ),
                    ),
                );
            }
        }
    }

    async function generateFromDepEd() {
        if (!canEdit || !resolvedDistrictId) return;
        if (
            !confirm(
                "Generate the full DepEd SY 2026-2027 three-term calendar for this district? Weeks are created in a scheduled (closed) state and can be opened per week. Existing dates will be overwritten.",
            )
        )
            return;

        generating = true;
        try {
            const rows = DEPED_2026_WEEKS.map((w) => ({
                school_year: schoolYear,
                term: w.term,
                week_number: w.week_number,
                deadline_date: w.deadline_date,
                description: `Week ${w.week_number} — Term ${w.term} Submission`,
                is_active: false,
                district_id: resolvedDistrictId,
            }));

            const { error } = await supabase
                .from("academic_calendar")
                .upsert(rows, { onConflict: "district_id,school_year,term,week_number" });

            if (error) {
                console.error("[calendar] Generate DepEd error:", error);
                addToast(
                    "error",
                    `Failed to generate calendar: ${error.message}`,
                );
                return;
            }

            addToast(
                "success",
                "DepEd SY 2026-2027 calendar generated. Weeks are scheduled (closed) — open them as needed.",
            );
            await loadDeadlines();
        } finally {
            generating = false;
        }
    }
</script>

<div class="max-w-4xl mx-auto">
    <!-- Header -->
    <div
        class="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6"
    >
        <div>
            <h1 class="text-3xl font-semibold text-text-primary tracking-tight">
                Academic Calendar
            </h1>
            <p class="text-base text-text-secondary mt-1 font-medium max-w-lg">
                Manage submission deadlines and institutional timeline for the
                current school year.
            </p>
        </div>

        <div class="flex items-center gap-2">
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                class="relative"
                onclick={(e) => e.stopPropagation()}
                onkeydown={() => {}}
                role="presentation"
            >
                <button
                    type="button"
                    onclick={() => { yearOpen = !yearOpen; termOpen = false; }}
                    class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue sm:min-w-[140px] w-full sm:w-auto"
                >
                    <span>{schoolYear}</span>
                    <svg class="w-4 h-4 transition-transform {yearOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                {#if yearOpen}
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-hidden"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={() => {}}
                        role="listbox"
                    >
                        {#each schoolYears as sy}
                            <button
                                type="button"
                                onclick={() => { schoolYear = sy; yearOpen = false; }}
                                class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {schoolYear === sy ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                role="option"
                                aria-selected={schoolYear === sy}
                            >
                                {sy}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <div
                class="relative"
                onclick={(e) => e.stopPropagation()}
                onkeydown={() => {}}
                role="presentation"
            >
                <button
                    type="button"
                    onclick={() => { termOpen = !termOpen; yearOpen = false; }}
                    class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue sm:min-w-[130px] w-full sm:w-auto"
                >
                    <span>{terms.find(t => t.value === term)?.label || `Term ${term}`}</span>
                    <svg class="w-4 h-4 transition-transform {termOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                </button>
                {#if termOpen}
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-hidden"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={() => {}}
                        role="listbox"
                    >
                        {#each terms as t}
                            <button
                                type="button"
                                onclick={() => { term = t.value; termOpen = false; }}
                                class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {term === t.value ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                role="option"
                                aria-selected={term === t.value}
                            >
                                {t.label}
                            </button>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8" in:fade>
            {#each deadlines as d, i (d.week_number)}
                <div
                    class="gov-card-static p-8 group relative overflow-hidden"
                    in:fly={{ y: 20, delay: i * 50 }}
                >
                    <div class="flex items-center justify-between mb-8">
                        <div class="flex items-center gap-4">
                            <div
                                class="w-14 h-14 rounded-md bg-gov-blue text-white flex items-center justify-center font-semibold text-xl shadow-lg shadow-gov-blue/20"
                            >
                                {d.week_number}
                            </div>
                            <div>
                                <h3
                                    class="font-semibold text-text-primary text-lg"
                                >
                                    Week {d.week_number}
                                </h3>
                                <div class="flex items-center gap-1.5 mt-1">
                                    {#if d.is_active}
                                        <div
                                            class="flex items-center gap-1 text-[10px] font-semibold uppercase text-gov-green"
                                        >
                                            <CheckCircle2 size={10} />
                                            Open
                                        </div>
                                    {:else}
                                        <div
                                            class="flex items-center gap-1 text-[10px] font-semibold uppercase text-text-muted"
                                        >
                                            <Clock size={10} />
                                            Scheduled
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>

                        {#if canEdit}
                            <div class="flex items-center gap-2">
                                {#if d.id}
                                    <button
                                        onclick={() => toggleActive(d)}
                                        class="px-3 py-2 rounded-xl text-xs font-bold uppercase tracking-wide transition-colors shadow-sm flex items-center gap-1.5 {d.is_active
                                            ? 'bg-gov-green/10 text-gov-green hover:bg-gov-green hover:text-white'
                                            : 'bg-surface-muted text-text-muted border border-border-subtle hover:bg-gov-gold/10 hover:text-gov-gold-dark'}"
                                        title="Week {d.week_number} is {d.is_active ? 'open' : 'scheduled'} — click to {d.is_active ? 'close (hide from teachers)' : 'open this week to teachers'}"
                                    >
                                        {d.is_active ? "Open" : "Scheduled"}
                                    </button>
                                {/if}
                                <button
                                    onclick={() => saveWeek(d)}
                                    class="p-2.5 rounded-xl bg-gov-blue/5 text-gov-blue hover:bg-gov-blue hover:text-white active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out shadow-sm flex items-center justify-center"
                                    title="Save Week {d.week_number}"
                                >
                                    <Save size={20} strokeWidth={2.5} />
                                </button>
                            </div>
                        {/if}
                    </div>

                    <div class="space-y-4">
                        <div class="relative">
                            <label
                                class="absolute -top-2 left-3 px-1 bg-surface-white text-[10px] font-bold text-gov-blue uppercase tracking-wide z-10"
                                for="date-{i}"
                            >
                                Due Date
                            </label>
                            {#if canEdit}
                                <input
                                    id="date-{i}"
                                    type="date"
                                    bind:value={d.deadline_date}
                                    class="w-full px-4 py-3.5 bg-surface-muted border border-border-subtle rounded-md focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none text-sm font-semibold transition-colors"
                                />
                            {:else}
                                <p
                                    class="w-full px-4 py-3.5 bg-surface-muted border border-border-subtle rounded-md text-sm font-semibold text-text-primary"
                                >
                                    {d.deadline_date
                                        ? new Date(
                                              d.deadline_date + "T00:00:00",
                                          ).toLocaleDateString("en-PH", {
                                              weekday: "long",
                                              month: "long",
                                              day: "numeric",
                                              year: "numeric",
                                          })
                                        : "Not set"}
                                </p>
                            {/if}
                        </div>

                        <div class="relative">
                            <label
                                class="absolute -top-2 left-3 px-1 bg-surface-white text-[10px] font-bold text-text-muted uppercase tracking-wide z-10"
                                for="desc-{i}"
                            >
                                Notes / Purpose
                            </label>
                            {#if canEdit}
                                <input
                                    id="desc-{i}"
                                    type="text"
                                    bind:value={d.description}
                                    placeholder="e.g. DLL Submission..."
                                    class="w-full px-4 py-3.5 bg-surface-muted border border-border-subtle rounded-md focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none text-sm font-medium placeholder:text-text-muted transition-colors"
                                />
                            {:else}
                                <p
                                    class="w-full px-4 py-3.5 bg-surface-muted border border-border-subtle rounded-md text-sm font-medium text-text-secondary"
                                >
                                    {d.description || "—"}
                                </p>
                            {/if}
                        </div>
                    </div>
                </div>
            {/each}
        </div>

        {#if canEdit}
            <div
                class="mt-12 p-8 bg-surface border border-border-subtle rounded-[2.5rem] shadow-sm"
            >
                    <div class="flex items-start gap-4">
                        <div
                            class="p-2.5 rounded-xl bg-gov-blue/10 text-gov-blue group-hover:bg-gov-blue group-hover:text-white transition-colors"
                        >
                            <Info size={24} />
                        </div>
                        <div>
                            <h4 class="font-bold text-text-primary text-lg mb-1">
                                Operational Guidelines
                            </h4>
                            <p class="text-sm text-text-secondary leading-relaxed">
                                Each week is saved individually by clicking the <span
                                    class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-gov-blue/10 text-gov-blue font-bold text-[10px] uppercase"
                                    >Save</span
                                >
                                icon. Deadlines are set to
                                <strong>11:59 PM</strong> of the selected date. Submissions
                                after this will be marked as <strong>Late</strong>
                                automatically. Use the <strong>Scheduled</strong> / <strong
                                    >Open</strong
                                >
                                toggle to control whether a week is visible to teachers and
                                counted toward compliance.
                            </p>
                            <button
                                type="button"
                                onclick={() => generateFromDepEd()}
                                disabled={generating}
                                class="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gov-blue text-white text-sm font-bold hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                <CalendarDays size={18} />
                                {generating
                                    ? "Generating…"
                                    : "Generate from DepEd SY 2026-2027"}
                            </button>
                        </div>
                    </div>
            </div>
        {:else}
            <div
                class="mt-12 p-8 bg-surface border border-border-subtle rounded-[2.5rem] shadow-sm"
            >
                <div class="flex items-start gap-4">
                    <div
                        class="p-2.5 rounded-xl bg-gov-green/10 text-gov-green"
                    >
                        <CalendarDays size={24} />
                    </div>
                    <div>
                        <h4 class="font-bold text-text-primary text-lg mb-1">
                            Submission Protocols
                        </h4>
                        <p class="text-sm text-text-secondary leading-relaxed">
                            Submit your documents before the deadline to be
                            marked as
                            <strong>Compliant</strong>. Submissions after the
                            deadline are marked as <strong>Late</strong>. Contact your
                            supervisor if you need deadline adjustments.
                        </p>
                    </div>
                </div>
            </div>
        {/if}
</div>
