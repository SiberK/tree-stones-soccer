/**
 * src/game.ts
 * 
 * Главный модуль игры.
 */

import { 
    GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, LOGICAL_WIDTH, LOGICAL_HEIGHT, canvas, spawnAtGates, 
    initSettingsPanel, loadSettingsFromCookie, checkCookieConsent, initCookieBanner,
    aiThinkingTime, cookiesAccepted
} from "./state.js";
import { AI } from "./ai/index.js";
import { startAim, moveAim, endAim } from "./input.js";
import { processTurnResult } from "./rules.js";
import { render, setPendingAIMove, addVisualEffect } from "./renderer.js";
import { simulationController, EventOccurrence } from "./simulation/controller.js";
import { ShotData } from "./simulation/types.js";

let pendingAIMove: any = null;

// ============================================================
// ОПТИМИЗАЦИЯ FPS
// ============================================================

const TARGET_FPS = 30;
const FRAME_INTERVAL = 1000 / TARGET_FPS;

let lastFrameTime = 0;
let needsRedraw = true;

let lastScoreLeft = -1;
let lastScoreRight = -1;
let lastPlayer = -1;

/**
 * Обрабатывает произошедшие события и добавляет визуальные эффекты
 */
function handleOccurredEvents(events: EventOccurrence[]): void {
    for (const event of events) {
        switch (event.eventType) {
            case 'COLLISION': {
                const data = event.data as any;
                addVisualEffect({
                    type: 'FLASH',
                    x: data.collisionPoint.x,
                    y: data.collisionPoint.y,
                    duration: 15,
                    color: 'rgba(255, 255, 200, 0.8)',
                    radius: 40
                });
                needsRedraw = true;
                break;
            }
            
            case 'CLEAN_PASS': {
                const data = event.data as any;
                addVisualEffect({
                    type: 'FLASH',
                    x: data.gateIntersection.x,
                    y: data.gateIntersection.y,
                    duration: 20,
                    color: 'rgba(100, 255, 100, 0.8)',
                    radius: 30
                });
                needsRedraw = true;
                break;
            }
            
            case 'GOAL': {
                const data = event.data as any;
                const goalX = data.goalSide === 'left' ? GOAL_WIDTH : LOGICAL_WIDTH - GOAL_WIDTH;
                const goalY = GOAL_Y + GOAL_HEIGHT / 2;
                
                addVisualEffect({
                    type: 'FLASH',
                    x: goalX,
                    y: goalY,
                    duration: 30,
                    color: 'rgba(255, 215, 0, 1)',
                    radius: 80
                });
                needsRedraw = true;
                break;
            }
            
            case 'OUT': {
                const data = event.data as any;
                const stone = stones[data.stoneIndex];
                addVisualEffect({
                    type: 'FLASH',
                    x: stone.x,
                    y: stone.y,
                    duration: 15,
                    color: 'rgba(255, 100, 100, 0.6)',
                    radius: 35
                });
                needsRedraw = true;
                break;
            }
        }
    }
}

