import { GameState, stones, FORCE_FACTOR, MAX_FORCE, canvas, spreadFactor } from "./state.js";
import { GameMath, Point } from "./math.js";
import { Stone } from "./stone.js";

function getStoneAt(x: number, y: number): Stone | undefined {
    return stones.find(s => !s.isOut && Math.hypot(s.x - x, s.y - y) < s.radius + 20);
}

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
    
    return {
        x: (cx - rect.left) * (canvas.width / rect.width),
        y: (cy - rect.top) * (canvas.height / rect.height)
    };
}

export function startAim(e: MouseEvent | TouchEvent): void {
    // Блокируем ввод, если ход бота или камни движутся
    if (GameState.currentPlayer === 2) return;
    if (stones.some(s => Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1)) return;

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
    
    // === ИСПОЛЬЗУЕМ РЕГУЛИРУЕМЫЙ spreadFactor ВМЕСТО 0.35 ===
    const currentStdDev = (force / MAX_FORCE) * spreadFactor;
    
    const finalAngle = GameMath.randomGaussian(baseAngle, currentStdDev);

    stone.vx = Math.cos(finalAngle) * force;
    stone.vy = Math.sin(finalAngle) * force;
    
    GameState.selectedStone = null;
}