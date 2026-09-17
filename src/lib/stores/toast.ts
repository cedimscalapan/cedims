import { writable } from 'svelte/store';

export interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info' | 'warning';
    message: string;
}

let nextId = 0;

function createToastStore() {
    const { subscribe, update } = writable<ToastMessage[]>([]);

    return {
        subscribe,
        add(type: ToastMessage['type'], message: string, duration = 5000) {
            const id = nextId++;
            update((items) => [...items, { id, type, message }]);
            if (duration > 0) {
                setTimeout(() => this.remove(id), duration);
            }
        },
        remove(id: number) {
            update((items) => items.filter((t) => t.id !== id));
        }
    };
}

export const toasts = createToastStore();
export const addToast = (type: ToastMessage['type'], message: string) => toasts.add(type, message);
