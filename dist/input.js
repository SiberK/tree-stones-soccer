import { GameState, stones, FORCE_FACTOR, MAX_FORCE, canvas, spreadFactor, alternateStriker } from "./state.js";
import { GameMath } from "./math.js";
import { simulationController } from "./simulation/controller.js";
function getStoneAt(x, y) {
    const stone = stones.find(s => !s.isOut && Math.hypot(s.x - x, s.y - y) < s.radius + 20);
    if (stone && alternateStriker && GameState.lastUsedStriker === stone) {
        return undefined;
    }
    return stone;
}
export function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    let cx = 0, cy = 0;
    if ('touches' in e) {
        const te = e;
        if (te.touches.length > 0) {
            cx = te.touches[0].clientX;
            cy = te.touches[0].clientY;
        }
        else if (te.changedTouches.length > 0) {
            cx = te.changedTouches[0].clientX;
            cy = te.changedTouches[0].clientY;
        }
    }
    else {
        const me = e;
        cx = me.clientX;
        cy = me.clientY;
    }
    return {
        x: (cx - rect.left) * (canvas.width / rect.width),
        y: (cy - rect.top) * (canvas.height / rect.height)
    };
}
export function startAim(e) {
    if (GameState.currentPlayer === 2)
        return;
    if (stones.some(s => Math.abs(s.vx) > 0.1 || Math.abs(s.vy) > 0.1))
        return;
    if (simulationController.isSimulating())
        return; // Блокируем ввод во время симуляции
    const pos = getMousePos(e);
    GameState.selectedStone = getStoneAt(pos.x, pos.y) || null;
    if (GameState.selectedStone) {
        GameState.isAiming = true;
        GameState.mouseX = pos.x;
        GameState.mouseY = pos.y;
        if (e.cancelable)
            e.preventDefault();
    }
}
export function moveAim(e) {
    if (!GameState.isAiming || !GameState.selectedStone)
        return;
    const pos = getMousePos(e);
    GameState.mouseX = pos.x;
    GameState.mouseY = pos.y;
    if (e.cancelable)
        e.preventDefault();
}
export function endAim() {
    if (!GameState.isAiming || !GameState.selectedStone)
        return;
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
    const currentStdDev = Math.pow((force / MAX_FORCE), 2) * spreadFactor;
    const finalAngle = GameMath.randomGaussian(baseAngle, currentStdDev);
    // Запускаем симуляцию для игрока
    const stoneIndex = stones.indexOf(stone);
    const move = {
        strikerIndex: stoneIndex,
        force: force,
        angle: finalAngle,
        playerIndex: 1
    };
    simulationController.startSimulation(stones, move);
    GameState.selectedStone = null;
}
//# sourceMappingURL=input.js.map