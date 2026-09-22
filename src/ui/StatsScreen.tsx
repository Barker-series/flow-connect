import { PACKS } from "../game/flow/levels.ts";
import { packSolvedCount } from "../game/levelController.ts";
import { useStore } from "../state/store.ts";
import { t } from "../systems/localization.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function StatsScreen() {
    const state = useStore((value) => value);
    const packRecords = Object.entries(state.levelRecords).filter(([key]) => !key.startsWith("daily:"));
    const perfects = packRecords.filter(([, record]) => record.perfect).length;
    const dailies = Object.keys(state.levelRecords).filter((key) => key.startsWith("daily:")).length;
    const stats: Array<[string, string | number]> = [
        [t("StatSolved"), packRecords.length.toLocaleString()],
        [t("StatPerfects"), perfects.toLocaleString()],
        [t("StatDailies"), dailies.toLocaleString()],
        [t("StatBestStreak"), state.dailyBestStreak.toLocaleString()],
        [t("StatHints"), state.hintsUsedTotal.toLocaleString()],
        [t("LabelSparks"), state.sparks.toLocaleString()],
    ];
    return (
        <MenuScreenLayout title={t("MenuStats")} kicker={t("KickerStats")}>
            <p className="screen-copy">{t("StatsBody")}</p>
            <div className="stats-grid">
                {stats.map(([label, value]) => (
                    <article key={label}>
                        <span>{label}</span>
                        <strong data-numeric>{value}</strong>
                    </article>
                ))}
            </div>
            <h3 className="section-heading">{t("StatsPacks")}</h3>
            <div className="pack-progress">
                {PACKS.map((pack) => {
                    const solved = packSolvedCount(pack.id);
                    return (
                        <div key={pack.id}>
                            <span>
                                {t(pack.nameKey)}{" "}
                                <small>
                                    {pack.size}×{pack.size}
                                </small>
                            </span>
                            <progress value={solved} max={25} />
                            <strong data-numeric>{solved}/25</strong>
                        </div>
                    );
                })}
            </div>
        </MenuScreenLayout>
    );
}
