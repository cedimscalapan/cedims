<script lang="ts">
    interface Props {
        size?: number;
        wave?: boolean;
    }
    let { size = 64, wave = true }: Props = $props();
</script>

<!--
    Gabay's mascot — the school-branded illustration in static/chatbot.png.
    A wrapper span drives the idle "breathing" bob (translateY) and the
    <img> itself drives the wave wiggle (rotate) when `wave` is true, since
    CSS can't run two animations that both target `transform` on the same
    element.
-->
<span class="gabay-bob" style="display:inline-block; width:{size}px; height:{size}px;">
    <img
        src="/chatbot.png"
        alt="Gabay"
        class="gabay"
        class:gabay--waving={wave}
        width={size}
        height={size}
        style="width:{size}px; height:{size}px;"
    />
</span>

<style>
    .gabay {
        display: block;
        border-radius: 9999px;
        object-fit: contain;
        transition: transform 200ms ease;
    }

    /* A little extra bounce on hover/focus for interactive spots (buttons) */
    :global(button:hover) .gabay,
    :global(button:focus-visible) .gabay {
        transform: scale(1.06);
    }

    /* Idle "breathing" bob — always running, purely visual, no JS required */
    .gabay-bob {
        animation: gabay-bob 3.2s ease-in-out infinite;
    }

    @keyframes gabay-bob {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-3px); }
    }

    /* Waving wiggle, only when wave=true */
    .gabay--waving {
        animation: gabay-wave 2.4s ease-in-out infinite;
    }

    @keyframes gabay-wave {
        0%, 8% { transform: rotate(0deg); }
        16% { transform: rotate(-10deg); }
        24% { transform: rotate(8deg); }
        32% { transform: rotate(-6deg); }
        40%, 100% { transform: rotate(0deg); }
    }

    @media (prefers-reduced-motion: reduce) {
        .gabay-bob,
        .gabay--waving {
            animation: none;
        }
    }
</style>
