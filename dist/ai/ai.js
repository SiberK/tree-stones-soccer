/**
 * Основной класс AI
 */
import { GameMath } from "../math.js";
import { MAX_FORCE, GameState, spreadFactor } from "../state.js";
import { evaluateGoalShot, findBestTacticalMoves, getEmergencyMove } from "./strategy.js";
/**
 * Класс AI реализует логику принятия решений ботом.
 */
export class AI {
    /**
     * Рассчитывает лучший ход для бота.
     */
    static calculateMove(stones) {
        const available = stones.filter(s => !s.isOut);
        if (available.length < 3)
            return null;
        let bestMove = null;
        const allConsideredMoves = [];
        for (const striker of available) {
            const gates = available.filter(s => s !== striker);
            if (gates.length !== 2)
                continue;
            const gateCenter = {
                x: (gates[0].x + gates[1].x) / 2,
                y: (gates[0].y + gates[1].y) / 2
            };
            // 1. Попытка гола
            const goalShot = evaluateGoalShot(striker, gates);
            if (goalShot) {
                allConsideredMoves.push(goalShot);
                if (!bestMove || goalShot.score > bestMove.score) {
                    bestMove = goalShot;
                }
            }
            // 2. Тактические проходы
            const tacticalEvaluations = findBestTacticalMoves(striker, gateCenter, gates, available);
            for (const evl of tacticalEvaluations) {
                if (!evl.rejected) {
                    allConsideredMoves.push(evl.move);
                    if (!bestMove || evl.move.score > bestMove.score) {
                        bestMove = evl.move;
                    }
                }
                else {
                    // Логирование отклонённых вариантов
                    //                    console.debug(`AI: Отклонён вариант (${evl.move.type}): ${evl.rejectReason}`);
                }
            }
        }
        // Аварийный режим
        if (!bestMove) {
            console.warn("AI: Нет подходящих ходов. Переход в аварийный режим.");
            const emergencyMove = getEmergencyMove(available);
            if (emergencyMove) {
                allConsideredMoves.push(emergencyMove);
                bestMove = emergencyMove;
            }
        }
        GameState.aiConsideredMoves = allConsideredMoves;
        return bestMove;
    }
    /**
     * Применяет рассчитанный ход.
     */
    static executeMove(move) {
        const s = move.stone;
        s.startX = s.x;
        s.startY = s.y;
        const dx = move.targetX - s.x;
        const dy = move.targetY - s.y;
        const angle = Math.atan2(dy, dx);
        const spread = Math.pow((move.force / MAX_FORCE), 2) * spreadFactor;
        const finalAngle = GameMath.randomGaussian(angle, spread);
        s.vx = Math.cos(finalAngle) * move.force;
        s.vy = Math.sin(finalAngle) * move.force;
    }
}
//# sourceMappingURL=ai.js.map