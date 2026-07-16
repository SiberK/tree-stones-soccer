/**
 * src/rules.ts
 * 
 * Обработка результатов хода.
 */

import { GameState, stones, spawnAtGates } from "./state.js";
import { LOGICAL_WIDTH, LOGICAL_HEIGHT } from "./state.js";

/**
 * Обрабатывает результат хода после полной остановки камней.
 */
export function processTurnResult(): void {
    // Проверяем, что все камни остановились
    const anyOut = stones.some(s => s.isOut);
    const stopped = stones.filter(s => !s.isOut).every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    if (!stopped) return;
    
    const currentPlayer = GameState.currentPlayer;
    let nextPlayer = currentPlayer;
    
    // === ОТЛАДКА: выводим флаги состояния ===
    console.log(`[Rules] Обработка результата: anyOut=${anyOut}, hitObstacle=${GameState.hitObstacle}, isGoalScored=${GameState.isGoalScored}, hasPassedThrough=${GameState.hasPassedThrough}`);
    
    // === ПРИОРИТЕТ 1: ВЫЛЕТ ЗА СТОЛ ===
    if (anyOut) {
        if (GameState.hitObstacle) {
            // Фол + Вылет
            if (GameState.isGoalScored) {
                // Гол отменяется из-за фола
                if (currentPlayer === 1) GameState.scoreLeft--;
                else GameState.scoreRight--;
                GameState.isGoalScored = false;
                console.log(`[Rules] Фол + Гол + Вылет: гол отменён`);
            }
            GameState.turnResultText = "ФОЛ И ВЫЛЕТ! ХОД ПЕРЕХОДИТ";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else if (GameState.isGoalScored) {
            // Гол + Вылет (гол засчитывается)
            // === ИСПРАВЛЕНИЕ: начисляем очки! ===
            if (currentPlayer === 1) {
                GameState.scoreLeft++;
                console.log(`[Rules] Гол + Вылет: игрок забил! Счёт: ${GameState.scoreLeft}:${GameState.scoreRight}`);
            } else {
                GameState.scoreRight++;
                console.log(`[Rules] Гол + Вылет: бот забил! Счёт: ${GameState.scoreLeft}:${GameState.scoreRight}`);
            }
            GameState.turnResultText = "ГОЛ! (Камень вылетел)";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else {
            // Просто вылет
            GameState.turnResultText = "ВЫЛЕТ ЗА СТОЛ! ХОД К СОПЕРНИКУ";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        }
    } 
    // === ПРИОРИТЕТ 2: ФОЛ ===
    else if (GameState.hitObstacle) {
        if (GameState.isGoalScored) {
            // Гол отменяется из-за фола
            if (currentPlayer === 1) {
                GameState.scoreLeft--;
                console.log(`[Rules] Фол + Гол: гол отменён`);
            } else {
                GameState.scoreRight--;
                console.log(`[Rules] Фол + Гол: гол отменён`);
            }
            GameState.isGoalScored = false;
        }
        GameState.turnResultText = "ФОЛ! ХОД ПЕРЕХОДИТ";
        nextPlayer = currentPlayer === 1 ? 2 : 1;
    } 
    // === ПРИОРИТЕТ 3: ГОЛ ===
    else if (GameState.isGoalScored) {
        // === ИСПРАВЛЕНИЕ: начисляем очки! ===
        if (currentPlayer === 1) {
            GameState.scoreLeft++;
            console.log(`[Rules] Гол: игрок забил! Счёт: ${GameState.scoreLeft}:${GameState.scoreRight}`);
        } else {
            GameState.scoreRight++;
            console.log(`[Rules] Гол: бот забил! Счёт: ${GameState.scoreLeft}:${GameState.scoreRight}`);
        }
        GameState.turnResultText = "ГОЛ!";
        nextPlayer = currentPlayer === 1 ? 2 : 1;
        spawnAtGates(nextPlayer);
    } 
    // === ПРИОРИТЕТ 4: ЧИСТЫЙ ПРОХОД ===
    else if (GameState.hasPassedThrough) {
        GameState.turnResultText = "ЧИСТЫЙ ПРОХОД!";
        nextPlayer = currentPlayer; // Ход сохраняется
    } 
    // === ПРИОРИТЕТ 5: ПРОМАХ ===
    else {
        GameState.turnResultText = "ПРОМАХ! ХОД ПЕРЕХОДИТ";
        nextPlayer = currentPlayer === 1 ? 2 : 1;
    }
    
    // === УПРАВЛЕНИЕ ПРАВИЛОМ "ЧЕРЕДОВАНИЕ БИТКОВ" ===
    if (nextPlayer !== currentPlayer) {
        GameState.lastUsedStriker = null;
    } 
	//else {
    //    GameState.lastUsedStriker = GameState.lastStruckStone;
    //}
    
    // Обновляем состояние
    GameState.currentPlayer = nextPlayer;
    GameState.resultTimer = 90;
    GameState.lastStruckStone = null;
    
    console.log(`[Rules] Итоговый счёт: ${GameState.scoreLeft}:${GameState.scoreRight}, следующий игрок: ${nextPlayer}`);
}