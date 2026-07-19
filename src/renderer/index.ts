/**
 * src/renderer/index.ts
 * 
 * Главная функция render + экспорты.
 * Тонкий оркестратор, который собирает все визуальные блоки.
 */

import { ctx, GameState, stones, LOGICAL_WIDTH, LOGICAL_HEIGHT } from "../state.js";
import { AIMove } from "../ai/types.js";

import { drawAimIndicator, setPendingAIMoveGetter } from "./aim.js";
import { addVisualEffect, hasActiveEffects, drawVisualEffects } from "./effects.js";
import { getBackgroundCache, invalidateBackgroundCache } from "./background.js";
import { updateFPS, drawFPS } from "./fps.js";
import { 
    drawAIConsideredMoves, drawAIThoughts, drawAIThinkingIndicator,
    drawDebugPoints, setAIpendingMoveGetter
} from "./ai.js";

// ============================================================
// ПУБЛИЧНЫЙ API
// ============================================================

export { addVisualEffect, invalidateBackgroundCache };

// Глобальное хранилище pendingAIMove (раньше было в renderer.ts)
let pendingAIMove: AIMove | null = null;

export function setPendingAIMove(move: AIMove | null): void {
    pendingAIMove = move;
}

// Инициализация — передаём getter во внутренние модули
setPendingAIMoveGetter(() => pendingAIMove);
setAIpendingMoveGetter(() => pendingAIMove);

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ============================================================

export function render(): void {
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    // 1. Фон из кэша (текстура, виньетка, ворота, счёт)
    const bgCache = getBackgroundCache();
    ctx.drawImage(bgCache, 0, 0);

    // 2. Камни
    stones.forEach(s => s.draw(ctx));

    // 3. AI визуализация: "мысли" во время раздумий
    if (GameState.currentPlayer === 2 && GameState.aiThinkingTimer > 0) {
        drawAIThoughts();
        drawAIThinkingIndicator();
    }

    // 4. AI мысли после удара (для анализа)
    if (GameState.currentPlayer === 2 && GameState.resultTimer > 60) {
        drawAIThoughts();
    }

    // 5. UI: результат хода или индикатор чьего хода
    if (GameState.resultTimer > 0) {
        let tc = "#F44336";
        if (GameState.turnResultText.includes("ПРОХОД")) tc = "#4CAF50";
        else if (GameState.turnResultText.includes("ГОЛ")) tc = "#FFD700";
        ctx.fillStyle = tc;
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(GameState.turnResultText, LOGICAL_WIDTH / 2, 70);
    } else if (stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1)) {
        ctx.fillStyle = GameState.currentPlayer === 1 ? "#4CAF50" : "#FF9800";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(
            GameState.currentPlayer === 1 ? "ВАШ ХОД" : "ХОД КОМПЬЮТЕРА...",
            LOGICAL_WIDTH / 2,
            35
        );
    }

    // 6. Прицеливание игрока
    if (GameState.isAiming && GameState.selectedStone && GameState.currentPlayer === 1) {
        drawAimIndicator(GameState.selectedStone, 0, 0, true);
    }

    // 7. Прицеливание AI
    if (GameState.currentPlayer === 2 && GameState.aiSelectedStone && GameState.aiAimTarget) {
        drawAimIndicator(
            GameState.aiSelectedStone,
            GameState.aiAimTarget.x,
            GameState.aiAimTarget.y,
            false
        );
    }

    // 8. Визуализация расчётов AI (кандидаты с цветовой шкалой)
    if (GameState.currentPlayer === 2 && GameState.aiConsideredMoves.length > 0) {
        drawAIConsideredMoves();
    }

    // 9. Визуальные эффекты (вспышки)
    if (hasActiveEffects()) {
        drawVisualEffects();
    }

    // 10. FPS-счётчик
    updateFPS();
    drawFPS();
}