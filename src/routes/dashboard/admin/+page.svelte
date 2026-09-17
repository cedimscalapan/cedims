<script lang="ts">
    import { profile, resetPasswordForEmail } from "$lib/utils/auth";
    import { supabase } from "$lib/utils/supabase";
    import { logAudit } from "$lib/utils/audit";
    import { onMount } from "svelte";
    import { goto } from "$app/navigation";
    import { addToast } from "$lib/stores/toast";
    import { fly, fade, slide } from "svelte/transition";
    import {
        Settings,
        Users,
        Shield,
        UserCheck,
        UserX,
        ChevronDown,
        Search,
        RefreshCw,
        Eye,
        EyeOff,
        CalendarDays,
    } from "lucide-svelte";
    import AcademicCalendarManager from "$lib/components/AcademicCalendarManager.svelte";

    // â”€â”€ Settings State â”€â”€
    let settings = $state<any[]>([]);
    let loading = $state(true);
    let saving = $state(false);
    let message = $state({ text: "", type: "success" });
    let showPassword = $state(false);

    // â”€â”€ User Management State (WBS 19.1) â”€â”€
    let users = $state<any[]>([]);
    let loadingUsers = $state(true);
    let userSearch = $state("");
    let activeTab = $state<"settings" | "users" | "calendar">("settings");
    let roleChangeModal = $state<{
        open: boolean;
        user: any;
        newRole: string;
        newSchoolId: string;
        newDistrictId: string;
    }>({ open: false, user: null, newRole: "", newSchoolId: "", newDistrictId: "" });

    let roleOpen = $state(false);
    let editSchoolOpen = $state(false);
    let editDistrictOpen = $state(false);

    let showCreateUser = $state(false);
    let createRoleOpen = $state(false);
    let createDistrictOpen = $state(false);
    let createSchoolOpen = $state(false);
    let createForm = $state({
        email: '',
        password: '',
        fullName: '',
        role: 'Teacher',
        schoolId: '',
        districtId: ''
    });
    let schools = $state<any[]>([]);
    let districts = $state<any[]>([]);
    let creating = $state(false);

    const ROLES = [
        "Teacher",
        "School Head",
        "Master Teacher",
        "District Supervisor",
    ];

    // Guard: only District Supervisors (and the legacy "Admin" role, if any
    // profile still carries it) may view this panel. Runs reactively so it
    // also catches a profile that loads in after this page has mounted.
    $effect(() => {
        if (
            $profile &&
            $profile.role !== "District Supervisor" &&
            $profile.role !== "Admin"
        ) {
            addToast("error", "You don't have access to the Admin panel.");
            goto("/dashboard");
        }
    });

    onMount(() => {
        // Initial Load
        loadSettings();
        loadSchoolsAndDistricts().then(() => loadUsers()).then(() => {
            loading = false;
            loadingUsers = false;
        });

        // â”€â”€ Real-time Subscriptions (WBS 15.1/19.1) â”€â”€
        const profileSubscription = supabase
            .channel("admin-profiles")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "profiles",
                },
                () => {
                    loadUsers(); // Refresh on any profile change
                },
            )
            .subscribe();

        const settingsSubscription = supabase
            .channel("admin-settings")
            .on(
                "postgres_changes",
                {
                    event: "*",
                    schema: "public",
                    table: "system_settings",
                },
                () => {
                    loadSettings(); // Refresh on any setting change
                },
            )
            .subscribe();

        return () => {
            profileSubscription.unsubscribe();
            settingsSubscription.unsubscribe();
        };
    });

    // â”€â”€ Settings Functions â”€â”€
    async function loadSettings() {
        const { data } = await supabase.from("system_settings").select("*");
        const dbSettings = data || [];

        // Default settings if empty
        const defaultSettings = [
            {
                key: "submission_window_days",
                value: "5",
                description: "Days after week end to allow on-time submissions",
            },
            {
                key: "maintenance_mode",
                value: "false",
                description: "Disable all uploads for system maintenance",
            },
            {
                key: "enforce_ocr",
                value: "true",
                description: "Prevent submission if OCR metadata mismatch",
            },
            {
                key: "max_upload_size_mb",
                value: "2",
                description: "Global file size limit for uploads (Hard Limit)",
            },
        ];

        // Merge DB settings with defaults
        settings = defaultSettings.map((def) => {
            const dbRef = dbSettings.find((s) => s.key === def.key);
            return dbRef || def;
        });
    }

    async function saveSetting(key: string, value: string) {
        saving = true;
        const { error } = await supabase
            .from("system_settings")
            .upsert({ key, value, updated_at: new Date().toISOString() });

        if (error) {
            showMessage("Failed to save setting", "error");
        } else {
            showMessage(`Setting "${key}" updated successfully`, "success");
            logAudit($profile!.id, 'settings.updated', 'system_settings', key, { value });
        }
        saving = false;
    }

    // â”€â”€ User Management Functions (WBS 19.1) â”€â”€
    async function loadUsers() {
        const { data, error } = await supabase
            .from("profiles")
            .select(
                'id, full_name, email, role, is_active, created_at, school_id, district_id'
            )
            .order("full_name", { ascending: true });

        if (!error && data) {
            users = data.map((u: any) => ({
                ...u,
                school_name: schools.find((s: any) => s.id === u.school_id)?.name || '—',
                district_name: districts.find((d: any) => d.id === u.district_id)?.name || '—',
                is_active: u.is_active !== false,
            }));
        }
    }

    function openRoleChange(user: any) {
        roleChangeModal = {
            open: true,
            user,
            newRole: user.role,
            newSchoolId: user.school_id || "",
            newDistrictId: user.district_id || "",
        };
    }

    async function confirmRoleChange() {
        if (!roleChangeModal.user || !roleChangeModal.newRole) return;

        saving = true;
        const { error } = await supabase
            .from("profiles")
            .update({
                role: roleChangeModal.newRole,
                school_id: roleChangeModal.newSchoolId || null,
                district_id: roleChangeModal.newDistrictId || null,
            })
            .eq("id", roleChangeModal.user.id);

        if (error) {
            showMessage(`Failed to update role: ${error.message}`, "error");
        } else {
            showMessage(
                `${roleChangeModal.user.full_name} updated successfully`,
                "success",
            );
            logAudit($profile!.id, 'user.role_changed', 'user', roleChangeModal.user.id, {
                previous_role: roleChangeModal.user.role,
                new_role: roleChangeModal.newRole,
                school_id: roleChangeModal.newSchoolId || null,
                district_id: roleChangeModal.newDistrictId || null,
            });
            // Update local state
            const idx = users.findIndex(
                (u) => u.id === roleChangeModal.user.id,
            );
            if (idx >= 0) {
                users[idx].role = roleChangeModal.newRole;
                users[idx].school_id = roleChangeModal.newSchoolId || null;
                users[idx].district_id = roleChangeModal.newDistrictId || null;
                users[idx].school_name = schools.find((s: any) => s.id === roleChangeModal.newSchoolId)?.name || '—';
                users[idx].district_name = districts.find((d: any) => d.id === roleChangeModal.newDistrictId)?.name || '—';
            }
        }
        roleChangeModal = { open: false, user: null, newRole: "", newSchoolId: "", newDistrictId: "" };
        saving = false;
    }

    async function resetUserPassword(user: any) {
        if (!user.email) {
            showMessage("This user has no email on file", "error");
            return;
        }
        if (!confirm(`Send a password reset email to "${user.full_name}" (${user.email})?`)) return;
        saving = true;
        const { error } = await resetPasswordForEmail(user.email);
        saving = false;
        if (error) {
            showMessage(`Failed to send reset email: ${error}`, "error");
        } else {
            logAudit($profile!.id, 'user.password_reset_requested', 'user', user.id, {
                user_name: user.full_name,
                email: user.email
            });
            showMessage(`Password reset email sent to ${user.email}`, "success");
        }
    }

    async function toggleUserActive(user: any) {
        if (user.is_active && !confirm(`Deactivate user "${user.full_name}"? They will lose access to the system.`)) return;
        saving = true;
        const newStatus = !user.is_active;
        const { error } = await supabase
            .from("profiles")
            .update({ is_active: newStatus })
            .eq("id", user.id);

        if (error) {
            showMessage(
                `Failed to update user status: ${error.message}`,
                "error",
            );
        } else {
            logAudit($profile!.id, newStatus ? 'user.activated' : 'user.deactivated', 'user', user.id, {
                user_name: user.full_name
            });
            const idx = users.findIndex((u) => u.id === user.id);
            if (idx >= 0) users[idx].is_active = newStatus;
            showMessage(
                `${user.full_name} ${newStatus ? "activated" : "deactivated"}`,
                "success",
            );
        }
        saving = false;
    }

    async function loadSchoolsAndDistricts() {
        const [schoolRes, districtRes] = await Promise.all([
            supabase.from('schools').select('id, name, district_id').order('name'),
            supabase.from('districts').select('id, name').order('name')
        ]);
        if (!schoolRes.error) schools = schoolRes.data;
        if (!districtRes.error) districts = districtRes.data;
    }

    async function handleCreateUser() {
        if (!createForm.email || !createForm.password || !createForm.fullName) return;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(createForm.email)) {
            showMessage('Please enter a valid email address.', 'error');
            return;
        }
        creating = true;
        try {
            const session = await supabase.auth.getSession();
            const token = session.data.session?.access_token;
            if (!token) { showMessage('Not authenticated', 'error'); return; }

            const res = await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    email: createForm.email,
                    password: createForm.password,
                    fullName: createForm.fullName,
                    role: createForm.role,
                    schoolId: createForm.schoolId || null,
                    districtId: createForm.districtId || null
                })
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.message || 'Failed to create user');

            showMessage(`User ${createForm.fullName} created successfully`, 'success');
            showCreateUser = false;
            createForm = { email: '', password: '', fullName: '', role: 'Teacher', schoolId: '', districtId: '' };
            loadUsers();
        } catch (err: any) {
            showMessage(err.message, 'error');
        } finally {
            creating = false;
        }
    }

    // â”€â”€ Derived â”€â”€
    const filteredUsers = $derived(() => {
        const q = userSearch.toLowerCase().trim();
        if (!q) return users;
        return users.filter(
            (u: any) =>
                u.full_name?.toLowerCase().includes(q) ||
                u.email?.toLowerCase().includes(q) ||
                u.role?.toLowerCase().includes(q) ||
                u.school_name?.toLowerCase().includes(q),
        );
    });

    function showMessage(text: string, type: "success" | "error") {
        message = { text, type };
        setTimeout(() => (message = { text: "", type: "success" }), 3000);
    }

    function getRoleBadgeClass(role: string): string {
        switch (role) {
            case "District Supervisor":
                return "bg-gov-blue/10 text-gov-blue";
            case "School Head":
                return "bg-gov-green/10 text-gov-green";
            case "Master Teacher":
                return "bg-purple-100 text-purple-700";
            default:
                return "bg-surface-muted text-text-muted";
        }
    }
