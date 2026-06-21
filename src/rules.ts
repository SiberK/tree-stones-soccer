import { GameState, stones, GOAL_WIDTH, GOAL_Y, GOAL_HEIGHT, canvas, spawnAtGates } from "./state.js";
import { GameMath } from "./math.js";

/**
 * Проверяет, совершил ли ударенный камень "Чистый проход".
 * Чистый проход — это когда траектория камня пересекает линию между двумя другими камнями.
 * Это необходимое условие для продолжения серии ударов или забития гола.
 */
export function checkCleanPass(): void {
    if (!GameState.lastStruckStone || GameState.hasPassedThrough) return;
    
    const striker = GameState.lastStruckStone;
    const others = stones.filter(s => s !== striker && !s.isOut);
    
    if (others.length !== 2) return;

    const bStart = { x: striker.startX, y: striker.startY };
    const bEnd = { x: striker.x, y: striker.y };
    const gStart = { x: others[0].x, y: others[0].y };
    const gEnd = { x: others[1].x, y: others[1].y };

    if (GameMath.checkLineIntersection(bStart, bEnd, gStart, gEnd)) {
        GameState.hasPassedThrough = true;
    }
}

/**
 * Проверяет попадание камня в створ ворот соперника.
 * ВАЖНО: Гол засчитывается ТОЛЬКО если перед этим был зафиксирован "Чистый проход".
 * Если был фол, hasPassedThrough останется false (или будет сброшен логикой), и гол не засчитается.
 */
export function checkGoal(): void {
    // Строгая проверка: нет камня, гол уже есть или НЕ БЫЛО чистого прохода
    if (!GameState.lastStruckStone || GameState.isGoalScored || !GameState.hasPassedThrough) return;
    
    const striker = GameState.lastStruckStone;
    const bStart = { x: striker.startX, y: striker.startY };
    const bEnd = { x: striker.x, y: striker.y };
    
    const lGStart = { x: GOAL_WIDTH, y: GOAL_Y };
    const lGEnd = { x: GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    
    const rGStart = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y };
    const rGEnd = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };

    if (GameMath.checkLineIntersection(bStart, bEnd, lGStart, lGEnd)) {
        GameState.scoreRight++; 
        GameState.isGoalScored = true;
        GameState.turnResultText = "ГОЛ БОТА!";
        GameState.resultTimer = 120;
    } else if (GameMath.checkLineIntersection(bStart, bEnd, rGStart, rGEnd)) {
        GameState.scoreLeft++; 
        GameState.isGoalScored = true;
        GameState.turnResultText = "ВЫ ЗАБИЛИ ГОЛ!";
        GameState.resultTimer = 120;
    }
}

/**
 * Главная функция обработки результатов хода.
 */
export function processTurnResult(): void {
    if (!GameState.lastStruckStone) return;
    
    const anyOut = stones.some(s => s.isOut);
    const stopped = stones.filter(s => !s.isOut).every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);
    
    if (!stopped) return;
    
    let nextPlayer = GameState.currentPlayer;
    
    // === ПРИОРИТЕТ 1: ВЫЛЕТ ЗА СТОЛ ===
    if (anyOut) {
        if (GameState.hitObstacle) {
            // Фол + Вылет. Гол не мог быть засчитан из-за фола (см. checkGoal).
            GameState.turnResultText = "ФОЛ И ВЫЛЕТ! ХОД ПЕРЕХОДИТ";
            nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else if (GameState.isGoalScored) {
            // Чистый гол, но камень вылетел после пересечения линии.
            GameState.turnResultText = "ГОЛ! (Камень вылетел)";
            nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        } 
        else {
            // Просто вылет
            GameState.turnResultText = "ВЫЛЕТ ЗА СТОЛ! ХОД К СОПЕРНИКУ";
            nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
            spawnAtGates(nextPlayer);
        }
    } 
    // === ПРИОРИТЕТ 2: ФОЛ (Касание другого камня) ===
    else if (GameState.hitObstacle) {
        // Так как в checkGoal стоит проверка !hasPassedThrough, а фол обычно мешает чистому проходу,
        // счет здесь увеличен не будет. Просто передаем ход.
        GameState.turnResultText = "ФОЛ! ХОД ПЕРЕХОДИТ";
        nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
    } 
    // === ПРИОРИТЕТ 3: ГОЛ (Чистый) ===
    else if (GameState.isGoalScored) {
        nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
        spawnAtGates(nextPlayer);
    } 
    // === ПРИОРИТЕТ 4: ЧИСТЫЙ ПРОХОД ===
    else if (GameState.hasPassedThrough) {
        GameState.turnResultText = "ЧИСТЫЙ ПРОХОД!";
        nextPlayer = GameState.currentPlayer;
    } 
    // === ПРИОРИТЕТ 5: ПРОМАХ ===
    else {
        GameState.turnResultText = "ПРОМАХ! ХОД ПЕРЕХОДИТ";
        nextPlayer = GameState.currentPlayer === 1 ? 2 : 1;
    }
    
    GameState.currentPlayer = nextPlayer;
    GameState.resultTimer = 90;
    GameState.lastStruckStone = null;
}