/**
 * Физическая симуляция для AI
 */

import { Point } from "../math.js";
import { FRICTION, STONE_RADIUS, STOP_THRESHOLD_RATIO } from "../state.js";

/**
 * Симулирует движение камня до полной остановки под действием трения.
 * Использует те же константы, что и реальная физика (stone.ts).
 */
export function simulateStopPosition(x: number, y: number, angle: number, force: number): Point {
    let vx: number = Math.cos(angle) * force;
    let vy: number = Math.sin(angle) * force;
    let simX: number = x;
    let simY: number = y;

    const stopThreshold: number = STONE_RADIUS * STOP_THRESHOLD_RATIO;

    while (Math.hypot(vx, vy) >= stopThreshold) {
        simX += vx;
        simY += vy;
        vx *= FRICTION;
        vy *= FRICTION;
    }

    return { x: simX, y: simY };
}