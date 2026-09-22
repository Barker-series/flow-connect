import Phaser from "phaser";
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import {
    BG_COLOR,
    PIPE_COLORS,
    UI_TEXT_COLOR,
    GRID_LINE_COLOR,
    GRID_BG_COLOR,
    UI_BUTTON_COLOR,
    UI_SUCCESS_COLOR,
} from "../game/ColorPalette";
import { LEVELS, LevelDef } from "../game/LevelData";
import { PipeGrid, GridCoord } from "../game/PipeGrid";
import { markLevelComplete, loadSave, writeSave } from "../game/SaveManager";

export default class GameScene extends Phaser.Scene {
    // Level data
    private levelIndex!: number;
    private level!: LevelDef;
    private grid!: PipeGrid;

    // Graphics layers
    private gridBgGraphics!: Phaser.GameObjects.Graphics;
    private pipeGraphics!: Phaser.GameObjects.Graphics;
    private endpointGraphics!: Phaser.GameObjects.Graphics;

    // Grid geometry
    private gridOriginX = 0;
    private gridOriginY = 0;
    private cellSize = 0;

    // Game state
    private moveCount = 0;
    private isComplete = false;
    private lastGridCoord: GridCoord | null = null;

    // UI elements
    private moveText!: Phaser.GameObjects.Text;
    private flowText!: Phaser.GameObjects.Text;
    private statusText!: Phaser.GameObjects.Text;
    private winContainer!: Phaser.GameObjects.Container;

    constructor() {
        super("game");
    }

    init(data: { levelIndex: number }): void {
        this.levelIndex = data.levelIndex ?? 0;
    }

    create(): void {
        this.level = LEVELS[this.levelIndex];
        this.grid = new PipeGrid(this.level);
        this.moveCount = 0;
        this.isComplete = false;
        this.lastGridCoord = null;

        const w = this.scale.width;
        const h = this.scale.height;
        const cx = w / 2;

        // Background
        this.add.rectangle(cx, h / 2, w, h, BG_COLOR);

        // Compute grid geometry
        this.computeGridGeometry();

        // Create graphics layers (order matters — bg first, then pipes, then endpoints)
        this.gridBgGraphics = this.add.graphics();
        this.pipeGraphics = this.add.graphics();
        this.endpointGraphics = this.add.graphics();

        // Create UI
        this.createUI();

        // Draw initial state
        this.redraw();

        // Set up input
        this.setupInput();

        // Track level start
        this.updateSaveLastPlayed();

        RundotGameAPI.log(
            `[GameScene] Level ${this.levelIndex + 1} started (${this.level.gridSize}x${this.level.gridSize})`,
        );
    }

    private computeGridGeometry(): void {
        const margin = 30;
        const maxWidth = this.scale.width - margin * 2; // 660
        const gridAreaTop = 200;
        const gridAreaBottom = 1350;
        const maxHeight = gridAreaBottom - gridAreaTop;

        const gridSize = this.level.gridSize;
        this.cellSize = Math.floor(Math.min(maxWidth, maxHeight) / gridSize);

        const gridPixelW = this.cellSize * gridSize;
        const gridPixelH = this.cellSize * gridSize;

        this.gridOriginX = (this.scale.width - gridPixelW) / 2;
        this.gridOriginY = gridAreaTop + (maxHeight - gridPixelH) / 2;
    }

    // ========== RENDERING ==========

    private redraw(): void {
        this.drawGridBackground();
        this.drawPipes();
        this.drawEndpoints();
        this.updateUI();
    }

    private drawGridBackground(): void {
        const g = this.gridBgGraphics;
        g.clear();

        const gridSize = this.level.gridSize;
        const totalW = this.cellSize * gridSize;
        const totalH = this.cellSize * gridSize;

        // Grid background
        g.fillStyle(GRID_BG_COLOR, 1);
        g.fillRoundedRect(this.gridOriginX - 4, this.gridOriginY - 4, totalW + 8, totalH + 8, 10);

        // Cell backgrounds
        for (let r = 0; r < gridSize; r++) {
            for (let c = 0; c < gridSize; c++) {
                const x = this.gridOriginX + c * this.cellSize;
                const y = this.gridOriginY + r * this.cellSize;
                g.fillStyle(0x0d1b2a, 1);
                g.fillRoundedRect(x + 2, y + 2, this.cellSize - 4, this.cellSize - 4, 4);
            }
        }

        // Grid lines
        g.lineStyle(2, GRID_LINE_COLOR, 0.5);
        for (let i = 0; i <= gridSize; i++) {
            // Horizontal
            const y = this.gridOriginY + i * this.cellSize;
            g.beginPath();
            g.moveTo(this.gridOriginX, y);
            g.lineTo(this.gridOriginX + totalW, y);
            g.strokePath();

            // Vertical
            const x = this.gridOriginX + i * this.cellSize;
            g.beginPath();
            g.moveTo(x, this.gridOriginY);
            g.lineTo(x, this.gridOriginY + totalH);
            g.strokePath();
        }
    }

