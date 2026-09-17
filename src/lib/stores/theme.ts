import { writable } from 'svelte/store';

export type Theme = 'light' | 'dark';

// Must match app.html's inline boot script exactly: stored preference wins,
// otherwise fall back to the OS preference. Previously this defaulted to
// 'light' with no system-preference check, so init() would strip the
// `.dark` class the boot script had just added for system-dark users.
function resolveInitialTheme(): Theme {
    if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem('cedims-theme');
        if (stored === 'dark' || stored === 'light') return stored;
    }
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
}

function applyThemeColorMeta(theme: Theme) {
    if (typeof document === 'undefined') return;
    // Keep the browser chrome (status bar / task switcher) in sync with an
    // explicit user choice — the static <meta media="..."> tags in app.html
    // only track the OS preference, not this in-app toggle.
    const color = theme === 'dark' ? '#0f1623' : '#ffffff';
    document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
        el.setAttribute('content', color);
    });
}

function createThemeStore() {
    const initial: Theme = resolveInitialTheme();

    const { subscribe, set, update } = writable<Theme>(initial);

    return {
        subscribe,
        toggle: () => update(t => {
            const next = t === 'light' ? 'dark' : 'light';
            localStorage.setItem('cedims-theme', next);
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', next === 'dark');
            }
            applyThemeColorMeta(next);
            return next;
        }),
        set: (theme: Theme) => {
            localStorage.setItem('cedims-theme', theme);
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', theme === 'dark');
            }
            applyThemeColorMeta(theme);
            set(theme);
        },
        init: () => {
            if (typeof document !== 'undefined') {
                document.documentElement.classList.toggle('dark', initial === 'dark');
            }
            applyThemeColorMeta(initial);
        }
    };
}

export const theme = createThemeStore();
