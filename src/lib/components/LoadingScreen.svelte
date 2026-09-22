<script lang="ts">
	import { onMount } from "svelte";

	export let appName = "CEDIMS";
	export let duration = 2800;

	let visible = true;
	let leaving = false;
	const letterPath = "M358 158C330 133 299 124 266 124C192 124 140 179 140 256C140 333 192 388 266 388C299 388 330 379 358 354";

	onMount(() => {
		const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
		let exitTimeout: number;
		const loadingTimeout = window.setTimeout(() => {
			leaving = true;
			exitTimeout = window.setTimeout(() => {
				visible = false;
				window.dispatchEvent(new CustomEvent("loading-complete"));
			}, reducedMotion ? 0 : 260);
		}, reducedMotion ? 150 : Math.max(2600, duration));

		return () => {
			window.clearTimeout(loadingTimeout);
			window.clearTimeout(exitTimeout);
		};
	});
</script>

{#if visible}
	<div class="splash" class:leaving role="status" aria-live="polite" aria-label={`Loading ${appName}`}>
		<svg class="education-lines" viewBox="0 0 390 760" aria-hidden="true">
			<g class="notebook-lines">
				<path d="M-30 180H420" /><path d="M-30 230H420" /><path d="M-30 280H420" />
				<path d="M-30 480H420" /><path d="M-30 530H420" /><path d="M-30 580H420" />
			</g>
			<path class="book-outline" d="M-20 398C62 352 126 356 195 400C264 356 328 352 410 398V650C328 604 264 608 195 652C126 608 62 604-20 650Z" />
			<path class="book-spine" d="M195 400V652" />
			<path class="cap-outline" d="M88 150L195 108L302 150L195 192Z M130 166V208C166 231 224 231 260 208V166" />
		</svg>
		<div class="stage" aria-hidden="true">
			<svg class="mark" viewBox="0 0 512 512">
				<path class="letter" d={letterPath} pathLength="1" />
				<circle class="endpoint origin" cx="358" cy="158" r="31" />
				<circle class="endpoint destination" cx="358" cy="354" r="31" />
				<circle class="destination-ring" cx="358" cy="354" r="48" />
				<circle class="traveler" r="22">
					<animateMotion path={letterPath} begin="0.56s" dur="1.02s" fill="freeze" calcMode="spline" keyTimes="0;1" keyPoints="0;1" keySplines=".55 0 .18 1" />
				</circle>
			</svg>
		</div>
		<div class="signature" aria-hidden="true">
			<span class="signature-label">Powered by</span>
			<span class="divider"></span>
			<span class="brand">
				<img src="/deped-calapan-east-district.jpg" alt="" width="31" height="31" />
				<span>Smart E-VISION</span>
			</span>
		</div>
	</div>
{/if}

<style>
	.splash {
		position: fixed;
		inset: 0;
		z-index: var(--z-loading, 20000);
		display: grid;
		place-items: center;
		overflow: hidden;
		background: var(--loader-surface);
		color: var(--loader-ink);
		font-family: "Segoe UI", Roboto, sans-serif;
		transition: opacity 260ms ease;
	}
	.splash.leaving { opacity: 0; }
	.splash::before {
		content: "";
		position: absolute;
		inset: 0;
		background-image: linear-gradient(var(--loader-grid) 1px, transparent 1px), linear-gradient(90deg, var(--loader-grid) 1px, transparent 1px);
		background-size: 44px 44px;
		mask-image: radial-gradient(circle at 50% 48%, black 0, black 42%, transparent 78%);
		animation: grid-arrive 1900ms cubic-bezier(.16,1,.3,1) both;
	}
	.education-lines {
		position: absolute;
		width: min(110vw, 480px);
		height: min(112vh, 820px);
		opacity: .82;
		transform: translateY(16px) scale(1.02);
		animation: education-settle 1900ms cubic-bezier(.16,1,.3,1) 120ms both;
	}
	.education-lines path {
		fill: none;
		stroke: var(--loader-line);
		opacity: .16;
		stroke-width: 1.8;
		stroke-linecap: round;
		stroke-dasharray: 920;
		stroke-dashoffset: 920;
		animation: draw 1300ms cubic-bezier(.5,0,.2,1) forwards;
	}
	.notebook-lines { opacity: .65; }
	.notebook-lines path { stroke-dasharray: 450; }
	.book-outline { animation-delay: 360ms; }
	.book-spine { animation-delay: 500ms; }
	.cap-outline { animation-delay: 180ms; }
	.stage {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		opacity: 0;
		transform: translateY(18px) scale(.95);
		animation: stage-arrive 760ms cubic-bezier(.16,1,.3,1) 160ms forwards;
	}
	.mark {
		width: min(clamp(134px, 34vw, 172px), 54svh);
		height: auto;
		aspect-ratio: 1;
		overflow: visible;
		transform: translateY(-4px);
	}
	.letter {
		fill: none;
		stroke: currentColor;
		stroke-width: 42;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-dasharray: 1;
		stroke-dashoffset: 1;
		animation: draw 1020ms cubic-bezier(.55,0,.18,1) 560ms forwards;
	}
	.endpoint, .destination-ring {
		opacity: 0;
		transform-box: fill-box;
		transform-origin: center;
	}
	.origin { fill: #19a86b; animation: endpoint-in 360ms cubic-bezier(.16,1,.3,1) 300ms forwards; }
	.destination {
		fill: #2563eb;
		animation: endpoint-in 320ms cubic-bezier(.16,1,.3,1) 1540ms forwards, destination-blink 720ms ease-out 1840ms forwards;
	}
	.traveler { fill: #19a86b; opacity: 0; animation: travel 1020ms linear 560ms forwards; }
	.destination-ring { fill: none; stroke: #2563eb; stroke-width: 9; animation: destination-ring 680ms ease-out 1840ms forwards; }
	.signature {
		position: absolute;
		left: 50%;
		bottom: max(74px, calc(env(safe-area-inset-bottom, 0px) + 58px));
		display: inline-flex;
		align-items: center;
		gap: 10px;
		white-space: nowrap;
		opacity: 0;
		transform: translate(-50%, 10px);
		animation: signature-in 560ms cubic-bezier(.16,1,.3,1) 1980ms forwards;
	}
	.signature::before {
		content: "";
		position: absolute;
		top: -24px;
		left: 50%;
		width: 48px;
		height: 3px;
		border-radius: 99px;
		background: linear-gradient(90deg, #19a86b, #2563eb);
		opacity: .82;
		transform: translateX(-50%);
	}
	.signature-label { color: var(--loader-muted); font-size: 10.5px; font-weight: 900; line-height: 1; text-transform: uppercase; }
	.divider { width: 1px; height: 22px; background: var(--loader-divider); }
	.brand { display: inline-flex; align-items: center; gap: 8px; font-size: 15px; font-weight: 900; line-height: 1; }
	.brand img { display: block; width: 31px; height: 31px; object-fit: contain; }
	@keyframes grid-arrive { from { opacity: 0; transform: translateY(16px); } to { opacity: .62; transform: translateY(0); } }
	@keyframes education-settle { to { transform: translateY(0) scale(1); } }
	@keyframes draw { to { stroke-dashoffset: 0; } }
	@keyframes stage-arrive { 72% { opacity: 1; transform: translateY(-2px) scale(1.012); } to { opacity: 1; transform: translateY(0) scale(1); } }
	@keyframes endpoint-in { from { opacity: 0; transform: scale(.86); } to { opacity: 1; transform: scale(1); } }
	@keyframes travel { 0% { opacity: 0; } 10%, 90% { opacity: 1; } 100% { opacity: 0; } }
	@keyframes destination-blink { 0%, 68% { filter: brightness(1); transform: scale(1); } 34% { filter: brightness(1.18); transform: scale(1.08); } 100% { filter: brightness(1.08); transform: scale(1.02); } }
	@keyframes destination-ring { 0% { opacity: 0; transform: scale(.76); } 38% { opacity: .22; transform: scale(1.08); } 100% { opacity: 0; transform: scale(1.32); } }
	@keyframes signature-in { to { opacity: 1; transform: translate(-50%, 0); } }
	@media (max-height: 500px) { .signature { bottom: max(24px, calc(env(safe-area-inset-bottom, 0px) + 14px)); } }
	@media (max-width: 340px) { .signature { gap: 8px; } .brand { font-size: 13px; } }
	@media (prefers-reduced-motion: reduce) {
		.splash { transition: none; }
		.splash::before, .education-lines, .education-lines path, .stage, .letter, .endpoint, .destination-ring, .signature { animation-duration: 1ms; animation-delay: 0ms; }
		.traveler { display: none; }
	}
	:global(.splash) { --loader-surface: #f8fbff; --loader-ink: #17212b; --loader-muted: #637381; --loader-grid: rgba(37, 99, 235, .045); --loader-line: #2563eb; --loader-divider: rgba(100,116,139,.26); }
	:global(.dark) .splash { --loader-surface: #08111f; --loader-ink: #edf3f8; --loader-muted: #a3b3c4; --loader-grid: rgba(153,180,211,.035); --loader-line: #a9c4df; --loader-divider: rgba(153,180,211,.26); }
</style>