    private drawPipes(): void {
        const g = this.pipeGraphics;
        g.clear();

        for (let pairId = 0; pairId < this.level.pairs.length; pairId++) {
            const path = this.grid.getPath(pairId);
            if (path.length < 2) continue;

            const pair = this.level.pairs[pairId];
            const color = PIPE_COLORS[pair.colorIndex];
            const isActive = this.grid.getActivePairId() === pairId;

            // Fill cells along the path
            for (const coord of path) {
                const x = this.gridOriginX + coord.col * this.cellSize + 4;
                const y = this.gridOriginY + coord.row * this.cellSize + 4;
                g.fillStyle(color, isActive ? 0.45 : 0.35);
                g.fillRoundedRect(x, y, this.cellSize - 8, this.cellSize - 8, 5);
            }

            // Draw thick connecting line through cell centers
            const lineWidth = this.cellSize * 0.4;
            g.lineStyle(lineWidth, color, isActive ? 0.95 : 0.8);
            g.beginPath();
            g.moveTo(
                this.gridOriginX + path[0].col * this.cellSize + this.cellSize / 2,
                this.gridOriginY + path[0].row * this.cellSize + this.cellSize / 2,
            );
            for (let i = 1; i < path.length; i++) {
                g.lineTo(
                    this.gridOriginX + path[i].col * this.cellSize + this.cellSize / 2,
                    this.gridOriginY + path[i].row * this.cellSize + this.cellSize / 2,
                );
            }
            g.strokePath();
        }
    }

    private drawEndpoints(): void {
        const g = this.endpointGraphics;
        g.clear();

        for (const pair of this.level.pairs) {
            const color = PIPE_COLORS[pair.colorIndex];

            for (const ep of [pair.a, pair.b]) {
                const cx = this.gridOriginX + ep.col * this.cellSize + this.cellSize / 2;
                const cy = this.gridOriginY + ep.row * this.cellSize + this.cellSize / 2;
                const r = this.cellSize * 0.32;

                // Outer circle
                g.fillStyle(color, 1);
                g.fillCircle(cx, cy, r);

                // Inner highlight
                g.fillStyle(0xffffff, 0.25);
                g.fillCircle(cx - r * 0.15, cy - r * 0.15, r * 0.5);

                // Dark center ring
                g.lineStyle(3, 0x000000, 0.3);
                g.strokeCircle(cx, cy, r * 0.65);
            }
        }
    }

    // ========== INPUT ==========

    private setupInput(): void {
        this.input.on("pointerdown", this.onPointerDown, this);
        this.input.on("pointermove", this.onPointerMove, this);
        this.input.on("pointerup", this.onPointerUp, this);
    }

    private pointerToGridCoord(px: number, py: number): GridCoord | null {
        const col = Math.floor((px - this.gridOriginX) / this.cellSize);
        const row = Math.floor((py - this.gridOriginY) / this.cellSize);
        if (!this.grid.isInBounds(row, col)) return null;
        return { row, col };
    }

    private onPointerDown(pointer: Phaser.Input.Pointer): void {
        if (this.isComplete) return;

        const coord = this.pointerToGridCoord(pointer.x, pointer.y);
        if (!coord) return;

        const started = this.grid.startPath(coord.row, coord.col);
        if (started) {
            this.moveCount++;
            this.lastGridCoord = coord;
            this.redraw();
        }
    }

