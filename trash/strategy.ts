/**
 * src/ai/strategy.ts
 * 
 * Оркестрация: кэширование кандидатов, оценка, поиск лучшего хода.
 */

import { Stone } from "../stone.js";
import { 
    LOGICAL_WIDTH, LOGICAL_HEIGHT, 
    GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH,
    MAX_FORCE, FRICTION, STONE_RADIUS,
    forceSteps, angleSteps, goalConfidenceThreshold,
    accuracyEnabled, spreadFactor, currentWeights
} from "../state.js";
import { Point } from "../math.js";
import { calculateStopPosition } from "../simulation/math.js";
import { AIMove, CachedCandidate, Weights } from "./types.js";
import { 
    FreeCorridor, buildFreeCorridor, 
    normalizeAngle, angleRangeWidth,
    raySegmentIntersection, distanceToBoundary
} from "./geometry.js";
import { GoalEvaluation, evaluateGoalPossibility, isGoalShot } from "./goal.js";
import { calculateMetrics } from "./metrics.js";

// ============================================================
// КЭШИРОВАНИЕ КАНДИДАТОВ
// ============================================================

/**
 * Строит всех кандидатов с геометрией и метриками.
 */
export function buildCachedCandidates(
    allStones: Stone[],
    excludedStriker: Stone | null = null
): {
    candidates: CachedCandidate[];
    corridors: Map<number, FreeCorridor>;
    goalEvals: Map<number, GoalEvaluation>;
    isGoalAttempts: Map<number, boolean>;
} {
    const availableStones = allStones.filter(s => !s.isOut);
    const candidates: CachedCandidate[] = [];
    const corridors = new Map<number, FreeCorridor>();
    const goalEvals = new Map<number, GoalEvaluation>();
    const isGoalAttempts = new Map<number, boolean>();
    
    if (availableStones.length < 3) {
        return { candidates, corridors, goalEvals, isGoalAttempts };
    }
    
    const goalParams = {
        goalX: 0,  // Левые ворота (ворота соперника)
        goalTop: GOAL_Y,
        goalBottom: GOAL_Y + GOAL_HEIGHT,
        maxForce: MAX_FORCE,
        friction: FRICTION,
        accuracyEnabled,
        spreadFactor
    };
    
    const metricsParams = {
        logicalWidth: LOGICAL_WIDTH,
        logicalHeight: LOGICAL_HEIGHT,
        stoneRadius: STONE_RADIUS,
        goalX: 0,
        goalCenterY: GOAL_Y + GOAL_HEIGHT / 2,
        friction: FRICTION
    };
    
    for (const striker of availableStones) {
        if (excludedStriker && striker === excludedStriker) {
            continue;
        }
        
        const gates = availableStones.filter(s => s !== striker);
        if (gates.length !== 2) continue;
        
        const gateA = gates[0];
        const gateB = gates[1];
        
        const corridor = buildFreeCorridor(striker, gateA, gateB);
        if (!corridor.isValid) continue;
        
        const goalEval = evaluateGoalPossibility(striker, corridor, goalParams);
        const isGoalAttempt = goalEval.isPossible && goalEval.confidence >= goalConfidenceThreshold;
        
        const strikerIndex = allStones.indexOf(striker);
        corridors.set(strikerIndex, corridor);
        goalEvals.set(strikerIndex, goalEval);
        isGoalAttempts.set(strikerIndex, isGoalAttempt);
        
        const K = -Math.log(FRICTION);
        const threshold = 0.02 * striker.radius;
        
        if (isGoalAttempt) {
            const goalWidth = angleRangeWidth(goalEval.goalCorridorMin, goalEval.goalCorridorMax);
            
            for (let i = 0; i < angleSteps; i++) {
                const t = angleSteps === 1 ? 0.5 : i / (angleSteps - 1);
                const angle = normalizeAngle(goalEval.goalCorridorMin + goalWidth * t);
                
                for (let j = 0; j < forceSteps; j++) {
                    const tForce = forceSteps === 1 ? 0.5 : j / (forceSteps - 1);
                    const force = goalEval.forceMin + (goalEval.forceMax - goalEval.forceMin) * tForce;
                    
                    const metrics = calculateMetrics(
                        striker, gateA, gateB, allStones,
                        angle, force, corridor, goalEval, isGoalAttempt,
                        metricsParams
                    );
                    
                    const dx = Math.cos(angle);
                    const dy = Math.sin(angle);
                    const vx = dx * force;
                    const vy = dy * force;
                    const stopPos = calculateStopPosition(
                        striker.x, striker.y, vx, vy, striker.radius
                    );
                    
                    candidates.push({
                        strikerIndex,
                        angle,
                        force,
                        stopX: stopPos.x,
                        stopY: stopPos.y,
                        metrics,
                        currentScore: 0
                    });
                }
            }
        } else {
            const corridorWidth = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);
            
            for (let i = 0; i < angleSteps; i++) {
                const t = angleSteps === 1 ? 0.5 : i / (angleSteps - 1);
                const angle = normalizeAngle(corridor.alphaMin + corridorWidth * t);
                
                const dirX = Math.cos(angle);
                const dirY = Math.sin(angle);
                
                const intersection = raySegmentIntersection(
                    striker.x, striker.y,
                    dirX, dirY,
                    gateA.x, gateA.y,
                    gateB.x, gateB.y
                );
                
                if (!intersection) continue;
                
                const dToGate = intersection.distance;
                const minDistance = dToGate + 2 * striker.radius;
                const forceMin = minDistance * K + threshold;
                
                const dToBoundary = distanceToBoundary(
                    striker.x, striker.y, dirX, dirY,
                    LOGICAL_WIDTH, LOGICAL_HEIGHT
                );
                const maxDistance = dToBoundary - striker.radius;
                const forceMax = Math.min(maxDistance * K + threshold, MAX_FORCE);
                
                if (forceMin >= forceMax) continue;
                
                for (let j = 0; j < forceSteps; j++) {
                    const tForce = forceSteps === 1 ? 0.5 : j / (forceSteps - 1);
                    const force = forceMin + (forceMax - forceMin) * tForce;
                    
                    const metrics = calculateMetrics(
                        striker, gateA, gateB, allStones,
                        angle, force, corridor, goalEval, isGoalAttempt,
                        metricsParams
                    );
                    
                    const dx = Math.cos(angle);
                    const dy = Math.sin(angle);
                    const vx = dx * force;
                    const vy = dy * force;
                    const stopPos = calculateStopPosition(
                        striker.x, striker.y, vx, vy, striker.radius
                    );
                    
                    candidates.push({
                        strikerIndex,
                        angle,
                        force,
                        stopX: stopPos.x,
                        stopY: stopPos.y,
                        metrics,
                        currentScore: 0
                    });
                }
            }
        }
    }
    
    return { candidates, corridors, goalEvals, isGoalAttempts };
}

