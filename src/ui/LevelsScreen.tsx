/**
 * The level list: one pack at a time, a tab strip of packs across the top and
 * a grid of that pack's boards below.
 *
 * Every tile is a real thumbnail of the board — endpoints only until it is
 * solved, then the full solution in the player's own tube set. A solved pack
 * is literally a wall of the player's work, which is the whole reward loop of
 * the genre and cost nothing but a canvas each.
 */
import { useMemo } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { boardPreviewDataUrl } from "../game/art/neon.ts";
import { palette } from "../game/art/palette.ts";
import { FlowGame } from "../game/flow/game.ts";
import { LEVELS_PER_PACK, PACK_UNLOCK_SOLVES, PACKS, packById, packLevel } from "../game/flow/levels.ts";
import { levelUnlocked, packSolvedCount, packUnlocked } from "../game/levelController.ts";
import { store, useStore } from "../state/store.ts";
import { t } from "../systems/localization.ts";
import { LockIcon, StarIcon } from "./Icons.tsx";
import { startLevel } from "./MainMenu.tsx";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

/** Thumbnails are cached per pack + set + solved-state, not per render. */
const thumbnails = new Map<string, string>();

function thumbnail(packId: string, index: number, solved: boolean, paletteId: string): string {
    const key = `${packId}:${index}:${solved ? 1 : 0}:${paletteId}`;
    const cached = thumbnails.get(key);
    if (cached) return cached;
    const puzzle = packLevel(packId, index);
    if (!puzzle) return "";
    const paths = solved ? new FlowGame(puzzle).solutionPaths : puzzle.flows.map(() => []);
    const url = boardPreviewDataUrl({ size: puzzle.size, flows: puzzle.flows, paths }, palette(paletteId), 132);
    thumbnails.set(key, url);
    return url;
}

export default function LevelsScreen() {
    useStore((s) => s.locale);
    const packId = useStore((s) => s.browsingPack);
    const records = useStore((s) => s.levelRecords);
    const paletteId = useStore((s) => s.selectedPalette);
    const pack = packById(packId) ?? PACKS[0];

    const tiles = useMemo(() => {
        if (!pack) return [];
        return Array.from({ length: LEVELS_PER_PACK }, (_, index) => {
            const record = records[`${pack.id}:${index}`];
            return {
                index,
                record,
                unlocked: levelUnlocked(pack.id, index),
                image: thumbnail(pack.id, index, Boolean(record), paletteId),
            };
        });
    }, [pack, records, paletteId]);

    if (!pack) return null;
    const solved = packSolvedCount(pack.id);
    const perfect = tiles.filter((tile) => tile.record?.perfect).length;

    return (
        <MenuScreenLayout title={t("MenuLevels")} kicker={t("KickerLevels")}>
            <div className="pack-tabs" role="tablist" aria-label={t("MenuLevels")}>
                {PACKS.map((entry) => {
                    const open = packUnlocked(entry.id);
                    const active = entry.id === pack.id;
                    return (
                        <button
                            type="button"
                            role="tab"
                            aria-selected={active}
                            key={entry.id}
                            className={`pack-tab${active ? " active" : ""}${open ? "" : " locked"}`}
                            style={
                                {
                                    "--pack-accent": cssHex(palette(paletteId).tubes[entry.accent]),
                                } as React.CSSProperties
                            }
                            onClick={() => {
                                audioManager.play("tap");
                                store.patch({ browsingPack: entry.id });
                            }}
                        >
                            <strong>{t(entry.nameKey)}</strong>
                            <small data-numeric>
                                {entry.size}×{entry.size} · {packSolvedCount(entry.id)}/{LEVELS_PER_PACK}
                            </small>
                        </button>
                    );
                })}
            </div>

            <div className="pack-summary">
                <span data-numeric>{t("PackSolved", { solved, total: LEVELS_PER_PACK })}</span>
                <span className="pack-perfects" data-numeric>
                    <StarIcon /> {perfect}
                </span>
            </div>

            {!packUnlocked(pack.id) ? (
                <p className="pack-locked-note">
                    <LockIcon />
                    {t("PackLockedNote", {
                        count: PACK_UNLOCK_SOLVES,
                        pack: t(PACKS[PACKS.indexOf(pack) - 1]?.nameKey ?? "PackSpark"),
                    })}
                </p>
            ) : null}

            <div className="level-grid">
                {tiles.map((tile) => (
                    <button
                        type="button"
                        key={tile.index}
                        className={`level-tile${tile.record ? " solved" : ""}${tile.record?.perfect ? " perfect" : ""}`}
                        disabled={!tile.unlocked}
                        aria-label={t("LevelTileLabel", { level: tile.index + 1 })}
                        onClick={() => startLevel({ kind: "pack", packId: pack.id, index: tile.index })}
                    >
                        <img src={tile.image} alt="" aria-hidden="true" draggable={false} />
                        <span className="level-number" data-numeric>
                            {tile.index + 1}
                        </span>
                        {tile.record?.perfect && (
                            <span className="level-star">
                                <StarIcon />
                            </span>
                        )}
                        {!tile.unlocked && (
                            <span className="level-lock">
                                <LockIcon />
                            </span>
                        )}
                    </button>
                ))}
            </div>
        </MenuScreenLayout>
    );
}

function cssHex(value: number | undefined): string {
    return `#${(value ?? 0xffffff).toString(16).padStart(6, "0")}`;
}