    private onPointerMove(pointer: Phaser.Input.Pointer): void {
        if (this.isComplete) return;
        if (!this.grid.isDrawing()) return;
        if (!pointer.isDown) return;

        const coord = this.pointerToGridCoord(pointer.x, pointer.y);
        if (!coord) return;

        // Same cell as last — skip
        if (this.lastGridCoord && this.lastGridCoord.row === coord.row && this.lastGridCoord.col === coord.col) {
            return;
        }

        // Interpolate through skipped cells for fast swipes
        const steps = this.interpolateCells(this.lastGridCoord, coord);
        let changed = false;

        for (const step of steps) {
            if (!this.grid.isDrawing()) break;
            const extended = this.grid.extendPath(step.row, step.col);
            if (extended) {
                this.lastGridCoord = step;
                changed = true;
            } else {
                break; // Hit an obstacle, stop
            }
        }

        if (changed) {
            this.redraw();

            // Check if path just completed and if we won
            if (!this.grid.isDrawing() && this.grid.checkWin()) {
                this.onWin();
            }
        }
    }

    // Walk cell-by-cell from `from` toward `to`, stepping one axis at a time
    private interpolateCells(from: GridCoord | null, to: GridCoord): GridCoord[] {
        if (!from) return [to];

        const steps: GridCoord[] = [];
        let r = from.row;
        let c = from.col;

        // Walk rows first, then cols (or vice versa depending on direction)
        // Use the axis with the larger delta first for a more natural path
        const dr = to.row - r;
        const dc = to.col - c;

        // If both axes differ, prefer the axis aligned with the active path's last move
        // Simple approach: step one axis at a time, alternating when diagonal
        const rowDir = dr > 0 ? 1 : dr < 0 ? -1 : 0;
        const colDir = dc > 0 ? 1 : dc < 0 ? -1 : 0;

        // Walk in L-shape: if only one axis differs, walk straight; otherwise try row first
        const maxSteps = Math.abs(dr) + Math.abs(dc);
        for (let i = 0; i < maxSteps; i++) {
            if (r !== to.row) {
                r += rowDir;
            } else if (c !== to.col) {
                c += colDir;
            }
            steps.push({ row: r, col: c });
        }

        return steps;
    }

    private onPointerUp(_pointer: Phaser.Input.Pointer): void {
        if (this.isComplete) return;

        if (this.grid.isDrawing()) {
            this.grid.finishPath();
            this.lastGridCoord = null;
            this.redraw();

            if (this.grid.checkWin()) {
                this.onWin();
            }
        }
    }

    // ========== UI ==========

