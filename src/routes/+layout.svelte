<script lang="ts">
	import "../app.css";
	import Toast from "$lib/components/Toast.svelte";
	import QRScanner from "$lib/components/QRScanner.svelte";
	import ChatBot from "$lib/components/ChatBot.svelte";
	import LoadingScreen from "$components/LoadingScreen.svelte";
	import { showQRScanner } from "$lib/stores/ui";
	import { hideLoading } from "$stores/loadingStore";
	import { goto } from "$app/navigation";
	import { initAuth, profile } from "$lib/utils/auth";
	import {
		initOfflineSync,
		prefetchOfflineMetadata,
	} from "$lib/utils/offline";
	import { onMount } from "svelte";
	import { get } from "svelte/store";

	let { children } = $props();

	function handleScan(data: string) {
		if (data.includes("/verify/")) {
			const hash = data.split("/verify/").pop();
			if (hash) {
				goto(`/verify/${hash}`);
				showQRScanner.set(false);
			}
		} else {
			// Fallback for non-verify QR codes
			console.log(`[QR] Scanned data:`, data);
		}
	}

	onMount(() => {
		const handleModuleError = (e: ErrorEvent) => {
			if (
				e.message?.includes(
					"Failed to fetch dynamically imported module",
				)
			) {
				console.warn("[v0] Build mismatch detected. Reloading...");
				window.location.reload();
			}
		};
		window.addEventListener("error", handleModuleError);

		(async () => {
			// Initialize auth first
			try {
				await initAuth();
			} catch (err) {
				console.error("[v0] Failed to initialize auth:", err);
			}

			// Then initialize offline sync
			initOfflineSync();

			// Pre-fetch metadata if online (Phase 20.4)
			const user = get(profile);
			if (user && user.id) {
				prefetchOfflineMetadata(user.id, user.district_id || undefined);
			}

			// Hide loading screen once app is initialized
			hideLoading();

			// Defer service worker registration
			setTimeout(() => {
				if ("serviceWorker" in navigator && import.meta.env.PROD) {
					try {
						navigator.serviceWorker
							.register("/service-worker.js")
							.then(
								(registration) => {
									console.log(
										"Service Worker registered:",
										registration,
									);
								},
								(error) => {
									console.error(
										"Service Worker registration failed:",
										error,
									);
								},
							);
					} catch (error) {
						console.error(
							"Service Worker registration error:",
							error,
						);
					}
				}
			}, 2000);
		})();

		return () => {
			window.removeEventListener("error", handleModuleError);
		};
	});
</script>

<svelte:head>
	<title>CEDIMS · Powered by Smart E-VISION</title>
</svelte:head>

<!-- duration is a fixed, fake wait — the progress bar is Math.random(),
     not tied to real auth/data readiness (see LoadingScreen.svelte). This
     fires on every full page load, so 3000ms was a guaranteed, unconditional
     tax on every session for every teacher, every day — directly against
     the plan's efficiency goal. Cut to a brief brand flash rather than
     rewiring it to a real readiness signal, which would need auditing this
     layout's full auth-init timing to change safely without a live
     browser to verify against. -->
<LoadingScreen
	appName="CEDIMS"
	subtitle="Intelligent Document Management System"
	duration={1200}
/>

<Toast />

{#if $showQRScanner}
	<QRScanner onScan={handleScan} onClose={() => showQRScanner.set(false)} />
{/if}

<ChatBot />

{@render children()}
