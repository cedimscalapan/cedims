<script lang="ts">
    import type { PDFDocumentProxy } from 'pdfjs-dist';
    import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

    let { file }: { file: File } = $props();
    let documentProxy = $state<PDFDocumentProxy | null>(null);
    let pageCount = $state(0);
    let loading = $state(true);
    let error = $state('');

    $effect(() => {
        const selected = file;
        let cancelled = false;
        let loadingTask: { destroy: () => Promise<void> } | null = null;
        documentProxy = null;
        pageCount = 0;
        loading = true;
        error = '';

        void (async () => {
            // The renderer is downloaded only when someone selects a PDF.
            const pdfjs = await import('pdfjs-dist');
            pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
            const bytes = new Uint8Array(await selected.arrayBuffer());
            if (cancelled) return;
            const task = pdfjs.getDocument({ data: bytes });
            loadingTask = task;
            const pdf = await task.promise;
            if (cancelled) { await pdf.destroy(); return; }
            documentProxy = pdf;
            pageCount = pdf.numPages;
            loading = false;
        })().catch((cause) => {
            if (cancelled) return;
            console.error('[upload] PDF preview unavailable', cause);
            error = 'This PDF could not be previewed. Choose a valid PDF and try again.';
            loading = false;
        });

        return () => {
            cancelled = true;
            void loadingTask?.destroy();
        };
    });

    function renderPage(node: HTMLDivElement, options: { pdf: PDFDocumentProxy; number: number }) {
        const canvas = node.querySelector('canvas')!;
        const placeholder = node.querySelector<HTMLElement>('.page-placeholder');
        let active = false;
        let generation = 0;
        let renderTask: { cancel: () => void; promise: Promise<void> } | null = null;

        async function render() {
            const current = ++generation;
            try {
                const page = await options.pdf.getPage(options.number);
                if (!active || current !== generation) return;
                const base = page.getViewport({ scale: 1 });
                const width = Math.min(node.clientWidth, 900);
                const height = Math.round(base.height * width / base.width);
                const scale = width / base.width;
                const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
                node.style.minHeight = `${height}px`;
                canvas.width = Math.round(width * pixelRatio);
                canvas.height = Math.round(height * pixelRatio);
                canvas.style.width = `${width}px`;
                canvas.style.height = `${height}px`;
                const context = canvas.getContext('2d');
                if (!context) throw new Error('Canvas unavailable');
                renderTask = page.render({ canvas, canvasContext: context, viewport: page.getViewport({ scale: scale * pixelRatio }) });
                await renderTask.promise;
                if (active && current === generation) {
                    canvas.hidden = false;
                    if (placeholder) placeholder.hidden = true;
                }
            } catch (cause) {
                if (active && current === generation) {
                    console.error('[upload] PDF page preview unavailable', cause);
                    if (placeholder) placeholder.textContent = 'Page preview unavailable';
                }
            }
        }

        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting && !active) {
                active = true;
                void render();
            } else if (!entry.isIntersecting && active) {
                active = false;
                generation++;
                renderTask?.cancel();
                canvas.width = 0;
                canvas.height = 0;
                canvas.hidden = true;
                if (placeholder) placeholder.hidden = false;
            }
        }, { root: node.parentElement, rootMargin: '300px' });
        observer.observe(node);
        return {
            destroy() {
                observer.disconnect();
                generation++;
                renderTask?.cancel();
            },
        };
    }
</script>

<section class="gov-card-static p-4" aria-labelledby="selected-pdf-preview-heading">
    <h3 id="selected-pdf-preview-heading" class="text-base font-bold text-text-primary">Preview selected PDF</h3>
    <p class="mt-1 text-sm text-text-muted">View {file.name} before uploading. The preview cannot change the selected file.</p>
    {#if loading}
        <p class="mt-4 text-sm text-text-muted" role="status">Preparing preview…</p>
    {:else if error}
        <p class="mt-4 text-sm text-gov-red" role="alert">{error}</p>
    {:else if documentProxy}
        <div class="mt-4 max-h-[36rem] space-y-4 overflow-y-auto rounded-lg border border-border-subtle bg-surface-muted p-2 sm:p-4" aria-label={`Preview of ${file.name}`}>
            {#each Array.from({ length: pageCount }) as _, index}
                <div use:renderPage={{ pdf: documentProxy, number: index + 1 }} class="flex min-h-[24rem] items-center justify-center overflow-hidden bg-white shadow-sm" aria-label={`Page ${index + 1} of ${pageCount}`}>
                    <span class="page-placeholder text-sm text-slate-600">Loading page {index + 1}…</span>
                    <canvas hidden aria-hidden="true"></canvas>
                </div>
            {/each}
        </div>
    {/if}
</section>
