<script lang="ts">
    import { untrack } from 'svelte';
    import CedimsSelect from './CedimsSelect.svelte';
    import { focusTrap } from '$lib/actions/focusTrap';
    import { profile } from '$lib/utils/auth';
    import { supabase } from '$lib/utils/supabase';
    import { getCurrentSchoolYear } from '$lib/utils/schoolYear';
    import { isTeacherWideLeave, summarizeLeaveCoverage, type CalendarSlot, type ComplianceLoad, type LeaveRequest } from '$lib/utils/compliance';
    import { phDateKey } from '$lib/utils/deadlineRules';
    import { addDays, formatLeaveRange, isSchoolDay, mondayOf, nextLeaveSelection, rangesOverlap, schoolWeek, weekRangeLabel } from '$lib/utils/leaveDates';
    import { requestUploadTargets } from '$lib/utils/uploadTargets';

    let { loads, calendar, leaveRequests, initialDay = '', onClose, onSaved }: {
        loads: ComplianceLoad[];
        calendar: CalendarSlot[];
        leaveRequests: LeaveRequest[];
        initialDay?: string;
        onClose: () => void;
        onSaved: () => void;
    } = $props();

    const today = phDateKey(Date.now());
    // Read once: this dialog is created fresh each time it opens.
    const firstDay = untrack(() => initialDay && isSchoolDay(initialDay) ? initialDay : '');
    let weekStart = $state(mondayOf(firstDay || today));
    let startDate = $state(firstDay);
    let endDate = $state(firstDay);
    let leaveType = $state('Sick leave');
    let reason = $state('');
    let saving = $state(false);
    let error = $state('');

    const days = $derived(schoolWeek(weekStart));
    const coverage = $derived(startDate ? summarizeLeaveCoverage({ start_date: startDate, end_date: endDate }, loads, calendar) : null);
    const overlap = $derived(startDate ? leaveRequests.find(request => isTeacherWideLeave(request)
        && (request.status === 'pending' || request.status === 'approved')
        && rangesOverlap(startDate, endDate, request.start_date!, request.end_date!)) : undefined);

    function chooseDay(day: string) {
        const next = nextLeaveSelection(startDate, endDate, day);
        startDate = next.start;
        endDate = next.end;
        error = '';
    }

    async function submit() {
        const user = $profile;
        if (!user) return;
        if (!startDate) { error = 'Choose the day or days of your leave.'; return; }
        if (!reason.trim()) { error = 'Add a short reason so your reviewer can decide.'; return; }
        if (overlap) { error = `You already have a request for ${formatLeaveRange(overlap.start_date, overlap.end_date)}.`; return; }
        if (!navigator.onLine) { error = 'You are offline. Connect to the internet to send this request.'; return; }
        saving = true;
        error = '';
        try {
            const { data: existing, error: existingError } = await requestUploadTargets(signal => supabase
                .from('submission_leave_requests').select('start_date, end_date')
                .eq('user_id', user.id).is('teaching_load_id', null).in('status', ['pending', 'approved'])
                .abortSignal(signal), 20000);
            if (existingError) throw existingError;
            const clash = (existing || []).find((row: any) => rangesOverlap(startDate, endDate, row.start_date, row.end_date));
            if (clash) { error = `You already have a request for ${formatLeaveRange(clash.start_date, clash.end_date)}.`; return; }

            const slotIds = coverage?.slots.map(slot => slot.id) || [];
            if (slotIds.length) {
                const { data: live, error: liveError } = await requestUploadTargets(signal => supabase
                    .from('academic_calendar').select('id, term, week_number, is_active, deadline_date')
                    .in('id', slotIds).abortSignal(signal), 20000);
                if (liveError) throw liveError;
                // A week not opened yet can still be planned for. A week that has
                // already passed and been closed is settled history.
                const closed = (live || []).find((slot: any) => slot.is_active !== true && Date.parse(slot.deadline_date) < Date.now());
                if (closed) { error = `Term ${closed.term}, Week ${closed.week_number} is Closed in the Academic Calendar. Choose days in an Open week.`; return; }
            }

            const { error: insertError } = await requestUploadTargets(signal => supabase.from('submission_leave_requests').insert({
                user_id: user.id,
                school_id: user.school_id,
                district_id: user.district_id,
                school_year: coverage?.slots[0]?.school_year || calendar[0]?.school_year || getCurrentSchoolYear(),
                teaching_load_id: null,
                term_number: null,
                week_number: null,
                leave_type: leaveType,
                reason: reason.trim(),
                start_date: startDate,
                end_date: endDate,
                status: 'pending',
            }).abortSignal(signal), 30000);
            if (insertError) throw insertError;
            onSaved();
            onClose();
        } catch (failure: any) {
            error = failure?.code === '23502' || failure?.code === '23514'
                ? 'Leave by date is not active on the server yet. Ask your administrator to apply the latest database update.'
                : 'Your request was not sent because the connection failed. Check your internet and press Send request again.';
        } finally {
            saving = false;
        }
    }
</script>

