<script lang="ts">
    import { X, Send, RefreshCw } from "lucide-svelte";
    import { processQuery, loadDllDocumentsFromSupabase } from "$lib/utils/chatbot";
    import type { ChatResponse, Intent, ChatContext, Lang } from "$lib/utils/chatbot";
    import { supabase } from "$lib/utils/supabase";
    import { user, profile } from "$lib/utils/auth";
    import { onMount, tick } from "svelte";
    import { fly, scale } from "svelte/transition";
    import { page } from "$app/stores";
    import GabayMascot from "./GabayMascot.svelte";

    // Dashboard pages carry a bottom tab bar at every screen size, so the
    // floating button/panel need extra clearance there; other pages don't.
    const inDashboard = $derived($page.url.pathname.startsWith("/dashboard"));

    let isOpen = $state(false);
    let hasOpenedOnce = $state(false);
    let messages: { role: 'user' | 'bot'; text: string; intent?: Intent }[] = $state([]);
    let inputText = $state('');
    let inputEl: HTMLInputElement | undefined = $state();
    let launcherEl: HTMLButtonElement | undefined = $state();
    let messagesEl: HTMLDivElement | undefined = $state();
    let isLoading = $state(false);
    // Set when the panel is closed by the user rather than by navigation, so
    // focus goes back to the launcher instead of to the top of the document.
    let restoreFocusOnClose = false;

    let currentUser = $state<{ id: string } | null>(null);
    let currentProfile = $state<{ id: string; full_name: string; role: string; school_id: string | null; district_id: string | null } | null>(null);
    let lastIntent = $state<Intent | undefined>(undefined);
    let lastSlots = $state<Record<string, string>>({});
    let lastLang = $state<Lang | undefined>(undefined);
    let dllDocsLoaded = $state(false);

    // Gabay answers in English or Tagalog (see detectLanguage in
    // utils/chatbot.ts), which a user has no way to discover unless the
    // opening message says so.
    const greeting =
        "Hi, I'm Gabay — your CEDIMS assistant. I can check your compliance rate, " +
        "look up deadlines, find DLLs and compare schools, using live data. " +
        "Ask me in English or Tagalog.";

    const suggestions = [
        "What is my compliance rate?",
        "When is the next deadline?",
        "How do I upload a DLL?",
        "Find DLLs about fractions",
        "Compare schools in the district",
        "Kailan ang susunod na deadline?"
    ];

    onMount(() => {
        messages.push({ role: 'bot', text: greeting, intent: 'general_help' });
        const unsubUser = user.subscribe((u) => currentUser = u as { id: string } | null);
        const unsubProfile = profile.subscribe((p) => currentProfile = p as any);
        return () => { unsubUser(); unsubProfile(); };
    });

    // Load DLL search documents lazily, only when the chat is first opened.
    // This avoids pulling up to 1000 OCR-text submissions on every page load,
    // which was a major cause of slow initial renders.
    $effect(() => {
        if (isOpen && !dllDocsLoaded) {
            dllDocsLoaded = true;
            loadDllDocumentsFromSupabase(supabase).catch(() => {});
        }
    });

    // Opening the panel should feel like opening a real chat app: focus the
    // input immediately, and remember it's been opened so the launcher's
    // one-time attention ping never shows again this session.
    $effect(() => {
        if (isOpen) {
            hasOpenedOnce = true;
            tick().then(() => inputEl?.focus());
        }
    });

    // Closing an overlay should hand focus back to what opened it, or a
    // keyboard user is dropped at the top of the page with no idea where the
    // chat went.
    $effect(() => {
        if (!isOpen && restoreFocusOnClose && launcherEl) {
            restoreFocusOnClose = false;
            launcherEl.focus();
        }
    });

    // Escape closes the panel, same as any other overlay in the app.
    $effect(() => {
        if (!isOpen) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') closePanel();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    });

    // Always keep the latest message in view — without this the user has to
    // manually scroll down after every reply, which reads as broken in any
    // real chat UI.
    $effect(() => {
        const count = messages.length;
        isLoading;
        // Nothing has been asked yet, so there is no "latest reply" to follow —
        // leave the greeting scrolled to its start.
        if (count <= 1) return;
        if (messagesEl) {
            tick().then(() => {
                if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
            });
        }
    });

    function closePanel() {
        restoreFocusOnClose = true;
        isOpen = false;
    }

    function resetChat() {
        messages = [{ role: 'bot', text: greeting, intent: 'general_help' }];
        lastIntent = undefined;
        lastSlots = {};
        lastLang = undefined;
        inputText = '';
        isLoading = false;
        inputEl?.focus();
    }

    async function handleSend() {
        const q = inputText.trim();
        if (!q || isLoading) return;

        messages.push({ role: 'user', text: q });
        inputText = '';
        isLoading = true;

        const ctx: ChatContext = {
            supabase,
            userId: currentUser?.id,
            profile: currentProfile,
            memory: { lastIntent, lastSlots, lastLang }
        };

        try {
            const response: ChatResponse = await processQuery(q, ctx);
            messages.push({ role: 'bot', text: response.answer, intent: response.intent });
            lastIntent = response.intent;
            lastSlots = response.slots;
            lastLang = response.lang;
        } catch (err) {
            // A query that throws — an offline Supabase call is the common
            // case — used to leave the typing indicator running forever with
            // no reply and no way to tell the request had failed.
            console.error('[chatbot] Query failed:', err);
            messages.push({
                role: 'bot',
                text: "Sorry — I couldn't reach the records just now. Check your connection and try asking again."
            });
        } finally {
            isLoading = false;
        }
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey && !isLoading) {
            e.preventDefault();
            handleSend();
        }
    }

    function applySuggestion(s: string) {
        inputText = s;
        // Auto-focus input and send
        inputEl?.focus();
        setTimeout(() => handleSend(), 100);
    }
</script>

<!-- Floating button -->
{#if !isOpen}
    <button
        bind:this={launcherEl}
        data-tour="chatbot"
        onclick={() => (isOpen = true)}
        transition:scale={{ duration: 150, start: 0.85 }}
        class="fixed right-6 z-50 w-16 h-16 bg-surface-white rounded-full shadow-lg border border-border-subtle flex items-center justify-center transition-[color,background-color,border-color,transform] duration-200 ease-out hover:scale-105 hover:shadow-xl active:scale-95 {inDashboard
            ? 'bottom-24'
            : 'bottom-6'}"
        aria-label="Open Gabay, the CEDIMS chat assistant"
    >
        {#if !hasOpenedOnce}
            <span class="absolute inset-0 rounded-full bg-gov-blue/30 animate-ping" aria-hidden="true"></span>
        {/if}
        <span class="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-gov-green border-2 border-surface-white" aria-hidden="true"></span>
        <GabayMascot size={44} />
    </button>
{:else}
    <!-- Chat window. Not aria-modal: the page behind it stays usable, and
         claiming otherwise hides the rest of the app from screen readers. -->
    <div
        transition:fly={{ y: 24, duration: 200, opacity: 0 }}
        class="fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border-subtle bg-surface-white shadow-2xl transition-colors duration-200 inset-x-4 sm:inset-x-auto sm:right-6 sm:w-96 h-[min(32rem,calc(100dvh-6rem))] {inDashboard
            ? 'bottom-24'
            : 'bottom-6'}"
        role="dialog"
        aria-label="Gabay chat assistant"
    >
        <!-- Header -->
        <div class="bg-gov-blue text-white px-4 py-3.5 flex items-center justify-between gap-2 shrink-0">
            <div class="flex items-center gap-3 min-w-0">
                <div class="relative w-9 h-9 bg-surface-white rounded-full flex items-center justify-center shrink-0 overflow-hidden">
                    <GabayMascot size={26} wave={false} />
                    <span class="absolute -bottom-0 -right-0 w-2.5 h-2.5 rounded-full bg-gov-green border-2 border-gov-blue" aria-hidden="true"></span>
                </div>
                <div class="min-w-0">
                    <p class="text-sm font-bold leading-tight">Gabay</p>
                    <p class="text-[11px] leading-tight text-white/85">English or Tagalog · live data</p>
                </div>
            </div>
            <div class="flex items-center gap-0.5 shrink-0">
                <button
                    onclick={resetChat}
                    disabled={messages.length <= 1}
                    class="hover:bg-surface-white/20 rounded-lg p-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    aria-label="Start a new conversation"
                    title="Start a new conversation"
                >
                    <RefreshCw size={16} />
                </button>
                <button
                    onclick={closePanel}
                    class="hover:bg-surface-white/20 rounded-lg p-2 transition-colors"
                    aria-label="Close chat"
                >
                    <X size={18} />
                </button>
            </div>
        </div>

        <!-- Messages. role="log" so replies are announced as they arrive
             rather than sitting silently in the DOM. -->
        <div
            bind:this={messagesEl}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            class="flex-1 overflow-y-auto p-4 space-y-3 bg-surface-muted scroll-smooth"
        >
            {#each messages as msg, i (i)}
                <div
                    in:fly={{ y: 8, duration: 180 }}
                    class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}"
                >
                    {#if msg.role === 'bot'}
                        <div class="flex items-start gap-2 max-w-[85%]">
                            <div class="w-7 h-7 bg-surface-white border border-border-subtle rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                                <GabayMascot size={20} wave={false} />
                            </div>
                            <div class="bg-surface-white border border-border-subtle rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-text-primary leading-relaxed shadow-sm">
                                <span class="sr-only">Gabay said: </span>{msg.text}
                            </div>
                        </div>
                    {:else}
                        <div class="bg-gov-blue text-white rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm leading-relaxed max-w-[85%] shadow-sm">
                            <span class="sr-only">You said: </span>{msg.text}
                        </div>
                    {/if}
                </div>
            {/each}

            {#if isLoading}
                <div class="flex justify-start">
                    <div class="flex items-start gap-2 max-w-[85%]">
                        <div class="w-7 h-7 bg-surface-white border border-border-subtle rounded-full flex items-center justify-center shrink-0 mt-0.5 overflow-hidden">
                            <GabayMascot size={20} wave={false} />
                        </div>
                        <div class="bg-surface-white border border-border-subtle rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                            <span class="sr-only">Gabay is typing…</span>
                            <div class="flex gap-1" aria-hidden="true">
                                <span class="w-1.5 h-1.5 bg-gov-blue/60 rounded-full animate-bounce" style="animation-delay: 0ms"></span>
                                <span class="w-1.5 h-1.5 bg-gov-blue/60 rounded-full animate-bounce" style="animation-delay: 150ms"></span>
                                <span class="w-1.5 h-1.5 bg-gov-blue/60 rounded-full animate-bounce" style="animation-delay: 300ms"></span>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- Suggestions on first message -->
            {#if messages.length === 1}
                <div class="mt-3">
                    <p class="text-xs text-text-muted font-semibold mb-2">Try asking:</p>
                    <div class="flex flex-wrap gap-1.5">
                        {#each suggestions as s}
                            <button
                                onclick={() => applySuggestion(s)}
                                class="text-xs bg-surface-white border border-border-subtle rounded-full px-3 py-1.5 text-text-secondary hover:bg-gov-blue/5 hover:border-gov-blue/30 hover:text-gov-blue transition-colors"
                            >
                                {s}
                            </button>
                        {/each}
                    </div>
                </div>
            {/if}
        </div>

        <!-- Input -->
        <div class="px-4 py-3 border-t border-border-subtle bg-surface-white shrink-0">
            <div class="flex items-center gap-2 bg-surface-muted rounded-xl border border-border-subtle px-3 py-2 focus-within:border-gov-blue/50 focus-within:bg-surface-white transition-colors">
                <label for="gabay-input" class="sr-only">Ask Gabay a question</label>
                <input
                    id="gabay-input"
                    bind:this={inputEl}
                    type="text"
                    bind:value={inputText}
                    onkeydown={handleKeydown}
                    placeholder="Ask a question…"
                    enterkeyhint="send"
                    autocomplete="off"
                    class="flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
                />
                <button
                    onclick={handleSend}
                    disabled={!inputText.trim() || isLoading}
                    class="p-1.5 rounded-lg text-gov-blue hover:bg-gov-blue/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Send message"
                >
                    <Send size={16} />
                </button>
            </div>
        </div>
    </div>
{/if}
