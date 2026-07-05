import { 
    GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas, spawnAtGates, 
    initSpreadSlider, initAIThinkingSlider, initAlternateStrikerCheckbox, 
    initAIPenaltiesSliders, loadSettingsFromCookie, checkCookieConsent, initCookieBanner,
    aiThinkingTime, cookiesAccepted
} from "./state.js";
import { GamePhysics } from "./physics.js";
import { AI } from "./ai/index.js";
import { startAim, moveAim, endAim } from "./input.js";
import { checkCleanPass, checkGoal, processTurnResult } from "./rules.js";
import { render, setPendingAIMove } from "./renderer.js";

/**
 * Рассчитывает оптимальные размеры canvas с сохранением пропорций 1200:800.
 * Вызывается при загрузке и при изменении размера окна.
 */
function resizeCanvas(): void {
    const container = document.querySelector('.canvas-container');
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const availableWidth = containerRect.width;
    const availableHeight = containerRect.height;
    
    // Пропорции игрового поля
    const gameWidth = 1200;
    const gameHeight = 800;
    const aspectRatio = gameWidth / gameHeight;
    
    // Вычисляем размеры с сохранением пропорций
    let canvasWidth = availableWidth;
    let canvasHeight = canvasWidth / aspectRatio;
    
    if (canvasHeight > availableHeight) {
        canvasHeight = availableHeight;
        canvasWidth = canvasHeight * aspectRatio;
    }
    
    // Устанавливаем CSS-размеры (внутренние размеры canvas остаются 1200x800)
    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
    
    console.log(`Canvas resized: ${canvasWidth.toFixed(0)}x${canvasHeight.toFixed(0)} (container: ${availableWidth.toFixed(0)}x${availableHeight.toFixed(0)})`);
}

/**
 * Генерирует спрайты всех камней при старте игры.
 * Это делается один раз, чтобы не генерировать спрайты во время игры.
 */
function generateStoneSprites(): void {
    // Ждём загрузки текстуры камня
    const checkAndGenerate = () => {
        const stoneImg = new Image();
        stoneImg.src = 'assets/stone_tex.jpg';
        
        stoneImg.onload = () => {
            console.log('✓ Текстура камня загружена, генерируем спрайты...');
            stones.forEach(s => s.generateSprite());
            console.log('✓ Спрайты камней сгенерированы');
        };
        
        stoneImg.onerror = () => {
            console.warn('✗ Не удалось загрузить текстуру камня, генерируем без текстуры');
            stones.forEach(s => s.generateSprite());
        };
    };
    
    checkAndGenerate();
}

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

/**
 * Инициализирует кнопку полноэкранного режима.
 * Поддерживает стандартный Fullscreen API и webkit-префикс для Safari.
 */
function initFullscreenButton(): void {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        
        if (!isFullscreen) {
            // Входим в полноэкранный режим
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => {
                    console.warn('Не удалось войти в полноэкранный режим:', err);
                });
            } else if ((elem as any).webkitRequestFullscreen) {
                (elem as any).webkitRequestFullscreen();
            }
        } else {
            // Выходим из полноэкранного режима
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
        }
    });

    // Отслеживаем изменение состояния
    const updateButton = () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        btn.textContent = isFullscreen ? '⛶' : '⛶';
        btn.title = isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
    };

    document.addEventListener('fullscreenchange', updateButton);
    document.addEventListener('webkitfullscreenchange', updateButton);
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
checkCookieConsent();
initCookieBanner();

// === ЗАГРУЗКА СОХРАНЁННЫХ НАСТРОЕК ===
if (cookiesAccepted) {
    loadSettingsFromCookie();
}

// Инициализация элементов управления
initSpreadSlider();
initAIThinkingSlider();
initAlternateStrikerCheckbox();
initAIPenaltiesSliders();

// Инициализация полноэкранного режима
initFullscreenButton();

// Первичный расчёт размеров canvas
resizeCanvas();

// Пересчёт при изменении размера окна
window.addEventListener('resize', resizeCanvas);
window.addEventListener('orientationchange', () => {
    setTimeout(resizeCanvas, 100); // Задержка для корректного расчёта после поворота
});

spawnAtGates(1);

// Генерация спрайтов камней
generateStoneSprites();

gameLoop();