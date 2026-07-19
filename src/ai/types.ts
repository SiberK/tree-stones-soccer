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

/**
 * Предвычисленные метрики кандидата (не зависят от весов).
 * Используются для быстрого пересчёта score в режиме паузы.
 */
export interface CandidateMetrics {
    triangleQuality: number;      // Оценка качества треугольника (-10000...+5000)
    flexibilityCount: number;     // Кол-во валидных битков для след. удара (-2...+3)
    edgeDistance: number;         // Мин. расстояние до края поля (px)
    goalDistance: number;         // Расстояние до ворот противника (px)
    safetyMargin: number;         // Запас прочности коридора (px)
    triangleAvgSide: number;      // Средняя сторона треугольника (px)
    advancement: number;          // Продвижение к воротам (px)
    corridorWidth: number;        // Ширина свободного коридора (рад)
    isGoal: boolean;              // Является ли этот ход голевым
    goalConfidence: number;       // Уверенность гола (0-1)
}

/**
 * Кешированный кандидат хода.
 * Геометрия и метрики не зависят от весов.
 * Score пересчитывается при изменении весов.
 */
export interface CachedCandidate {
    strikerIndex: number;
    angle: number;
    force: number;
    stopX: number;
    stopY: number;
    metrics: CandidateMetrics;
    currentScore: number;
}

/**
 * Набор весов для оценки ходов.
 */
export interface Weights {
    // Существующие
    riskPenalty: number;
    forcePenalty: number;
    gatesBlockPenalty: number;
    advancementBonus: number;
    retreatPenalty: number;
    nextShotBonus: number;
    missGatePenalty: number;
    badPositionPenalty: number;
    
    // Новые
    triangleQualityBonus: number;
    flexibilityBonus: number;
    goalProximityBonus: number;
    safetyMarginBonus: number;
    edgePenalty: number;
    largeTrianglePenalty: number;
}

/**
 * Шаг в истории паузы (для кнопок «Далее» / «Назад»).
 */
export interface PausedStep {
    stones: Array<{
        x: number; y: number;
        vx: number; vy: number;
        radius: number; color: string;
        isOut: boolean; index: number;
    }>;
    bestMove: AIMove | null;
    candidates: CachedCandidate[];
    stepIndex: number;
}