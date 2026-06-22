/**
 * src/rules.ts
 * 
 * Модуль правил игры «Футбол в три камня».
 * Отвечает за проверку голов, проходов, фола и определение результата хода.
 */

import { GameState, stones, GOAL_WIDTH, GOAL_Y, GOAL_HEIGHT, canvas, spawnAtGates } from "./state.js";
import { GameMath } from "./math.js";

/**
 * Проверяет, совершил ли ударенный камень "Чистый проход".
 * 
 * Чистый проход — это когда траектория камня пересекает линию между двумя другими камнями
 * (проходит через "ворота" между ними). Это необходимое условие для:
 * - Сохранения хода (игрок ходит ещё раз)
 * - Засчитывания гола
 */
export function checkCleanPass(): void {
    // Если нет активного камня или проход уже был зафиксирован, выходим
    if (!GameState.lastStruckStone || GameState.hasPassedThrough) return;
    
    const striker = GameState.lastStruckStone;
    // Берем только те камни, которые не являются ударенным и не вылетели за стол
    const others = stones.filter(s => s !== striker && !s.isOut);
    
    // Для прохода нужно ровно два других камня на поле
    if (others.length !== 2) return;

    // Координаты начала и конца движения ударенного камня
    const bStart = { x: striker.startX, y: striker.startY };
    const bEnd = { x: striker.x, y: striker.y };
    
    // Координаты "ворот" между двумя другими камнями
    const gStart = { x: others[0].x, y: others[0].y };
    const gEnd = { x: others[1].x, y: others[1].y };

    // Если траектория пересекает линию между камнями, засчитываем чистый проход
    if (GameMath.checkLineIntersection(bStart, bEnd, gStart, gEnd)) {
        GameState.hasPassedThrough = true;
    }
}

/**
 * Проверяет попадание камня в створ ворот соперника.
 * 
 * ВАЖНО: Гол засчитывается ТОЛЬКО если перед этим был зафиксирован "Чистый проход"
 * (GameState.hasPassedThrough === true).
 * Это гарантирует, что гол не может быть забит "напрямую" или с фолом.
 */
export function checkGoal(): void {
    // Строгая проверка: нет камня, гол уже есть или НЕ БЫЛО чистого прохода
    if (!GameState.lastStruckStone || GameState.isGoalScored || !GameState.hasPassedThrough) return;
    
    const striker = GameState.lastStruckStone;
    const bStart = { x: striker.startX, y: striker.startY };
    const bEnd = { x: striker.x, y: striker.y };
    
    // Левые ворота (цель бота, x ≈ 0)
    const lGStart = { x: GOAL_WIDTH, y: GOAL_Y };
    const lGEnd = { x: GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    
    // Правые ворота (цель игрока, x ≈ canvas.width)
    const rGStart = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y };
    const rGEnd = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };

    if (GameMath.checkLineIntersection(bStart, bEnd, lGStart, lGEnd)) {
        GameState.scoreRight++; // Увеличиваем счет бота
        GameState.isGoalScored = true;
        GameState.turnResultText = "ГОЛ БОТА!";
        GameState.resultTimer = 120;
    } else if (GameMath.checkLineIntersection(bStart, bEnd, rGStart, rGEnd)) {
        GameState.scoreLeft++; // Увеличиваем счет игрока
        GameState.isGoalScored = true;
        GameState.turnResultText = "ВЫ ЗАБИЛИ ГОЛ!";
        GameState.resultTimer = 120;
    }
}

/**
 * Главная функция обработки результатов хода.
 * 
 * Вызывается только когда все камни на столе полностью остановились.
 * Определяет, кто делает следующий ход, основываясь на приоритетах правил.
 * 
 * Приоритеты (от высшего к низшему):
 * 1. Вылет за стол + фол
 * 2. Гол (с вылетом или без)
 * 3. Вылет за стол (без гола)
 * 4. Фол (касание другого камня)
 * 5. Чистый проход (ход сохраняется)
 * 6. Промах (ход переходит сопернику)
 * 
 * Также управляет флагом lastUsedStriker для правила "Чередование битков":
 * - При переходе хода к сопернику — флаг сбрасывается (новая серия)
 * - При сохранении хода (чистый проход) — флаг сохраняется (продолжение серии)
 */
