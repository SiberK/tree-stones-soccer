/**
 * src/simulation/math.ts
 * 
 * Аналитические функции для расчёта времени событий.
 * Все функции возвращают ВРЕМЯ (в игровых единицах), а не расстояние.
 */

import { StoneState, Point, CandidateEvent } from "./types.js";
import { FRICTION, STOP_THRESHOLD_RATIO, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas } from "../state.js";

// Коэффициент затухания (из дискретной модели)
// FRICTION = 0.98, значит K = -ln(0.98) ≈ 0.0202
const K = -Math.log(FRICTION);

/**
 * Вычисляет скорость камня в момент времени t
 */
export function velocityAtTime(v0: number, t: number): number {
    return v0 * Math.exp(-K * t);
}

/**
 * Вычисляет позицию камня в момент времени t
 */
export function positionAtTime(x0: number, v0: number, t: number): number {
    return x0 + (v0 / K) * (1 - Math.exp(-K * t));
}

/**
 * Вычисляет время полной остановки камня.
 * 
 * ИСПРАВЛЕНО: добавлена защита от деления на ноль и отрицательных значений.
 */
export function stopTime(v0x: number, v0y: number): number {
    const speed = Math.hypot(v0x, v0y);
    
    // Если скорость очень мала — камень уже стоит
    if (speed < 0.01) return 0;
    
    // Порог остановки (минимальная скорость, при которой считаем камень остановившимся)
    const threshold = STOP_THRESHOLD_RATIO * 28; // radius * STOP_THRESHOLD_RATIO
    
    // Проверяем, что threshold меньше скорости
    if (threshold >= speed) {
        return 0; // Камень уже ниже порога
    }
    
    // v(t) = v0 * e^(-K*t) = threshold
    // t = -ln(threshold / v0) / K
    const ratio = threshold / speed;
    
    // Защита от логарифма нуля или отрицательного числа
    if (ratio <= 0 || ratio >= 1) {
        return 0;
    }
    
    const time = -Math.log(ratio) / K;
    
    // Защита от отрицательного времени
    return Math.max(0, time);
}

/**
 * Находит точку пересечения траектории с отрезком между двумя камнями.
 * 
 * @returns { point, t, s } где:
 *   - point: точка пересечения
 *   - t: РАССТОЯНИЕ от startPos до точки пересечения (не время!)
 *   - s: параметр вдоль отрезка (0 = gate1, 1 = gate2)
 */
export function findGateIntersection(
    startPos: Point,
    dir: Point,  // единичный вектор направления
    gate1: Point,
    gate2: Point
): { point: Point; t: number; s: number } | null {
    // Вектор отрезка между камнями
    const segDir = { x: gate2.x - gate1.x, y: gate2.y - gate1.y };
    
    // Решаем систему:
    // startPos.x + t * dir.x = gate1.x + s * segDir.x
    // startPos.y + t * dir.y = gate1.y + s * segDir.y
    
    const det = dir.x * segDir.y - dir.y * segDir.x;
    
    if (Math.abs(det) < 1e-10) {
        return null; // Линии параллельны
    }
    
    const dx = gate1.x - startPos.x;
    const dy = gate1.y - startPos.y;
    
    const t = (dx * segDir.y - dy * segDir.x) / det;
    const s = (dx * dir.y - dy * dir.x) / det;
    
    // Проверяем, что пересечение в пределах отрезка и впереди битка
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
 * Использует линейную аппроксимацию (без учёта трения).
 */
export function calculateCollisionTime(s1: StoneState, s2: StoneState): number | null {
    if (s1.isOut || s2.isOut) return null;
    
    const speed1 = Math.hypot(s1.vx, s1.vy);
    const speed2 = Math.hypot(s2.vx, s2.vy);
    
    // Если оба стоят — столкновения не будет
    if (speed1 < 0.001 && speed2 < 0.001) return null;
    
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const dvx = s2.vx - s1.vx;
    const dvy = s2.vy - s1.vy;
    
    const a = dvx * dvx + dvy * dvy;
    const b = 2 * (dx * dvx + dy * dvy);
    const c = dx * dx + dy * dy - (s1.radius + s2.radius) ** 2;
    
    // Если a ≈ 0, камни движутся с одинаковой скоростью
    if (Math.abs(a) < 1e-10) {
        if (Math.abs(b) < 1e-10) return null;
        const t = -c / b;
        return t > 0.1 ? t : null;
    }
    
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null; // Столкновения не будет
    
    const sqrtD = Math.sqrt(discriminant);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);
    
    // Берём первое положительное время
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
    
    // Левая граница: x(t) = 0
    if (stone.vx < 0) {
        const t = solveForBoundary(stone.x, stone.vx, 0);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'left';
        }
    }
    
    // Правая граница: x(t) = canvas.width
    if (stone.vx > 0) {
        const t = solveForBoundary(stone.x, stone.vx, canvas.width);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'right';
        }
    }
    
    // Верхняя граница: y(t) = 0
    if (stone.vy < 0) {
        const t = solveForBoundary(stone.y, stone.vy, 0);
        if (t !== null && t < minTime) {
            minTime = t;
            boundary = 'top';
        }
    }
    
    // Нижняя граница: y(t) = canvas.height
    if (stone.vy > 0) {
        const t = solveForBoundary(stone.y, stone.vy, canvas.height);
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
    // x0 + (v0/K) * (1 - e^(-K*t)) = target
    // (v0/K) * (1 - e^(-K*t)) = target - x0
    // 1 - e^(-K*t) = (target - x0) * K / v0
    // e^(-K*t) = 1 - (target - x0) * K / v0
    // -K*t = ln(1 - (target - x0) * K / v0)
    // t = -ln(1 - (target - x0) * K / v0) / K
    
    const arg = 1 - (target - x0) * K / v0;
    if (arg <= 0) return null; // Не достигнет границы
    
    const t = -Math.log(arg) / K;
    return t > 0 ? t : null;
}
/**
 * Вычисляет время достижения точки на расстоянии d с учётом трения.
 * 
 * Формула: d = (v0 / K) * (1 - e^(-K * t))
 * Решение: t = -ln(1 - d * K / v0) / K
 * 
 * @returns время или null, если биток не достигнет точки
 */
