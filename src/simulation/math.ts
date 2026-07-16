/**
 * src/simulation/math.ts
 * 
 * Аналитические функции для расчёта времени событий.
 * K вычисляется каждый раз для учёта изменения FRICTION.
 */

import { StoneState, Point, CandidateEvent } from "./types.js";
import { FRICTION, STOP_THRESHOLD_RATIO, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas, LOGICAL_WIDTH, LOGICAL_HEIGHT, STONE_RADIUS } from "../state.js";

/**
 * Возвращает текущий коэффициент затухания.
 * Вычисляется каждый раз, чтобы учитывать изменение FRICTION.
 */
function getK(): number {
    return -Math.log(FRICTION);
}

/**
 * Вычисляет скорость камня в момент времени t
 */
export function velocityAtTime(v0: number, t: number): number {
    const K = getK();
    return v0 * Math.exp(-K * t);
}

/**
 * Вычисляет позицию камня в момент времени t
 */
export function positionAtTime(x0: number, v0: number, t: number): number {
    const K = getK();
    return x0 + (v0 / K) * (1 - Math.exp(-K * t));
}

/**
 * Вычисляет время полной остановки камня
 */
export function stopTime(v0x: number, v0y: number, radius: number = STONE_RADIUS): number {
    const K = getK();
    const speed = Math.hypot(v0x, v0y);
    
    if (speed < 0.01) return 0;
    
    const threshold = STOP_THRESHOLD_RATIO * radius;
    
    if (threshold >= speed) {
        return 0;
    }
    
    const ratio = threshold / speed;
    
    if (ratio <= 0 || ratio >= 1) {
        return 0;
    }
    
    const time = -Math.log(ratio) / K;
    
    return Math.max(0, time);
}

/**
 * Вычисляет расстояние, которое пролетит камень до остановки
 */
export function stopDistance(v0x: number, v0y: number, radius: number = STONE_RADIUS): number {
    const K = getK();
    const speed = Math.hypot(v0x, v0y);
    if (speed < 0.01) return 0;
    
    const threshold = STOP_THRESHOLD_RATIO * radius;
    if (speed <= threshold) return 0;
    
    return (speed - threshold) / K;
}

/**
 * Вычисляет точку, в которой остановится камень
 */
export function calculateStopPosition(
    x0: number, 
    y0: number, 
    vx: number, 
    vy: number,
    radius: number = STONE_RADIUS
): { x: number; y: number } {
    const speed = Math.hypot(vx, vy);
    if (speed < 0.01) {
        return { x: x0, y: y0 };
    }
    
    const tStop = stopTime(vx, vy, radius);
    
    return {
        x: positionAtTime(x0, vx, tStop),
        y: positionAtTime(y0, vy, tStop)
    };
}

/**
 * Вычисляет время достижения точки на расстоянии d с учётом трения.
 */
function timeToReachDistance(distance: number, speed: number): number | null {
    const K = getK();
    if (speed < 0.001) return null;
    
    const maxDistance = speed / K;
    
    if (distance >= maxDistance) {
        return null;
    }
    
    const arg = 1 - (distance * K) / speed;
    if (arg <= 0) return null;
    
    const time = -Math.log(arg) / K;
    return time > 0 ? time : null;
}

/**
 * Находит точку пересечения траектории с отрезком между двумя камнями.
 */
export function findGateIntersection(
    startPos: Point,
    dir: Point,
    gate1: Point,
    gate2: Point
): { point: Point; t: number; s: number } | null {
    const segDir = { x: gate2.x - gate1.x, y: gate2.y - gate1.y };
    
    const det = dir.x * segDir.y - dir.y * segDir.x;
    
    if (Math.abs(det) < 1e-10) {
        return null;
    }
    
    const dx = gate1.x - startPos.x;
    const dy = gate1.y - startPos.y;
    
    const t = (dx * segDir.y - dy * segDir.x) / det;
    const s = (dx * dir.y - dy * dir.x) / det;
    
    if (s < 0 || s > 1 || t < 0) {
        return null;
    }
    
    const point = {
        x: startPos.x + t * dir.x,
        y: startPos.y + t * dir.y
    };
    
    return { point, t, s };
}

/**
 * Рассчитывает время столкновения двух камней.
 */
export function calculateCollisionTime(s1: StoneState, s2: StoneState): number | null {
    if (s1.isOut || s2.isOut) return null;
    
    const speed1 = Math.hypot(s1.vx, s1.vy);
    const speed2 = Math.hypot(s2.vx, s2.vy);
    
    if (speed1 < 0.001 && speed2 < 0.001) return null;
    
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const dvx = s2.vx - s1.vx;
    const dvy = s2.vy - s1.vy;
    
    const a = dvx * dvx + dvy * dvy;
    const b = 2 * (dx * dvx + dy * dvy);
    const c = dx * dx + dy * dy - (s1.radius + s2.radius) ** 2;
    
    if (Math.abs(a) < 1e-10) {
        if (Math.abs(b) < 1e-10) return null;
        const t = -c / b;
        return t > 0.1 ? t : null;
    }
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null;
    
    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    
    if (t1 > 0.1) return t1;
    if (t2 > 0.1) return t2;
    
    return null;
}

/**
 * Рассчитывает время вылета камня за пределы поля.
 */
