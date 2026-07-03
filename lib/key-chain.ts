// --- Key Management & Rotation Setup ---

export interface KeyRecord {
    key: string;
    index: number;
    cooldownUntil: number;
}

export const COOLDOWN_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
export let keyPool: KeyRecord[] = [];
let keysInitialized = false;

/**
 * Initializes the key pool from environment variables (OPENROUTER_KEY_1 to 7).
 * Runs once during the server lifecycle.
 */
export function initKeys() {
    if (keysInitialized) return;

    for (let i = 1; i <= 7; i++) {
        const k = process.env[`OPENROUTER_KEY_${i}`];
        if (k) {
            keyPool.push({ key: k, index: i, cooldownUntil: 0 });
        }
    }

    if (keyPool.length === 0) {
        throw new Error("No OPENROUTER_KEY_x found in environment variables.");
    }

    keysInitialized = true;
    console.log(`Initialized OpenRouter key pool with ${keyPool.length} keys.`);
}