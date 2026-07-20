/**
 * src/ai/strategy.ts
 * 
 * Стратегия AI: генерация кандидатов, оценка ходов, выбор лучшего.
 */

import { Stone } from "../stone.js";
import { 
    LOGICAL_WIDTH, LOGICAL_HEIGHT, MAX_FORCE, FRICTION, 
    STONE_RADIUS, goalConfidenceThreshold, currentWeights,
    accuracyEnabled, spreadFactor // <-- ДОБАВЛЕНО для GoalParams
} from "../state.js";
import { 
    FreeCorridor, buildFreeCorridor , angleRangeWidth, rayToSegmentDistance, distanceToBoundary, isAngleInRange
} from "./geometry.js";
import { 
    GoalEvaluation, evaluateGoalPossibility, isGoalShot 
} from "./goal.js";
import { 
    calculateMetrics 
} from "./metrics.js";
import { 
    calculateStopPosition 
} from "../simulation/math.js";
import { 
    CachedCandidate, AIMove, Weights 
} from "./types.js";
import { DEBUG_AI, DEBUG_GOAL, DEBUG_CANDIDATES } from "../debug.js";

// ============================================================
// ПАРАМЕТРЫ ПЕРЕБОРА
// ============================================================

const angleSteps = 6;
const forceSteps = 6;

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================
/**
 * Генерирует список кандидатов (возможных ударов) для ОДНОГО битка.
 *
 * Для битка `striker` перебираем сетку "направление × сила" внутри его
 * свободного коридора `corridor`. Каждый узел сетки = один кандидат.
 *
 * КЛЮЧЕВОЕ (восстановлено после рефакторинга): диапазон сил для каждого
 * направления берётся НЕ как "доля от максимума", а из геометрии:
 *   forceMin — минимальная сила, чтобы биток пересёк отрезок гейта и ушёл
 *              за точку пересечения на 2 радиуса (осмысленный проход гейта);
 *   forceMax — потолок силы, зависящий от того, голевое ли направление:
 *              • голевое  -> биток пролетает границу поля на 2 диаметра наружу
 *                            (гарантия пересечения створа; гол в игре засчитается
 *                            ещё раньше, в прямоугольнике ворот — см. isGoalShot);
 *              • не-голевое -> биток останавливается за R до границы (не вылетает);
 *              в обоих случаях forceMax не превышает MAX_FORCE.
 *   Силы распределяются равномерно ОТ forceMin ДО forceMax.
 *
 * Про углы и ±180°: коридор и голевой коридор могут пересекать границу ±180°,
 * поэтому углы генерируются непрерывным окном вокруг alphaCenter, а голевость
 * угла проверяется через isAngleInRange (она корректно обрабатывает wrap).
 *
 * @param striker   - биток, которым рассматриваем удар
 * @param gates     - два камня-гейта (препятствия, через которые надо пройти)
 * @param allStones - все камни (для indexOf и метрик)
 * @param corridor  - свободный коридор битка (угловое окно пролёта через гейт)
 */
