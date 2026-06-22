import { GamePhysics } from "./physics.js";
import { AI } from "./ai/index.js";
import { startAim, moveAim, endAim } from "./input.js";
import { checkCleanPass, checkGoal, processTurnResult } from "./rules.js";
import { render, setPendingAIMove } from "./renderer.js";
import { 
    GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas, spawnAtGates, 
    initSpreadSlider, initAIThinkingSlider, initAlternateStrikerCheckbox, 
    initAIPenaltiesSliders, loadSettingsFromCookie, checkCookieConsent, initCookieBanner,
    aiThinkingTime,cookiesAccepted 
} from "./state.js";

let pendingAIMove: any = null;

function processAITurn(): void {
    if (GameState.currentPlayer !== 2) return;
    
    const allStopped = stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    if (allStopped && GameState.resultTimer === 0) {
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
            }
        }
        
        if (GameState.aiThinkingTimer > aiThinkingTime && pendingAIMove) {
            AI.executeMove(pendingAIMove);
            
            GameState.lastStruckStone = pendingAIMove.stone;
            
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
    GamePhysics.checkCollisions(stones);
    stones.forEach(s => s.update(canvas.width, canvas.height));
    
    checkCleanPass();
    checkGoal();
    processTurnResult();
    processAITurn();
    
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

// === ПРОВЕРКА СОГЛАСИЯ НА COOKIES ===
// Делаем это ПЕРЕД загрузкой настроек
checkCookieConsent();
initCookieBanner();

// === ЗАГРУЗКА СОХРАНЁННЫХ НАСТРОЕК ===
// Загружаем только если пользователь дал согласие
// Делаем это ДО инициализации слайдеров, чтобы они подхватили правильные значения
if (cookiesAccepted) {
    loadSettingsFromCookie();
}

// Инициализация элементов управления
initSpreadSlider();
initAIThinkingSlider();
initAlternateStrikerCheckbox(); // Оставили только переименованную
initAIPenaltiesSliders(); 

spawnAtGates(1);
gameLoop();