    private createUI(): void {
        const w = this.scale.width;
        const cx = w / 2;

        // Top bar background
        this.add.rectangle(cx, 70, w, 140, GRID_BG_COLOR);

        // Back button
        const backBtn = this.add
            .text(30, 45, "<", {
                fontSize: "52px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0, 0.5)
            .setInteractive({ useHandCursor: true });

        backBtn.on("pointerdown", () => {
            this.scene.start("level-select");
        });

        // Level title
        this.add
            .text(cx, 35, `Level ${this.levelIndex + 1}`, {
                fontSize: "40px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0.5);

        // Grid size subtitle
        this.add
            .text(cx, 80, `${this.level.gridSize}x${this.level.gridSize}`, {
                fontSize: "26px",
                fontFamily: "Arial, sans-serif",
                color: "#7f8c8d",
            })
            .setOrigin(0.5);

        // Restart button
        const restartBtn = this.add
            .text(w - 30, 45, "R", {
                fontSize: "44px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(1, 0.5)
            .setInteractive({ useHandCursor: true });

        restartBtn.on("pointerdown", () => {
            this.onRestart();
        });

        // Move counter
        this.moveText = this.add
            .text(cx, 112, "Moves: 0", {
                fontSize: "26px",
                fontFamily: "Arial, sans-serif",
                color: "#bdc3c7",
            })
            .setOrigin(0.5);

        // Bottom status area
        const gridSize = this.level.gridSize;
        const gridBottom = this.gridOriginY + this.cellSize * gridSize;
        const statusY = gridBottom + 40;

        this.flowText = this.add
            .text(cx, statusY, "", {
                fontSize: "30px",
                fontFamily: "Arial, sans-serif",
                color: "#bdc3c7",
            })
            .setOrigin(0.5);

        this.statusText = this.add
            .text(cx, statusY + 50, "", {
                fontSize: "26px",
                fontFamily: "Arial, sans-serif",
                color: "#7f8c8d",
            })
            .setOrigin(0.5);

        // Win overlay container (hidden initially)
        this.winContainer = this.add.container(0, 0);
        this.winContainer.setVisible(false);
    }

    private updateUI(): void {
        this.moveText.setText(`Moves: ${this.moveCount}`);

        const completed = this.grid.getCompletedCount();
        const total = this.level.pairs.length;
        const filled = this.grid.getFilledCount();
        const totalCells = this.level.gridSize * this.level.gridSize;

        this.flowText.setText(`Flows: ${completed}/${total}   Pipe: ${filled}/${totalCells}`);

        if (completed === total && filled < totalCells) {
            this.statusText.setText("All flows connected! Fill every cell.");
            this.statusText.setColor("#f39c12");
        } else if (filled === totalCells && completed < total) {
            this.statusText.setText("Board full but some flows broken!");
            this.statusText.setColor("#e74c3c");
        } else {
            this.statusText.setText("");
        }
    }

    // ========== GAME ACTIONS ==========

    private onRestart(): void {
        this.grid.clearAll();
        this.moveCount = 0;
        this.isComplete = false;
        this.lastGridCoord = null;
        this.winContainer.setVisible(false);
        this.redraw();
    }

    private async onWin(): Promise<void> {
        this.isComplete = true;

        RundotGameAPI.log(`[GameScene] Level ${this.levelIndex + 1} complete in ${this.moveCount} moves`);

        // Save progress
        await markLevelComplete(this.levelIndex, this.moveCount);

        // Show win overlay
        this.showWinOverlay();
    }

    private showWinOverlay(): void {
        const w = this.scale.width;
        const cx = w / 2;

        this.winContainer.removeAll(true);
        this.winContainer.setVisible(true);

        // Semi-transparent overlay
        const overlay = this.add.rectangle(cx, this.scale.height / 2, w, this.scale.height, 0x000000, 0.5);
        this.winContainer.add(overlay);

        // Win panel background
        const panelY = this.scale.height / 2 - 80;
        const panel = this.add.graphics();
        panel.fillStyle(GRID_BG_COLOR, 0.95);
        panel.fillRoundedRect(cx - 280, panelY - 160, 560, 400, 20);
        this.winContainer.add(panel);

        // "Level Complete!" text
        const title = this.add
            .text(cx, panelY - 80, "Level Complete!", {
                fontSize: "48px",
                fontFamily: "Arial, sans-serif",
                color: "#2ecc71",
                fontStyle: "bold",
            })
            .setOrigin(0.5);
        this.winContainer.add(title);

        // Moves text
        const movesLabel = this.add
            .text(cx, panelY, `Moves: ${this.moveCount}`, {
                fontSize: "36px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
            })
            .setOrigin(0.5);
        this.winContainer.add(movesLabel);

        // Next Level button
        const hasNext = this.levelIndex + 1 < LEVELS.length;
        if (hasNext) {
            this.createWinButton(
                cx,
                panelY + 80,
                340,
                80,
                "Next Level",
                () => {
                    this.scene.start("game", { levelIndex: this.levelIndex + 1 });
                },
                UI_SUCCESS_COLOR,
            );
        }

        // Level Select button
        this.createWinButton(
            cx,
            panelY + (hasNext ? 180 : 80),
            340,
            80,
            "Level Select",
            () => {
                this.scene.start("level-select");
            },
            UI_BUTTON_COLOR,
        );

        // Animate panel in
        this.winContainer.setAlpha(0);
        this.tweens.add({
            targets: this.winContainer,
            alpha: 1,
            duration: 400,
            ease: "Power2",
        });
    }

    private createWinButton(
        x: number,
        y: number,
        width: number,
        height: number,
        label: string,
        onClick: () => void,
        color: number,
    ): void {
        const bg = this.add.graphics();
        bg.fillStyle(color, 1);
        bg.fillRoundedRect(x - width / 2, y - height / 2, width, height, 14);
        this.winContainer.add(bg);

        const text = this.add
            .text(x, y, label, {
                fontSize: "34px",
                fontFamily: "Arial, sans-serif",
                color: UI_TEXT_COLOR,
                fontStyle: "bold",
            })
            .setOrigin(0.5);
        this.winContainer.add(text);

        const hitZone = this.add.zone(x, y, width, height).setInteractive({ useHandCursor: true });
        this.winContainer.add(hitZone);

        hitZone.on("pointerup", onClick);
    }

    // ========== SAVE ==========

    async saveProgress(): Promise<void> {
        try {
            const save = await loadSave();
            save.lastPlayedLevel = this.levelIndex;
            await writeSave(save);
        } catch {
            // Best effort
        }
    }

    private async updateSaveLastPlayed(): Promise<void> {
        try {
            const save = await loadSave();
            save.lastPlayedLevel = this.levelIndex;
            await writeSave(save);
        } catch {
            // Best effort
        }
    }
}
