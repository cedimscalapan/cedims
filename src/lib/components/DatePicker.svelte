<script lang="ts">
    import { fly } from "svelte/transition";
    import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-svelte";

    let {
        value = $bindable(""),
        id = "",
        disabled = false,
        placeholder = "Select date",
        min = "",
        max = "",
    }: {
        value: string;
        id?: string;
        disabled?: boolean;
        placeholder?: string;
        min?: string;
        max?: string;
    } = $props();

    let open = $state(false);
    let containerEl = $state<HTMLDivElement | undefined>(undefined);

    function parseIso(iso: string): Date | null {
        if (!iso) return null;
        const [y, m, d] = iso.split("-").map(Number);
        if (!y || !m || !d) return null;
        return new Date(y, m - 1, d);
    }

    function toIso(year: number, month: number, day: number): string {
        return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }

    const selectedDate = $derived(parseIso(value));
    const today = new Date();

    let viewYear = $state(today.getFullYear());
    let viewMonth = $state(today.getMonth());

    $effect(() => {
        const d = selectedDate;
        if (d) {
            viewYear = d.getFullYear();
            viewMonth = d.getMonth();
        }
    });

    const MONTH_NAMES = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

    const displayLabel = $derived(
        selectedDate
            ? selectedDate.toLocaleDateString("en-PH", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
              })
            : placeholder,
    );

    const minDate = $derived(parseIso(min));
    const maxDate = $derived(parseIso(max));

    type DayCell = { day: number; iso: string; inMonth: boolean; isToday: boolean; isSelected: boolean; isDisabled: boolean };

    const gridDays = $derived.by((): DayCell[] => {
        const firstOfMonth = new Date(viewYear, viewMonth, 1);
        const startWeekday = firstOfMonth.getDay();
        const daysInCurrent = new Date(viewYear, viewMonth + 1, 0).getDate();
        const daysInPrev = new Date(viewYear, viewMonth, 0).getDate();

        const cells: DayCell[] = [];

        const prevMonthIdx = viewMonth === 0 ? 11 : viewMonth - 1;
        const prevMonthYear = viewMonth === 0 ? viewYear - 1 : viewYear;
        for (let i = startWeekday - 1; i >= 0; i--) {
            const day = daysInPrev - i;
            cells.push(makeCell(day, prevMonthIdx, prevMonthYear, false));
        }
        for (let day = 1; day <= daysInCurrent; day++) {
            cells.push(makeCell(day, viewMonth, viewYear, true));
        }
        const nextMonthIdx = viewMonth === 11 ? 0 : viewMonth + 1;
        const nextMonthYear = viewMonth === 11 ? viewYear + 1 : viewYear;
        let trailingDay = 1;
        while (cells.length < 42) {
            cells.push(makeCell(trailingDay, nextMonthIdx, nextMonthYear, false));
            trailingDay += 1;
        }

        return cells;

        function makeCell(day: number, month: number, year: number, inMonth: boolean): DayCell {
            const iso = toIso(year, month, day);
            const cellDate = new Date(year, month, day);
            const isToday =
                cellDate.getFullYear() === today.getFullYear() &&
                cellDate.getMonth() === today.getMonth() &&
                cellDate.getDate() === today.getDate();
            const isSelected = !!selectedDate &&
                cellDate.getFullYear() === selectedDate.getFullYear() &&
                cellDate.getMonth() === selectedDate.getMonth() &&
                cellDate.getDate() === selectedDate.getDate();
            const isDisabled =
                (!!minDate && cellDate < minDate) || (!!maxDate && cellDate > maxDate);
            return { day, iso, inMonth, isToday, isSelected, isDisabled };
        }
    });

    function toggleOpen() {
        if (disabled) return;
        open = !open;
    }

    function selectDay(cell: DayCell) {
        if (cell.isDisabled) return;
        value = cell.iso;
        open = false;
    }

    function goToday() {
        const iso = toIso(today.getFullYear(), today.getMonth(), today.getDate());
        value = iso;
        viewYear = today.getFullYear();
        viewMonth = today.getMonth();
        open = false;
    }

    function clearDate() {
        value = "";
        open = false;
    }

    function prevMonth() {
        if (viewMonth === 0) {
            viewMonth = 11;
            viewYear -= 1;
        } else {
            viewMonth -= 1;
        }
    }

    function nextMonth() {
        if (viewMonth === 11) {
            viewMonth = 0;
            viewYear += 1;
        } else {
            viewMonth += 1;
        }
    }

    function handleWindowClick(e: MouseEvent) {
        if (!open) return;
        if (containerEl && e.target instanceof Node && !containerEl.contains(e.target)) {
            open = false;
        }
    }

    function handleWindowKeydown(e: KeyboardEvent) {
        if (open && e.key === "Escape") open = false;
    }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleWindowKeydown} />

