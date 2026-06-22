/**
 * Типы и интерфейсы для модуля AI
 */

import { Stone } from "../stone.js";
import { Point } from "../math.js";

/**
 * Интерфейс описывает один рассчитанный вариант хода.
 */
export interface AIMove {
    stone: Stone;           // Какой камень будем бить (биток)
    targetX: number;        // Целевая координата X
    targetY: number;        // Целевая координата Y
    score: number;          // Итоговая оценка полезности хода
    force: number;          // Сила удара (0..MAX_FORCE)
    isFinalShot: boolean;   // Это удар на гол?
    risk: number;           // Риск фола (0..1)
    type: 'GOAL' | 'PASS' | 'EMERGENCY'; // Тип хода
    stopX?: number;         // Расчётная точка остановки
    stopY?: number;         // Расчётная точка остановки
    /** Флаг: вариант не проходит через ворота между камнями */
    blockedByGates?: boolean;
}

/**
 * Результат оценки варианта хода (для логирования и визуализации)
 */
export interface MoveEvaluation {
    move: AIMove;
    positionScore: number;
    riskPenalty: number;
    forcePenalty: number;
    totalScore: number;
    rejected: boolean;
    rejectReason?: string;
    /** Флаг: вариант не проходит через ворота между камнями */
    blockedByGates: boolean;
}