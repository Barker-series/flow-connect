/**
 * The Studio: pick your tube set, and the only place anything is sold.
 *
 * Sets come first and products second, deliberately. The screen's job is
 * choosing how the board looks; the offers are what you find while you are
 * choosing, not a storefront the player was routed into.
 *
 * Every price shown here is either a resolved live catalog price or explicitly
 * labelled PREVIEW. Nothing on this screen invents a number.
 */
import { useEffect, useMemo, useState } from "react";
import { applyMenuBackdrop } from "../assets/preload.ts";
import { audioManager } from "../audio/audioManager.ts";
import { showcaseBoard } from "../game/art/backdrop.ts";
import { boardPreviewDataUrl, paletteSwatchDataUrl } from "../game/art/neon.ts";
import { type PaletteId, palette } from "../game/art/palette.ts";
import { store, useStore } from "../state/store.ts";
import { productView, purchaseProduct, refreshCommerce } from "../systems/commerce.ts";
import { t } from "../systems/localization.ts";
import { PRODUCT_IDS } from "../systems/monetization/config.ts";
import { monetizationTelemetry } from "../systems/monetization/runtime.ts";
import { PALETTE_OFFERS, paletteIsOwned } from "../systems/palettes.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import { SparkGlyph } from "./Icons.tsx";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

export default function StudioScreen() {
    const selected = useStore((s) => s.selectedPalette);
    const sparks = useStore((s) => s.sparks);
    const owned = useStore((s) => s.ownedPalettes);
    const levelsCompleted = useStore((s) => s.levelsCompleted);
    useStore((s) => s.locale);
    const [busyProduct, setBusyProduct] = useState<string | null>(null);

    // The catalog is fetched when the screen opens, not at boot: an offer the
    // player never navigates to should not cost them a request.
    useEffect(() => {
        void refreshCommerce();
        monetizationTelemetry.record("store_opened", { surface: "studio", levels_completed: levelsCompleted });
    }, [levelsCompleted]);

    // Previews are drawn with the same generator the board uses, so a set's
    // preview cannot show a tube the game will not render.
    const previews = useMemo(() => {
        const art = showcaseBoard();
        return Object.fromEntries(
            PALETTE_OFFERS.map((offer) => [
                offer.id,
                {
                    board: boardPreviewDataUrl(art, palette(offer.id), 150),
                    swatch: paletteSwatchDataUrl(palette(offer.id)),
                },
            ]),
        );
    }, []);

    const choose = (id: PaletteId): void => {
        audioManager.play("tap");
        void runtimeServices.haptic("light");
        store.patch({ selectedPalette: id });
        applyMenuBackdrop(id);
        runtimeServices.track("palette_selected", { palette: id });
        void saveSystem.flush();
    };

    const buyWithSparks = (id: PaletteId, cost: number): void => {
        if (sparks < cost) {
            audioManager.play("reject");
            store.patch({ toast: t("NotEnoughSparks") });
            return;
        }
        audioManager.play("reward");
        void runtimeServices.haptic("success");
        store.patch({ sparks: sparks - cost, ownedPalettes: [...new Set([...owned, id])], selectedPalette: id });
        applyMenuBackdrop(id);
        runtimeServices.track("palette_unlocked", { palette: id, source: "sparks", cost });
        void saveSystem.flush();
    };

    const buyProduct = (productId: (typeof PRODUCT_IDS)[number]): void => {
        void (async () => {
            setBusyProduct(productId);
            const outcome = await purchaseProduct(productId, "studio");
            setBusyProduct(null);
            if (!outcome) {
                store.patch({ toast: t("PurchaseUnavailable") });
                return;
            }
            if (outcome.status === "confirmed") {
                audioManager.play("reward");
                void runtimeServices.haptic("success");
                store.patch({ toast: t("PurchaseConfirmed") });
            } else if (outcome.status === "cancelled") {
                store.patch({ toast: t("PurchaseCancelled") });
            } else if (outcome.status === "unknown") {
                // Ambiguous is NOT failed: the order may still land, and the
                // pending intent survives to be reconciled on the next resume.
                store.patch({ toast: t("PurchasePending") });
            } else {
                audioManager.play("reject");
                store.patch({ toast: t("PurchaseFailed") });
            }
        })();
    };

    return (
        <MenuScreenLayout title={t("MenuStudio")} kicker={t("KickerStudio")}>
            <p className="screen-copy">{t("StudioBody")}</p>

            <div className="palette-list">
                {PALETTE_OFFERS.map((offer) => {
                    const isOwned = paletteIsOwned(offer.id);
                    const isActive = selected === offer.id;
                    const cost = offer.unlock.kind === "sparks" ? offer.unlock.cost : 0;
                    const art = previews[offer.id];
                    return (
                        <article
                            className={`palette-card${isActive ? " active" : ""}`}
                            key={offer.id}
                            data-palette={offer.id}
                        >
                            <img className="palette-board" src={art?.board} alt="" aria-hidden="true" />
                            <div className="palette-copy">
                                <h3>{offer.name}</h3>
                                <p>{offer.blurb}</p>
                                <img className="palette-swatch" src={art?.swatch} alt="" aria-hidden="true" />
                            </div>
                            {isOwned ? (
                                <button
                                    type="button"
                                    className={`palette-action${isActive ? " active" : ""}`}
                                    disabled={isActive}
                                    onClick={() => choose(offer.id)}
                                >
                                    {isActive ? t("PaletteSelected") : t("PaletteSelect")}
                                </button>
                            ) : offer.unlock.kind === "sparks" ? (
                                <button
                                    type="button"
                                    className="palette-action"
                                    disabled={sparks < cost}
                                    onClick={() => buyWithSparks(offer.id, cost)}
                                >
                                    <SparkGlyph small /> {t("PaletteUnlockSparks", { cost })}
                                </button>
                            ) : offer.unlock.kind === "entitlement" ? (
                                <span className="palette-locked">{offer.unlock.via}</span>
                            ) : null}
                        </article>
                    );
                })}
            </div>

            <h3 className="section-heading">{t("StudioProducts")}</h3>
            <p className="screen-copy small">{t("StudioProductsBody")}</p>

            {PRODUCT_IDS.map((productId) => {
                const view = productView(productId);
                if (!view.visible) return null;
                return (
                    <article className="shop-card" key={productId}>
                        <p className="eyebrow">{view.statusLabel}</p>
                        <h3>{view.name}</h3>
                        <p>{view.description}</p>
                        <button
                            type="button"
                            disabled={!view.purchasable || busyProduct !== null}
                            onClick={() => buyProduct(productId)}
                        >
                            {busyProduct === productId
                                ? t("PurchaseWorking")
                                : view.owned
                                  ? t("Owned")
                                  : view.priceLabel}
                        </button>
                    </article>
                );
            })}

            <p className="safety-note">{t("StudioSafetyNote")}</p>
        </MenuScreenLayout>
    );
}
