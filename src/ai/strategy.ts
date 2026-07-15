/**
 * src/ai/strategy.ts
 * 
 * Стратегическая оценка ходов для AI.
 * Все камни равнозначны: любой камень может быть битком, два других выступают в роли ворот.
 */

import { Stone } from "../stone.js";
import { 
    LOGICAL_WIDTH, 
    LOGICAL_HEIGHT, 
    GOAL_Y, 
    GOAL_HEIGHT, 
    GOAL_WIDTH, 
    MAX_FORCE, 
    FRICTION 
} from "../state.js";
import { Point } from "../math.js";
import { findGateIntersection } from "../simulation/math.js";
import { AIMove, MoveEvaluation } from "./types.js";

// ============================================================
// НАСТРОЙКИ ШТРАФОВ И БОНУСОВ ИИ
// ============================================================

const DEFAULT_PENALTIES = {
    riskPenalty: 4000,
    forcePenalty: 300,
    gatesBlockPenalty: 10000,
    advancementBonus: 3000,
    retreatPenalty: 0.5,
    nextShotBonus: 5000,
    missGatePenalty: 5000,
    badPositionPenalty: 2000
};

let currentPenalties = { ...DEFAULT_PENALTIES };

export function setAIPenalties(penalties: Partial<typeof DEFAULT_PENALTIES>): void {
    currentPenalties = { ...currentPenalties, ...penalties };
}

export function getAIPenalties(): typeof DEFAULT_PENALTIES {
    return { ...currentPenalties };
}

// ============================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Проверяет, проходит ли траектория через створ между двумя камнями
 */
function checkGatePass(
    striker: Stone,
    angle: number,
    gates: Stone[]
): { passes: boolean; blocked: boolean; clearance: number } {
    if (gates.length !== 2) return { passes: false, blocked: false, clearance: 0 };
    
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    // Векторы от битка к камням ворот
    const v1x = gates[0].x - striker.x;
    const v1y = gates[0].y - striker.y;
    const v2x = gates[1].x - striker.x;
    const v2y = gates[1].y - striker.y;
    
    // Векторное произведение для определения сторон
    const cross1 = v1x * dy - v1y * dx;
    const cross2 = v2x * dy - v2y * dx;
    
    // Если знаки одинаковые — камни на одной стороне, створа нет
    if (cross1 * cross2 > 0) {
        return { passes: false, blocked: false, clearance: 0 };
    }
    
    // Проверяем пересечение с отрезком между камнями
    const dir = { x: dx, y: dy };
    const startPos = { x: striker.x, y: striker.y };
    const intersection = findGateIntersection(
        startPos,
        dir,
        { x: gates[0].x, y: gates[0].y },
        { x: gates[1].x, y: gates[1].y }
    );
    
    if (!intersection || intersection.t < 0.5) {
        return { passes: false, blocked: true, clearance: 0 };
    }
    
    // Проверяем расстояние до камней в точке пересечения
    const distToA = Math.hypot(
        intersection.point.x - gates[0].x,
        intersection.point.y - gates[0].y
    );
    const distToB = Math.hypot(
        intersection.point.x - gates[1].x,
        intersection.point.y - gates[1].y
    );
    
    const minClearance = Math.min(distToA, distToB);
    const requiredClearance = striker.radius + gates[0].radius + 5;
    
    if (minClearance < requiredClearance) {
        return { passes: false, blocked: true, clearance: minClearance };
    }
    
    return { passes: true, blocked: false, clearance: minClearance };
}

// ============================================================
// ОСНОВНЫЕ ФУНКЦИИ ОЦЕНКИ (вызываются из ai.ts)
// ============================================================

/**
 * Оценивает удар для гола конкретным камнем
 */
export function evaluateGoalShot(
    striker: Stone,
    gates: Stone[]
): AIMove | null {
    // Цель — противоположные ворота
    const targetGateX = striker.x < LOGICAL_WIDTH / 2 ? LOGICAL_WIDTH : 0;
    const targetGateY = GOAL_Y + GOAL_HEIGHT / 2;
    
    const dx = targetGateX - striker.x;
    const dy = targetGateY - striker.y;
    const angle = Math.atan2(dy, dx);
    
    const gateCheck = checkGatePass(striker, angle, gates);
    if (!gateCheck.passes) {
        return null; // Не можем забить через створ
    }
    
    const distance = Math.hypot(dx, dy);
    const K = -Math.log(FRICTION);
    
    // Рассчитываем необходимую силу с небольшим запасом
    const requiredForce = Math.min(distance * K * 1.2, MAX_FORCE);
    if (requiredForce > MAX_FORCE) {
        return null; // Слишком далеко, не можем забить
    }
    
    const stopDistance = requiredForce / K;
    
    return {
        stone: striker,
        targetX: targetGateX,
        targetY: targetGateY,
        score: 10000 + gateCheck.clearance * 10, // Бонус за чистый проход
        force: requiredForce,
        isFinalShot: true,
        risk: 0.2,
        type: 'GOAL',
        stopX: striker.x + Math.cos(angle) * stopDistance,
        stopY: striker.y + Math.sin(angle) * stopDistance,
        blockedByGates: gateCheck.blocked
    };
}

/**
 * Находит лучшие тактические ходы для конкретного камня-битка
 */
export function findBestTacticalMoves(
    striker: Stone,
    gateCenter: Point,
    gates: Stone[],
    allStones: Stone[]
): MoveEvaluation[] {
    const evaluations: MoveEvaluation[] = [];
    const numAngles = 36;
    const numForces = 6;
    
    for (let i = 0; i < numAngles; i++) {
        const angle = (i / numAngles) * Math.PI * 2;
        
        for (let j = 1; j <= numForces; j++) {
            const force = (j / numForces) * MAX_FORCE;
            const evaluation = evaluateTacticalMove(striker, angle, force, gates, allStones, gateCenter);
            evaluations.push(evaluation);
        }
    }
    
    // Сортируем по totalScore (по убыванию)
    evaluations.sort((a, b) => b.totalScore - a.totalScore);
    
    return evaluations.slice(0, 10); // Возвращаем топ-10
}

