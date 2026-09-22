import Phaser from "phaser";
import { BG_COLOR, PIPE_COLORS, UI_TEXT_COLOR, UI_BUTTON_COLOR } from "../game/ColorPalette";
import { loadSave } from "../game/SaveManager";

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super("menu");
    }

    async create(): Promise<void> {
        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;

        // Background
        this.add.rectangle(cx, h / 2, w, h, BG_COLOR);

        // Title
        this.add
            .text(cx, 320, "FLOW", {
                fontSize: "96px",
                fontFamily: "Arial, sans-serif",
                color: "#ffffff",
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        this.add
            .text(cx, 420, "CONNECT", {
                fontSize: "64px",
                fontFamily: "Arial, sans-serif",
                color: "#3498db",
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Decorative pipes
        this.createDecorativePipes(cx, 650);

        // Subtitle
        this.add
            .text(cx, 880, "Connect matching colors.\nFill the entire board.", {
                fontSize: "32px",
                fontFamily: "Arial, sans-serif",
                color: "#aaaaaa",
                align: "center",
                lineSpacing: 10,
            })
            .setOrigin(0.5);

        // Play button
        this.createButton(cx, 1050, 400, 100, "PLAY", () => {
            this.scene.start("level-select");
        });

        // Continue button (if applicable)
        const save = await loadSave();
        if (save.completedLevels.length > 0) {
            const nextLevel = save.lastPlayedLevel;
            this.createButton(
                cx,
                1200,
                400,
                100,
                "CONTINUE",
                () => {
                    this.scene.start("game", { levelIndex: nextLevel });
                },
                0x27ae60,
            );
        }
    }

    private createDecorativePipes(cx: number, cy: number): void {
        const g = this.add.graphics();
        const size = 60;
        const gap = 8;
        const gridCols = 5;
        const gridRows = 3;
        const totalW = gridCols * (size + gap) - gap;
        const startX = cx - totalW / 2;

        // Draw grid cells
        for (let r = 0; r < gridRows; r++) {
            for (let c = 0; c < gridCols; c++) {
                const x = startX + c * (size + gap);
                const y = cy + r * (size + gap);
                g.fillStyle(0x16213e, 1);
                g.fillRoundedRect(x, y, size, size, 8);
            }
        }

        // Draw some colored paths as decoration
        const paths = [
            {
                color: PIPE_COLORS[0],
                cells: [
                    [0, 0],
                    [0, 1],
                    [1, 1],
                    [1, 0],
                    [2, 0],
                ],
            },
            {
                color: PIPE_COLORS[1],
                cells: [
                    [0, 2],
                    [1, 2],
                    [2, 2],
                    [2, 1],
                ],
            },
            {
                color: PIPE_COLORS[2],
                cells: [
                    [0, 3],
                    [0, 4],
                    [1, 4],
                    [1, 3],
                    [2, 3],
                    [2, 4],
                ],
            },
        ];

        for (const path of paths) {
            // Fill cells
            for (const [r, c] of path.cells) {
                const x = startX + c * (size + gap) + 4;
                const y = cy + r * (size + gap) + 4;
                g.fillStyle(path.color, 0.35);
                g.fillRoundedRect(x, y, size - 8, size - 8, 6);
            }

            // Draw connecting line
            g.lineStyle(size * 0.4, path.color, 0.8);
            g.beginPath();
            const first = path.cells[0];
            g.moveTo(startX + first[1] * (size + gap) + size / 2, cy + first[0] * (size + gap) + size / 2);
            for (let i = 1; i < path.cells.length; i++) {
                const [r, c] = path.cells[i];
                g.lineTo(startX + c * (size + gap) + size / 2, cy + r * (size + gap) + size / 2);
            }
            g.strokePath();

            // Draw endpoints
            const endA = path.cells[0];
            const endB = path.cells[path.cells.length - 1];
            for (const [r, c] of [endA, endB]) {
                const ex = startX + c * (size + gap) + size / 2;
                const ey = cy + r * (size + gap) + size / 2;
                g.fillStyle(path.color, 1);
                g.fillCircle(ex, ey, size * 0.3);
                g.fillStyle(0x000000, 0.3);
                g.fillCircle(ex, ey, size * 0.15);
            }
        }
    }

    private createButton(
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        onClick: () => void,
        color = UI_BUTTON_COLOR,
    ): void {
        const bg = this.add.graphics();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, 16);

        this.add
            .text(x, y, label, {
                fontSize: "40px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        const hitZone = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });

        hitZone.on("pointerdown", () => {
            bg.clear();
            bg.fillStyle(color, 0.7);
            bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, 16);
        });

        hitZone.on("pointerup", () => {
            bg.clear();
            bg.fillStyle(color, 1);
            bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, 16);
            onClick();
        });

        hitZone.on("pointerout", () => {
            bg.clear();
            bg.fillStyle(color, 1);
            bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, 16);
        });

        return;
    }
}
