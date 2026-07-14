/**
 * src/input.ts
 * 
 * Обработка ввода игрока (мышь/тач).
 */

import { GameState, stones, FORCE_FACTOR, MAX_FORCE, canvas, spreadFactor, alternateStriker, accuracyEnabled } from "./state.js";
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
 * Учитывает CSS-масштабирование через object-fit: contain.
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
    
    // Пересчёт с учётом CSS-масштабирования
    // getBoundingClientRect() возвращает реальные экранные размеры canvas
    // canvas.width/height — логические размеры
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        x: (cx - rect.left) * scaleX,
        y: (cy - rect.top) * scaleY
    };
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
    
    GameState.isAiming = false;
    GameState.hasPassedThrough = false;
    GameState.hitObstacle = false;
    GameState.isGoalScored = false;
    GameState.turnResultText = "";

    const stone = GameState.selectedStone;
    stone.startX = stone.x;
    stone.startY = stone.y;
    GameState.lastStruckStone = stone;

    let dx = stone.x - GameState.mouseX;
    let dy = stone.y - GameState.mouseY;
    
    const distance = Math.hypot(dx, dy);
    if (distance === 0) {
        GameState.selectedStone = null;
        return;
    }
    
    const maxPullDistance = MAX_FORCE / FORCE_FACTOR;
    const pullDistance = Math.min(distance, maxPullDistance);
    
    const normalizedDx = (dx / distance) * pullDistance;
    const normalizedDy = (dy / distance) * pullDistance;
    
    let tvx = normalizedDx * FORCE_FACTOR;
    let tvy = normalizedDy * FORCE_FACTOR;
    let force = Math.hypot(tvx, tvy);

    const baseAngle = Math.atan2(tvy, tvx);
    
    // Разброс (только если включена точность)
    const spreadValue = accuracyEnabled ? spreadFactor : 0;
    const spread = (force / MAX_FORCE) ** 2 * spreadValue;
    const finalAngle = GameMath.randomGaussian(baseAngle, spread);

    // Запускаем симуляцию для игрока
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