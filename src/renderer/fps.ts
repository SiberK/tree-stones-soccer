/**
 * src/renderer/fps.ts
 * 
 * Встроенный FPS-счётчик и время рендеринга.
 */

import { ctx, GameState } from "../state.js";

let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let currentFPS = 0;

export function updateFPS(): void {
    fpsFrameCount++;
    const now = performance.now();

    if (now - fpsLastTime >= 1000) {
        currentFPS = fpsFrameCount;
        fpsFrameCount = 0;
        fpsLastTime = now;
    }
}

export function drawFPS(): void {
    let color = "#4CAF50";
    if (currentFPS < 50) color = "#FFC107";
    if (currentFPS < 30) color = "#F44336";

    ctx.save();

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(10, 10, 140, 55);

    ctx.fillStyle = color;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${currentFPS} FPS`, 20, 19);

    const renderTime = GameState.renderTimeAvg.toFixed(2);
    ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
    ctx.font = "14px monospace";
    ctx.fillText(`Render: ${renderTime}ms`, 20, 44);

    ctx.restore();
}