/**
 * src/ai/types.ts
 */

import { Stone } from "../stone.js";

/**
 * Рассчитанный ход AI.
 */
export interface AIMove {
    stone: Stone;
    targetX: number;
    targetY: number;
    score: number;
    force: number;
    isFinalShot: boolean;
    risk: number;
    type: 'GOAL' | 'PASS' | 'EMERGENCY';
    stopX: number;
    stopY: number;
    blockedByGates: boolean;
    
    // === НОВЫЕ ПОЛЯ ДЛЯ ОТЛАДКИ ===
    /** Точка пересечения луча с гейтом */
    gateIntersectionX?: number;
    gateIntersectionY?: number;
    
    /** Минимальная точка остановки (при forceMin) */
    minStopX?: number;
    minStopY?: number;
    
    /** Максимальная точка остановки (при forceMax) */
    maxStopX?: number;
    maxStopY?: number;
}

/**
 * Детальная оценка хода.
 */
export interface MoveEvaluation {
    move: AIMove;
    positionScore: number;
    riskPenalty: number;
    forcePenalty: number;
    totalScore: number;
    rejected: boolean;
    rejectReason: string;
    blockedByGates: boolean;
}