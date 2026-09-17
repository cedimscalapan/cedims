<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { fade } from "svelte/transition";
    import { focusTrap } from "$lib/actions/focusTrap";

    interface Props {
        onScan?: (data: string) => void;
        onClose?: () => void;
    }

    let { onScan, onClose }: Props = $props();

    let videoElement: HTMLVideoElement;
    let canvasElement: HTMLCanvasElement;
    let scanning = $state(false);
    let error = $state("");
    let stream: MediaStream | null = null;
    let detectionLoopId: number | null = null;
    let jsQRModule: any = null;
    let scanStartTime = 0;

    onMount(async () => {
        try {
            scanning = true;
            // Preload jsQR library
            jsQRModule = await import("jsqr");

            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });

            if (videoElement) {
                videoElement.srcObject = stream;
                videoElement.setAttribute("playsinline", "true");
                await videoElement.play();
                startScanning();
            }
        } catch (err) {
            error =
                "Could not access camera. Please ensure permissions are granted.";
            scanning = false;
        }
    });

    onDestroy(() => {
        stopScanning();
    });

    function stopScanning() {
        scanning = false;
        if (detectionLoopId !== null) {
            cancelAnimationFrame(detectionLoopId);
            detectionLoopId = null;
        }
        if (stream) {
            stream.getTracks().forEach((track) => track.stop());
        }
    }

    async function startScanning() {
        if (!scanning || !jsQRModule) return;

        const jsQR = jsQRModule.default;
        let frameCount = 0;

        const detect = () => {
            if (!scanning || !videoElement || !canvasElement) return;

            frameCount++;
            // Process every 3rd frame to reduce CPU usage
            if (frameCount % 3 !== 0) {
                detectionLoopId = requestAnimationFrame(detect);
                return;
            }

            if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
                const canvas = canvasElement;
                const context = canvas.getContext("2d", {
                    willReadFrequently: true,
                });
                if (!context) {
                    detectionLoopId = requestAnimationFrame(detect);
                    return;
                }

                canvas.height = videoElement.videoHeight;
                canvas.width = videoElement.videoWidth;
                context.drawImage(
                    videoElement,
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                );

                // 1. Try Native BarcodeDetector (High Perf)
                if ("BarcodeDetector" in window) {
                    try {
                        // @ts-ignore
                        const detector = new BarcodeDetector({
                            formats: ["qr_code"],
                        });
                        detector.detect(videoElement).then((barcodes: any[]) => {
                            if (barcodes.length > 0 && scanning) {
                                onScan?.(barcodes[0].rawValue);
                                stopScanning();
                                onClose?.();
                            }
                        });
                    } catch (e) {
                        // Fallback to jsQR
                    }
                }

                // 2. jsQR Fallback (Reliability)
                const imageData = context.getImageData(
                    0,
                    0,
                    canvas.width,
                    canvas.height,
                );
                const code = jsQR(
                    imageData.data,
                    imageData.width,
                    imageData.height,
                    {
                        inversionAttempts: "dontInvert",
                    },
                );

                if (code) {
                    onScan?.(code.data);
                    stopScanning();
                    onClose?.();
                    return;
                }
            }

            detectionLoopId = requestAnimationFrame(detect);
        };

        detectionLoopId = requestAnimationFrame(detect);
    }
</script>

<div
    class="fixed inset-0 z-[var(--z-modal)] bg-black/90 flex flex-col items-center justify-center p-6"
    transition:fade
    role="dialog"
    aria-modal="true"
    aria-label="Scan QR code"
    tabindex="-1"
    use:focusTrap
    onkeydown={(e) => {
        if (e.key === "Escape") {
            stopScanning();
            onClose?.();
        }
    }}
>
    <!-- Scanner Overlay -->
    <div
        class="relative w-full max-w-sm aspect-square rounded-3xl overflow-hidden border-2 border-white/20 shadow-sm"
    >
        <!-- Camera Feed -->
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoElement} class="w-full h-full object-cover">
            <track kind="captions" />
        </video>
        <canvas bind:this={canvasElement} class="hidden"></canvas>

        <!-- Scanning Animation -->
        <div class="absolute inset-0 border-[40px] border-black/40"></div>
        <div
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 border-2 border-gov-blue rounded-md"
        >
            <div
                class="absolute top-0 left-0 w-full h-1 bg-gov-blue/50 shadow-[0_0_15px_rgba(0,103,172,0.8)] animate-scan"
            ></div>

            <!-- Corners -->
            <div
                class="absolute -top-1 -left-1 w-6 h-6 border-t-4 border-l-4 border-white rounded-tl-lg"
            ></div>
            <div
                class="absolute -top-1 -right-1 w-6 h-6 border-t-4 border-r-4 border-white rounded-tr-lg"
            ></div>
            <div
                class="absolute -bottom-1 -left-1 w-6 h-6 border-b-4 border-l-4 border-white rounded-bl-lg"
            ></div>
            <div
                class="absolute -bottom-1 -right-1 w-6 h-6 border-b-4 border-r-4 border-white rounded-br-lg"
            ></div>
        </div>

        {#if error}
            <div
                class="absolute inset-0 flex items-center justify-center p-8 bg-black/60 backdrop-blur-sm text-center"
            >
                <p class="text-white text-sm font-medium">{error}</p>
            </div>
        {/if}
    </div>

    <div class="mt-12 text-center space-y-2">
        <h3 class="text-white font-bold text-lg">Scan QR Code</h3>
        <p class="text-text-muted text-sm">
            Position the document's QR code within the frame
        </p>
    </div>

    <button
        onclick={() => {
            stopScanning();
            onClose?.();
        }}
        class="mt-16 py-3 px-8 rounded-full bg-surface-white/10 border border-white/20 text-white text-xs font-semibold uppercase tracking-wide hover:bg-surface-white/20 active:scale-95 transition-[color,background-color,border-color,transform] duration-200 ease-out cursor-pointer"
    >
        CLOSE
    </button>
</div>

<style>
    @keyframes scan {
        0% {
            top: 0;
        }
        100% {
            top: 100%;
        }
    }
    .animate-scan {
        animation: scan 2s linear infinite;
    }
</style>
