/**
 * Svelte action that traps Tab/Shift+Tab focus cycling within a modal-like
 * container, moves focus into it on mount, and restores focus to the
 * previously-focused element on destroy. Use with `use:focusTrap` on the
 * outermost dialog element.
 */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function focusTrap(node: HTMLElement) {
    const previouslyFocused = document.activeElement as HTMLElement | null;

    function getFocusable(): HTMLElement[] {
        return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
            (el) => el.offsetParent !== null,
        );
    }

    function handleKeydown(e: KeyboardEvent) {
        if (e.key !== "Tab") return;
        const focusable = getFocusable();
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }

    // Move focus into the dialog on open
    const initial = getFocusable();
    (initial[0] || node).focus();

    node.addEventListener("keydown", handleKeydown);

    return {
        destroy() {
            node.removeEventListener("keydown", handleKeydown);
            previouslyFocused?.focus?.();
        },
    };
}
