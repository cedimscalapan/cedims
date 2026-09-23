<script lang="ts">
  interface HeatmapCell {
    row: string;
    week: number;
    weekLabel?: string;
    rate: number;
    count?: number;
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

  // One hue at rising intensity (a magnitude scale), not the old red/gold/green
  // split (a status scale): "how much got submitted" and "is this okay" are
  // different questions, and folding both into one ramp is what made the old
  // heatmap read as a grade sheet. A missing cell (no submission window yet)
  // still gets its own dashed, colorless fill so it stays visibly different
  // from a real 0%-compliance week.
  function getCellFill(cell: HeatmapCell | undefined): string {
    if (!cell) return "bg-surface-muted border border-dashed border-border-subtle";
    if (cell.rate >= 100) return "bg-gov-green-dark";
    if (cell.rate >= 75) return "bg-gov-green";
    if (cell.rate >= 50) return "bg-gov-green/55";
    if (cell.rate > 0) return "bg-gov-green/25";
    return "bg-gov-green/10";
  }
</script>

<div class="min-w-max">
  <table class="border-separate heatmap-table" style="border-spacing: 2px;">
    <thead>
      <tr>
        <th class="sticky left-0 top-0 z-20 bg-surface-white px-2 py-1 min-w-[180px]"></th>
        {#each weeks as w}
          <th class="sticky top-0 z-10 bg-surface-white px-0 py-1 text-center text-xs text-text-muted font-semibold min-w-[22px]">
            {w.label}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr>
          <td
            class="sticky left-0 z-10 bg-surface-white pr-3 text-xs font-semibold text-text-primary text-left truncate max-w-[190px] align-middle"
            title={row}
          >
            {row}
          </td>
          {#each weeks as w}
            {@const cell = getCellData(row, w.week)}
            <td class="p-0 text-center align-middle">
              <button
                type="button"
                class="block h-4 w-4 sm:h-5 sm:w-5 rounded-[4px] transition-transform hover:scale-125 focus-visible:scale-125 {getCellFill(cell)}"
                title={cell?.tooltip || `${row}, ${w.label}: no data recorded`}
                aria-label={cell?.tooltip || `${row}, ${w.label}: no data recorded`}
                onclick={() => onCellClick?.(row, w.week)}
              ></button>
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
{:else}
  <!-- Legend: a dedicated "no data" swatch plus a Less→More sequential ramp,
       matching the ramp used for the cells above. -->
  <div class="sticky left-0 flex flex-wrap items-center gap-4 mt-4 px-2 text-xs font-semibold text-text-muted">
    <span class="flex items-center gap-1.5">
      <span class="w-3 h-3 rounded-[3px] bg-surface-muted border border-dashed border-border-subtle"></span>
      No data
    </span>
    <span class="flex items-center gap-1.5">
      Less
      <span class="w-3 h-3 rounded-[3px] bg-gov-green/10"></span>
      <span class="w-3 h-3 rounded-[3px] bg-gov-green/25"></span>
      <span class="w-3 h-3 rounded-[3px] bg-gov-green/55"></span>
      <span class="w-3 h-3 rounded-[3px] bg-gov-green"></span>
      <span class="w-3 h-3 rounded-[3px] bg-gov-green-dark"></span>
      More
    </span>
  </div>
{/if}

<style>
  .heatmap-table tbody tr:hover td {
    background: var(--color-surface-muted);
  }
</style>