// ============================================================
// ОЦЕНКА SCORE (зависит от весов)
// ============================================================

/**
 * Вычисляет score для кандидата по метрикам и весам.
 */
export function calculateScoreFromMetrics(
    candidate: CachedCandidate,
    weights: Weights = currentWeights
): number {
    const m = candidate.metrics;
    let score = 0;
    
    // === ГОЛ ===
    if (m.isGoal) {
        score += 20000;
        score += m.goalConfidence * 5000;
    }
    
    // === БОНУСЫ ===
    score += (m.triangleQuality / 10000) * weights.triangleQualityBonus;
    score += m.flexibilityCount * weights.flexibilityBonus / 2;
    
    const maxDistance = LOGICAL_WIDTH;
    score += ((maxDistance - m.goalDistance) / maxDistance) * weights.goalProximityBonus;
    score += Math.min(m.safetyMargin, 50) * (weights.safetyMarginBonus / 50);
    
    if (m.advancement > 0) {
        score += (m.advancement / 100) * weights.advancementBonus;
    } else {
        score += m.advancement * weights.retreatPenalty;
    }
    
    // === ШТРАФЫ ===
    if (m.edgeDistance < STONE_RADIUS) {
        score -= (STONE_RADIUS - m.edgeDistance) * (weights.edgePenalty / STONE_RADIUS);
    }
    
    const D = STONE_RADIUS * 2;
    const maxSide = 15 * D;
    if (m.triangleAvgSide > maxSide) {
        score -= (m.triangleAvgSide - maxSide) * (weights.largeTrianglePenalty / 100);
    }
    
    const risk = m.corridorWidth < 0.1 ? 0.8 : (m.corridorWidth < 0.3 ? 0.4 : 0.1);
    score -= risk * weights.riskPenalty;
    score -= (candidate.force / MAX_FORCE) * weights.forcePenalty;
    
    if (candidate.stopX < 0 || candidate.stopX > LOGICAL_WIDTH || 
        candidate.stopY < 0 || candidate.stopY > LOGICAL_HEIGHT) {
        score -= weights.badPositionPenalty;
    }
    
    return score;
}