<div class="backdrop" role="presentation">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="leave-title" tabindex="-1" use:focusTrap>
    <form onsubmit={(event) => { event.preventDefault(); void submit(); }}>
        <h3 id="leave-title">Request leave</h3>
        <p class="lead">Applies to all your subjects. A Master Teacher or your School Head reviews it.</p>

        <fieldset>
            <legend>Which days? Tap the first day, then the last day.</legend>
            <div class="week-nav">
                <button type="button" aria-label="Previous week" onclick={() => weekStart = addDays(weekStart, -7)}>←</button>
                <strong aria-live="polite">{weekRangeLabel(weekStart)}</strong>
                <button type="button" aria-label="Next week" onclick={() => weekStart = addDays(weekStart, 7)}>→</button>
            </div>
            <div class="days">
                {#each days as day (day.key)}
                    {@const selected = !!startDate && day.key >= startDate && day.key <= endDate}
                    <button type="button" class:selected class:today={day.key === today} aria-pressed={selected} aria-label={`${day.weekday}, ${day.date}`} onclick={() => chooseDay(day.key)}>
                        <span>{day.shortWeekday}</span>
                        <strong>{day.date}</strong>
                    </button>
                {/each}
            </div>
        </fieldset>

        <p class="range" aria-live="polite">{startDate ? formatLeaveRange(startDate, endDate) : 'No days chosen yet'}</p>

        {#if overlap}
            <p class="note warn">You already have a {overlap.status === 'approved' ? 'approved' : 'pending'} request for {formatLeaveRange(overlap.start_date, overlap.end_date)}.</p>
        {:else if coverage && coverage.count > 0}
            <div class="note">
                <p><strong>If approved, these required uploads will not count against you ({coverage.periods.join('; ')}):</strong></p>
                <p>{coverage.subjects.join(', ')}</p>
                <p class="muted">Supplementary uploads are not affected.</p>
            </div>
        {:else if coverage}
            <p class="note">No required upload is due on these days, so your compliance will not change. Your reviewer still sees this request.</p>
        {/if}

        <label>Leave type <CedimsSelect bind:value={leaveType} ariaLabel="Leave type" options={['Sick leave', 'Official travel', 'Emergency leave', 'Maternity/Paternity leave', 'Other'].map(label => ({ value: label, label }))} /></label>
        <label>Reason <textarea bind:value={reason} rows="3" placeholder="Example: Fever, advised to rest by the doctor."></textarea></label>
        {#if error}<p class="error" role="alert">{error}</p>{/if}
        <div class="actions">
            <button type="button" disabled={saving} onclick={onClose}>Cancel</button>
            <button class="primary" disabled={saving || !!overlap}>{saving ? 'Sending…' : 'Send request'}</button>
        </div>
    </form>
    </div>
</div>

<style>
    .backdrop { position: fixed; inset: 0; z-index: var(--z-modal, 50); display: grid; place-items: center; padding: 16px; overflow-y: auto; background: rgba(15, 23, 42, .45); }
    form { display: grid; gap: 14px; min-width: 0; }
    .dialog { width: min(560px, 100%); padding: 20px; border-radius: 10px; color: var(--color-text-primary); background: var(--color-surface-white); box-shadow: 0 18px 44px rgba(15, 23, 42, .25); }
    h3 { font-size: 20px; font-weight: 800; }
    .lead, .muted { color: var(--color-text-secondary); font-size: 14px; }
    fieldset { display: grid; gap: 10px; min-width: 0; border: 0; padding: 0; margin: 0; }
    legend { padding: 0; margin-bottom: 8px; font-size: 14px; font-weight: 800; }
    .week-nav { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .week-nav strong { font-size: 15px; text-align: center; }
    .week-nav button { width: 48px; min-height: 44px; border: 1px solid var(--color-border-subtle); border-radius: 8px; color: var(--color-gov-blue); background: var(--color-surface-white); font-size: 18px; font-weight: 800; }
    .days { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
    .days button { display: grid; gap: 2px; justify-items: center; min-height: 64px; padding: 8px 2px; border: 1px solid var(--color-border-subtle); border-radius: 8px; color: var(--color-text-primary); background: var(--color-surface-white); }
    .days button span { color: var(--color-text-secondary); font-size: 12px; font-weight: 700; text-transform: uppercase; }
    .days button strong { font-size: 14px; }
    .days button.today { border-color: var(--color-gov-blue); }
    .days button.selected { color: white; border-color: var(--color-gov-blue); background: var(--color-gov-blue); }
    .days button.selected span { color: white; }
    .range { font-size: 15px; font-weight: 800; }
    .note { display: grid; gap: 4px; padding: 10px 12px; border: 1px solid var(--color-border-subtle); border-radius: 8px; background: var(--color-surface-muted); font-size: 14px; line-height: 1.45; }
    .note.warn { color: var(--color-gov-gold-dark); border-color: var(--color-gov-gold); }
    label { display: grid; gap: 6px; font-size: 14px; font-weight: 800; }
    textarea { width: 100%; padding: 10px; border: 1px solid var(--color-border-subtle); border-radius: 6px; color: var(--color-text-primary); background: var(--color-surface-white); font-weight: 400; }
    .error { color: var(--color-gov-red); font-size: 14px; font-weight: 800; }
    .actions { display: flex; justify-content: end; gap: 10px; }
    .actions button { min-height: 48px; padding: 0 16px; border: 1px solid var(--color-border-subtle); border-radius: 6px; color: var(--color-text-primary); background: var(--color-surface-white); font-weight: 800; }
    .actions .primary { color: white; border-color: var(--color-gov-blue); background: var(--color-gov-blue); }
    .actions button:disabled { opacity: .5; }
    @media (max-width: 420px) { .dialog { padding: 16px; } .days button strong { font-size: 13px; } .actions button { flex: 1; } }
</style>