</script>

<svelte:head>
    <title>Admin Config â€” CEDIMS</title>
</svelte:head>

<div class="max-w-5xl mx-auto" role="main" aria-label="Admin Configuration">
    <div class="mb-8">
        <h1
            class="text-2xl font-bold text-text-primary uppercase tracking-tight flex items-center gap-2"
        >
            <Settings size={24} />
            Admin Configuration
        </h1>
        <p class="text-text-secondary mt-1">
            Manage system parameters and user accounts.
        </p>
    </div>

    <!-- Tab Navigation -->
    <div
        class="flex gap-1 p-1 bg-surface-muted rounded-md mb-8 max-w-md"
        role="tablist"
        aria-label="Admin sections"
    >
        <button
            onclick={() => (activeTab = "settings")}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-colors {activeTab ===
            'settings'
                ? 'bg-surface-white text-gov-blue shadow-sm'
                : 'text-text-muted hover:text-text-primary'}"
            role="tab"
            aria-selected={activeTab === "settings"}
            aria-controls="settings-panel"
            aria-label="Settings"
        >
            <Settings size={18} />
            <span class="hidden sm:inline">Settings</span>
        </button>
        <button
            onclick={() => (activeTab = "users")}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-colors {activeTab ===
            'users'
                ? 'bg-surface-white text-gov-blue shadow-sm'
                : 'text-text-muted hover:text-text-primary'}"
            role="tab"
            aria-selected={activeTab === "users"}
            aria-controls="users-panel"
            aria-label="Users"
        >
            <Users size={18} />
            <span class="hidden sm:inline">Users</span>
        </button>
        <button
            onclick={() => (activeTab = "calendar")}
            class="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-bold transition-colors {activeTab ===
            'calendar'
                ? 'bg-surface-white text-gov-blue shadow-sm'
                : 'text-text-muted hover:text-text-primary'}"
            role="tab"
            aria-selected={activeTab === "calendar"}
            aria-controls="calendar-panel"
            aria-label="Calendar"
        >
            <CalendarDays size={18} />
            <span class="hidden sm:inline">Calendar</span>
        </button>
    </div>

    <!-- Settings Tab -->
    {#if activeTab === "settings"}
        <div
            id="settings-panel"
            role="tabpanel"
            aria-labelledby="settings-tab"
            in:fade={{ duration: 200 }}
        >
                <div class="grid gap-6">
                    {#each settings as s}
                        <div
                            class="gov-card-static p-6 flex flex-col md:flex-row md:items-center justify-between gap-6"
                            in:fly={{ y: 20, duration: 400 }}
                        >
                            <div class="max-w-md">
                                <h3
                                    class="font-bold text-text-primary uppercase tracking-wider text-xs mb-1"
                                >
                                    {s.key.replace(/_/g, " ")}
                                </h3>
                                <p
                                    class="text-sm text-text-secondary leading-relaxed"
                                >
                                    {s.description ||
                                        "System-wide parameter governing platform behavior."}
                                </p>
                            </div>

                            <div class="flex items-center gap-3">
                                {#if s.key === "maintenance_mode" || s.key === "enforce_ocr"}
                                    <button
                                        class="w-14 h-8 rounded-full transition-colors relative {s.value ===
                                        'true'
                                            ? 'bg-gov-blue'
                                            : 'bg-surface-muted'}"
                                        onclick={() => {
                                            s.value =
                                                s.value === "true"
                                                    ? "false"
                                                    : "true";
                                            saveSetting(s.key, s.value);
                                        }}
                                        aria-label="Toggle {s.key.replace(
                                            /_/g,
                                            ' ',
                                        )}"
                                    >
                                        <div
                                            class="absolute top-1 w-6 h-6 rounded-full bg-surface-white transition-colors {s.value ===
                                            'true'
                                                ? 'left-7'
                                                : 'left-1'}"
                                        ></div>
                                    </button>
                                    <span
                                        class="text-sm font-bold {s.value ===
                                        'true'
                                            ? 'text-gov-blue'
                                            : 'text-text-muted'}"
                                    >
                                        {s.value === "true"
                                            ? "ENABLED"
                                            : "DISABLED"}
                                    </span>
                                {:else}
                                    <input
                                        type="text"
                                        bind:value={s.value}
                                        class="bg-surface-white border border-border-subtle rounded-lg px-3 py-2 text-sm font-bold w-24 focus:ring-2 focus:ring-gov-blue/20 outline-none"
                                        aria-label="{s.key.replace(
                                            /_/g,
                                            ' ',
                                        )} value"
                                    />
                                    <button
                                        onclick={() =>
                                            saveSetting(s.key, s.value)}
                                        disabled={saving}
                                        class="px-4 py-2 bg-gov-blue text-white rounded-lg text-xs font-bold hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out"
                                    >
                                        Update
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/each}
                </div>
        </div>
    {/if}

    <!-- User Management Tab (WBS 19.1) -->
    {#if activeTab === "users"}
        <div
            id="users-panel"
            role="tabpanel"
            aria-labelledby="users-tab"
            in:fade={{ duration: 200 }}
        >
            <!-- Search & Refresh & Create -->
            <div class="flex items-center gap-3 mb-6">
                <div class="relative flex-1 max-w-md">
                    <Search
                        size={16}
                        class="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                    />
                    <input
                        type="text"
                        bind:value={userSearch}
                        placeholder="Search by name, email, role, school..."
                        class="w-full pl-10 pr-4 py-2.5 text-sm bg-surface-white/60 border border-border-subtle rounded-xl outline-none focus:ring-2 focus:ring-gov-blue/20 min-h-[44px]"
                        aria-label="Search users"
                    />
                </div>
                <button
                    onclick={() => {
                        loadSchoolsAndDistricts();
                        showCreateUser = true;
                    }}
                    class="px-4 py-2.5 bg-gov-blue text-white rounded-xl text-xs font-bold hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out min-h-[44px] flex items-center gap-2"
                    aria-label="Create new user"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
                    Create User
                </button>
                <button
                    onclick={() => {
                        loadingUsers = true;
                        loadUsers().then(() => (loadingUsers = false));
                    }}
                    class="p-2.5 rounded-xl bg-surface-white/60 border border-border-subtle text-text-muted hover:text-gov-blue hover:border-gov-blue/30 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    aria-label="Refresh user list"
                >
                    <RefreshCw
                        size={16}
                        class={loadingUsers ? "animate-spin" : ""}
                    />
                </button>
            </div>

            <!-- User Stats -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {#each ROLES as role, i}
                    <div
                        class="gov-card-static p-4 text-center"
                        in:fly={{ y: 10, delay: i * 50 }}
                    >
                        <p class="text-2xl font-semibold text-text-primary">
                            {users.filter((u) => u.role === role).length}
                        </p>
                        <p
                            class="text-[10px] text-text-muted font-bold uppercase tracking-wide mt-1"
                        >
                            {role === "District Supervisor"
                                ? "Supervisors"
                                : role + "s"}
                        </p>
                    </div>
                {/each}
            </div>

            <!-- User Table -->
                <div class="gov-card-static overflow-hidden">
                    <div class="max-h-[65vh] overflow-y-auto">
                    <div class="overflow-x-auto">
                        <table
                            class="w-full text-sm"
                            aria-label="User management table"
                        >
                            <thead>
                                <tr
                                    class="bg-surface-muted border-b border-gray-100 text-left"
                                >
                                    <th
                                        class="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wider"
                                        >Name</th
                                    >
                                    <th
                                        class="px-4 py-3 font-semibold text-text-muted text-xs uppercase tracking-wider"
                                        >School</th
                                    >
                                    <th
                                        class="px-4 py-3 font-semibold text-text-muted text-xs uppercase tracking-wider text-center"
                                        >Role</th
                                    >
                                    <th
                                        class="px-4 py-3 font-semibold text-text-muted text-xs uppercase tracking-wider text-center"
                                        >Status</th
                                    >
                                    <th
                                        class="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wider text-right"
                                        >Actions</th
                                    >
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-border-subtle">
                                {#each filteredUsers() as user (user.id)}
                                    <tr
                                        class="hover:bg-surface-white/40 transition-colors {!user.is_active
                                            ? 'opacity-50'
                                            : ''}"
                                    >
                                        <td class="px-5 py-3.5">
                                            <p
                                                class="font-bold text-text-primary text-sm"
                                            >
                                                {user.full_name || "â€”"}
                                            </p>
                                            <p
                                                class="text-[11px] text-text-muted"
                                            >
                                                {user.email || "â€”"}
                                            </p>
                                        </td>
                                        <td class="px-4 py-3.5">
                                            <p
                                                class="text-xs text-text-secondary"
                                            >
                                                {user.school_name}
                                            </p>
                                            <p
                                                class="text-[10px] text-text-muted"
                                            >
                                                {user.district_name}
                                            </p>
                                        </td>
                                        <td class="px-4 py-3.5 text-center">
                                            <span
                                                class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider {getRoleBadgeClass(
                                                    user.role,
                                                )}"
                                            >
                                                <Shield size={10} />
                                                {user.role}
                                            </span>
                                        </td>
                                        <td class="px-4 py-3.5 text-center">
                                            {#if user.is_active}
                                                <span
                                                    class="inline-flex items-center gap-1 text-[10px] font-bold text-gov-green uppercase"
                                                >
                                                    <UserCheck size={12} />
                                                    Active
                                                </span>
                                            {:else}
                                                <span
                                                    class="inline-flex items-center gap-1 text-[10px] font-bold text-gov-red uppercase"
                                                >
                                                    <UserX size={12} />
                                                    Inactive
                                                </span>
                                            {/if}
                                        </td>
                                        <td class="px-5 py-3.5 text-right">
                                            <div
                                                class="flex items-center justify-end gap-2"
                                            >
                                                <button
                                                    onclick={() =>
                                                        openRoleChange(user)}
                                                    class="px-3 py-1.5 text-[10px] font-bold text-gov-blue border border-gov-blue/20 rounded-lg hover:bg-gov-blue/5 transition-colors min-h-[32px]"
                                                    aria-label="Manage {user.full_name}"
                                                >
                                                    Manage
                                                </button>
                                                <button
                                                    onclick={() =>
                                                        resetUserPassword(user)}
                                                    class="px-3 py-1.5 text-[10px] font-bold text-gov-gold-dark border border-gov-gold/30 rounded-lg hover:bg-gov-gold/10 transition-colors min-h-[32px]"
                                                    aria-label="Send password reset email to {user.full_name}"
                                                >
                                                    Reset Password
                                                </button>
                                                <button
                                                    onclick={() =>
                                                        toggleUserActive(user)}
                                                    class="px-3 py-1.5 text-[10px] font-bold rounded-lg transition-colors min-h-[32px] {user.is_active
                                                        ? 'text-gov-red border border-gov-red/20 hover:bg-gov-red/5'
                                                        : 'text-gov-green border border-gov-green/20 hover:bg-gov-green/5'}"
                                                    aria-label="{user.is_active
                                                        ? 'Deactivate'
                                                        : 'Activate'} {user.full_name}"
                                                >
                                                    {user.is_active
                                                        ? "Deactivate"
                                                        : "Activate"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                    </div>

                    {#if filteredUsers().length === 0}
                        <div class="p-12 text-center text-text-muted">
                            <Users size={32} class="mx-auto mb-3 opacity-30" />
                            <p class="text-sm font-medium">
                                No users match your search.
                            </p>
                        </div>
                    {/if}
                </div>

                <p class="text-xs text-text-muted mt-3 text-center">
                    {filteredUsers().length} of {users.length} users shown
                </p>
        </div>
    {/if}

    <!-- Toast Message -->
    {#if message.text}
        <div
            class="fixed bottom-24 right-8 px-6 py-4 rounded-md shadow-sm {message.type ===
            'success'
                ? 'bg-gov-green/10 text-gov-green'
                : 'bg-gov-red/10 text-gov-red'} flex items-center gap-3 font-bold text-sm z-[var(--z-toast)]"
            in:fly={{ x: 50 }}
            out:fade
            role="alert"
        >
            <span
                class="w-6 h-6 rounded-full bg-surface-white flex items-center justify-center text-[10px] shadow-sm"
            >
                {message.type === "success" ? "OK" : "!!"}
            </span>
            {message.text}
        </div>
    {/if}
</div>

<!-- Role Change Modal -->
{#if roleChangeModal.open}
    <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[var(--z-modal)] flex items-center justify-center p-6"
        transition:fade={{ duration: 200 }}
        role="dialog"
        aria-modal="true"
        aria-label="Manage user"
    >
        <div
            class="bg-surface-white rounded-3xl shadow-sm w-full max-w-md overflow-hidden"
            in:fly={{ y: 30, duration: 300 }}
        >
            <div class="p-6 border-b border-gray-100">
                <h3 class="text-lg font-bold text-text-primary">
                    Manage User
                </h3>
                <p class="text-sm text-text-secondary mt-1">
                    Update details for <strong
                        >{roleChangeModal.user?.full_name}</strong
                    >
                </p>
            </div>

            <div class="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div>
                    <label
                        for="role-select"
                        class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-2"
                        >Role (current: {roleChangeModal.user?.role})</label
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
                            onclick={() => { roleOpen = !roleOpen; editSchoolOpen = false; editDistrictOpen = false; }}
                            class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                        >
                            <span>{roleChangeModal.newRole || "Select Role"}</span>
                            <svg class="w-4 h-4 transition-transform {roleOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if roleOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-hidden"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                {#each ROLES as r}
                                    <button
                                        type="button"
                                        onclick={() => { roleChangeModal.newRole = r; roleOpen = false; }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {roleChangeModal.newRole === r ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={roleChangeModal.newRole === r}
                                    >
                                        {r}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <div>
                    <label
                        class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-2"
                        >District</label
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
                            onclick={() => { editDistrictOpen = !editDistrictOpen; editSchoolOpen = false; roleOpen = false; }}
                            class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                        >
                            <span>{roleChangeModal.newDistrictId ? (districts.find(d => d.id === roleChangeModal.newDistrictId)?.name || roleChangeModal.newDistrictId) : '-- No District --'}</span>
                            <svg class="w-4 h-4 transition-transform {editDistrictOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if editDistrictOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto max-h-48"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                <button
                                    type="button"
                                    onclick={() => { roleChangeModal.newDistrictId = ""; roleChangeModal.newSchoolId = ""; editDistrictOpen = false; }}
                                    class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors text-text-muted"
                                    role="option"
                                    aria-selected={!roleChangeModal.newDistrictId}
                                >
                                    -- No District --
                                </button>
                                {#each districts as d}
                                    <button
                                        type="button"
                                        onclick={() => { roleChangeModal.newDistrictId = d.id; roleChangeModal.newSchoolId = ""; editDistrictOpen = false; }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {roleChangeModal.newDistrictId === d.id ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={roleChangeModal.newDistrictId === d.id}
                                    >
                                        {d.name}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                <div>
                    <label
                        class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-2"
                        >School</label
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
                            onclick={() => { editSchoolOpen = !editSchoolOpen; editDistrictOpen = false; roleOpen = false; }}
                            class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                        >
                            <span>{roleChangeModal.newSchoolId ? (schools.find(s => s.id === roleChangeModal.newSchoolId)?.name || roleChangeModal.newSchoolId) : '-- No School --'}</span>
                            <svg class="w-4 h-4 transition-transform {editSchoolOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if editSchoolOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto max-h-48"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                <button
                                    type="button"
                                    onclick={() => { roleChangeModal.newSchoolId = ""; editSchoolOpen = false; }}
                                    class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors text-text-muted"
                                    role="option"
                                    aria-selected={!roleChangeModal.newSchoolId}
                                >
                                    -- No School --
                                </button>
                                {#each schools as s}
                                    <button
                                        type="button"
                                        onclick={() => { roleChangeModal.newSchoolId = s.id; editSchoolOpen = false; }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {roleChangeModal.newSchoolId === s.id ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={roleChangeModal.newSchoolId === s.id}
                                    >
                                        {s.name}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>

                {#if roleChangeModal.newRole !== roleChangeModal.user?.role}
                    <div
                        class="p-3 bg-gov-gold/10 rounded-xl border border-gov-gold/20 text-xs text-text-secondary"
                        role="alert"
                    >
                        <strong class="text-gov-gold-dark">Warning:</strong>
                        Changing role from
                        <strong>{roleChangeModal.user?.role}</strong> to
                        <strong>{roleChangeModal.newRole}</strong> will update this
                        user's access permissions immediately.
                    </div>
                {/if}
            </div>

            <div
                class="p-6 border-t border-gray-100 flex items-center justify-end gap-3"
            >
                <button
                    onclick={() =>
                        (roleChangeModal = {
                            open: false,
                            user: null,
                            newRole: "",
                            newSchoolId: "",
                            newDistrictId: "",
                        })}
                    class="px-5 py-2.5 text-sm font-bold text-text-muted hover:text-text-primary transition-colors min-h-[44px]"
                >
                    Cancel
                </button>
                <button
                    onclick={confirmRoleChange}
                    disabled={saving ||
                        (roleChangeModal.newRole === roleChangeModal.user?.role &&
                        (roleChangeModal.newSchoolId || "") === (roleChangeModal.user?.school_id || "") &&
                        (roleChangeModal.newDistrictId || "") === (roleChangeModal.user?.district_id || ""))}
                    class="px-5 py-2.5 bg-gov-blue text-white rounded-xl text-sm font-bold hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out disabled:opacity-40 min-h-[44px]"
                >
                    {saving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    </div>
{/if}

<!-- Calendar Tab -->
{#if activeTab === "calendar"}
    <div id="calendar-panel" role="tabpanel" in:fade={{ duration: 200 }}>
        <AcademicCalendarManager />
    </div>
{/if}

<!-- Create User Modal -->
{#if showCreateUser}
    <div
        class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[var(--z-modal)] flex items-center justify-center p-6"
        transition:fade={{ duration: 200 }}
        role="dialog"
        aria-modal="true"
        aria-label="Create new user"
    >
        <div
            class="bg-surface-white rounded-3xl shadow-sm w-full max-w-lg overflow-hidden"
            in:fly={{ y: 30, duration: 300 }}
        >
            <div class="p-6 border-b border-border-subtle">
                <h3 class="text-lg font-bold text-text-primary">
                    Create New User
                </h3>
                <p class="text-sm text-text-secondary mt-1">
                    Create a new account with email and password. The user will be able to log in immediately.
                </p>
            </div>

            <form
                class="p-6 space-y-4"
                onsubmit={(e) => { e.preventDefault(); handleCreateUser(); }}
            >
                <div>
                    <label for="create-fullname" class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">Full Name</label>
                    <input
                        id="create-fullname"
                        type="text"
                        bind:value={createForm.fullName}
                        placeholder="e.g. Juan Dela Cruz"
                        class="w-full px-4 py-2.5 text-sm bg-surface-muted border border-border-subtle rounded-xl outline-none focus:ring-2 focus:ring-gov-blue/20 min-h-[44px]"
                        required
                    />
                </div>
                <div>
                    <label for="create-email" class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">Email</label>
                    <input
                        id="create-email"
                        type="email"
                        bind:value={createForm.email}
                        placeholder="e.g. juan.delacruz@deped.gov.ph"
                        class="w-full px-4 py-2.5 text-sm bg-surface-muted border border-border-subtle rounded-xl outline-none focus:ring-2 focus:ring-gov-blue/20 min-h-[44px]"
                        required
                    />
                </div>
                <div>
                    <label for="create-password" class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">Password</label>
                    <div class="relative">
                        <input
                            id="create-password"
                            type={showPassword ? "text" : "password"}
                            bind:value={createForm.password}
                            placeholder="At least 6 characters"
                            class="w-full px-4 py-2.5 text-sm bg-surface-muted border border-border-subtle rounded-xl outline-none focus:ring-2 focus:ring-gov-blue/20 min-h-[44px] pr-10"
                            minlength="6"
                            required
                        />
                        <button
                            type="button"
                            onclick={() => showPassword = !showPassword}
                            class="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors p-1"
                            tabindex="-1"
                            aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                            {#if showPassword}
                                <EyeOff size={16} />
                            {:else}
                                <Eye size={16} />
                            {/if}
                        </button>
                    </div>
                </div>
                <div class="grid grid-cols-2 gap-4">
                    <div>
                        <label class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">Role</label>
                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                        <div
                            class="relative"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={() => {}}
                            role="presentation"
                        >
                            <button
                                type="button"
                                onclick={() => { createRoleOpen = !createRoleOpen; createDistrictOpen = false; createSchoolOpen = false; }}
                                class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                            >
                                <span>{createForm.role}</span>
                                <svg class="w-4 h-4 transition-transform {createRoleOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </button>
                            {#if createRoleOpen}
                                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                <div
                                    class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-hidden"
                                    onclick={(e) => e.stopPropagation()}
                                    onkeydown={() => {}}
                                    role="listbox"
                                >
                                    {#each ROLES as r}
                                        <button
                                            type="button"
                                            onclick={() => { createForm.role = r; createRoleOpen = false; }}
                                            class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {createForm.role === r ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                            role="option"
                                            aria-selected={createForm.role === r}
                                        >
                                            {r}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">District</label>
                        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                        <div
                            class="relative"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={() => {}}
                            role="presentation"
                        >
                            <button
                                type="button"
                                onclick={() => { createDistrictOpen = !createDistrictOpen; createRoleOpen = false; createSchoolOpen = false; }}
                                class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                            >
                                <span>{createForm.districtId ? (districts.find(d => d.id === createForm.districtId)?.name || createForm.districtId) : '-- Select District --'}</span>
                                <svg class="w-4 h-4 transition-transform {createDistrictOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                                </svg>
                            </button>
                            {#if createDistrictOpen}
                                <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                                <div
                                    class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto max-h-48"
                                    onclick={(e) => e.stopPropagation()}
                                    onkeydown={() => {}}
                                    role="listbox"
                                >
                                    {#each districts as d}
                                        <button
                                            type="button"
                                            onclick={() => { createForm.districtId = d.id; createDistrictOpen = false; }}
                                            class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {createForm.districtId === d.id ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                            role="option"
                                            aria-selected={createForm.districtId === d.id}
                                        >
                                            {d.name}
                                        </button>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    </div>
                </div>
                <div>
                    <label class="block text-xs font-bold text-text-muted uppercase tracking-wide mb-1.5">School</label>
                    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                    <div
                        class="relative"
                        onclick={(e) => e.stopPropagation()}
                        onkeydown={() => {}}
                        role="presentation"
                    >
                        <button
                            type="button"
                            onclick={() => { createSchoolOpen = !createSchoolOpen; createRoleOpen = false; createDistrictOpen = false; }}
                            class="px-4 py-2.5 text-sm font-bold text-left bg-surface-white border border-border-subtle rounded-xl min-h-[42px] flex items-center justify-between gap-3 text-gov-blue w-full"
                        >
                            <span>{createForm.schoolId ? (schools.find(s => s.id === createForm.schoolId)?.name || createForm.schoolId) : '-- Select School --'}</span>
                            <svg class="w-4 h-4 transition-transform {createSchoolOpen ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                            </svg>
                        </button>
                        {#if createSchoolOpen}
                            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
                            <div
                                class="absolute z-50 mt-1 w-full bg-surface-white border border-border-subtle rounded-xl shadow-lg overflow-y-auto max-h-48"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={() => {}}
                                role="listbox"
                            >
                                {#each schools as s}
                                    <button
                                        type="button"
                                        onclick={() => { createForm.schoolId = s.id; createSchoolOpen = false; }}
                                        class="w-full text-left px-4 py-3 text-sm hover:bg-gov-blue/5 transition-colors {createForm.schoolId === s.id ? 'bg-gov-blue/10 font-bold text-gov-blue' : 'text-text-primary'}"
                                        role="option"
                                        aria-selected={createForm.schoolId === s.id}
                                    >
                                        {s.name}
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </div>
                </div>
            </form>

            <div class="p-6 border-t border-border-subtle flex items-center justify-end gap-3">
                <button
                    onclick={() => { showCreateUser = false; }}
                    class="px-5 py-2.5 text-sm font-bold text-text-muted hover:text-text-primary transition-colors min-h-[44px]"
                >
                    Cancel
                </button>
                <button
                    onclick={handleCreateUser}
                    disabled={creating || !createForm.email || !createForm.password || !createForm.fullName}
                    class="px-5 py-2.5 bg-gov-blue text-white rounded-xl text-sm font-bold hover:bg-gov-blue-dark active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out disabled:opacity-40 min-h-[44px]"
                >
                    {creating ? "Creating..." : "Create User"}
                </button>
            </div>
        </div>
    </div>
{/if}

