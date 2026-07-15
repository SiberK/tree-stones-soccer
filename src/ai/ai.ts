/**
 * src/ai/ai.ts
 * 
 * Основной класс AI.
 * Использует findBestMove из strategy.ts для выбора лучшего хода.
 */

import { Stone } from "../stone.js";
import { GameMath } from "../math.js";
import { MAX_FORCE, GameState, spreadFactor, alternateStriker, accuracyEnabled } from "../state.js";
import { AIMove } from "./types.js";
import { findBestMove } from "./strategy.js";

/**
 * Класс AI реализует логику принятия решений ботом.
 */
export class AI {
    /**
     * Рассчитывает лучший ход для бота.
     * 
     * Логика:
     * - Все 3 камня равнозначны
     * - Использует findBestMove из strategy.ts
     * - Учитывает правило чередования битков
     */
    public static calculateMove(stones: Stone[]): AIMove | null {
        const available: Stone[] = stones.filter(s => !s.isOut);
        if (available.length < 3) return null;

        // Правило "чередование битков": исключаем камень, которым били в прошлом ударе
        let stonesToConsider = available;
        if (alternateStriker && GameState.lastUsedStriker) {
            const filtered = available.filter(s => s !== GameState.lastUsedStriker);
            // Если после исключения осталось меньше 3 — берём все
            if (filtered.length >= 3) {
                stonesToConsider = filtered;
            }
        }

        // Центр створа (для оценки тактических ходов)
        const gateCenter = this.calculateGateCenter(stonesToConsider);

        // Используем функцию из strategy.ts
        const { bestMove, allConsideredMoves } = findBestMove(stonesToConsider, gateCenter);

        // Сохраняем все рассмотренные ходы для визуализации
        GameState.aiConsideredMoves = allConsideredMoves;

        // Если ничего хорошего не нашли — аварийный режим
        if (!bestMove) {
            console.warn("AI: Нет подходящих ходов. Переход в аварийный режим.");
            const emergencyMove = this.getEmergencyMove(available);
            if (emergencyMove) {
                GameState.aiConsideredMoves.push(emergencyMove);
                return emergencyMove;
            }
        }

        return bestMove;
    }

    /**
     * Вычисляет центр створа (среднее между всеми камнями)
     */
    private static calculateGateCenter(stones: Stone[]): { x: number; y: number } {
        const sumX = stones.reduce((s, st) => s + st.x, 0);
        const sumY = stones.reduce((s, st) => s + st.y, 0);
        return { x: sumX / stones.length, y: sumY / stones.length };
    }

    /**
     * Аварийный ход (если все варианты плохие)
     */
    private static getEmergencyMove(available: Stone[]): AIMove | null {
        if (available.length === 0) return null;
        
        const striker = available[0];
        const angle = Math.random() * Math.PI * 2;
        const force = MAX_FORCE * 0.4;
        
        return {
            stone: striker,
            targetX: striker.x + Math.cos(angle) * 1000,
            targetY: striker.y + Math.sin(angle) * 1000,
            score: -1000,
            force,
            isFinalShot: false,
            risk: 0.5,
            type: 'EMERGENCY',
            blockedByGates: false
        };
    }

    /**
     * Применяет рассчитанный ход.
     * Задаёт камню начальную скорость с учётом разброса (если точность выключена).
     */
    public static executeMove(move: AIMove): void {
        const s: Stone = move.stone;

        s.startX = s.x;
        s.startY = s.y;

        const dx: number = move.targetX - s.x;
        const dy: number = move.targetY - s.y;
        const angle: number = Math.atan2(dy, dx);

        // Разброс применяется ТОЛЬКО если точность выключена
        const spreadValue = accuracyEnabled ? 0 : spreadFactor;
        const spread: number = (move.force / MAX_FORCE) ** 2 * spreadValue;
        const finalAngle: number = GameMath.randomGaussian(angle, spread);

        s.vx = Math.cos(finalAngle) * move.force;
        s.vy = Math.sin(finalAngle) * move.force;
    }
}