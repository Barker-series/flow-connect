import Phaser from "phaser";
import { BG_COLOR, UI_TEXT_COLOR, UI_ACCENT_COLOR, UI_SUCCESS_COLOR, GRID_BG_COLOR } from "../game/ColorPalette";
import { LEVELS } from "../game/LevelData";
import { loadSave, isLevelUnlocked, SaveData } from "../game/SaveManager";

export default class LevelSelectScene extends Phaser.Scene {
    constructor() {
        super("level-select");
    }

    async create(): Promise<void> {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;

        // Background
        this.add.rectangle(cx, h / 2, w, h, BG_COLOR);

        // Header bar
        this.add.rectangle(cx, 60, w, 120, GRID_BG_COLOR);

        // Back button
        const backBtn = this.add
            .text(30, 60, "<", {
                fontSize: "56px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0, 0.5)
            .setInteractive({ useHandCursor: true });

        backBtn.on("pointerdown", () => {
            this.scene.start("menu");
        });

        // Title
        this.add
            .text(cx, 60, "SELECT LEVEL", {
                fontSize: "44px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Load save data
        const save = await loadSave();

        // Level grid
        this.createLevelGrid(save);
    }

    private createLevelGrid(save: SaveData): void {
        const cols = 4;
        const btnSize = 130;
        const gap = 20;
        const totalW = cols * btnSize + (cols - 1) * gap;
        const startX = (this.scale.width - totalW) / 2;
        const startY = 180;

        for (let i = 0; i < LEVELS.length; i++) {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x = startX + col * (btnSize + gap);
            const y = startY + row * (btnSize + gap);

            const completed = save.completedLevels.includes(i);
            const unlocked = isLevelUnlocked(save, i);
            const bestMoves = save.bestMoves[i];

            this.createLevelButton(i, x, y, btnSize, unlocked, completed, bestMoves);
        }
    }

    private createLevelButton(
        index: number,
        x: number,
        y: number,
        size: number,
        unlocked: boolean,
        completed: boolean,
        bestMoves?: number,
    ): void {
        const g = this.add.graphics();
        const gridLabel = LEVELS[index].gridSize + "x" + LEVELS[index].gridSize;

        if (!unlocked) {
            // Locked
            g.fillStyle(0x333344, 1);
            g.fillRoundedRect(x, y, size, size, 12);

            // Lock icon (simple padlock shape)
            const lockCx = x + size / 2;
            const lockCy = y + size / 2 - 5;
            g.lineStyle(4, 0x666677, 1);
            g.strokeCircle(lockCx, lockCy - 10, 14);
            g.fillStyle(0x666677, 1);
            g.fillRect(lockCx - 14, lockCy, 28, 22);
            return;
        }

        // Unlocked or completed
        const bgColor = completed ? UI_SUCCESS_COLOR : UI_ACCENT_COLOR;
        g.fillStyle(bgColor, 1);
        g.fillRoundedRect(x, y, size, size, 12);

        // Level number
        this.add
            .text(x + size / 2, y + size / 2 - 12, String(index + 1), {
                fontSize: "48px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Grid size label
        this.add
            .text(x + size / 2, y + size / 2 + 30, gridLabel, {
                fontSize: "20px",
                fontFamily: "Arial, sans-serif",
                color: "#aabbcc",
            })
            .setOrigin(0.5);

        // Best moves (if completed)
        if (completed && bestMoves !== undefined) {
            // Checkmark
            g.lineStyle(4, 0xffffff, 0.8);
            g.beginPath();
            g.moveTo(x + size - 30, y + 12);
            g.lineTo(x + size - 22, y + 22);
            g.lineTo(x + size - 10, y + 8);
            g.strokePath();
        }

        // Hit zone
        const hitZone = this.add.zone(x + size / 2, y + size / 2, size, size).setInteractive({ useHandCursor: true });

        hitZone.on("pointerdown", () => {
            g.clear();
            g.fillStyle(bgColor, 0.6);
            g.fillRoundedRect(x, y, size, size, 12);
        });

        hitZone.on("pointerup", () => {
            this.scene.start("game", { levelIndex: index });
        });

        hitZone.on("pointerout", () => {
            g.clear();
            g.fillStyle(bgColor, 1);
            g.fillRoundedRect(x, y, size, size, 12);

            // Re-draw checkmark for completed levels
            if (completed && bestMoves !== undefined) {
                g.lineStyle(4, 0xffffff, 0.8);
                g.beginPath();
                g.moveTo(x + size - 30, y + 12);
                g.lineTo(x + size - 22, y + 22);
                g.lineTo(x + size - 10, y + 8);
                g.strokePath();
            }
        });
    }
}
