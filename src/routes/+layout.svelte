<script lang="ts">
	import "../app.css";
	import Toast from "$lib/components/Toast.svelte";
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

	// Loaded on demand rather than imported at the top of this file: this is
	// the root layout, so a static import here pulled QRScanner (and its CSS)
	// into every single page load — login, upload, all of them — even though
	// the component only ever mounts once the user opens the scanner. That's
	// exactly the "preloaded but not used" warning browsers logged on pages
	// that never open it.
	let QRScannerComponent = $state<typeof import("$lib/components/QRScanner.svelte").default | null>(null);
	$effect(() => {
		if ($showQRScanner && !QRScannerComponent) {
			import("$lib/components/QRScanner.svelte").then((m) => {
				QRScannerComponent = m.default;
			});
		}
	});

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
		// Dynamic `import()` failures (stale chunk hashes after a redeploy,
		// or a chunk request that got redirected/404'd) surface as a
		// *rejected promise*, not a thrown error — so the existing 'error'
		// listener below never sees them. Without this, a build mismatch
		// left the router permanently stuck instead of self-healing via
		// reload, which is exactly the "Failed to fetch dynamically
		// imported module" loop seen in the console.
		let reloadedForStaleBuild = false;
		const reloadOnStaleBuild = (message: string | undefined) => {
			if (reloadedForStaleBuild) return;
			if (
				message?.includes("Failed to fetch dynamically imported module") ||
				message?.includes("error loading dynamically imported module")
			) {
				reloadedForStaleBuild = true;
				console.warn("[v0] Build mismatch detected. Reloading...");
				window.location.reload();
			}
		};

		const handleModuleError = (e: ErrorEvent) => reloadOnStaleBuild(e.message);
		const handleModuleRejection = (e: PromiseRejectionEvent) =>
			reloadOnStaleBuild(e.reason?.message ?? String(e.reason ?? ""));

		window.addEventListener("error", handleModuleError);
		window.addEventListener("unhandledrejection", handleModuleRejection);

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
					(async () => {
						try {
							// Preview/staging hosts sometimes front every
							// request with an auth or canonicalization
							// redirect. Registering a SW whose script
							// request is redirected throws a SecurityError
							// (browsers disallow it outright), so probe
							// first with a manual-redirect HEAD request and
							// skip registration entirely when that's the
							// case instead of letting the browser log a
							// hard failure every load.
							const probe = await fetch("/service-worker.js", {
								method: "HEAD",
								redirect: "manual",
								cache: "no-store",
							});
							if (
								probe.type === "opaqueredirect" ||
								(probe.status >= 300 && probe.status < 400)
							) {
								console.warn(
									"[v0] Skipping Service Worker registration: script is served behind a redirect on this host.",
								);
								return;
							}
						} catch (probeError) {
							// Network hiccup on the probe itself isn't a
							// reason to skip registration — fall through
							// and let register() attempt it normally.
						}

						try {
							const registration =
								await navigator.serviceWorker.register(
									"/service-worker.js",
								);
							console.log(
								"Service Worker registered:",
								registration,
							);
						} catch (error) {
							console.error(
								"Service Worker registration failed:",
								error,
							);
						}
					})();
				}
			}, 2000);
		})();

		return () => {
			window.removeEventListener("error", handleModuleError);
			window.removeEventListener(
				"unhandledrejection",
				handleModuleRejection,
			);
		};
	});
</script>

<svelte:head>
	<title>CEDIMS · Powered by Smart E-VISION</title>
</svelte:head>

<LoadingScreen appName="CEDIMS" />

<Toast />

{#if $showQRScanner && QRScannerComponent}
	<QRScannerComponent onScan={handleScan} onClose={() => showQRScanner.set(false)} />
{/if}

<ChatBot />

{@render children()}
