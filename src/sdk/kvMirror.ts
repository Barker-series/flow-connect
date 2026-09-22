/**
 * A synchronous in-memory mirror of one RUN appStorage key.
 *
 * Browser storage (`localStorage` and friends) is not available inside the RUN
 * game iframe — it throws in the opaque-origin sandbox, and the SDK's build
 * check refuses to ship it. Small bookkeeping values that code wants to read
 * synchronously (the once-ever analytics marks, the like-prompt counter) live
 * here instead: hydrated from appStorage once at boot, read from memory after
 * that, and written back fire-and-forget.
 */
import { readAppStorage, writeAppStorage } from "./runSdk.ts";

export interface KvMirror {
    /** Read the stored value once. Call after `initSdk()`. Never throws. */
    hydrate(): Promise<void>;
    get(): string | null;
    set(value: string): void;
    remove(): void;
}

export function createKvMirror(key: string): KvMirror {
    let value: string | null = null;
    let hydrated = false;
    let dirty = false;
    return {
        async hydrate() {
            if (hydrated) return;
            hydrated = true;
            const stored = await readAppStorage(key);
            // A write that landed before hydration wins: it is newer.
            if (!dirty && stored.ok) value = stored.value;
        },
        get() {
            return value;
        },
        set(next) {
            value = next;
            dirty = true;
            void writeAppStorage(key, next);
        },
        remove() {
            value = null;
            dirty = true;
            void writeAppStorage(key, "");
        },
    };
}
