<script lang="ts">
	import { onMount } from "svelte";

	export let appName = "CEDIMS";
	export let duration = 1200;

	let isLoading = true;
	let progress = 8;

	onMount(() => {
		const safeDuration = Math.max(duration, 700);
		const progressStep = Math.max(70, Math.round(safeDuration / 12));

		const progressInterval = window.setInterval(() => {
			progress = Math.min(progress + 7, 92);
		}, progressStep);

		const loadingTimeout = window.setTimeout(() => {
			progress = 100;

			window.setTimeout(() => {
				isLoading = false;
				window.dispatchEvent(new CustomEvent("loading-complete"));
			}, 220);
		}, safeDuration);

		return () => {
			window.clearInterval(progressInterval);
			window.clearTimeout(loadingTimeout);
		};
	});
</script>

{#if isLoading}
	<div class="loading-container" role="status" aria-live="polite" aria-label={`Loading ${appName}`}>
		<div class="letter-loader" aria-hidden="true">
			<div class="letter-ring">
				<span>C</span>
			</div>
			<div class="progress-track">
				<div class="progress-fill" style:width={`${progress}%`}></div>
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
		overflow: hidden;
		background: #071221;
		color: #ffffff;
	}

	.letter-loader {
		display: grid;
		justify-items: center;
		gap: 1.25rem;
		animation: loader-in var(--duration-modal) var(--ease-out);
	}

	.letter-ring {
		width: clamp(5.5rem, 24vw, 8rem);
		height: clamp(5.5rem, 24vw, 8rem);
		display: grid;
		place-items: center;
		border-radius: 50%;
		background:
			radial-gradient(circle at center, #0b1b30 55%, transparent 56%),
			conic-gradient(from 220deg, #d97706 0deg, #d97706 74deg, #1e40af 75deg, #2d8bea 292deg, #d97706 293deg, #d97706 360deg);
		box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.32);
		animation: ring-breathe 1.4s var(--ease-in-out) infinite;
	}

	.letter-ring span {
		color: #ffffff;
		font-size: clamp(3.4rem, 14vw, 5.2rem);
		font-weight: 800;
		line-height: 1;
		letter-spacing: 0;
	}

	.progress-track {
		width: clamp(6rem, 24vw, 8.5rem);
		height: 0.2rem;
		overflow: hidden;
		border-radius: var(--radius-full);
		background: rgba(255, 255, 255, 0.14);
	}

	.progress-fill {
		height: 100%;
		border-radius: inherit;
		background: #d97706;
		transition: width var(--duration-popover) var(--ease-out);
	}

	@keyframes loader-in {
		from {
			opacity: 0;
			transform: scale(0.96);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}

	@keyframes ring-breathe {
		0%, 100% {
			transform: scale(1);
			filter: brightness(1);
		}
		50% {
			transform: scale(1.035);
			filter: brightness(1.08);
		}
	}
</style>
