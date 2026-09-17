<script lang="ts">
    interface Props {
        size?: number;
        wave?: boolean;
    }
    let { size = 64, wave = true }: Props = $props();
</script>

<!--
    Gabay's mascot, inlined (not <img src>) so its idle animations run purely
    in CSS — no JS, no network, no backend. It stays "alive" (breathing bob +
    periodic blink) at all times, and waves hello when `wave` is true. Because
    everything here is a self-contained CSS animation, it keeps working even
    when the app is offline or Supabase is unreachable — only the chat
    responses depend on connectivity, not the character itself.
-->
<svg
    class="gabay"
    class:gabay--waving={wave}
    width={size}
    height={size * 1.25}
    viewBox="0 0 240 300"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Gabay"
>
    <!-- Ground shadow -->
    <ellipse cx="120" cy="288" rx="56" ry="8" fill="#1e293b" opacity="0.08" />

    <g class="gabay-bob">
        <!-- Relaxed arm -->
        <path d="M 62 172 L 26 208" stroke="#3b82f6" stroke-width="20" stroke-linecap="round" fill="none" />

        <!-- Waving arm -->
        <path
            class="gabay-wave-arm"
            d="M 178 172 L 212 118"
            stroke="#3b82f6"
            stroke-width="20"
            stroke-linecap="round"
            fill="none"
        />

        <!-- Feet -->
        <ellipse cx="99" cy="280" rx="15" ry="9" fill="#2563eb" />
        <ellipse cx="141" cy="280" rx="15" ry="9" fill="#2563eb" />

        <!-- Body (rounded teardrop — a friendly torch/flame silhouette) -->
        <path
            d="M 120 22
               C 160 62 190 106 190 158
               C 190 223 161 274 120 274
               C 79 274 50 223 50 158
               C 50 106 80 62 120 22 Z"
            fill="url(#gabayBodyGradient)"
        />

        <!-- Soft gloss highlight -->
        <ellipse cx="88" cy="92" rx="17" ry="32" fill="#ffffff" opacity="0.22" transform="rotate(-18 88 92)" />

        <!-- Face patch -->
        <ellipse cx="120" cy="182" rx="45" ry="49" fill="#fbfcff" />

        <!-- Eyes -->
        <g class="gabay-eyes">
            <circle cx="103" cy="174" r="7.5" fill="#25324a" />
            <circle cx="137" cy="174" r="7.5" fill="#25324a" />
            <circle cx="100.5" cy="171" r="2.4" fill="#ffffff" />
            <circle cx="134.5" cy="171" r="2.4" fill="#ffffff" />
        </g>

        <!-- Cheeks -->
        <ellipse cx="90" cy="190" rx="8" ry="5" fill="#fca5c8" opacity="0.45" />
        <ellipse cx="150" cy="190" rx="8" ry="5" fill="#fca5c8" opacity="0.45" />

        <!-- Smile -->
        <path d="M 102 197 Q 120 211 138 197" stroke="#25324a" stroke-width="5" stroke-linecap="round" fill="none" />
    </g>

    <defs>
        <linearGradient id="gabayBodyGradient" x1="20%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stop-color="#60a5fa" />
            <stop offset="55%" stop-color="#3b82f6" />
            <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
    </defs>
</svg>

<style>
    .gabay {
        overflow: visible;
        transition: transform 200ms ease;
    }

    /* A little extra bounce on hover/focus for interactive spots (buttons) */
    :global(button:hover) .gabay,
    :global(button:focus-visible) .gabay {
        transform: scale(1.06);
    }

    /* Idle "breathing" bob — always running, purely visual, no JS required */
    .gabay-bob {
        transform-origin: 120px 280px;
        animation: gabay-bob 3.2s ease-in-out infinite;
    }

    @keyframes gabay-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-5px); }
    }

    /* Periodic blink */
    .gabay-eyes {
        transform-origin: 120px 174px;
        animation: gabay-blink 4.5s ease-in-out infinite;
    }

    @keyframes gabay-blink {
        0%, 92%, 100% { transform: scaleY(1); }
        95% { transform: scaleY(0.1); }
    }

    /* Waving arm, only when wave=true */
    .gabay--waving .gabay-wave-arm {
        transform-origin: 178px 172px;
        animation: gabay-wave 1.8s ease-in-out infinite;
    }

    @keyframes gabay-wave {
        0%, 100% { transform: rotate(0deg); }
        25% { transform: rotate(-14deg); }
        50% { transform: rotate(0deg); }
        75% { transform: rotate(-8deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        .gabay-bob,
        .gabay-eyes,
        .gabay-wave-arm {
            animation: none;
        }
    }
</style>