function checkIfNeedsRedraw(): boolean {
    if (simulationController.isSimulating()) return true;
    if (stones.some(s => !s.isOut && (Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1))) return true;
    if (GameState.isAiming) return true;
    if (GameState.currentPlayer === 2 && GameState.aiSelectedStone) return true;
    if (GameState.resultTimer > 0) return true;
    if (GameState.aiConsideredMoves.length > 0) return true;
    
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

function processAITurn(): void {
    if (GameState.currentPlayer !== 2) return;
    
    const allStopped = stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    if (allStopped && GameState.resultTimer === 0 && !simulationController.isSimulating()) {
        GameState.aiThinkingTimer++;
        
        if (GameState.aiThinkingTimer === 1 && !pendingAIMove) {
            GameState.hasPassedThrough = false;
            GameState.hitObstacle = false;
            GameState.isGoalScored = false;
            
            pendingAIMove = AI.calculateMove(stones);
            if (pendingAIMove) {
                GameState.aiSelectedStone = pendingAIMove.stone;
                GameState.aiAimTarget = { x: pendingAIMove.targetX, y: pendingAIMove.targetY };
                setPendingAIMove(pendingAIMove);
                needsRedraw = true;
            }
        }
        
        if (GameState.aiThinkingTimer > aiThinkingTime && pendingAIMove) {
            const stoneIndex = stones.indexOf(pendingAIMove.stone);
            const move: ShotData = {
                strikerIndex: stoneIndex,
                force: pendingAIMove.force,
                angle: Math.atan2(
                    pendingAIMove.targetY - pendingAIMove.stone.y,
                    pendingAIMove.targetX - pendingAIMove.stone.x
                ),
                playerIndex: 2
            };
            
            simulationController.startSimulation(stones, move);
            GameState.lastStruckStone = pendingAIMove.stone;
            
            GameState.aiConsideredMoves = []; 
            pendingAIMove = null;
            setPendingAIMove(null);
            GameState.aiSelectedStone = null;
            GameState.aiAimTarget = null;
            GameState.aiThinkingTimer = 0;
            needsRedraw = true;
        }
    } else {
        if (!allStopped || GameState.resultTimer > 0) {
             GameState.aiThinkingTimer = 0;
             pendingAIMove = null;
             setPendingAIMove(null);
             GameState.aiSelectedStone = null;
             GameState.aiAimTarget = null;
             GameState.aiConsideredMoves = [];
             needsRedraw = true;
        }
    }
}

function initFullscreenButton(): void {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        
        if (!isFullscreen) {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => {
                    console.warn('Не удалось войти в полноэкранный режим:', err);
                });
            } else if ((elem as any).webkitRequestFullscreen) {
                (elem as any).webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
        }
    });

    const updateButton = () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        btn.textContent = isFullscreen ? '⛶' : '⛶';
        btn.title = isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
    };

    document.addEventListener('fullscreenchange', updateButton);
    document.addEventListener('webkitfullscreenchange', updateButton);
}

function gameLoop(currentTime: number = 0): void {
    requestAnimationFrame(gameLoop);
    
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
    
    if (simulationController.isSimulating()) {
        const occurredEvents = simulationController.updatePlayback(deltaTime, stones);
        
        if (occurredEvents.length > 0) {
            handleOccurredEvents(occurredEvents);
        }
        
        if (!simulationController.isSimulating()) {
            const finalState = simulationController.getFinalState();
            
            if (finalState) {
                GameState.hasPassedThrough = finalState.hasPassedThrough;
                GameState.isGoalScored = finalState.isGoalScored;
                GameState.hitObstacle = finalState.hitObstacle;
            }
            
            processTurnResult();
            needsRedraw = true;
        }
    }
    
    processAITurn();
    
    if (needsRedraw) {
        render();
    }
}

// Инициализация ввода
canvas.addEventListener('mousedown', (e: MouseEvent) => {
    needsRedraw = true;
    startAim(e);
});

window.addEventListener('mousemove', (e: MouseEvent) => {
    if (GameState.isAiming) needsRedraw = true;
    moveAim(e);
});

window.addEventListener('mouseup', (e: MouseEvent) => {
    needsRedraw = true;
    endAim();
});

canvas.addEventListener('touchstart', (e: TouchEvent) => {
    needsRedraw = true;
    startAim(e);
}, { passive: false });

canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (GameState.isAiming) needsRedraw = true;
    moveAim(e);
}, { passive: false });

window.addEventListener('touchend', (e: TouchEvent) => {
    needsRedraw = true;
    endAim();
});

checkCookieConsent();
initCookieBanner();

if (cookiesAccepted) {
    loadSettingsFromCookie();
}

// Инициализация элементов управления
initSettingsPanel();
initFullscreenButton();

spawnAtGates(1);
needsRedraw = true;
requestAnimationFrame(gameLoop);