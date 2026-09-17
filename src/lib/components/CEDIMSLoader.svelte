<script lang="ts">
    interface Props {
        label?: string;
        compact?: boolean;
    }
    let { label = "Loading data...", compact = false }: Props = $props();
</script>

<div class="cedims-loader" role="status" aria-label={label} class:compact>
    <!-- Official Calapan East District Logo -->
    <div class="logo-container" aria-hidden="true">
        <img
            src="/app_icon.png"
            alt="CEDIMS Logo"
            class="logo-image"
            loading="eager"
        />
    </div>

    <!-- Text Label. This is a reusable component mounted mid-page (e.g.
         upload/+page.svelte uses it twice, inline, while the real page <h1>
         is already on screen) — decorative branding text here must never be
         a heading element, or every mount adds a duplicate <h1> to the page. -->
    <div class="text-container">
        <p class="cedims-text">CEDIMS</p>
        <p class="subtitle">Calapan East District Instructional Monitoring System</p>
    </div>

    <!-- Progress Bar -->
    <div class="progress-bar">
        <div class="progress-fill"></div>
    </div>

    {#if label}
        <p class="label">{label}</p>
    {/if}
</div>

<style>
    .cedims-loader {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.5rem;
        padding: 3rem 2rem;
        user-select: none;
    }
    .cedims-loader.compact {
        gap: 1rem;
        padding: 1.5rem;
    }

    .logo-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .logo-image {
        width: 140px;
        height: 140px;
        object-fit: contain;
        filter: drop-shadow(0 4px 16px rgba(37, 99, 235, 0.25));
        animation: logo-float 3s ease-in-out infinite;
    }
    .cedims-loader.compact .logo-image {
        width: 100px;
        height: 100px;
    }

    @keyframes logo-float {
        0%, 100% {
            transform: translateY(0px);
        }
        50% {
            transform: translateY(-8px);
        }
    }

    .text-container {
        text-align: center;
    }

    .cedims-text {
        font-size: 1.875rem;
        font-weight: 900;
        letter-spacing: 0.15em;
        background: linear-gradient(135deg, #2563eb 0%, #3b82f6 100%);
        background-clip: text;
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        margin: 0;
    }
    .cedims-loader.compact .cedims-text {
        font-size: 1.5rem;
    }

    .subtitle {
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-transform: uppercase;
        color: #718096;
        margin-top: 0.5rem;
        margin: 0;
        max-width: 240px;
        line-height: 1.4;
    }
    .cedims-loader.compact .subtitle {
        font-size: 0.65rem;
        max-width: 180px;
    }

    .progress-bar {
        width: 160px;
        height: 6px;
        background: linear-gradient(90deg, #e2e8f0 0%, #cbd5e0 100%);
        border-radius: 999px;
        overflow: hidden;
        box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
    }
    .cedims-loader.compact .progress-bar {
        width: 120px;
        height: 4px;
    }

    .progress-fill {
        height: 100%;
        width: 30%;
        border-radius: 999px;
        background: linear-gradient(90deg, #2563eb, #3b82f6, #60a5fa);
        background-size: 200% 100%;
        animation: progress-slide 2s ease-in-out infinite;
        box-shadow: 0 0 10px rgba(37, 99, 235, 0.5);
    }
    @keyframes progress-slide {
        0% {
            width: 10%;
            filter: blur(0px);
        }
        50% {
            width: 60%;
            filter: blur(0.5px);
        }
        100% {
            width: 100%;
            filter: blur(0px);
        }
    }

    .label {
        font-size: 0.8rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #4a5568;
        text-align: center;
        max-width: 240px;
        line-height: 1.4;
    }
    .cedims-loader.compact .label {
        font-size: 0.7rem;
    }
</style>