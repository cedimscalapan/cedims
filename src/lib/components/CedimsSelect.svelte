<script lang="ts">
    import { onMount, tick } from 'svelte';
    import { ChevronDown, ChevronUp } from 'lucide-svelte';

    type Option = { value: any; label: string; disabled?: boolean };
    let {
        value = $bindable(),
        options,
        ariaLabel,
        placeholder = 'Select an option',
        onChange,
        compact = false,
        disabled = false
    }: {
        value: any;
        options: Option[];
        ariaLabel: string;
        placeholder?: string;
        onChange?: (value: any) => void;
        compact?: boolean;
        disabled?: boolean;
    } = $props();

    let open = $state(false);
    let trigger: HTMLButtonElement;
    let menu = $state<HTMLDivElement>();
    let activeIndex = $state(0);
    let position = $state({ top: 0, left: 0, width: 0, maxHeight: 280 });
    const selected = $derived(options.find((item) => Object.is(item.value, value)));

    function portal(node: HTMLElement) {
        document.body.appendChild(node);
        return { destroy: () => node.remove() };
    }

    function placeMenu() {
        if (!trigger) return;
        const rect = trigger.getBoundingClientRect();
        const below = window.innerHeight - rect.bottom - 12;
        const above = rect.top - 12;
        const height = Math.min(280, Math.max(120, Math.max(below, above)));
        position = {
            top: below >= Math.min(220, height) || below >= above ? rect.bottom + 6 : Math.max(8, rect.top - height - 6),
            left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
            width: Math.min(rect.width, window.innerWidth - 16),
            maxHeight: height
        };
    }

    async function showMenu() {
        if (disabled) return;
        if (open) { open = false; return; }
        activeIndex = Math.max(0, options.findIndex((item) => Object.is(item.value, value)));
        placeMenu();
        open = true;
        await tick();
        menu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[activeIndex]?.focus();
    }

    function choose(option: Option) {
        if (option.disabled) return;
        value = option.value;
        open = false;
        trigger?.focus();
        onChange?.(option.value);
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Escape') { event.preventDefault(); open = false; trigger?.focus(); return; }
        if (event.key === 'Tab') { event.preventDefault(); open = false; trigger?.focus(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        if (!options.length) return;
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (activeIndex + direction + options.length) % options.length;
        activeIndex = next;
        menu?.querySelectorAll<HTMLButtonElement>('[role="option"]')[next]?.focus();
    }

    onMount(() => {
        const onOutside = (event: PointerEvent) => {
            if (open && !trigger?.contains(event.target as Node) && !menu?.contains(event.target as Node)) open = false;
        };
        const onWindowChange = () => { if (open) placeMenu(); };
        document.addEventListener('pointerdown', onOutside);
        window.addEventListener('resize', onWindowChange);
        window.addEventListener('scroll', onWindowChange, true);
        return () => {
            document.removeEventListener('pointerdown', onOutside);
            window.removeEventListener('resize', onWindowChange);
            window.removeEventListener('scroll', onWindowChange, true);
        };
    });
</script>

<button bind:this={trigger} type="button" class:compact class="cedims-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} {disabled} onclick={showMenu} onkeydown={(event) => {
    if (!open && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); void showMenu(); }
}}>
    <span>{selected?.label ?? placeholder}</span>
    {#if open}<ChevronUp size={20} aria-hidden="true" />{:else}<ChevronDown size={20} aria-hidden="true" />{/if}
</button>
{#if open}
    <div bind:this={menu} use:portal class="cedims-menu" role="listbox" tabindex="-1" aria-label={ariaLabel} style:top={`${position.top}px`} style:left={`${position.left}px`} style:width={`${position.width}px`} style:max-height={`${position.maxHeight}px`} onkeydown={onKeydown}>
        {#each options as option, index}
            <button type="button" role="option" aria-selected={Object.is(option.value, value)} class:active={Object.is(option.value, value)} disabled={option.disabled} tabindex={index === activeIndex ? 0 : -1} onclick={() => choose(option)} onfocus={() => activeIndex = index}>{option.label}</button>
        {/each}
    </div>
{/if}

<style>
    .cedims-trigger { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-width: 0; min-height: 46px; padding: 9px 14px; border: 1px solid var(--color-border-subtle); border-radius: 9px; background: var(--color-surface-white); color: var(--color-gov-blue); font-size: 17px; font-weight: 800; line-height: 1.3; text-align: left; cursor: pointer; }
    .cedims-trigger span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cedims-trigger :global(svg) { flex: none; }
    .cedims-trigger.compact { min-height: 42px; font-size: 15px; padding: 8px 12px; }
    .cedims-trigger:focus-visible, .cedims-menu button:focus-visible { outline: 2px solid var(--color-gov-blue); outline-offset: 2px; }
    .cedims-trigger:disabled { opacity: .55; cursor: not-allowed; }
    .cedims-menu { position: fixed; z-index: 1000; overflow-y: auto; overscroll-behavior: contain; border: 1px solid var(--color-border-subtle); border-radius: 10px; background: var(--color-surface-white); box-shadow: 0 18px 36px rgba(15, 23, 42, .16); padding: 0; }
    .cedims-menu button { display: block; width: 100%; min-height: 46px; padding: 10px 16px; color: var(--color-text-primary); font-size: 17px; font-weight: 800; text-align: left; cursor: pointer; }
    .cedims-menu button:hover, .cedims-menu button:focus-visible, .cedims-menu button.active { background: var(--color-surface-muted); color: var(--color-gov-blue); }
    .cedims-menu button:disabled { opacity: .5; cursor: not-allowed; }
    @media (max-width: 640px) { .cedims-trigger { font-size: 16px; min-height: 48px; } .cedims-menu button { font-size: 16px; min-height: 48px; } }
</style>
