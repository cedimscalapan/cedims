<script lang="ts">
    import { profile } from "$lib/utils/auth";
    import {
        hasSeenWalkthrough,
        markWalkthroughSeen,
        walkthroughReplayRequested,
    } from "$lib/stores/walkthrough";
    import { walkthroughGuides, walkthroughHeaderSteps, type WalkthroughStep } from "$lib/config/walkthroughSteps";
    import { getNavItemsForRole } from "$lib/config/navigation";
    import { fade, scale } from "svelte/transition";
    import { focusTrap } from "$lib/actions/focusTrap";
    import { tick, onDestroy } from "svelte";
    import { BadgeCheck, PartyPopper, ChevronLeft, ChevronRight, X } from "lucide-svelte";

    let visible = $state(false);
    let stepIndex = $state(0);
    let steps = $state<WalkthroughStep[]>([]);
    let emoji = $state("👋");
    let cardStyle = $state("");
    let arrowSide = $state<"top" | "bottom" | "none">("none");
    let checkedUserId: string | null = null;

    let currentEl: HTMLElement | null = null;
    let resizeHandler: (() => void) | null = null;

    const currentStep = $derived(steps[stepIndex]);
    const totalSteps = $derived(steps.length);
    const progress = $derived(totalSteps > 0 ? ((stepIndex + 1) / totalSteps) * 100 : 0);

    function buildSteps(role: string): WalkthroughStep[] {
        const guide = walkthroughGuides[role] || walkthroughGuides["Teacher"];
        return [
            { title: "Welcome to CEDIMS", content: guide.intro, target: null },
            ...guide.navSteps,
            ...walkthroughHeaderSteps,
            {
                title: "You're All Set!",
                content: "Explore at your own pace — you can replay this walkthrough any time from Settings.",
                target: null,
            },
        ];
    }

    function getVisibleTarget(key: string): HTMLElement | null {
        const candidates = document.querySelectorAll<HTMLElement>(
            `[data-nav="${key}"], [data-tour="${key}"]`,
        );
        for (const el of candidates) {
            // el.offsetParent is spec'd to be null for position: fixed
            // elements — regardless of whether they're actually visible —
            // so it always failed to find the chatbot launcher (a fixed
            // floating button) and the "Meet Gabay" step never highlighted
            // anything real. getClientRects().length works the same way
            // across every position scheme: zero rects means not rendered
            // (display: none or not in the DOM's layout at all), and that's
            // the only case we actually want to skip.
            if (el.getClientRects().length > 0) return el;
        }
        return null;
    }

    function clearHighlight() {
        if (currentEl) {
            currentEl.classList.remove("walkthrough-spotlight", "walkthrough-spotlight-fixed");
            currentEl = null;
        }
    }

    async function positionAround(el: HTMLElement) {
        await tick();
        const rect = el.getBoundingClientRect();
        const cardWidth = 320;
        const margin = 12;
        const spaceBelow = window.innerHeight - rect.bottom;

        let left = rect.left + rect.width / 2 - cardWidth / 2;
        left = Math.max(16, Math.min(left, window.innerWidth - cardWidth - 16));

        if (spaceBelow > 220 || rect.top < window.innerHeight / 2) {
            // Enough room below, or target is in the upper half — place card below it
            cardStyle = `top: ${rect.bottom + margin}px; left: ${left}px; width: ${cardWidth}px;`;
            arrowSide = "top";
        } else {
            // Target is low on screen (e.g. bottom nav) — place card above it
            cardStyle = `bottom: ${window.innerHeight - rect.top + margin}px; left: ${left}px; width: ${cardWidth}px;`;
            arrowSide = "bottom";
        }
    }

    async function updateHighlight() {
        clearHighlight();
        const target = currentStep?.target;
        if (!target) {
            cardStyle = "";
            arrowSide = "none";
            return;
        }
        const el = getVisibleTarget(target);
        if (!el) {
            cardStyle = "";
            arrowSide = "none";
            return;
        }
        currentEl = el;
        // The chatbot launcher (and anything else already position: fixed)
        // must keep that positioning — forcing "relative" here (the class
        // used for normal-flow nav items) used to yank it out of its floating
        // spot and into the document flow, so it never actually looked
        // highlighted during the "Meet Gabay" step.
        const isPositioned = getComputedStyle(el).position !== "static";
        el.classList.add(isPositioned ? "walkthrough-spotlight-fixed" : "walkthrough-spotlight");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        await positionAround(el);
        // Re-measure after the smooth scroll settles
        setTimeout(() => currentEl && positionAround(currentEl), 350);
    }

    $effect(() => {
        const p = $profile;
        if (p && checkedUserId !== p.id) {
            checkedUserId = p.id;
            if (!hasSeenWalkthrough(p.id)) {
                startTour(p.role);
            }
        }
    });

    $effect(() => {
        if ($walkthroughReplayRequested && $profile) {
            startTour($profile.role);
            walkthroughReplayRequested.set(false);
        }
    });

    function startTour(role: string) {
        const guide = walkthroughGuides[role] || walkthroughGuides["Teacher"];
        emoji = guide.emoji;
        steps = buildSteps(role);
        stepIndex = 0;
        visible = true;
    }

    $effect(() => {
        if (visible && currentStep) {
            updateHighlight();
        }
    });

    $effect(() => {
        if (!visible) return;
        resizeHandler = () => currentEl && positionAround(currentEl);
        window.addEventListener("resize", resizeHandler);
        window.addEventListener("scroll", resizeHandler, true);
        return () => {
            if (resizeHandler) {
                window.removeEventListener("resize", resizeHandler);
                window.removeEventListener("scroll", resizeHandler, true);
            }
        };
    });

    function next() {
        if (stepIndex < totalSteps - 1) {
            stepIndex++;
        } else {
            finish();
        }
    }

    function prev() {
        if (stepIndex > 0) stepIndex--;
    }

    function finish() {
        visible = false;
        clearHighlight();
        if ($profile) markWalkthroughSeen($profile.id);
    }

    onDestroy(() => {
        clearHighlight();
        if (resizeHandler) {
            window.removeEventListener("resize", resizeHandler);
            window.removeEventListener("scroll", resizeHandler, true);
        }
    });
