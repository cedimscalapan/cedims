<script lang="ts">
    import { onMount, onDestroy, tick } from 'svelte';
    export let url: string;
    let canvas: HTMLCanvasElement;
    let holder: HTMLDivElement;
    let pdf: any; let loadingTask: any; let renderTask: any;
    let page = 1; let total = 0; let loading = true; let error = ''; let alive = true; let run = 0;
    async function render(number: number) {
        const request = ++run;
        renderTask?.cancel(); loading = true; error = '';
        try {
            const sheet = await pdf.getPage(number);
            if (!alive || request !== run) return;
            const base = sheet.getViewport({scale:1});
            const scale = Math.min(2.5, Math.max(240, holder.clientWidth-24)/base.width);
            const viewport = sheet.getViewport({scale});
            const ratio = Math.min(2,window.devicePixelRatio||1);
            canvas.width = Math.floor(viewport.width*ratio); canvas.height = Math.floor(viewport.height*ratio);
            canvas.style.width = `${viewport.width}px`;canvas.style.height = `${viewport.height}px`;
            renderTask=sheet.render({canvasContext:canvas.getContext('2d'),viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});
            await renderTask.promise;
        } catch(issue: any) {if(alive && request===run && issue?.name!=='RenderingCancelledException')error='The preview could not be displayed. Use Open full document above.';}
        finally {if(alive && request===run)loading=false;}
    }
    async function load() {
        loading=true;error='';
        try {
            const {loadPdfJs}=await import('$lib/utils/ocr');
            await loadPdfJs(20000);
            if(!alive)return;
            loadingTask=(window as any).pdfjsLib.getDocument({url});
            pdf=await loadingTask.promise;
            if(!alive){void pdf.destroy();return;}
            total=pdf.numPages;await tick();await render(page);
        } catch {if(alive){loading=false;error='The preview is unavailable. Use Open full document above.';}}
    }
    function change(number: number) {if(number<1||number>total||loading)return;page=number;holder.scrollTop=0;holder.scrollLeft=0;void render(number);}
    onMount(()=>void load());
    onDestroy(()=>{alive=false;run++;renderTask?.cancel();void loadingTask?.destroy();});
</script>
<div class="pdf-reader">
    <div class="pdf-controls"><button on:click={()=>change(page-1)} disabled={loading||page===1} aria-label="Previous document page">←</button><span>Page {page} of {total||'…'}</span><button on:click={()=>change(page+1)} disabled={loading||page===total||!total} aria-label="Next document page">→</button></div>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (Focus lets keyboard users scroll the full PDF with arrow and Page Down keys.) -->
    <div class="pdf-sheet" bind:this={holder} role="region" aria-label="Scrollable lesson plan. Scroll down to read the full page." tabindex="0">{#if loading}<p role="status">Loading page…</p>{/if}{#if error}<p role="alert">{error}</p>{/if}<canvas bind:this={canvas} aria-label="Lesson plan page" class:hidden={!!error}></canvas></div>
</div>
<style>
    .pdf-reader {display:flex;flex-direction:column;flex:1 1 0;min-height:0;min-width:0;overflow:hidden;} .pdf-controls {display:flex;flex:none;align-items:center;justify-content:center;gap:18px;padding:8px;border-bottom:1px solid var(--color-border-subtle);font-size:12px;color:var(--color-text-primary);} button {min-height:48px;min-width:40px;border:1px solid var(--color-border-subtle);border-radius:7px;font-weight:700;} button:disabled{opacity:.4;} .pdf-sheet{min-height:0;min-width:0;overflow:scroll;scrollbar-gutter:stable;scrollbar-width:auto;scrollbar-color:#64748b #e2e8f0;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px;text-align:center;flex:1 1 0;background:#e2e8f0;} .pdf-sheet::-webkit-scrollbar{width:14px;height:14px;} .pdf-sheet::-webkit-scrollbar-track{background:#e2e8f0;} .pdf-sheet::-webkit-scrollbar-thumb{background:#64748b;border:3px solid #e2e8f0;border-radius:8px;} .pdf-sheet::-webkit-scrollbar-thumb:hover{background:#334155;} .pdf-sheet:focus-visible{outline:3px solid var(--color-gov-blue);outline-offset:-3px;} canvas{display:block;margin:auto;background:white;max-width:100%;} p{padding:20px;color:#334155;font-size:13px;} .hidden{display:none;}
</style>