<div class="relative" bind:this={containerEl}>
    <button
        type="button"
        {id}
        {disabled}
        onclick={toggleOpen}
        class="w-full px-4 py-3.5 bg-surface-muted border border-border-subtle rounded-md focus:ring-2 focus:ring-gov-blue/20 focus:border-gov-blue outline-none text-sm font-semibold transition-colors flex items-center justify-between gap-2 text-left disabled:opacity-60 disabled:cursor-not-allowed {value ? 'text-text-primary' : 'text-text-muted'}"
        aria-haspopup="dialog"
        aria-expanded={open}
    >
        <span class="truncate">{displayLabel}</span>
        <CalendarDays size={16} class="text-gov-blue flex-shrink-0" />
    </button>

    {#if open}
        <div
            class="absolute z-50 mt-2 w-[300px] bg-surface-white border border-border-subtle rounded-2xl shadow-lg p-4"
            transition:fly={{ y: -6, duration: 140 }}
            role="dialog"
            aria-label="Choose date"
        >
            <div class="flex items-center justify-between mb-3">
                <button
                    type="button"
                    onclick={prevMonth}
                    class="p-1.5 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
                    aria-label="Previous month"
                >
                    <ChevronLeft size={18} />
                </button>
                <span class="text-sm font-bold text-text-primary">
                    {MONTH_NAMES[viewMonth]} {viewYear}
                </span>
                <button
                    type="button"
                    onclick={nextMonth}
                    class="p-1.5 rounded-lg text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
                    aria-label="Next month"
                >
                    <ChevronRight size={18} />
                </button>
            </div>

            <div class="grid grid-cols-7 gap-1 mb-1">
                {#each WEEKDAY_LABELS as wd}
                    <div class="text-center text-[10px] font-bold uppercase text-text-muted py-1">
                        {wd}
                    </div>
                {/each}
            </div>

            <div class="grid grid-cols-7 gap-1">
                {#each gridDays as cell}
                    <button
                        type="button"
                        onclick={() => selectDay(cell)}
                        disabled={cell.isDisabled}
                        class="aspect-square rounded-lg text-xs font-semibold flex items-center justify-center transition-colors
                            {cell.isSelected
                                ? 'bg-gov-blue text-white'
                                : cell.isToday
                                  ? 'bg-gov-blue/10 text-gov-blue'
                                  : cell.inMonth
                                    ? 'text-text-primary hover:bg-surface-muted'
                                    : 'text-text-muted/40 hover:bg-surface-muted'}
                            {cell.isDisabled ? 'opacity-30 cursor-not-allowed hover:bg-transparent' : ''}"
                    >
                        {cell.day}
                    </button>
                {/each}
            </div>

            <div class="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
                <button
                    type="button"
                    onclick={clearDate}
                    class="text-xs font-bold text-text-muted hover:text-text-primary transition-colors"
                >
                    Clear
                </button>
                <button
                    type="button"
                    onclick={goToday}
                    class="text-xs font-bold text-gov-blue hover:text-gov-blue-dark transition-colors"
                >
                    Today
                </button>
            </div>
        </div>
    {/if}
</div>
