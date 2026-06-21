import { GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas, spawnAtGates } from "./state.js";
import { GamePhysics } from "./physics.js";
import { AI } from "./ai.js";
import { startAim, moveAim, endAim } from "./input.js";
import { checkCleanPass, checkGoal, processTurnResult } from "./rules.js";
import { render, setPendingAIMove } from "./renderer.js";

let pendingAIMove: any = null;

function processAITurn(): void {
    if (GameState.currentPlayer !== 2) return;
    
    const allStopped = stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    if (allStopped && GameState.resultTimer === 0) {
        GameState.aiThinkingTimer++;
        
        // 1. Прицеливание (0.5 сек)
        if (GameState.aiThinkingTimer === 10 && !pendingAIMove) {
            GameState.hasPassedThrough = false;
            GameState.hitObstacle = false;
            GameState.isGoalScored = false;
            
            pendingAIMove = AI.calculateMove(stones);
            if (pendingAIMove) {
                GameState.aiSelectedStone = pendingAIMove.stone;
                GameState.aiAimTarget = { x: pendingAIMove.targetX, y: pendingAIMove.targetY };
                setPendingAIMove(pendingAIMove);
            }
        }
        
        // 2. Удар (1 сек)
        if (GameState.aiThinkingTimer > 600 && pendingAIMove) {
            AI.executeMove(pendingAIMove);
            
            GameState.lastStruckStone = pendingAIMove.stone;
            
            // Очищаем визуализацию расчетов после удара
            GameState.aiConsideredMoves = []; 
            
            pendingAIMove = null;
            setPendingAIMove(null);
            GameState.aiSelectedStone = null;
            GameState.aiAimTarget = null;
            GameState.aiThinkingTimer = 0;
        }
    } else {
        if (!allStopped || GameState.resultTimer > 0) {
             GameState.aiThinkingTimer = 0;
             pendingAIMove = null;
             setPendingAIMove(null);
             GameState.aiSelectedStone = null;
             GameState.aiAimTarget = null;
             GameState.aiConsideredMoves = [];
        }
    }
}

function gameLoop(): void {
    // Логика
    GamePhysics.checkCollisions(stones);
    stones.forEach(s => s.update(canvas.width, canvas.height));
    
    checkCleanPass();
    checkGoal();
    processTurnResult();
    processAITurn();
    
    // Отрисовка
    render();
    
    requestAnimationFrame(gameLoop);
}

// Инициализация ввода
canvas.addEventListener('mousedown', startAim);
window.addEventListener('mousemove', moveAim);
window.addEventListener('mouseup', endAim);
canvas.addEventListener('touchstart', startAim, { passive: false });
canvas.addEventListener('touchmove', moveAim, { passive: false });
window.addEventListener('touchend', endAim);

spawnAtGates(1);
gameLoop();