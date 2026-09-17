<script lang="ts">
    import { supabase } from "$lib/utils/supabase";
    import { profile } from "$lib/utils/auth";
    import { addToast } from "$lib/stores/toast";
    import { onMount } from "svelte";
    import { Edit, Trash2, Plus, BookOpen, Layers } from "lucide-svelte";
    import { fly } from "svelte/transition";

    interface TeachingLoad {
        id: string;
        grade_level: string;
        subject: string;
        is_active: boolean;
    }

    let loads = $state<TeachingLoad[]>([]);
    let loading = $state(true);
    let showModal = $state(false);
    let editingId = $state<string | null>(null);
    let gradeLevel = $state("Grade 1");
    let subject = $state("");
    let gradeOpen = $state(false);
    let subjectOpen = $state(false);
    let subjects = $state<string[]>([]);
    let availableSubjects = $state<string[]>([]);

    const gradeLevels = [
        "Grade 1",
        "Grade 2",
        "Grade 3",
        "Grade 4",
        "Grade 5",
        "Grade 6",
    ];

    async function loadSubjectsByGrade(grade: string) {
        const { data } = await supabase
            .from("curriculum_subjects")
            .select("subject")
            .eq("grade_level", grade)
            .order("sort_order");
        availableSubjects = (data || []).map((r: any) => r.subject);
    }

    onMount(async () => {
        await loadTeachingLoads();
        await loadSubjectsByGrade("Grade 1");
        loading = false;
    });

    async function loadTeachingLoads() {
        const user = $profile;
        if (!user?.id) return;

        const { data } = await supabase
            .from("teaching_loads")
            .select("*")
            .eq("user_id", user.id)
            .order("grade_level");

        loads = (data as TeachingLoad[]) || [];
    }

    function openAdd() {
        editingId = null;
        gradeLevel = "Grade 1";
        subject = "";
        gradeOpen = false;
        subjectOpen = false;
        loadSubjectsByGrade("Grade 1");
        showModal = true;
    }

    function openEdit(load: TeachingLoad) {
        editingId = load.id;
        gradeLevel = load.grade_level;
        subject = load.subject;
        gradeOpen = false;
        subjectOpen = false;
        loadSubjectsByGrade(load.grade_level);
        showModal = true;
    }

    async function handleSave() {
        if (!subject.trim()) {
            addToast("warning", "Please enter a subject");
            return;
        }

        if (editingId) {
            const { error } = await supabase
                .from("teaching_loads")
                .update({ grade_level: gradeLevel, subject: subject.trim() })
                .eq("id", editingId);
            if (error) {
                addToast("error", error.message);
                return;
            }
            addToast("success", "Teaching load updated");
        } else {
            const user = $profile;
            if (!user?.id) {
                addToast("error", "User session not found");
                return;
            }
            const { error } = await supabase.from("teaching_loads").insert({
                user_id: user.id,
                grade_level: gradeLevel,
                subject: subject.trim(),
            });
            if (error) {
                addToast("error", error.message);
                return;
            }
            addToast("success", "Teaching load added");
        }

        showModal = false;
        gradeOpen = false;
        subjectOpen = false;
        await loadTeachingLoads();
    }

    async function toggleActive(load: TeachingLoad) {
        const { error } = await supabase
            .from("teaching_loads")
            .update({ is_active: !load.is_active })
            .eq("id", load.id);
        if (error) {
            addToast("error", `Failed to update teaching load: ${error.message}`);
            return;
        }
        addToast("success", `${load.subject} is now ${!load.is_active ? "active" : "inactive"}`);
        await loadTeachingLoads();
    }

    async function handleDelete(id: string) {
        if (!confirm("Are you sure you want to remove this teaching load?"))
            return;
        await supabase.from("teaching_loads").delete().eq("id", id);
        addToast("success", "Teaching load removed");
        await loadTeachingLoads();
    }
</script>

