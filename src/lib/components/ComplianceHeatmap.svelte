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

  function getCellBg(rate: number): string {
    if (rate >= 100) return "bg-gov-green/70";
    if (rate >= 50) return "bg-gov-gold/60";
    if (rate > 0) return "bg-gov-red/50";
    return "bg-surface-muted";
  }

  function getCellText(rate: number): string {
    if (rate >= 100) return "text-white";
    if (rate >= 50) return "text-text-secondary";
    if (rate > 0) return "text-white";
    return "text-text-muted";
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
                  cell?.rate || 0,
                )} {getCellText(
                  cell?.rate || 0,
                )} text-[10px] font-bold cursor-pointer"
                title={cell?.tooltip || `${row} â€” ${w.label}: No data`}
                onclick={() => onCellClick?.(row, w.week)}
              >
                {cell ? `${cell.rate}%` : "0%"}
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
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-green/70"></span> 100%
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-gold/60"></span> 50-99%
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-gov-red/50"></span> &lt;50%
  </span>
  <span class="flex items-center gap-2">
    <span class="w-2.5 h-2.5 rounded-sm bg-surface-muted"></span> No data
  </span>
</div>
