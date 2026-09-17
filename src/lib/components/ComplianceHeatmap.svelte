<script lang="ts">
  import { getComplianceColor } from "$lib/utils/useDashboardData";

  interface HeatmapCell {
    row: string;
    week: number;
    weekLabel: string;
    rate: number;
    count: number;
    tooltip: string;
  }

  interface Props {
    rows: string[];
    weeks: { week: number; label: string }[];
    cells: HeatmapCell[];
    onCellClick?: (row: string, week: number) => void;
  }

  let { rows, weeks, cells, onCellClick }: Props = $props();

  function getCellData(row: string, week: number): HeatmapCell | undefined {
    return cells.find((c) => c.row === row && c.week === week);
  }

  // Takes the cell itself, not a bare rate number: a missing cell (no
  // submission window existed yet) and a real 0%-compliance cell both used
  // to collapse into the same "rate || 0" branch below, so a genuinely
  // empty week and a fully-missed one looked identical. They now get
  // distinct fills, and the solid -dark backgrounds (vs. the previous
  // white/gray-text-on-tint pairing) clear 4.5:1 at this cell's ~10px size.
  function getCellBg(cell: HeatmapCell | undefined): string {
    if (!cell) return "bg-surface-muted border border-dashed border-text-muted";
    if (cell.rate >= 100) return "bg-gov-green-dark";
    if (cell.rate >= 50) return "bg-gov-gold-dark";
    return "bg-gov-red-dark";
  }

  function getCellText(cell: HeatmapCell | undefined): string {
    if (!cell) return "text-text-secondary";
    return "text-white";
  }

  function getCellLabel(cell: HeatmapCell | undefined): string {
    return cell ? `${cell.rate}%` : "—";
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-xs">
    <thead>
      <tr class="border-b border-border-subtle bg-surface-muted">
        <th
          class="sticky left-0 z-10 bg-surface-white/95 backdrop-blur px-3 py-3 text-left text-[10px] text-text-muted font-bold uppercase tracking-wider min-w-[140px] border-r border-border-subtle"
        >
          Institutional Units
        </th>
        {#each weeks as w}
          <th
            class="px-1 py-3 text-center text-[10px] text-text-muted font-bold uppercase tracking-wider min-w-[45px]"
          >
            {w.label}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody class="divide-y divide-border-subtle border-t border-border-subtle">
      {#each rows as row}
        <tr class="hover:bg-surface-muted transition-colors">
          <td
            class="sticky left-0 z-10 bg-surface-white/95 backdrop-blur px-3 py-2.5 font-bold text-[10px] text-text-primary truncate max-w-[160px] border-r border-border-subtle"
            title={row}
          >
            {row}
          </td>
          {#each weeks as w}
            {@const cell = getCellData(row, w.week)}
            <td class="p-0.5 text-center">
              <button
                class="w-full h-full py-2 px-1 rounded-sm transition-colors hover:brightness-95 {getCellBg(
                  cell,
                )} {getCellText(cell)} text-[10px] font-bold cursor-pointer"
                title={cell?.tooltip || `${row} — ${w.label}: No data recorded`}
                onclick={() => onCellClick?.(row, w.week)}
              >
                {getCellLabel(cell)}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if rows.length === 0}
  <div class="p-8 text-center text-text-muted">
    No data available for heatmap
  </div>
{/if}

<!-- Legend -->
<div
  class="flex items-center gap-6 mt-4 px-3 text-[10px] font-bold text-text-muted uppercase tracking-wider"
>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-green-dark"></span> 100%
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-gold-dark"></span> 50-99%
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-red-dark"></span> &lt;50% (incl. 0%)
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-surface-muted border border-dashed border-text-muted"></span> No data recorded
  </span>
</div>
