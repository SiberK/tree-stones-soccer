/**
 * src/input.ts
 * 
 * Обработка ввода игрока (мышь/тач).
 */

import { 
    GameState, stones, FORCE_FACTOR, MAX_FORCE, canvas, 
    spreadFactor, alternateStriker, accuracyEnabled, 
    LOGICAL_WIDTH, LOGICAL_HEIGHT,
    PULL_SENSITIVITY
} from "./state.js";
import { GameMath, Point } from "./math.js";
import { Stone } from "./stone.js";
import { simulationController } from "./simulation/controller.js";
import { ShotData } from "./simulation/types.js";

function getStoneAt(x: number, y: number): Stone | undefined {
    const stone = stones.find(s => !s.isOut && Math.hypot(s.x - x, s.y - y) < s.radius + 20);

    if (stone && alternateStriker && GameState.lastUsedStriker === stone) {
        return undefined;
    }

    return stone;
}

/**
 * Преобразует экранные координаты мыши в логические координаты canvas.
 * Учитывает CSS-масштабирование через object-fit: contain с letterboxing.
 */
export function getMousePos(e: MouseEvent | TouchEvent): Point {
    const rect = canvas.getBoundingClientRect();
    let cx = 0, cy = 0;

    if ('touches' in e) {
        const te = e as TouchEvent;
        if (te.touches.length > 0) {
            cx = te.touches[0].clientX;
            cy = te.touches[0].clientY;
        } else if (te.changedTouches.length > 0) {
            cx = te.changedTouches[0].clientX;
            cy = te.changedTouches[0].clientY;
        }
    } else {
        const me = e as MouseEvent;
        cx = me.clientX;
        cy = me.clientY;
    }

    // === ИСПРАВЛЕНО: Учёт object-fit: contain с letterboxing ===
    const canvasAspect = LOGICAL_WIDTH / LOGICAL_HEIGHT;
    const rectAspect = rect.width / rect.height;
    
    let renderWidth: number;
    let renderHeight: number;
    let offsetX: number;
    let offsetY: number;
    
    if (rectAspect > canvasAspect) {
        // Экран шире canvas — letterboxing по бокам (чёрные полосы слева/справа)
        renderHeight = rect.height;
        renderWidth = rect.height * canvasAspect;
        offsetX = (rect.width - renderWidth) / 2;
        offsetY = 0;
    } else {
        // Экран выше canvas — letterboxing сверху/снизу
        renderWidth = rect.width;
        renderHeight = rect.width / canvasAspect;
        offsetX = 0;
        offsetY = (rect.height - renderHeight) / 2;
    }
    
    const scaleX = LOGICAL_WIDTH / renderWidth;
    const scaleY = LOGICAL_HEIGHT / renderHeight;

    // Вычитаем смещение letterboxing
    const x = (cx - rect.left - offsetX) * scaleX;
    const y = (cy - rect.top - offsetY) * scaleY;

    return { x, y };
}

export function startAim(e: MouseEvent | TouchEvent): void {
    if (GameState.currentPlayer === 2) return;
    if (stones.some(s => Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1)) return;
    if (simulationController.isSimulating()) return;

    const pos = getMousePos(e);
    GameState.selectedStone = getStoneAt(pos.x, pos.y) || null;

    if (GameState.selectedStone) {
        GameState.isAiming = true;
        GameState.mouseX = pos.x;
        GameState.mouseY = pos.y;
        if (e.cancelable) e.preventDefault();
    }
}

export function moveAim(e: MouseEvent | TouchEvent): void {
    if (!GameState.isAiming || !GameState.selectedStone) return;
    const pos = getMousePos(e);
    GameState.mouseX = pos.x;
    GameState.mouseY = pos.y;
    if (e.cancelable) e.preventDefault();
}

export function endAim(): void {
    if (!GameState.isAiming || !GameState.selectedStone) return;

    // === НОВОЕ: Сбрасываем данные отчёта бота перед ударом игрока ===
    GameState.lastAIMove = null;
    GameState.reportStartPositions = null;
		
    // === НОВОЕ: Считаем удар игрока ===
    GameState.shotInTurnCounter++;
    const stone = GameState.selectedStone;
    const dx = stone.x - GameState.mouseX;
    const dy = stone.y - GameState.mouseY;
    const distance = Math.hypot(dx, dy);

    // Если отпустили внутри радиуса камня — отмена
    if (distance < stone.radius) {
        GameState.isAiming = false;
        GameState.selectedStone = null;
        return;
    }

    GameState.isAiming = false;
    GameState.hasPassedThrough = false;
    GameState.hitObstacle = false;
    GameState.isGoalScored = false;
    GameState.turnResultText = "";

    stone.startX = stone.x;
    stone.startY = stone.y;
    GameState.lastUsedStriker = stone;
    GameState.lastStruckStone = stone;

    // === ИСПРАВЛЕНО: Чувствительность рогатки 1:5 ===
    // Оттягивание мыши умножается на PULL_SENSITIVITY при расчёте силы
    // Максимальное оттягивание мыши: MAX_FORCE / (FORCE_FACTOR * PULL_SENSITIVITY)
    const maxPullDistance = MAX_FORCE / (FORCE_FACTOR * PULL_SENSITIVITY);
    const pullDistance = Math.min(distance, maxPullDistance);

    const normalizedDx = (dx / distance) * pullDistance;
    const normalizedDy = (dy / distance) * pullDistance;

    // Умножаем на PULL_SENSITIVITY — малое оттягивание даёт большую силу
    let tvx = normalizedDx * FORCE_FACTOR * PULL_SENSITIVITY;
    let tvy = normalizedDy * FORCE_FACTOR * PULL_SENSITIVITY;
    let force = Math.hypot(tvx, tvy);

    const baseAngle = Math.atan2(tvy, tvx);

    const spreadValue = accuracyEnabled ? 0 : spreadFactor;
    const spread = (force / MAX_FORCE) ** 2 * spreadValue;
    const finalAngle = GameMath.randomGaussian(baseAngle, spread);

    // ОТЛАДКА
    const angleDeviationDeg = (finalAngle - baseAngle) * 180 / Math.PI;
    console.log(`[Player] Удар: сила=${force.toFixed(1)}, угол=${(baseAngle * 180 / Math.PI).toFixed(1)}°, разброс=${(spread * 180 / Math.PI).toFixed(2)}°, отклонение=${angleDeviationDeg.toFixed(2)}°, точность=${accuracyEnabled}`);

    const stoneIndex = stones.indexOf(stone);
    const move: ShotData = {
        strikerIndex: stoneIndex,
        force: force,
        angle: finalAngle,
        playerIndex: 1
    };

    simulationController.startSimulation(stones, move);
    GameState.selectedStone = null;
}