</script>

{#if visible && currentStep}
    <!-- Dim backdrop. Sits below the spotlighted element (--z-tour-spotlight)
         so that element stays genuinely clickable, but blocks stray clicks on
         the rest of the page so the tour doesn't get derailed. Clicking the
         dimmed area closes the tour, same as clicking outside any modal. -->
    <div
        class="fixed inset-0 z-[var(--z-tour-backdrop)]"
        style="background: rgba(15, 23, 42, {currentStep.target ? '0.55' : '0.6'});"
        onclick={finish}
        onkeydown={(e) => { if (e.key === 'Escape') finish(); }}
        transition:fade={{ duration: 150 }}
        role="presentation"
    ></div>

    <div
        class={currentStep.target
            ? "fixed z-[var(--z-tour-card)]"
            : "fixed inset-0 z-[var(--z-tour-card)] flex items-center justify-center p-4"}
        style={currentStep.target ? cardStyle : ""}
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => { e.stopPropagation(); if (e.key === "Escape") finish(); }}
        role="presentation"
    >
        <div
            class="relative bg-surface-white rounded-2xl shadow-2xl overflow-hidden {currentStep.target ? 'w-full' : 'w-full max-w-sm'}"
            role="dialog"
            aria-modal="true"
            aria-label="System walkthrough"
            tabindex="-1"
            use:focusTrap
            transition:scale={{ start: 0.96, duration: 180 }}
        >
            {#if arrowSide === "top"}
                <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-surface-white rotate-45"></div>
            {:else if arrowSide === "bottom"}
                <div class="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-surface-white rotate-45"></div>
            {/if}

            <div class="relative px-5 pt-6 pb-4">
                <button
                    onclick={finish}
                    class="absolute top-3 right-3 p-1.5 rounded-full text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
                    aria-label="Close walkthrough"
                >
                    <X size={16} />
                </button>

                {#if !currentStep.target}
                    <div class="mx-auto w-14 h-14 rounded-full bg-gov-blue/10 flex items-center justify-center mb-3 text-2xl">
                        {#if stepIndex === 0}
                            {emoji}
                        {:else}
                            <PartyPopper size={26} class="text-gov-blue" />
                        {/if}
                    </div>
                {/if}

                <h2 class="text-base font-bold text-text-primary {currentStep.target ? '' : 'text-center'}">
                    {currentStep.title}
                </h2>
                <p class="text-sm text-text-secondary mt-1.5 leading-relaxed {currentStep.target ? '' : 'text-center'}">
                    {currentStep.content}
                </p>
                {#if currentStep.tip}
                    <p class="text-xs text-gov-gold-dark bg-gov-gold/10 rounded-lg px-3 py-2 mt-3 font-medium">
                        {currentStep.tip}
                    </p>
                {/if}
            </div>

            <div class="px-5 pb-5">
                <div class="flex items-center gap-1.5 mb-3">
                    {#each steps as _, i}
                        <span class="h-1 flex-1 rounded-full transition-colors {i <= stepIndex ? 'bg-gov-blue' : 'bg-border-subtle'}"></span>
                    {/each}
                </div>
                <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                        {stepIndex + 1} / {totalSteps}
                    </span>
                    <div class="flex gap-2">
                        {#if stepIndex > 0}
                            <button
                                onclick={prev}
                                class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border-strong text-xs font-bold text-text-primary hover:bg-surface-muted transition-colors"
                            >
                                <ChevronLeft size={14} />
                                Back
                            </button>
                        {/if}
                        <button
                            onclick={next}
                            class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-gov-blue text-white text-xs font-bold hover:bg-gov-blue-dark transition-colors"
                        >
                            {stepIndex === totalSteps - 1 ? "Done" : "Next"}
                            {#if stepIndex < totalSteps - 1}
                                <ChevronRight size={14} />
                            {/if}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    :global(.walkthrough-spotlight),
    :global(.walkthrough-spotlight-fixed) {
        z-index: var(--z-tour-spotlight) !important;
        border-radius: 12px;
        background-color: var(--color-surface-white);
        box-shadow:
            0 0 0 4px var(--color-gov-blue, #2563eb),
            0 0 0 9999px rgba(15, 23, 42, 0.6);
        transition: box-shadow 200ms ease;
    }

    /* Only normal-flow elements (nav items, header buttons) need forcing to
       "relative" so z-index takes effect. Already-positioned elements (the
       fixed chatbot launcher) keep their own position so they don't jump. */
    :global(.walkthrough-spotlight) {
        position: relative !important;
    }
</style>