function timeToReachDistance(distance: number, speed: number): number | null {
    if (speed < 0.001) return null;
    
    // Проверяем, достигнет ли биток этой точки
    // Максимальное расстояние = v0 / K (при t → ∞)
    const maxDistance = speed / K;
    
    if (distance >= maxDistance) {
        return null; // Биток не долетит
    }
    
    // t = -ln(1 - d * K / v0) / K
    const arg = 1 - (distance * K) / speed;
    if (arg <= 0) return null;
    
    const time = -Math.log(arg) / K;
    return time > 0 ? time : null;
}

/**
 * Проверяет чистый проход и возвращает ВРЕМЯ события.
 * 
 * ИСПРАВЛЕНО: учитываем трение при расчёте времени достижения точки пересечения.
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
    
    // Находим точку пересечения траектории с отрезком между камнями
    const intersection = findGateIntersection(
        startPos, 
        dir, 
        { x: gate1.x, y: gate1.y }, 
        { x: gate2.x, y: gate2.y }
    );
    
    if (!intersection) return null;
    if (intersection.t < 0.5) return null;
    
    // === ИСПРАВЛЕНИЕ: рассчитываем время с учётом трения ===
    const time = timeToReachDistance(intersection.t, speed);
    if (time === null) {
        return null; // Биток не долетит до точки пересечения
    }
    
    // Вычисляем расстояния от точки пересечения до обоих камней
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
 * 
 * @param skipGateCheck - если true, не проверяем створ (только пересечение с воротами)
 * 
 * Логика:
 * - При skipGateCheck=false: полная проверка (створ + ворота)
 * - При skipGateCheck=true: только проверка пересечения с воротами
 *   (створ уже был проверен в начале симуляции)
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
    
    // УБРАНО: console.log('[checkGoal]...')
    
    // Проверка створа
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
    
    // Проверка пересечения с воротами
    if (startPos.x > canvas.width - GOAL_WIDTH && 
        startPos.y > GOAL_Y && 
        startPos.y < GOAL_Y + GOAL_HEIGHT) {
        return { time: 0.1, goalSide: 'right' };
    }
    
    if (startPos.x < GOAL_WIDTH && 
        startPos.y > GOAL_Y && 
        startPos.y < GOAL_Y + GOAL_HEIGHT) {
        return { time: 0.1, goalSide: 'left' };
    }
    
    // Правые ворота
    const rightGate1 = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y };
    const rightGate2 = { x: canvas.width - GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    const rightIntersection = findGateIntersection(startPos, dir, rightGate1, rightGate2);
    
    if (rightIntersection && rightIntersection.t > 0.5) {
        const time = timeToReachDistance(rightIntersection.t, speed);
        if (time !== null) {
            return { time, goalSide: 'right' };
        }
    }
    
    // Левые ворота
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