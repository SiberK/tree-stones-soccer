/**
 * Физическая симуляция для AI
 */
import { FRICTION, STONE_RADIUS, STOP_THRESHOLD_RATIO } from "../state.js";
/**
 * Симулирует движение камня до полной остановки под действием трения.
 * Использует те же константы, что и реальная физика (stone.ts).
 */
export function simulateStopPosition(x, y, angle, force) {
    let vx = Math.cos(angle) * force;
    let vy = Math.sin(angle) * force;
    let simX = x;
    let simY = y;
    const stopThreshold = STONE_RADIUS * STOP_THRESHOLD_RATIO;
    while (Math.hypot(vx, vy) >= stopThreshold) {
        simX += vx;
        simY += vy;
        vx *= FRICTION;
        vy *= FRICTION;
    }
    return { x: simX, y: simY };
}
//# sourceMappingURL=physics.js.map