/**
 * src/gameLoop.ts
 * 
 * Главный игровой цикл и проверка необходимости перерисовки.
 */

import { GameState, stones } from "./state.js";
import { simulationController } from "./simulation/controller.js";
import { render } from "./renderer/index.js";

let lastFrameTime = 0;
export let needsRedraw = true;

export function setNeedsRedraw(value: boolean): void {
    needsRedraw = value;
}

let lastScoreLeft = -1;
let lastScoreRight = -1;
let lastPlayer = -1;

const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

export function checkIfNeedsRedraw(): boolean {
    if (simulationController.isSimulating()) return true;
    if (stones.some(s => !s.isOut && (Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1))) return true;
    if (GameState.isAiming) return true;
    if (GameState.currentPlayer === 2 && GameState.aiSelectedStone) return true;
    if (GameState.resultTimer > 0) return true;
    if (GameState.aiConsideredMoves.length > 0) return true;
    if (GameState.isPaused) return true;
    
    if (GameState.scoreLeft !== lastScoreLeft || GameState.scoreRight !== lastScoreRight) {
        lastScoreLeft = GameState.scoreLeft;
        lastScoreRight = GameState.scoreRight;
        return true;
    }
    
    if (GameState.currentPlayer !== lastPlayer) {
        lastPlayer = GameState.currentPlayer;
        return true;
    }
    
    if (GameState.turnResultText !== "") return true;
    
    return false;
}

export function gameLoop(
    currentTime: number,
    onUpdate: (deltaTime: number) => void
): void {
    requestAnimationFrame((t) => gameLoop(t, onUpdate));
    
    const elapsed = currentTime - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) {
        return;
    }
    
    lastFrameTime = currentTime - (elapsed % FRAME_INTERVAL);
    
    if (GameState.currentPlayer !== lastPlayer) {
        needsRedraw = true;
        lastPlayer = GameState.currentPlayer;
    }
    
    if (GameState.resultTimer > 0) {
        GameState.resultTimer--;
        needsRedraw = true;
    }
    
    needsRedraw = checkIfNeedsRedraw();
    
    if (!needsRedraw) {
        return;
    }
    
    const deltaTime = elapsed / 1000;
    
    onUpdate(deltaTime);
    
    if (needsRedraw) {
        const renderStart = performance.now();
        render();
        const renderTime = performance.now() - renderStart;
        
        if (simulationController.isSimulating()) {
            GameState.renderTimeAvg = GameState.renderTimeAvg * 0.9 + renderTime * 0.1;
        }
    }
}