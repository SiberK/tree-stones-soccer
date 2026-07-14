/**
 * src/ai/strategy.ts
 * 
 * Стратегическая оценка ходов для AI.
 * МИНИМАЛЬНАЯ ВЕРСИЯ с проверкой створа.
 */

import { Stone } from "../stone.js";
import { canvas, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH } from "../state.js";
import { Point } from "../math.js";
import { AIMove, MoveEvaluation } from "./types.js";

/**
 * Проверяет, проходит ли траектория через створ между двумя камнями
 */
function checkGatePass(
    striker: Stone,
    angle: number,
    gates: Stone[]
): { passes: boolean; blocked: boolean } {
    if (gates.length !== 2) return { passes: false, blocked: false };
    
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
        return { passes: false, blocked: false };
    }
    
    // Простая проверка: биток проходит между камнями
    // Вычисляем расстояние от линии траектории до каждого камня
    const dist1 = Math.abs(cross1) / Math.hypot(dx, dy);
    const dist2 = Math.abs(cross2) / Math.hypot(dx, dy);
    
    const minDist = Math.min(dist1, dist2);
    const requiredDist = striker.radius + gates[0].radius + 5;
    
    if (minDist < requiredDist) {
        return { passes: false, blocked: true };
    }
    
    return { passes: true, blocked: false };
}

/**
 * Оценивает удар для гола
 */
export function evaluateGoalShot(
    striker: Stone,
    gates: Stone[]
): AIMove | null {
    // Цель — ворота противника
    const targetGateX = striker.color === 'red' ? canvas.width : 0;
    const targetGateY = GOAL_Y + GOAL_HEIGHT / 2;
    
    const dx = targetGateX - striker.x;
    const dy = targetGateY - striker.y;
    const angle = Math.atan2(dy, dx);
    
    // Проверяем, проходит ли через створ
    const gateCheck = checkGatePass(striker, angle, gates);
    
    if (!gateCheck.passes) {
        return null; // Не можем забить через створ
    }
    
    const distance = Math.hypot(dx, dy);
    const force = Math.min(distance * 0.03, 18); // Простая формула силы
    
    const move: AIMove = {
        stone: striker,
        targetX: targetGateX,
        targetY: targetGateY,
        score: 10000,
        force: force,
        isFinalShot: true,
        risk: 0.2,
        type: 'GOAL',
        blockedByGates: gateCheck.blocked
    };
    
    return move;
}

/**
 * Находит лучшие тактические ходы
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
            const force = (j / numForces) * 18;
            
            const evaluation = evaluateTacticalMove(striker, angle, force, gates, gateCenter);
            evaluations.push(evaluation);
        }
    }
    
    // Сортируем по totalScore
    evaluations.sort((a, b) => b.totalScore - a.totalScore);
    
    return evaluations.slice(0, 10);
}

/**
 * Оценивает один тактический ход
 */
function evaluateTacticalMove(
    striker: Stone,
    angle: number,
    force: number,
    gates: Stone[],
    gateCenter: Point
): MoveEvaluation {
    let score = 0;
    let rejected = false;
    let rejectReason = '';
    
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    
    const targetX = striker.x + dx * 1000;
    const targetY = striker.y + dy * 1000;
    
    // Проверяем створ
    const gateCheck = checkGatePass(striker, angle, gates);
    
    // Штраф за удар мимо створа
    if (!gateCheck.passes && gates.length === 2) {
        score -= 5000;
        rejected = true;
        rejectReason = 'Удар мимо створа';
    }
    
    // Бонус за чистый проход
    if (gateCheck.passes) {
        score += 1000;
    }
    
    // Расстояние до ворот
    const stopX = striker.x + dx * (force / 0.0202);
    const stopY = striker.y + dy * (force / 0.0202);
    const distToGate = Math.hypot(stopX - gateCenter.x, stopY - gateCenter.y);
    
    if (distToGate < GOAL_HEIGHT) {
        score += 5000;
    } else if (distToGate < GOAL_HEIGHT * 2) {
        score += 2000;
    }
    
    // Штраф за риск
    const risk = gateCheck.blocked ? 0.8 : (gateCheck.passes ? 0.1 : 0.6);
    score -= risk * 4000;
    
    // Штраф за силу
    score -= (force / 18) * 300;
    
    const move: AIMove = {
        stone: striker,
        targetX,
        targetY,
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
        riskPenalty: risk * 4000,
        forcePenalty: (force / 18) * 300,
        totalScore: score,
        rejected,
        rejectReason,
        blockedByGates: gateCheck.blocked
    };
}

/**
 * Возвращает экстренный ход
 */
export function getEmergencyMove(available: Stone[]): AIMove | null {
    if (available.length === 0) return null;
    
    const striker = available[0];
    const angle = Math.random() * Math.PI * 2;
    const force = 8;
    
    const targetX = striker.x + Math.cos(angle) * 1000;
    const targetY = striker.y + Math.sin(angle) * 1000;
    
    return {
        stone: striker,
        targetX,
        targetY,
        score: -1000,
        force,
        isFinalShot: false,
        risk: 0.5,
        type: 'EMERGENCY',
        blockedByGates: false
    };
}