/**
 * Пересчитывает score для всех кандидатов.
 */
export function recalculateScores(
    candidates: CachedCandidate[],
    weights: Weights = currentWeights
): void {
    for (const candidate of candidates) {
        candidate.currentScore = calculateScoreFromMetrics(candidate, weights);
    }
}

/**
 * Выбирает лучший ход из кандидатов.
 */
export function findBestMoveFromCandidates(
    candidates: CachedCandidate[],
    allStones: Stone[]
): AIMove | null {
    if (candidates.length === 0) return null;
    
    let bestCandidate: CachedCandidate | null = null;
    let bestScore = -Infinity;
    
    for (const candidate of candidates) {
        if (candidate.currentScore > bestScore) {
            bestScore = candidate.currentScore;
            bestCandidate = candidate;
        }
    }
    
    if (!bestCandidate) return null;
    
    const striker = allStones[bestCandidate.strikerIndex];
    const isGoal = bestCandidate.metrics.isGoal;
    
    return {
        stone: striker,
        targetX: striker.x + Math.cos(bestCandidate.angle) * 1000,
        targetY: striker.y + Math.sin(bestCandidate.angle) * 1000,
        score: bestCandidate.currentScore,
        force: bestCandidate.force,
        isFinalShot: isGoal,
        risk: bestCandidate.metrics.safetyMargin < 10 ? 0.8 : 0.2,
        type: isGoal ? 'GOAL' : 'PASS',
        stopX: bestCandidate.stopX,
        stopY: bestCandidate.stopY,
        blockedByGates: false
    };
}

// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ
// ============================================================

export function findBestMove(
    allStones: Stone[],
    gateCenter: Point,
    excludedStriker: Stone | null = null
): { 
    bestMove: AIMove | null; 
    allConsideredMoves: AIMove[];
    candidates: CachedCandidate[];
    corridors: Map<number, FreeCorridor>;
} {
    const { candidates, corridors } = buildCachedCandidates(allStones, excludedStriker);
    
    recalculateScores(candidates);
    
    const bestMove = findBestMoveFromCandidates(candidates, allStones);
    
    const allConsideredMoves: AIMove[] = candidates.map(c => {
        const striker = allStones[c.strikerIndex];
        return {
            stone: striker,
            targetX: striker.x + Math.cos(c.angle) * 1000,
            targetY: striker.y + Math.sin(c.angle) * 1000,
            score: c.currentScore,
            force: c.force,
            isFinalShot: c.metrics.isGoal,
            risk: c.metrics.safetyMargin < 10 ? 0.8 : 0.2,
            type: c.metrics.isGoal ? 'GOAL' : 'PASS',
            stopX: c.stopX,
            stopY: c.stopY,
            blockedByGates: false
        };
    });
    
    return { bestMove, allConsideredMoves, candidates, corridors };
}

// ============================================================
// АВАРИЙНЫЙ РЕЖИМ
// ============================================================

export function getEmergencyMove(available: Stone[]): AIMove | null {
    if (available.length === 0) return null;
    
    const striker = available[0];
    const angle = Math.random() * Math.PI * 2;
    const force = MAX_FORCE * 0.4;
    
    const vx = Math.cos(angle) * force;
    const vy = Math.sin(angle) * force;
    const stopPos = calculateStopPosition(striker.x, striker.y, vx, vy, striker.radius);
    
    return {
        stone: striker,
        targetX: striker.x + Math.cos(angle) * 1000,
        targetY: striker.y + Math.sin(angle) * 1000,
        score: -1000,
        force,
        isFinalShot: false,
        risk: 0.5,
        type: 'EMERGENCY',
        stopX: stopPos.x,
        stopY: stopPos.y,
        blockedByGates: false
    };
}