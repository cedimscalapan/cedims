<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import { addToast } from "$lib/stores/toast";
    import { onMount } from "svelte";
    import {
        Save,
        Clock,
        CheckCircle2,
        Info,
        CalendarDays,
    } from "lucide-svelte";
    import DatePicker from "$lib/components/DatePicker.svelte";

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
    let loadingWeeks = $state(false);
    let loadRequest = 0;
    let resolvedDistrictId = $state<string | null>(null);
    let availableDistricts = $state<{ id: string; name: string }[]>([]);
    let yearOpen = $state(false);
    let termOpen = $state(false);

    const schoolYears = ["2026-2027", "2027-2028"];
    const WEEKS_PER_TERM = 14;

    const terms = [
        { value: 1, label: "1st Term" },
        { value: 2, label: "2nd Term" },
        { value: 3, label: "3rd Term" },
    ];

    const isAdmin = $derived($profile?.role === "Admin");
    const canEdit = $derived(isAdmin);

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
            } else if (isAdmin) {
                const { data, error } = await supabase
                    .from("districts")
                    .select("id, name")
                    .order("name");
                if (error) throw error;
                availableDistricts = data || [];
                resolvedDistrictId = availableDistricts[0]?.id || null;
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

        const request = ++loadRequest;
        loadingWeeks = true;
        deadlines = [];
        const districtId = resolvedDistrictId;
        const selectedYear = schoolYear;
        const selectedTerm = term;
        const { data, error } = await supabase
            .from("academic_calendar")
            .select("*")
            .eq("school_year", selectedYear)
            .eq("district_id", districtId)
            .order("week_number", { ascending: true });

        if (request !== loadRequest || districtId !== resolvedDistrictId || selectedYear !== schoolYear || selectedTerm !== term) return;
        loadingWeeks = false;
        if (error) {
            console.error("[calendar] Error loading calendar:", error);
            addToast("error", "Failed to load calendar weeks");
            return;
        }

        deadlines = (data || [])
            .filter((row) => row.term === selectedTerm)
            .map((row) => ({
                id: row.id,
                week_number: row.week_number,
                deadline_date: row.deadline_date ? dateInManila(row.deadline_date) : "",
                description: row.description || "",
                is_active: row.is_active,
            }));
    }

    function dateInManila(value: string): string {
        const parts = new Intl.DateTimeFormat("en-US", {
            timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
        }).formatToParts(new Date(value));
        const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
        return `${part("year")}-${part("month")}-${part("day")}`;
    }

    function selectedDeadlineIso(dateValue: string): string {
        return new Date(`${dateValue}T10:00:00+08:00`).toISOString();
    }

    async function saveWeek(weekData: Deadline) {
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

        if (!weekData.id || !weekData.deadline_date) {
            addToast("error", "Please set a deadline date for this week");
            return;
        }

        const payload = {
            deadline_date: selectedDeadlineIso(weekData.deadline_date),
            description: weekData.description,
        };

        const { data, error } = await supabase
            .from("academic_calendar")
            .update(payload)
            .eq("id", weekData.id)
            .eq("district_id", resolvedDistrictId)
            .select();

        if (error) {
            console.error("[calendar] Save error:", error);
            addToast(
                "error",
                `Failed to save Week ${weekData.week_number}: ${error.message}`,
            );
        } else {
            if (data && data[0]) {
                addToast("success", `Week ${weekData.week_number} deadline saved successfully`);
            } else {
                addToast("error", `Week ${weekData.week_number} could not be updated. Refresh and try again.`);
            }
        }
    }

    $effect(() => {
        if (schoolYear && term && resolvedDistrictId) {
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
                `Failed to ${next ? "open" : "close"} Week ${d.week_number}: ${error.message}`,
            );
            return;
        }

        d.is_active = next;
        addToast(
            "success",
            next
                ? `Week ${d.week_number} is now open for submissions (visible to teachers)`
                : `Week ${d.week_number} is now closed (hidden from Upload)`,
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
                Review and update the {WEEKS_PER_TERM} saved weeks in each term.
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
                        role="listbox" tabindex="-1"
                    >
                        {#each schoolYears as sy}
                            <button
                                type="button"
                                onclick={() => { schoolYear = sy; yearOpen = false; }}
                                class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {schoolYear === sy ? 'bg-gov-blue/10 font-bold text-gov-blue-dark dark:text-gov-blue-light' : 'text-text-primary'}"
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
                        role="listbox" tabindex="-1"
                    >
                        {#each terms as t}
                            <button
                                type="button"
                                onclick={() => { term = t.value; termOpen = false; }}
                                class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {term === t.value ? 'bg-gov-blue/10 font-bold text-gov-blue-dark dark:text-[#5a8fde]' : 'text-text-primary'}"
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

        {#if canEdit && availableDistricts.length > 0}
            <div class="mb-6">
                <label for="calendar-district" class="block mb-2 text-sm font-semibold text-text-primary">District</label>
                <select
                    id="calendar-district"
                    bind:value={resolvedDistrictId}
                    class="w-full sm:w-auto min-w-64 px-4 py-3 bg-surface-white border border-border-subtle rounded-xl text-text-primary"
                >
                    {#each availableDistricts as district}
                        <option value={district.id}>{district.name}</option>
                    {/each}
                </select>
            </div>
        {/if}

        {#if !loading && !loadingWeeks && resolvedDistrictId && deadlines.length === 0}
            <p class="mb-8 p-6 rounded-xl border border-border-subtle text-sm text-text-secondary">
                No calendar weeks are stored for this term and school year.
            </p>
        {:else if !loading && !loadingWeeks && resolvedDistrictId && deadlines.length !== WEEKS_PER_TERM}
            <p class="mb-8 p-6 rounded-xl border border-border-subtle text-sm text-text-secondary">
                This term has {deadlines.length} of {WEEKS_PER_TERM} weeks in the database. Calendar setup is incomplete.
            </p>
        {/if}

        <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
            {#each deadlines as d, i (d.week_number)}
                <div
                    class="gov-card-static p-8 group relative"
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
                                            class="flex items-center gap-1 text-xs font-semibold uppercase text-gov-green-dark dark:text-[#4ade80]"
                                        >
                                            <CheckCircle2 size={10} />
                                            Open
                                        </div>
                                    {:else}
                                        <div
                                            class="flex items-center gap-1 text-xs font-semibold uppercase text-text-muted"
                                        >
                                            <Clock size={10} />
                                            Closed
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
                                            ? 'bg-gov-green/10 text-[#166534] dark:text-[#4ade80] hover:bg-gov-green hover:text-white'
                                            : 'bg-surface-muted text-text-muted border border-border-subtle hover:bg-gov-gold/10 hover:text-gov-gold-dark'}"
                                        title="Week {d.week_number} is {d.is_active ? 'Open' : 'Closed'}. Click to {d.is_active ? 'close (hide from Upload)' : 'open this week for Upload'}"
                                    >
                                        {d.is_active ? "Open" : "Closed"}
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
                                class="absolute -top-2 left-3 px-1 bg-surface-white text-xs font-bold text-gov-blue uppercase tracking-wide z-10"
                                for="date-{i}"
                            >
                                Due Date
                            </label>
                            {#if canEdit}
                                <DatePicker
                                    id="date-{i}"
                                    bind:value={d.deadline_date}
                                    placeholder="Select due date"
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
                                class="absolute -top-2 left-3 px-1 bg-surface-white text-xs font-bold text-text-muted uppercase tracking-wide z-10"
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
                                Each term has {WEEKS_PER_TERM} numbered weeks. Change a deadline date or note, then click that week's <span
                                    class="inline-flex items-center justify-center px-2 py-0.5 rounded bg-gov-blue/10 text-gov-blue-dark dark:text-[#5a8fde] font-bold text-xs uppercase"
                                    >Save</span
                                > icon. On-time status uses a <strong>10:00 AM Philippine time</strong>
                                cutoff on the applicable due date; some subjects have a different
                                due weekday. Later submissions are marked <strong>Late</strong>.
                                Use <strong>Open</strong> or <strong>Closed</strong> to control whether
                                teachers can upload for that week. Closing a week does not delete
                                its saved submissions or reviews.
                            </p>
                        </div>
                    </div>
            </div>
        {:else}
            <div
                class="mt-12 p-8 bg-surface border border-border-subtle rounded-[2.5rem] shadow-sm"
            >
                <div class="flex items-start gap-4">
                    <div
                        class="p-2.5 rounded-xl bg-gov-green/10 text-gov-green-dark dark:text-[#4ade80]"
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