export function processTurnResult(): void {
    if (!GameState.lastStruckStone) return;
    
    // Флаг: вылетел ли хоть один камень за пределы стола
    const anyOut = stones.some(s => s.isOut);
    
    // Проверка остановки: скорость всех камней на поле близка к нулю
    const stopped = stones.filter(s => !s.isOut).every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    // Ждем полной остановки перед подведением итогов
    if (!stopped) return;
    
    const currentPlayer = GameState.currentPlayer;
    let nextPlayer = currentPlayer;
    
    // === ПРИОРИТЕТ 1: ВЫЛЕТ ЗА СТОЛ ===
    if (anyOut) {
        // Если был вылет, проверяем, не было ли по пути фола
        
        if (GameState.hitObstacle) {
            // Сценарий: Фол + Вылет. Гол отменяется (если успел засчитаться), ход переходит.
            if (GameState.isGoalScored) {
                // Откатываем счет, так как гол был забит с нарушением
                if (currentPlayer === 1) GameState.scoreLeft--;
                else GameState.scoreRight--;
                GameState.isGoalScored = false;
            }
            GameState.turnResultText = "ФОЛ И ВЫЛЕТ! ХОД ПЕРЕХОДИТ";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else if (GameState.isGoalScored) {
            // Сценарий: Чистый гол, но камень вылетел после пересечения линии.
            // По правилам гол засчитывается.
            GameState.turnResultText = "ГОЛ! (Камень вылетел)";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else {
            // Сценарий: Просто вылет без гола и фола.
            GameState.turnResultText = "ВЫЛЕТ ЗА СТОЛ! ХОД К СОПЕРНИКУ";
            nextPlayer = currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        }
    } 
    // === ПРИОРИТЕТ 2: ФОЛ (Касание другого камня) ===
    else if (GameState.hitObstacle) {
        // Если был фол, любой предварительно засчитанный гол ОТМЕНЯЕТСЯ
        if (GameState.isGoalScored) {
            if (currentPlayer === 1) {
                GameState.scoreLeft--; // Откат счета игрока
            } else {
                GameState.scoreRight--; // Откат счета бота
            }
            GameState.isGoalScored = false;
        }

        GameState.turnResultText = "ФОЛ! ХОД ПЕРЕХОДИТ";
        nextPlayer = currentPlayer === 1 ? 2 : 1;
    } 
    // === ПРИОРИТЕТ 3: ГОЛ (Чистый, без вылета и фола) ===
    else if (GameState.isGoalScored) {
        // Гол засчитан окончательно (так как checkGoal уже проверил hasPassedThrough)
        nextPlayer = currentPlayer === 1 ? 2 : 1;
        spawnAtGates(nextPlayer);
    } 
    // === ПРИОРИТЕТ 4: ЧИСТЫЙ ПРОХОД ===
    else if (GameState.hasPassedThrough) {
        // Игрок успешно провел камень между другими. Ход сохраняется.
        // ВАЖНО: Флаг lastUsedStriker НЕ сбрасываем — правило "Чередование битков" продолжает действовать
        GameState.turnResultText = "ЧИСТЫЙ ПРОХОД!";
        nextPlayer = currentPlayer; // Ход остаётся у текущего игрока
    } 
    // === ПРИОРИТЕТ 5: ПРОМАХ ===
    else {
        // Камень остановился, не забил гол, не прошел ворота и никого не задел.
        GameState.turnResultText = "ПРОМАХ! ХОД ПЕРЕХОДИТ";
        nextPlayer = currentPlayer === 1 ? 2 : 1;
    }
    
    // === УПРАВЛЕНИЕ ПРАВИЛОМ "ЧЕРЕДОВАНИЕ БИТКОВ" ===
    // Ключевая логика: флаг lastUsedStriker управляет запретом на повторное использование камня
    
    if (nextPlayer !== currentPlayer) {
        // Ход перешёл к другому игроку — начинается новая серия ударов
        // Флаг сбрасывается, чтобы первый удар в новой серии был без ограничений
        GameState.lastUsedStriker = null;
    } else {
        // Ход остался у того же игрока (чистый проход) — серия продолжается
        // Сохраняем флаг: следующий удар в этой серии не сможет использовать тот же камень
        GameState.lastUsedStriker = GameState.lastStruckStone;
    }
    
    // Передаем ход и сбрасываем таймеры
    GameState.currentPlayer = nextPlayer;
    GameState.resultTimer = 90; // Пауза перед следующим действием (в кадрах)
    GameState.lastStruckStone = null; // Сброс активного камня
}