function buildCandidatesForStriker(
    striker: Stone,
    gates: [Stone, Stone],
    allStones: Stone[],
    corridor: FreeCorridor
): CachedCandidate[] {
    const candidates: CachedCandidate[] = [];

    // Геометрические точки: позиция битка и центры камней гейта.
    const P = { x: striker.x, y: striker.y };
    const A = { x: gates[0].x, y: gates[0].y };
    const B = { x: gates[1].x, y: gates[1].y };
    const R = striker.radius;

    // Параметры связи "сила <-> дистанция остановки" при трении.
    // dMax = (force - thr) / K  =>  force = dMax * K + thr.
    const K = -Math.log(FRICTION);
    const thr = 0.02 * R;

    // Параметры ворот для оценки гола (бот = игрок 2 -> левые ворота, goalX = 0).
    const goalParams = {
        goalX: 0,
        goalTop: LOGICAL_HEIGHT / 2 - 100,
        goalBottom: LOGICAL_HEIGHT / 2 + 100,
        maxForce: MAX_FORCE,
        friction: FRICTION,
        accuracyEnabled: accuracyEnabled,
        spreadFactor: spreadFactor
    };

    // Оценка голевой возможности битка через его коридор (разворот углов внутри
    // уже сделан, поэтому wrap-кейс ±180° здесь не ломает пересечение).
    const goalEval = evaluateGoalPossibility(striker, corridor, goalParams);

    // isGoalAttempt — "биток в принципе способен забить с достаточной уверенностью".
    // Порог высокий (goalConfidenceThreshold): этим флагом в calculateMetrics
    // помечается кандидат как isGoal и начисляется бонус +20000. Применяется на
    // уровне битка; конкретный угол/сила дополнительно проверяются в isGoalShot.
    const isGoalAttempt = goalEval.isPossible && goalEval.confidence >= goalConfidenceThreshold;

    // Непрерывное угловое окно коридора вокруг центра (корректно при ±180°).
    // Наивная интерполяция alphaMin..alphaMax для wrap-коридора пошла бы "через 0"
    // (вправо) — это и был баг "биток бьёт в правый борт при открытом левом голе".
    const corrWidth = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);
    const corrLo = corridor.alphaCenter - corrWidth / 2;
    const corrHi = corridor.alphaCenter + corrWidth / 2;

    // Внешний цикл — по направлениям (углам) внутри коридора.
    for (let i = 0; i < angleSteps; i++) {
        // Середина i-й угловой ячейки (равномерное покрытие без краевых касательных).
        const angle = corrLo + (corrHi - corrLo) * (i + 0.5) / angleSteps;
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);

        // --- forceMin: пересечь отрезок гейта и уйти на 2R за него ---
        const dGate = rayToSegmentDistance(P.x, P.y, dirX, dirY, A.x, A.y, B.x, B.y);
        if (dGate === Infinity) {
            // Луч не пересекает отрезок гейта — для этого угла проход невозможен.
            // Внутри валидного коридора такого быть не должно, но это защита.
            continue;
        }
        const forceMin = (dGate + 2 * R) * K + thr;

        // --- forceMax: зависит от того, голевое ли это направление ---
        const dBoundary = distanceToBoundary(P.x, P.y, dirX, dirY, LOGICAL_WIDTH, LOGICAL_HEIGHT);

        // Голевое направление = угол лежит внутри голевого коридора (пересечение
        // коридора битка со створом ворот). Проверяем на уровне угла, а не битка:
        // внутри одного коридора могут быть и голевые, и не-голевые направления.
        const isGoalAngle = goalEval.isPossible &&
            isAngleInRange(angle, goalEval.goalCorridorMin, goalEval.goalCorridorMax);

        // Целевая дистанция остановки:
        //   голевое  -> за границей на 2 диаметра (4R) наружу;
        //   прочее   -> за R до границы (чтобы не вылететь).
        const dMaxStop = isGoalAngle ? (dBoundary + 4 * R) : (dBoundary - R);
        let forceMax = dMaxStop * K + thr;

        // Потолок силы — не больше MAX_FORCE ни при каких обстоятельствах.
        if (forceMax > MAX_FORCE) forceMax = MAX_FORCE;

        // Если даже максимум не дотягивает до минимума — для этого угла нет
        // валидной силы (биток либо не проходит гейт, либо вылетает). Пропускаем.
        if (forceMax < forceMin) continue;

        // Внутренний цикл — по силам, равномерно ОТ forceMin ДО forceMax включительно.
        for (let j = 0; j < forceSteps; j++) {
            const force = forceMin + (forceMax - forceMin) * j / (forceSteps - 1);

            // Прогнозируемая точка остановки при таком ударе (идёт в метрики и отчёт).
            const stopPos = calculateStopPosition(
                striker.x, striker.y,
                dirX * force, dirY * force,
                R
            );

            // Метрики позиции после удара (треугольник, гибкость, isGoal и т.д.).
            // params обязан содержать все 6 полей MetricsParams.
            const metrics = calculateMetrics(
                striker, gates[0], gates[1], allStones,
                angle, force, corridor, goalEval, isGoalAttempt,
                {
                    goalX: 0,
                    goalCenterY: LOGICAL_HEIGHT / 2,
                    friction: FRICTION,
                    logicalWidth: LOGICAL_WIDTH,
                    logicalHeight: LOGICAL_HEIGHT,
                    stoneRadius: STONE_RADIUS
                }
            );

            // currentScore = 0: оценки проставляются пакетно в recalculateScores,
            // чтобы при смене весов/пресета не перебирать геометрию заново.
            candidates.push({
                strikerIndex: allStones.indexOf(striker),
                angle,
                force,
                stopX: stopPos.x,
                stopY: stopPos.y,
                metrics,
                currentScore: 0
            });
        }
    }

    return candidates;
}

