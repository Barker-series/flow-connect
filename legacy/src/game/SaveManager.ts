import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

export interface SaveData {
    version: number;
    completedLevels: number[];
    bestMoves: Record<number, number>;
    lastPlayedLevel: number;
}

const SAVE_KEY = "flowconnect_save";

function getDefaultSave(): SaveData {
    return {
        version: 1,
        completedLevels: [],
        bestMoves: {},
        lastPlayedLevel: 0,
    };
}

let cache: SaveData | null = null;

export async function loadSave(): Promise<SaveData> {
    if (cache) return cache;

    try {
        const raw = await RundotGameAPI.appStorage.getItem(SAVE_KEY);
        if (raw) {
            cache = JSON.parse(raw) as SaveData;
            return cache;
        }
    } catch {
        // Corrupted data — reset
    }

    cache = getDefaultSave();
    return cache;
}

export async function writeSave(data: SaveData): Promise<void> {
    cache = data;
    try {
        await RundotGameAPI.appStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
        // Storage write failed — cached in memory at least
    }
}

export async function markLevelComplete(levelIndex: number, moves: number): Promise<void> {
    const data = await loadSave();

    if (!data.completedLevels.includes(levelIndex)) {
        data.completedLevels.push(levelIndex);
    }

    const prev = data.bestMoves[levelIndex];
    if (prev === undefined || moves < prev) {
        data.bestMoves[levelIndex] = moves;
    }

    data.lastPlayedLevel = levelIndex;
    await writeSave(data);
}

export function isLevelUnlocked(save: SaveData, levelIndex: number): boolean {
    if (levelIndex === 0) return true;
    return save.completedLevels.includes(levelIndex - 1);
}
