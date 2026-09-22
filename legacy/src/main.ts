import Phaser from "phaser";
import MenuScene from "./scenes/MenuScene";
import LevelSelectScene from "./scenes/LevelSelectScene";
import GameScene from "./scenes/GameScene";
import "./style.css";
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

async function bootstrap(): Promise<void> {
    try {
        const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            width: 720,
            height: 1560,
            parent: "app",
            backgroundColor: "#1a1a2e",
            scene: [MenuScene, LevelSelectScene, GameScene],
            scale: {
                mode: Phaser.Scale.FIT,
                autoCenter: Phaser.Scale.CENTER_BOTH,
            },
        };

        const game = new Phaser.Game(config);
        RundotGameAPI.log("[Main] Flow Connect game created");

        // Save progress when app is paused/suspended/quit
        RundotGameAPI.lifecycles.onPause(() => {
            const gameScene = game.scene.getScene("game") as GameScene;
            gameScene?.saveProgress?.();
        });

        RundotGameAPI.lifecycles.onSleep(() => {
            const gameScene = game.scene.getScene("game") as GameScene;
            gameScene?.saveProgress?.();
        });

        RundotGameAPI.lifecycles.onQuit(async () => {
            const gameScene = game.scene.getScene("game") as GameScene;
            await gameScene?.saveProgress?.();
        });
    } catch (error) {
        console.error("[Main] Bootstrap error:", error);
    }
}

bootstrap();
