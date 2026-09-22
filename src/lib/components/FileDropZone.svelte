<script lang="ts">
    import { Upload, FileText, AlertCircle } from "lucide-svelte";

    interface Props {
        accept?: string;
        onfileselected: (file: File) => void;
        disabled?: boolean;
        maxSizeMb?: number;
    }

    let {
        accept = ".pdf,.docx,.doc,.jpg,.jpeg,.png",
        onfileselected,
        disabled = false,
        maxSizeMb = 500,
    }: Props = $props();

    let dragOver = $state(false);
    let selectedFile = $state<File | null>(null);
    let errorMessage = $state("");
    let inputEl: HTMLInputElement;

    function handleDrop(e: DragEvent) {
        e.preventDefault();
        dragOver = false;
        if (disabled) return;
        errorMessage = "";
        const file = e.dataTransfer?.files[0];
        if (file) selectFile(file);
    }

    function handleDragOver(e: DragEvent) {
        e.preventDefault();
        if (!disabled) dragOver = true;
    }

    function handleDragLeave() {
        dragOver = false;
    }

    function handleInputChange(e: Event) {
        const target = e.target as HTMLInputElement;
        const file = target.files?.[0];
        errorMessage = "";
        if (file) selectFile(file);
    }

    function selectFile(file: File) {
        if (maxSizeMb && file.size > maxSizeMb * 1024 * 1024) {
            errorMessage = `File too large. Maximum size is ${maxSizeMb}MB.`;
            selectedFile = null;
            return;
        }
        selectedFile = file;
        onfileselected(file);
    }

    function formatSize(bytes: number): string {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    }
</script>

<div
    class="relative rounded-lg border border-dashed transition-colors cursor-pointer min-h-[180px] flex items-center justify-center
		{disabled
            ? 'opacity-50 cursor-not-allowed border-border-subtle bg-surface-muted'
            : dragOver
            ? 'border-gov-blue bg-gov-blue/10'
            : 'border-border-strong hover:border-gov-blue bg-surface-muted/30 hover:bg-gov-blue/5'}"
    ondrop={handleDrop}
    ondragover={handleDragOver}
    ondragleave={handleDragLeave}
    onclick={() => !disabled && inputEl.click()}
    onkeydown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            inputEl.click();
        }
    }}
    role="button"
    tabindex="0"
    aria-label="Drop zone for file upload"
    aria-disabled={disabled}
>
    <input
        bind:this={inputEl}
        type="file"
        {accept}
        class="hidden"
        onchange={handleInputChange}
        {disabled}
    />

    <div class="text-center px-4 sm:px-6 py-6 w-full min-w-0">
        {#if selectedFile}
            <div class="space-y-4">
                <!-- File Icon -->
                <div class="flex justify-center">
                    <div class="w-10 h-10 flex items-center justify-center text-gov-blue">
                        <FileText size={28} strokeWidth={2} />
                    </div>
                </div>

                <!-- File Info -->
                <div>
                    <p class="font-semibold text-base text-text-primary break-all">
                        {selectedFile.name}
                    </p>
                    <p class="text-sm text-text-secondary mt-1 font-medium">
                        {formatSize(selectedFile.size)}
                    </p>
                </div>

                <!-- Change Button -->
                <button
                    class="text-sm font-bold text-gov-blue hover:text-gov-blue-dark transition-colors px-3 py-3 rounded-lg"
                    onclick={(e) => {
                        e.stopPropagation();
                        if (!disabled) inputEl.click();
                    }}
                >
                    Choose another file
                </button>
            </div>
        {:else}
            <div class="space-y-4">
                <!-- Upload Icon -->
                <div class="flex justify-center">
                    <div class="w-10 h-10 flex items-center justify-center text-text-secondary">
                        <Upload size={32} strokeWidth={1.5} />
                    </div>
                </div>

                <!-- Main Text -->
                <div>
                    <p class="font-semibold text-base text-text-primary">
                        {dragOver
                            ? "Drop your file now"
                            : "Drag & drop your file"}
                    </p>
                    <p class="text-sm text-text-secondary mt-1 font-medium">
                        {dragOver
                            ? "or press to browse"
                            : "or select a file from your device"}
                    </p>
                </div>

                <!-- Error or Info -->
                {#if errorMessage}
                    <div role="alert" class="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg bg-gov-red/10 border border-gov-red/30">
                        <AlertCircle size={18} class="text-gov-red flex-shrink-0" strokeWidth={2} />
                        <p class="text-sm font-bold text-gov-red">{errorMessage}</p>
                    </div>
                {:else}
                    <p class="text-xs text-text-muted font-medium pt-2">
                        Supported: PDF, DOCX, DOC, JPG, JPEG, PNG (max {maxSizeMb}MB)
                    </p>
                {/if}
            </div>
        {/if}
    </div>
</div>
