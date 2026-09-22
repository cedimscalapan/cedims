<script lang="ts">
	import { onMount } from "svelte";

	export let appName = "CEDIMS";
	export let subtitle = "Calapan East District Instructional Monitoring System";
	export let duration = 1200;

	const stages = [
		"Checking secure access",
		"Preparing district records",
		"Opening your workspace",
	];

	let isLoading = true;
	let progress = 8;
	let stageIndex = 0;

	onMount(() => {
		const safeDuration = Math.max(duration, 700);
		const progressStep = Math.max(70, Math.round(safeDuration / 12));
		const stageStep = Math.max(220, Math.round(safeDuration / stages.length));

		const progressInterval = window.setInterval(() => {
			progress = Math.min(progress + 7, 92);
		}, progressStep);

		const stageInterval = window.setInterval(() => {
			stageIndex = Math.min(stageIndex + 1, stages.length - 1);
		}, stageStep);

		const loadingTimeout = window.setTimeout(() => {
			progress = 100;
			stageIndex = stages.length - 1;

			window.setTimeout(() => {
				isLoading = false;
				window.dispatchEvent(new CustomEvent("loading-complete"));
			}, 220);
		}, safeDuration);

		return () => {
			window.clearInterval(progressInterval);
			window.clearInterval(stageInterval);
			window.clearTimeout(loadingTimeout);
		};
	});
</script>

{#if isLoading}
	<div class="loading-container" role="status" aria-live="polite" aria-label={stages[stageIndex]}>
		<div class="loading-panel">
			<div class="seal-wrap" aria-hidden="true">
				<img src="/app_icon.png" alt="" class="seal" loading="eager" />
			</div>

			<div class="brand-copy">
				<p class="loading-title">{appName}</p>
				<p class="loading-subtitle">{subtitle}</p>
			</div>

			<div class="status-row">
				<span class="status-mark" aria-hidden="true"></span>
				<span>{stages[stageIndex]}</span>
			</div>

			<div class="progress-track" aria-hidden="true">
				<div class="progress-fill" style:width={`${progress}%`}></div>
			</div>

			<div class="stage-list" aria-hidden="true">
				{#each stages as stage, index}
					<span class:active={index <= stageIndex}>{stage}</span>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.loading-container {
		position: fixed;
		inset: 0;
		z-index: var(--z-loading);
		display: grid;
		place-items: center;
		padding: 1.5rem;
		overflow: hidden;
		background:
			linear-gradient(180deg, color-mix(in srgb, var(--color-surface-white) 88%, transparent), transparent 38%),
			var(--color-surface);
		color: var(--color-text-primary);
	}

	.loading-panel {
		width: min(100%, 26rem);
		display: grid;
		justify-items: center;
		gap: 1.25rem;
		padding: 2rem;
		text-align: center;
		background: var(--color-surface-white);
		border: 1px solid var(--color-border-subtle);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-elevated);
		animation: panel-in var(--duration-modal) var(--ease-out);
	}

	.seal-wrap {
		width: 5.5rem;
		height: 5.5rem;
		display: grid;
		place-items: center;
		border-radius: var(--radius-xl);
		background: color-mix(in srgb, var(--color-gov-blue) 8%, var(--color-surface-white));
		border: 1px solid color-mix(in srgb, var(--color-gov-blue) 18%, var(--color-border-subtle));
	}

	.seal {
		width: 4.25rem;
		height: 4.25rem;
		object-fit: contain;
	}

	.brand-copy {
		display: grid;
		gap: 0.35rem;
	}

	.loading-title {
		margin: 0;
		color: var(--color-text-primary);
		font-size: clamp(1.65rem, 7vw, 2.35rem);
		font-weight: 750;
		line-height: 1.1;
		letter-spacing: 0;
	}

	.loading-subtitle {
		max-width: 20rem;
		margin: 0;
		color: var(--color-text-secondary);
		font-size: 0.875rem;
		line-height: 1.45;
		letter-spacing: 0;
	}

	.status-row {
		display: inline-flex;
		align-items: center;
		gap: 0.55rem;
		min-height: 1.5rem;
		color: var(--color-text-primary);
		font-size: 0.875rem;
		font-weight: 650;
	}

	.status-mark {
		width: 0.55rem;
		height: 0.55rem;
		border-radius: 50%;
		background: var(--color-gov-blue);
		box-shadow: 0 0 0 0.35rem color-mix(in srgb, var(--color-gov-blue) 12%, transparent);
	}

	.progress-track {
		width: min(100%, 18rem);
		height: 0.45rem;
		overflow: hidden;
		border-radius: var(--radius-full);
		background: var(--color-surface-muted);
		border: 1px solid var(--color-border-subtle);
	}

	.progress-fill {
		height: 100%;
		border-radius: inherit;
		background: var(--color-gov-blue);
		transition: width var(--duration-popover) var(--ease-out);
	}

	.stage-list {
		width: min(100%, 19rem);
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 0.4rem;
		color: var(--color-text-muted);
		font-size: 0.7rem;
		line-height: 1.25;
	}

	.stage-list span {
		padding-top: 0.55rem;
		border-top: 2px solid var(--color-border-subtle);
	}

	.stage-list span.active {
		color: var(--color-text-primary);
		border-top-color: var(--color-gov-blue);
	}

	@keyframes panel-in {
		from {
			opacity: 0;
			transform: translateY(0.5rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@media (max-width: 480px) {
		.loading-panel {
			padding: 1.5rem;
			gap: 1rem;
		}

		.seal-wrap {
			width: 4.75rem;
			height: 4.75rem;
		}

		.seal {
			width: 3.6rem;
			height: 3.6rem;
		}

		.stage-list {
			grid-template-columns: 1fr;
			text-align: left;
		}
	}
</style>