/**
 * Преобразует CachedCandidate в AIMove.
 */
function candidateToAIMove(c: CachedCandidate, stones: Stone[]): AIMove {
    const striker = stones[c.strikerIndex];
    return {
        stone: striker,
        targetX: striker.x + Math.cos(c.angle) * 1000,
        targetY: striker.y + Math.sin(c.angle) * 1000,
        score: c.currentScore,
        force: c.force,
        isFinalShot: c.metrics.isGoal,
        risk: c.metrics.corridorWidth < 10 ? 0.8 : 0.2,
        type: c.metrics.isGoal ? 'GOAL' : 'PASS',
        stopX: c.stopX,
        stopY: c.stopY,
        blockedByGates: false
    };
}

// ============================================================
// ОЦЕНКА КАНДИДАТОВ
// ============================================================

export function calculateScoreFromMetrics(
    candidate: CachedCandidate,
    weights: Weights = currentWeights,
    spread: number = 0.1
): number {
    const m = candidate.metrics;
    let score = 0;
    
    const spreadMultiplier = 1 + spread * 10;
    const effectiveRiskPenalty = weights.riskPenalty * spreadMultiplier;
    const effectiveForcePenalty = weights.forcePenalty * spreadMultiplier;
    
    if (m.isGoal) {
        score += 20000;
        score += m.goalConfidence * 5000;
    }
    
    if (!m.isGoal) {
        score += (m.triangleQuality / 10000) * weights.triangleQualityBonus;
        score += m.flexibilityCount * weights.flexibilityBonus / 2;
        
        const maxDistance = LOGICAL_WIDTH;
        score += ((maxDistance - m.goalDistance) / maxDistance) * weights.goalProximityBonus;
        score += Math.min(m.safetyMargin, 50) * (weights.safetyMarginBonus / 50);
        
        if (m.advancement > 0) {
            const cappedAdvancement = Math.min(m.advancement, 200);
            score += (cappedAdvancement / 100) * weights.advancementBonus;
        } else {
            score += m.advancement * weights.retreatPenalty;
        }
    }
    
    const risk = m.corridorWidth < 0.1 ? 0.8 : (m.corridorWidth < 0.3 ? 0.4 : 0.1);
    score -= risk * effectiveRiskPenalty;
    score -= (candidate.force / MAX_FORCE) * effectiveForcePenalty;
    
    if (!m.isGoal) {
        if (m.edgeDistance < STONE_RADIUS) {
            score -= (STONE_RADIUS - m.edgeDistance) * (weights.edgePenalty / STONE_RADIUS);
        }
        
        const D = STONE_RADIUS * 2;
        const maxSide = 8 * D;
        let excessSides = 0;
        const side1 = m.triangleAvgSide;
        const side2 = m.triangleAvgSide;
        const side3 = m.triangleAvgSide;
        
        if (side1 > maxSide) excessSides += (side1 - maxSide);
        if (side2 > maxSide) excessSides += (side2 - maxSide);
        if (side3 > maxSide) excessSides += (side3 - maxSide);
        
        if (excessSides > 0) {
            score -= excessSides * (weights.largeTrianglePenalty / 100);
        }
        
        if (candidate.stopX < 0 || candidate.stopX > LOGICAL_WIDTH || 
            candidate.stopY < 0 || candidate.stopY > LOGICAL_HEIGHT) {
            score -= weights.badPositionPenalty;
        }
    }
    
    return score;
}

