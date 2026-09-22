import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { store, useStore } from "../state/store.ts";
import { DAILY_REWARD_LADDER, dailySystems } from "../systems/dailySystems.ts";
import { t } from "../systems/localization.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

const REWARDS = DAILY_REWARD_LADDER;

export default function DailyRewardsScreen() {
    useStore((state) => `${state.locale}:${state.dailyRewardClaimIds.length}:${state.trustedTimeReady}`);
    const [busy, setBusy] = useState(false);
    const view = dailySystems.rewardView();

    const claim = async () => {
        await audioManager.unlock();
        setBusy(true);
        const result = await dailySystems.claimDailyReward();
        setBusy(false);
        store.patch({ toast: result.ok ? t("SparksGained", { sparks: result.sparks }) : result.reason });
        if (result.ok) {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
        } else audioManager.play("reject");
    };

    return (
        <MenuScreenLayout title={t("MenuDailyRewards")} kicker={t("KickerDailyRewards")}>
            <p className="screen-copy">{t("DailyRewardsBody")}</p>
            <p className="authority-label">{view.label}</p>
            <div className="reward-track">
                {REWARDS.map((reward, day) => ({ reward, day: day + 1 })).map(({ reward, day }) => (
                    <div
                        className={`reward-day ${view.streak > 0 && (view.streak - 1) % REWARDS.length === day - 1 ? "current" : ""}`}
                        key={`day-${day}`}
                    >
                        <span>
                            {t("LabelDay")} {day}
                        </span>
                        <strong>{reward}</strong>
                        <small>{t("LabelSparks")}</small>
                    </div>
                ))}
            </div>
            <button
                type="button"
                className="claim-action"
                disabled={busy || !view.ready || view.claimed}
                onClick={() => void claim()}
            >
                {busy ? t("Saving") : view.claimed ? t("ClaimedToday") : t("ClaimSparks", { sparks: view.reward })}
            </button>
            <p className="safety-note">{t("LocalClaimNote")}</p>
        </MenuScreenLayout>
    );
}
