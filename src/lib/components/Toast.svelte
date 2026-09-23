<script lang="ts">
	import { toasts, type ToastMessage } from "$lib/stores/toast";
	import {
		CheckCircle2,
		AlertCircle,
		Info,
		AlertTriangle,
		X,
	} from "lucide-svelte";
	import { fly } from "svelte/transition";
	import { page } from "$app/stores";

	// Dashboard pages have a bottom tab bar at every screen size now, so
	// toasts need extra clearance there; marketing/auth pages don't.
	const inDashboard = $derived($page.url.pathname.startsWith("/dashboard"));

	const icons: Record<ToastMessage["type"], any> = {
		success: CheckCircle2,
		error: AlertCircle,
		info: Info,
		warning: AlertTriangle,
	};

	// Success and warning use the -dark palette variant for their fill —
	// white text on the base bg-gov-green/bg-gov-gold measured 3.30:1 /
	// 3.19:1, below the 4.5:1 floor. Error and info already pass on their
	// base fill and are left as-is.
	const styles: Record<ToastMessage["type"], { bg: string; text: string; icon: string }> = {
		success: {
			bg: "bg-gov-green-dark",
			text: "text-white",
			icon: "bg-white/20",
		},
		error: {
			bg: "bg-gov-red",
			text: "text-white",
			icon: "bg-white/20",
		},
		info: {
			bg: "bg-gov-blue",
			text: "text-white",
			icon: "bg-white/20",
		},
		warning: {
			bg: "bg-gov-gold-dark",
			text: "text-white",
			icon: "bg-white/20",
		},
	};
</script>

<div
	class="fixed right-4 sm:right-5 z-[var(--z-toast)] flex flex-col gap-2 max-w-xs w-full sm:w-80 pointer-events-none px-4 sm:px-0 {inDashboard
		? 'bottom-24'
		: 'bottom-4 sm:bottom-6'}"
>
	{#each $toasts as toast (toast.id)}
		{@const ToastIcon = icons[toast.type]}
		<div
			class="pointer-events-auto flex items-start gap-2.5 px-3.5 py-3 rounded-lg shadow-md {styles[toast.type].bg} {styles[toast.type].text} border border-white/20"
			role="alert"
			in:fly={{ x: 400, duration: 300 }}
			out:fly={{ x: 400, duration: 300 }}
		>
			<div class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg {styles[toast.type].icon}">
				<ToastIcon size={16} strokeWidth={2} />
			</div>
			<div class="flex-1 min-w-0 py-0.5">
				<p class="text-xs font-bold leading-tight">
					{toast.type.charAt(0).toUpperCase() + toast.type.slice(1)}
				</p>
				<p class="text-xs font-medium opacity-95 mt-0.5 leading-snug">
					{toast.message}
				</p>
			</div>
			<button
				class="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/15 transition-colors duration-200 p-1"
				onclick={() => toasts.remove(toast.id)}
				aria-label="Dismiss notification"
			>
				<X size={15} strokeWidth={2} />
			</button>
		</div>
	{/each}
</div>
