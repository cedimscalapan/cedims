<script lang="ts">
    import { supabase } from "$lib/utils/supabase";
    import { User, Upload, X, Check, Loader2 } from "lucide-svelte";
    import imageCompression from "browser-image-compression";
    import { addToast } from "$lib/stores/toast";
    import { fade, scale } from "svelte/transition";

    let { 
        url = $bindable(), 
        onUpload = null, 
        placeholderIcon = User,
        bucket = "avatars",
        path = "users",
        id = "",
        label = "Profile Picture",
        size = "md"
    } = $props<{
        url: string | null;
        onUpload?: ((url: string) => void) | null;
        placeholderIcon?: any;
        bucket?: string;
        path?: string;
        id: string;
        label?: string;
        size?: "sm" | "md" | "lg" | "xl";
    }>();

    let uploading = $state(false);
    let fileInput: HTMLInputElement;

    const sizeClasses: Record<string, string> = {
        sm: "w-12 h-12",
        md: "w-20 h-20",
        lg: "w-32 h-32",
        xl: "w-48 h-48"
    };

    const iconSizes: Record<string, number> = {
        sm: 16,
        md: 24,
        lg: 32,
        xl: 48
    };

    async function handleFileChange(event: Event) {
        const target = event.target as HTMLInputElement;
        const file = target.files?.[0];
        if (!file) return;

        // Validations
        if (!file.type.startsWith('image/')) {
            addToast("error", "Please upload an image file");
            return;
        }

        uploading = true;
        try {
            // 1. Compress Image
            const options = {
                maxSizeMB: 0.5,
                maxWidthOrHeight: 1024,
                useWebWorker: true,
            };
            const compressedFile = await imageCompression(file, options);

            // 2. Prepare Path
            // Format: {path}/{id}/{timestamp}_{filename}
            const fileExt = file.name.split('.').pop();
            const fileName = `${Date.now()}.${fileExt}`;
            const filePath = `${path}/${id}/${fileName}`;

            // 3. Upload to Supabase
            const { data, error } = await supabase.storage
                .from(bucket)
                .upload(filePath, compressedFile, {
                    upsert: true
                });

            if (error) {
                console.error("Upload error:", error);
                addToast("error", `Upload failed: ${error.message}`);
                return;
            }

            // 4. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath);

            url = publicUrl;
            if (onUpload) onUpload(publicUrl);
            addToast("success", "Logo updated successfully");
            
        } catch (err) {
            console.error("Compression/Upload error:", err);
            addToast("error", "An error occurred during upload");
        } finally {
            uploading = false;
        }
    }

    function triggerFileInput() {
        if (!uploading) fileInput.click();
    }
</script>

<div class="flex flex-col items-center gap-4">
    <div class="relative group">
        <!-- Avatar Display -->
        <button 
            type="button"
            onclick={triggerFileInput}
            class="relative {sizeClasses[size ?? 'md']} rounded-full overflow-hidden border-2 border-border-subtle bg-surface-muted flex items-center justify-center transition-colors hover:border-gov-blue/50 focus:outline-none focus:ring-2 focus:ring-gov-blue/20"
            disabled={uploading}
            aria-label="Change {label}"
        >
            {#if url}
                <img src={url} alt={label} class="w-full h-full object-cover" in:fade />
            {:else}
                <div class="text-text-muted">
                    <placeholderIcon size={iconSizes[size ?? 'md']}></placeholderIcon>
                </div>
            {/if}

            <!-- Overlay on hover -->
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Upload size={iconSizes[size ?? 'md'] / 1.5} class="text-white" />
            </div>

            <!-- Loading Spinner -->
            {#if uploading}
                <div class="absolute inset-0 bg-surface-white/80 flex items-center justify-center" in:fade>
                    <Loader2 size={iconSizes[size ?? 'md'] / 1.5} class="text-gov-blue animate-spin" />
                </div>
            {/if}
        </button>

        <!-- Small badge for visual feedback -->
        {#if url && !uploading}
            <div 
                class="absolute -bottom-1 -right-1 bg-gov-green text-white p-1 rounded-full shadow-sm"
                transition:scale
            >
                <Check size={12} strokeWidth={3} />
            </div>
        {/if}
    </div>

    <div class="text-center">
        <span class="text-xs font-bold text-text-muted uppercase tracking-wider">{label}</span>
        <button 
            type="button"
            onclick={triggerFileInput}
            class="block text-[10px] text-gov-blue font-bold hover:underline mt-1"
        >
            {url ? 'Change Photo' : 'Upload Photo'}
        </button>
    </div>

    <input 
        type="file" 
        bind:this={fileInput} 
        onchange={handleFileChange} 
        accept="image/*" 
        class="hidden" 
    />
</div>

<style>
    /* Add any custom styles here if needed */
</style>