export function recalculateScores(
    candidates: CachedCandidate[],
    weights: Weights = currentWeights,
    spread: number = 0.1
): void {
    for (const candidate of candidates) {
        candidate.currentScore = calculateScoreFromMetrics(candidate, weights, spread);
    }
}

// ============================================================
// ПОИСК ЛУЧШЕГО ХОДА
// ============================================================

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
    return candidateToAIMove(bestCandidate, allStones);
}

export function buildCachedCandidates(
    allStones: Stone[],
    excludedStriker: Stone | null = null
): { candidates: CachedCandidate[], corridors: Map<Stone, FreeCorridor> } {
    const candidates: CachedCandidate[] = [];
    const corridors = new Map<Stone, FreeCorridor>();
    
    const availableStones = allStones.filter(s => !s.isOut);
    
    for (const striker of availableStones) {
        if (excludedStriker && striker === excludedStriker) continue;
        
        const gates = availableStones.filter(s => s !== striker);
        if (gates.length !== 2) continue;
        
        const corridor = buildFreeCorridor(striker, gates[0], gates[1]);
        if (!corridor.isValid) continue;
        
        corridors.set(striker, corridor);
        
        const strikerCandidates = buildCandidatesForStriker(
            striker,
            [gates[0], gates[1]],
            allStones,
            corridor
        );
        
        candidates.push(...strikerCandidates);
    }
    
    return { candidates, corridors };
}

export function findBestMove(
    allStones: Stone[],
    gateCenter: { x: number; y: number },
    excludedStriker: Stone | null = null
): { 
    bestMove: AIMove | null;
    allConsideredMoves: AIMove[];
    candidates: CachedCandidate[];
    corridors: Map<Stone, FreeCorridor>
} {
    const { candidates, corridors } = buildCachedCandidates(allStones, excludedStriker);
    
    recalculateScores(candidates, currentWeights, spreadFactor);
    
    const bestMove = findBestMoveFromCandidates(candidates, allStones);
    const allConsideredMoves = candidates.map(c => candidateToAIMove(c, allStones));
    
    return { bestMove, allConsideredMoves, candidates, corridors };
}

// ============================================================
// АВАРИЙНЫЙ ХОД (ИСПРАВЛЕНИЕ 1)
// ============================================================

/**
 * Аварийный ход — когда нет валидных кандидатов.
 * Бьёт первым доступным битком в случайном направлении с минимальной силой.
 */
export function getEmergencyMove(allStones: Stone[]): AIMove {
    const available = allStones.filter(s => !s.isOut);
    
    if (available.length === 0) {
        return {
            stone: allStones[0],
            targetX: LOGICAL_WIDTH / 2,
            targetY: LOGICAL_HEIGHT / 2,
            score: -1000,
            force: 10,
            isFinalShot: false,
            risk: 1.0,
            type: 'EMERGENCY',
            stopX: LOGICAL_WIDTH / 2,
            stopY: LOGICAL_HEIGHT / 2,
            blockedByGates: false
        };
    }
    
    const striker = available[0];
    const angle = Math.random() * Math.PI * 2;
    const force = 10 + Math.random() * 5;
    
    const stopPos = calculateStopPosition(
        striker.x, striker.y,
        Math.cos(angle) * force,
        Math.sin(angle) * force,
        striker.radius
    );
    
    return {
        stone: striker,
        targetX: striker.x + Math.cos(angle) * 1000,
        targetY: striker.y + Math.sin(angle) * 1000,
        score: -1000,
        force,
        isFinalShot: false,
        risk: 1.0,
        type: 'EMERGENCY',
        stopX: stopPos.x,
        stopY: stopPos.y,
        blockedByGates: false
    };
}