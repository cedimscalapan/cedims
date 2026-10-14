import { env } from '$env/dynamic/public';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const DEFAULT_LOG_THROTTLE_MS = 60000;
const lastLogAt = new Map<string, number>();

export function shouldUseRealtime(): boolean {
    return env.PUBLIC_ENABLE_REALTIME === 'true';
}

export function shouldVerboseLog(): boolean {
    return env.PUBLIC_VERBOSE_CLIENT_LOGS === 'true' || import.meta.env.DEV;
}

export function isRecoverableNoise(error: unknown): boolean {
    const message = String((error as any)?.message || error || '').toLowerCase();
    return (
        message.includes('failed to fetch') ||
        message.includes('networkerror') ||
        message.includes('network error') ||
        message.includes('offline') ||
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('abort') ||
        message.includes('auth session missing') ||
        message.includes('jwt expired')
    );
}

export function logOnce(
    key: string,
    level: LogLevel,
    message: string,
    detail?: unknown,
    throttleMs = DEFAULT_LOG_THROTTLE_MS
) {
    if (!shouldVerboseLog() && level !== 'error') return;
    if (!shouldVerboseLog() && isRecoverableNoise(detail)) return;

    const now = Date.now();
    const last = lastLogAt.get(key) || 0;
    if (now - last < throttleMs) return;
    lastLogAt.set(key, now);

    const logger = console[level] || console.log;
    if (detail === undefined) logger(message);
    else logger(message, detail);
}