export function calculateOutTime(stone: StoneState): { time: number; boundary: 'left' | 'right' | 'top' | 'bottom' } | null {
    if (stone.isOut) return null;
    
    const speed = Math.hypot(stone.vx, stone.vy);
    if (speed < 0.001) return null;
    
    let minTime = Infinity;
    let boundary: 'left' | 'right' | 'top' | 'bottom' = 'left';
    
    if (stone.vx < 0) {
        const t = solveForBoundary(stone.x, stone.vx, 0);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'left';
        }
    }
    
    if (stone.vx > 0) {
        const t = solveForBoundary(stone.x, stone.vx, LOGICAL_WIDTH);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'right';
        }
    }
    
    if (stone.vy < 0) {
        const t = solveForBoundary(stone.y, stone.vy, 0);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'top';
        }
    }
    
    if (stone.vy > 0) {
        const t = solveForBoundary(stone.y, stone.vy, LOGICAL_HEIGHT);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'bottom';
        }
    }
    
    if (minTime === Infinity || minTime < 0.1) return null;
    
    return { time: minTime, boundary };
}

/**
 * Решает уравнение x0 + (v0/K) * (1 - e^(-K*t)) = target для t
 */
function solveForBoundary(x0: number, v0: number, target: number): number | null {
    const K = getK();
    const arg = 1 - (target - x0) * K / v0;
    if (arg <= 0) return null;
    
    const t = -Math.log(arg) / K;
    return t > 0 ? t : null;
}

/**
 * Проверяет чистый проход и возвращает ВРЕМЯ события.
 */
export function checkCleanPass(
    striker: StoneState,
    gate1: StoneState,
    gate2: StoneState
): { time: number; gateIntersection: Point; distanceToA: number; distanceToB: number; minClearance: number } | null {
    if (striker.isOut || gate1.isOut || gate2.isOut) return null;
    
    const speed = Math.hypot(striker.vx, striker.vy);
    if (speed < 0.001) return null;
    
    const dir = { x: striker.vx / speed, y: striker.vy / speed };
    const startPos = { x: striker.x, y: striker.y };
    
    const intersection = findGateIntersection(
        startPos, 
        dir, 
        { x: gate1.x, y: gate1.y }, 
        { x: gate2.x, y: gate2.y }
    );
    
    if (!intersection) return null;
    if (intersection.t < 0.5) return null;
    
    const time = timeToReachDistance(intersection.t, speed);
    if (time === null) {
        return null;
    }
    
    const distanceToA = Math.hypot(
        intersection.point.x - gate1.x,
        intersection.point.y - gate1.y
    );
    
    const distanceToB = Math.hypot(
        intersection.point.x - gate2.x,
        intersection.point.y - gate2.y
    );
    
    const minClearance = striker.radius + gate1.radius + 5;
    
    if (distanceToA < minClearance || distanceToB < minClearance) {
        return null;
    }
    
    return {
        time,
        gateIntersection: intersection.point,
        distanceToA,
        distanceToB,
        minClearance: Math.min(distanceToA, distanceToB)
    };
}

/**
 * Проверяет пересечение линии ворот и возвращает ВРЕМЯ события.
 */
export function checkGoal(
    striker: StoneState,
    allStones: StoneState[],
    skipGateCheck: boolean = false
): { time: number; goalSide: 'left' | 'right' } | null {
    if (striker.isOut) return null;
    
    const speed = Math.hypot(striker.vx, striker.vy);
    if (speed < 0.001) return null;
    
    const dir = { x: striker.vx / speed, y: striker.vy / speed };
    const startPos = { x: striker.x, y: striker.y };
    
    if (!skipGateCheck) {
        const others = allStones.filter(s => s.index !== striker.index && !s.isOut);
        
        if (others.length === 2) {
            const v1x = others[0].x - striker.x;
            const v1y = others[0].y - striker.y;
            const v2x = others[1].x - striker.x;
            const v2y = others[1].y - striker.y;
            
            const cross1 = v1x * dir.y - v1y * dir.x;
            const cross2 = v2x * dir.y - v2y * dir.x;
            
            const hasGate = (cross1 * cross2 < 0);
            
            if (hasGate) {
                const gateIntersection = findGateIntersection(
                    startPos,
                    dir,
                    { x: others[0].x, y: others[0].y },
                    { x: others[1].x, y: others[1].y }
                );
                
                if (!gateIntersection || gateIntersection.t < 0.5) {
                    return null;
                }
            } else {
                return null;
            }
        } else {
            return null;
        }
    }
    
    if (startPos.x > LOGICAL_WIDTH - GOAL_WIDTH && 
        startPos.y > GOAL_Y && 
        startPos.y < GOAL_Y + GOAL_HEIGHT) {
        return { time: 0.1, goalSide: 'right' };
    }
    
    if (startPos.x < GOAL_WIDTH && 
        startPos.y > GOAL_Y && 
        startPos.y < GOAL_Y + GOAL_HEIGHT) {
        return { time: 0.1, goalSide: 'left' };
    }
    
    const rightGate1 = { x: LOGICAL_WIDTH - GOAL_WIDTH, y: GOAL_Y };
    const rightGate2 = { x: LOGICAL_WIDTH - GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    const rightIntersection = findGateIntersection(startPos, dir, rightGate1, rightGate2);
    
    if (rightIntersection && rightIntersection.t > 0.5) {
        const time = timeToReachDistance(rightIntersection.t, speed);
        if (time !== null) {
            return { time, goalSide: 'right' };
        }
    }
    
    const leftGate1 = { x: GOAL_WIDTH, y: GOAL_Y };
    const leftGate2 = { x: GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    const leftIntersection = findGateIntersection(startPos, dir, leftGate1, leftGate2);
    
    if (leftIntersection && leftIntersection.t > 0.5) {
        const time = timeToReachDistance(leftIntersection.t, speed);
        if (time !== null) {
            return { time, goalSide: 'left' };
        }
    }
    
    return null;
}