/**
 * Оценивает один конкретный тактический ход
 */
function evaluateTacticalMove(
    striker: Stone,
    angle: number,
    force: number,
    gates: Stone[],
    allStones: Stone[],
    gateCenter: Point
): MoveEvaluation {
    let score = 0;
    let rejected = false;
    let rejectReason = '';
    
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const K = -Math.log(FRICTION);
    
    const stopDistance = force / K;
    const stopX = striker.x + dx * stopDistance;
    const stopY = striker.y + dy * stopDistance;
    
    // 1. Проверка створа
    const gateCheck = checkGatePass(striker, angle, gates);
    
    if (!gateCheck.passes && gates.length === 2) {
        score -= currentPenalties.missGatePenalty;
        rejected = true;
        rejectReason = 'Удар мимо створа';
    }
    
    if (gateCheck.passes) {
        score += 1000 + gateCheck.clearance * 5; // Бонус за чистый проход
    }
    
    // 2. Продвижение к цели
    const currentDist = Math.hypot(striker.x - gateCenter.x, striker.y - gateCenter.y);
    const distToGate = Math.hypot(stopX - gateCenter.x, stopY - gateCenter.y);
    const advancement = currentDist - distToGate;
    
    if (advancement > 0) {
        score += (advancement / 100) * currentPenalties.advancementBonus;
    } else {
        score += advancement * currentPenalties.retreatPenalty;
    }
    
    // 3. Близость к воротам после удара
    if (distToGate < GOAL_HEIGHT) {
        score += 8000;
    } else if (distToGate < GOAL_HEIGHT * 2) {
        score += 4000;
    }
    
    // 4. Штрафы
    const risk = gateCheck.blocked ? 0.8 : (gateCheck.passes ? 0.1 : 0.6);
    score -= risk * currentPenalties.riskPenalty;
    score -= (force / MAX_FORCE) * currentPenalties.forcePenalty;
    
    if (stopX < 0 || stopX > LOGICAL_WIDTH || stopY < 0 || stopY > LOGICAL_HEIGHT) {
        score -= 3000;
        if (!rejected) {
            rejected = true;
            rejectReason = 'Вылет за стол';
        }
    }
    
    if (gateCheck.blocked) {
        score -= currentPenalties.gatesBlockPenalty;
    }
    
    const move: AIMove = {
        stone: striker,
        targetX: striker.x + dx * 1000,
        targetY: striker.y + dy * 1000,
        score,
        force,
        isFinalShot: false,
        risk,
        type: 'PASS',
        stopX,
        stopY,
        blockedByGates: gateCheck.blocked
    };
    
    return {
        move,
        positionScore: score,
        riskPenalty: risk * currentPenalties.riskPenalty,
        forcePenalty: (force / MAX_FORCE) * currentPenalties.forcePenalty,
        totalScore: score,
        rejected,
        rejectReason,
        blockedByGates: gateCheck.blocked
    };
}

/**
 * Возвращает экстренный ход (если все варианты плохие)
 */
export function getEmergencyMove(available: Stone[]): AIMove | null {
    if (available.length === 0) return null;
    
    const striker = available[0];
    const angle = Math.random() * Math.PI * 2;
    const force = MAX_FORCE * 0.4; // Средняя сила
    const K = -Math.log(FRICTION);
    const stopDistance = force / K;
    
    return {
        stone: striker,
        targetX: striker.x + Math.cos(angle) * 1000,
        targetY: striker.y + Math.sin(angle) * 1000,
        score: -1000,
        force,
        isFinalShot: false,
        risk: 0.5,
        type: 'EMERGENCY',
        stopX: striker.x + Math.cos(angle) * stopDistance,
        stopY: striker.y + Math.sin(angle) * stopDistance,
        blockedByGates: false
    };
}

/**
 * Находит лучший ход среди всех доступных камней и собирает все рассмотренные варианты.
 * 
 * @returns Объект с лучшим ходом и списком всех рассмотренных ходов
 */
export function findBestMove(
    allStones: Stone[],
    gateCenter: Point
): { bestMove: AIMove | null; allConsideredMoves: AIMove[] } {
    const availableStones = allStones.filter(s => !s.isOut);
    if (availableStones.length < 3) {
        return { bestMove: null, allConsideredMoves: [] };
    }
    
    let bestMove: AIMove | null = null;
    let bestScore = -Infinity;
    const allConsideredMoves: AIMove[] = [];
    
    for (const striker of availableStones) {
        const gates = availableStones.filter(s => s !== striker);
        if (gates.length !== 2) continue;
        
        // 1. Проверка гола
        const goalShot = evaluateGoalShot(striker, gates);
        if (goalShot) {
            allConsideredMoves.push(goalShot);
            if (goalShot.score > bestScore) {
                bestScore = goalShot.score;
                bestMove = goalShot;
            }
        }
        
        // 2. Проверка тактических ходов
        const tacticalEvaluations = findBestTacticalMoves(striker, gateCenter, gates, allStones);
        for (const evl of tacticalEvaluations) {
            if (!evl.rejected) {
                allConsideredMoves.push(evl.move);
                if (evl.move.score > bestScore) {
                    bestScore = evl.move.score;
                    bestMove = evl.move;
                }
            }
        }
    }
    
    return { bestMove, allConsideredMoves };
}