import { cacheMetadata, getCachedMetadata } from "./offline";

export interface CachedPayload<T> {
    data: T;
    timestamp: number;
    stale: boolean;
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000;
const CACHE_VERSION = "v2";

export async function readLocalData<T>(
    key: string,
    maxAgeMs = DEFAULT_MAX_AGE,
): Promise<CachedPayload<T> | null> {
    const cached = await getCachedMetadata(key);
    if (!cached || cached.data === undefined) return null;

    const timestamp = Number(cached.timestamp || 0);
    return {
        data: cached.data as T,
        timestamp,
        stale: Date.now() - timestamp > maxAgeMs,
    };
}

export async function writeLocalData<T>(key: string, data: T): Promise<void> {
    await cacheMetadata(key, data);
}

export function makeScopedCacheKey(
    scope: string,
    role: string | null | undefined,
    userId: string | null | undefined,
): string {
    return `${CACHE_VERSION}_${scope}_${role || "unknown"}_${userId || "anonymous"}`;
}
