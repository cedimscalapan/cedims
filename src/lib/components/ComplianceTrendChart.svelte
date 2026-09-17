<script lang="ts">
  import { onMount, onDestroy } from "svelte";

  interface Props {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      color?: string;
      dashed?: boolean;
    }[];
    height?: number;
  }

  let { labels, datasets, height = 280 }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let chartInstance: any = null;

  const DEFAULT_COLORS = [
    "#0038A8", // DepEd Blue
    "#008751", // DepEd Green
    "#FCD116", // DepEd Gold
    "#CE1126", // DepEd Red
    "#1a5fc9", // Blue light
    "#00a866", // Green light
  ];

  $effect(() => {
    if (labels && datasets) {
      // Trigger re-render when props change
      (async () => {
        const { Chart, registerables } = await import("chart.js");
        Chart.register(...registerables);
        renderChart(Chart);
      })();
    }
  });

  onDestroy(() => {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
  });

  function renderChart(Chart: any) {
    if (!canvas) return;
    if (chartInstance) chartInstance.destroy();

    // Svelte 5 Fix: Use $state.snapshot() to pass non-reactive objects
    // to external libraries like Chart.js that modify descriptors.
    const cleanLabels = $state.snapshot(labels);
    const cleanDatasets = $state.snapshot(datasets);

    chartInstance = new Chart(canvas, {
      type: "line",
      data: {
        labels: cleanLabels,
        datasets: cleanDatasets.map((ds, i) => ({
          label: ds.label,
          data: ds.data,
          borderColor: ds.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length],
          backgroundColor:
            (ds.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]) + "18",
          fill: datasets.length === 1,
          tension: 0.4,
          pointRadius: 4,
          pointHoverRadius: 7,
          borderWidth: 2.5,
          borderDash: ds.dashed ? [6, 4] : [],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        plugins: {
          legend: {
            display: datasets.length > 1,
            position: "top",
            labels: {
              usePointStyle: true,
              padding: 16,
              font: { family: "'Segoe UI', Roboto, system-ui, sans-serif", size: 12 },
            },
          },
          tooltip: {
            backgroundColor: "rgba(26, 26, 46, 0.9)",
            titleFont: { family: "'Segoe UI', Roboto, system-ui, sans-serif", size: 13 },
            bodyFont: { family: "'Segoe UI', Roboto, system-ui, sans-serif", size: 12 },
            cornerRadius: 8,
            padding: 10,
            callbacks: {
              label: (ctx: any) => `${ctx.dataset.label}: ${ctx.parsed.y}%`,
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: (v: any) => v + "%",
              font: { family: "'Segoe UI', Roboto, system-ui, sans-serif", size: 10, weight: "bold" },
              color: "#64748b",
            },
            grid: { color: "rgba(0,0,0,0.06)" },
            border: { display: false },
          },
          x: {
            ticks: {
              font: { family: "'Segoe UI', Roboto, system-ui, sans-serif", size: 10, weight: "bold" },
              color: "#64748b",
            },
            grid: { display: false },
            border: { display: false },
          },
        },
      },
    });
  }
</script>

<div style="height: {height}px">
  <canvas bind:this={canvas}></canvas>
</div>