<svelte:head>
    <title>Teaching Load â€” CEDIMS</title>
</svelte:head>

<div class="space-y-8">
    <!-- Header -->
    <div
        class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
    >
        <div>
            <h1 class="text-3xl font-bold text-text-primary tracking-tight">
                Teaching Load
            </h1>
            <p class="text-base text-text-secondary mt-1 font-medium">
                Manage your academic assignments and grade levels
            </p>
        </div>
        <button
            onclick={openAdd}
            class="px-6 py-3 bg-gov-blue text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-lg hover:shadow-gov-blue/20 transition-colors flex items-center gap-2 group"
        >
            <Plus
                size={16}
                class="group-hover:rotate-90 transition-transform"
            />
            Add New Load
        </button>
    </div>

    {#if loads.length === 0}
        <div
            class="bg-surface-muted backdrop-blur-md border border-dashed border-border-strong rounded-3xl p-20 text-center"
        >
            <div
                class="w-16 h-16 bg-gov-blue/10 text-gov-blue rounded-2xl flex items-center justify-center mx-auto mb-6"
            >
                <BookOpen size={32} strokeWidth={1.5} />
            </div>
            <p class="text-xl font-bold text-text-primary">
                No teaching loads configured
            </p>
            <p
                class="text-xs font-bold text-text-muted mt-2 uppercase tracking-widest"
            >
                ARCHIVE YOUR FIRST GRADE LEVEL & SUBJECT TO BEGIN
            </p>
            <button
                onclick={openAdd}
                class="mt-8 px-8 py-3 bg-gov-blue text-white text-xs font-bold uppercase tracking-widest rounded-xl shadow-md hover:bg-gov-blue-dark transition-colors"
            >
                Setup Initial Load
            </button>
        </div>
    {:else}
        <div
            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-h-[70vh] overflow-y-auto pr-1"
        >
            {#each loads as load}
                <div
                    class="bg-surface-white border border-border-subtle rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gov-blue/20 transition-colors group relative flex flex-col h-full"
                    in:fly={{ y: 20, duration: 400 }}
                >
                    <!-- Status Badge -->
                    <div class="absolute top-6 right-6">
                        <button
                            onclick={() => toggleActive(load)}
                            class="w-10 h-5.5 rounded-full relative transition-colors shadow-inner {load.is_active
                                ? 'bg-gov-green'
                                : 'bg-surface-muted'}"
                            aria-label="Toggle active status"
                            title={load.is_active ? "Active" : "Inactive"}
                        >
                            <span
                                class="absolute top-0.5 transition-colors w-4.5 h-4.5 rounded-full bg-surface-white shadow-sm {load.is_active
                                    ? 'translate-x-5'
                                    : 'translate-x-0.5'}"
                            ></span>
                        </button>
                    </div>

                    <div class="mb-6">
                        <div class="flex items-center gap-2 mb-3">
                            <Layers size={14} class="text-gov-blue" />
                            <span
                                class="px-2.5 py-1 bg-gov-blue/5 text-gov-blue text-[10px] font-bold uppercase tracking-widest rounded-full"
                            >
                                {load.grade_level}
                            </span>
                        </div>
                        <h4
                            class="text-lg font-bold text-text-primary leading-tight group-hover:text-gov-blue transition-colors"
                        >
                            {load.subject}
                        </h4>
                    </div>

                    <div
                        class="mt-auto pt-6 border-t border-gray-100 flex items-center justify-between"
                    >
                        <div class="flex items-center gap-2">
                            <span
                                class="text-[10px] font-bold text-text-muted uppercase tracking-tighter"
                                >Modified Recently</span
                            >
                        </div>
                        <div class="flex items-center gap-1">
                            <button
                                onclick={() => openEdit(load)}
                                class="p-2 text-text-muted hover:text-gov-blue hover:bg-gov-blue/5 rounded-lg transition-colors"
                                aria-label="Edit Load"
                                title="Edit Load"
                            >
                                <Edit size={16} strokeWidth={2} />
                            </button>
                            <button
                                onclick={() => handleDelete(load.id)}
                                class="p-2 text-text-muted hover:text-gov-red hover:bg-gov-red/5 rounded-lg transition-colors"
                                aria-label="Delete Load"
                                title="Delete Load"
                            >
                                <Trash2 size={16} strokeWidth={2} />
                            </button>
                        </div>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Modal -->
{#if showModal}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
        class="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center p-6"
        onclick={() => { showModal = false; gradeOpen = false; subjectOpen = false; }}
        onkeydown={(e) => { if (e.key === "Escape") { showModal = false; gradeOpen = false; subjectOpen = false; } }}
        role="dialog"
        tabindex="-1"
    >
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
            class="gov-card-static p-8 w-full max-w-md animate-slide-up"
            onclick={(e) => e.stopPropagation()}
            onkeydown={() => {}}
            role="document"
        >
            <h2 class="text-xl font-bold text-text-primary mb-6">
                {editingId ? "Edit" : "Add"} Teaching Load
            </h2>

            <div class="space-y-5">
                <div>
                    <label
                        class="block text-sm font-semibold text-text-primary mb-2"
                        >Grade Level</label
                    >
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        class="relative"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={() => {}}
                        role="presentation"
                    >
                        <button
                            type="button"
                            onclick={() => gradeOpen = !gradeOpen}
                            class="w-full px-4 py-3 text-base text-left bg-surface-white/60 border border-border-subtle rounded-xl min-h-[48px] flex items-center justify-between text-text-primary"
                        >
                            <span>{gradeLevel}</span>
                            <svg class="w-4 h-4 transition-transform {gradeOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if gradeOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                {#each gradeLevels as gl}
                                    <button
                                        type="button"
                                        onclick={() => { gradeLevel = gl; subject = ""; gradeOpen = false; loadSubjectsByGrade(gl); }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {gradeLevel === gl ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={gradeLevel === gl}
                                    >
                                        {gl}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <div>
                    <label
                        class="block text-sm font-semibold text-text-primary mb-2"
                        >Subject</label
                    >
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        class="relative"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={() => {}}
                        role="presentation"
                    >
                        <button
                            type="button"
                            onclick={() => subjectOpen = !subjectOpen}
                            class="w-full px-4 py-3 text-base text-left bg-surface-white/60 border border-border-subtle rounded-xl min-h-[48px] flex items-center justify-between {subject ? 'text-text-primary' : 'text-text-muted'}"
                        >
                            <span>{subject || "Select subject..."}</span>
                            <svg class="w-4 h-4 transition-transform {subjectOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if subjectOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto max-h-48"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                {#each availableSubjects as s}
                                    <button
                                        type="button"
                                        onclick={() => { subject = s; subjectOpen = false; }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {subject === s ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={subject === s}
                                    >
                                        {s}
                                    </button>
                                {/each}
                                {#if availableSubjects.length === 0}
                                    <div class="px-4 py-3 text-sm text-text-muted">No subjects available</div>
                                {/if}
                            </div>
                        {/if}
                    </div>
                </div>
            </div>

            <div class="flex gap-3 mt-8">
                <button
                    onclick={() => { showModal = false; gradeOpen = false; subjectOpen = false; }}
                    class="flex-1 py-3 border border-border-subtle text-text-secondary font-semibold rounded-xl min-h-[48px] hover:bg-surface-muted transition-colors"
                >
                    Cancel
                </button>
                <button
                    onclick={handleSave}
                    class="flex-1 py-3 bg-gradient-to-r from-gov-blue to-gov-blue-dark text-white font-semibold rounded-xl min-h-[48px] shadow-md hover:shadow-lg transition-colors"
                >
                    {editingId ? "Update" : "Add"}
                </button>
            </div>
        </div>
    </div>
{/if}

