/**
 * src/ai/geometry.ts
 * 
 * Геометрические функции для построения свободных коридоров.
 * Не зависит от весов и стратегии.
 */

import { Stone } from "../stone.js";

export interface FreeCorridor {
    isValid: boolean;
    alphaMin: number;
    alphaMax: number;
    alphaCenter: number;
    margin: number;
    rejectReason?: string;
}

/**
 * Нормализует угол в диапазон [-π, π]
 */
export function normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= 2 * Math.PI;
    while (angle < -Math.PI) angle += 2 * Math.PI;
    return angle;
}

/**
 * Вычисляет ширину углового диапазона
 */
export function angleRangeWidth(min: number, max: number): number {
    let delta = normalizeAngle(max - min);
    if (delta < 0) delta += 2 * Math.PI;
    return delta;
}

/**
 * Проверяет, попадает ли угол в диапазон
 */
export function isAngleInRange(angle: number, min: number, max: number): boolean {
    const a = normalizeAngle(angle);
    const lo = normalizeAngle(min);
    const hi = normalizeAngle(max);
    
    if (lo <= hi) {
        return a >= lo && a <= hi;
    } else {
        return a >= lo || a <= hi;
    }
}

/**
 * Проверяет, пересекает ли луч отрезок AB
 */
export function rayIntersectsSegment(
    P: { x: number; y: number },
    dirX: number, dirY: number,
    A: { x: number; y: number }, B: { x: number; y: number }
): boolean {
    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    
    const det = dirX * ABy - dirY * ABx;
    if (Math.abs(det) < 1e-10) return false;
    
    const dx = A.x - P.x;
    const dy = A.y - P.y;
    
    const t = (dx * ABy - dy * ABx) / det;
    const s = (dx * dirY - dy * dirX) / det;
    
    return t > 1e-6 && s >= -1e-6 && s <= 1 + 1e-6;
}

/**
 * Расстояние от точки до луча
 */
export function distanceFromPointToRay(
    qx: number, qy: number,
    px: number, py: number,
    dirX: number, dirY: number
): number {
    const dx = qx - px;
    const dy = qy - py;
    
    const t = dx * dirX + dy * dirY;
    if (t < 0) return Infinity;
    
    const cross = Math.abs(dx * dirY - dy * dirX);
    return cross;
}

/**
 * Расстояние от точки до отрезка вдоль луча
 */
export function rayToSegmentDistance(
    px: number, py: number,
    dirX: number, dirY: number,
    ax: number, ay: number, bx: number, by: number
): number {
    const ABx = bx - ax;
    const ABy = by - ay;
    
    const det = dirX * ABy - dirY * ABx;
    if (Math.abs(det) < 1e-10) return Infinity;
    
    const dx = ax - px;
    const dy = ay - py;
    
    const t = (dx * ABy - dy * ABx) / det;
    const s = (dx * dirY - dy * dirX) / det;
    
    if (t < 1e-6 || s < -1e-6 || s > 1 + 1e-6) {
        return Infinity;
    }
    
    return t;
}

/**
 * Точка пересечения луча с отрезком
 */
export function raySegmentIntersection(
    px: number, py: number,
    dirX: number, dirY: number,
    ax: number, ay: number, bx: number, by: number
): { distance: number; x: number; y: number } | null {
    const d = rayToSegmentDistance(px, py, dirX, dirY, ax, ay, bx, by);
    if (d === Infinity) return null;
    
    return {
        distance: d,
        x: px + dirX * d,
        y: py + dirY * d
    };
}

/**
 * Расстояние от точки до ближайшей границы поля вдоль луча
 */
export function distanceToBoundary(
    x: number, y: number, 
    dirX: number, dirY: number,
    logicalWidth: number, logicalHeight: number
): number {
    let minT = Infinity;
    
    if (dirX < 0) {
        const t = -x / dirX;
        if (t > 0) minT = Math.min(minT, t);
    }
    if (dirX > 0) {
        const t = (logicalWidth - x) / dirX;
        if (t > 0) minT = Math.min(minT, t);
    }
    if (dirY < 0) {
        const t = -y / dirY;
        if (t > 0) minT = Math.min(minT, t);
    }
    if (dirY > 0) {
        const t = (logicalHeight - y) / dirY;
        if (t > 0) minT = Math.min(minT, t);
    }
    
    return minT === Infinity ? 0 : minT;
}

/**
 * Строит свободный коридор для битка через гейт (два камня A, B).
 * 
 * @param bufferRadiusFactor - коэффициент буферной зоны (по умолчанию 2.2)
 */
export function buildFreeCorridor(
    striker: Stone,
    gateA: Stone,
    gateB: Stone,
    bufferRadiusFactor: number = 2.2
): FreeCorridor {
    const R = striker.radius;
    const bufferRadius = bufferRadiusFactor * R;
    const P = { x: striker.x, y: striker.y };
    const A = { x: gateA.x, y: gateA.y };
    const B = { x: gateB.x, y: gateB.y };
    
    const distPA = Math.hypot(P.x - A.x, P.y - A.y);
    const distPB = Math.hypot(P.x - B.x, P.y - B.y);
    
    if (distPA < bufferRadius || distPB < bufferRadius) {
        return {
            isValid: false,
            alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
            rejectReason: 'Биток внутри буферной зоны'
        };
    }
    
    // Проверка: биток на отрезке гейта
    const ABx = B.x - A.x;
    const ABy = B.y - A.y;
    const APx = P.x - A.x;
    const APy = P.y - A.y;
    const cross = ABx * APy - ABy * APx;
    const dot = ABx * APx + ABy * APy;
    const lenSq = ABx * ABx + ABy * ABy;
    
    if (Math.abs(cross) < 1e-6 && dot >= 0 && dot <= lenSq) {
        return {
            isValid: false,
            alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
            rejectReason: 'Биток на отрезке гейта'
        };
    }
    
    // Построение 4 касательных к буферным зонам
    const tangents: { angle: number; source: 'A' | 'B' }[] = [];
    
    for (const [center, source] of [[A, 'A'], [B, 'B']] as const) {
        const dx = center.x - P.x;
        const dy = center.y - P.y;
        const d = Math.hypot(dx, dy);
        
        if (d < bufferRadius) {
            return {
                isValid: false,
                alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
                rejectReason: 'Биток внутри буферной зоны'
            };
        }
        
        const alphaC = Math.atan2(dy, dx);
        const beta = Math.asin(bufferRadius / d);
        
        tangents.push({ angle: normalizeAngle(alphaC - beta), source });
        tangents.push({ angle: normalizeAngle(alphaC + beta), source });
    }
    
    // Выбор 2 внутренних касательных
    const internalTangents: { angle: number; source: 'A' | 'B' }[] = [];
    
    for (const tangent of tangents) {
        const dirX = Math.cos(tangent.angle);
        const dirY = Math.sin(tangent.angle);
        
        if (!rayIntersectsSegment(P, dirX, dirY, A, B)) {
            continue;
        }
        
        const otherCenter = tangent.source === 'A' ? B : A;
        const distToOther = distanceFromPointToRay(
            otherCenter.x, otherCenter.y,
            P.x, P.y, dirX, dirY
        );
        
        if (distToOther < bufferRadius - 1e-6) {
            continue;
        }
        
        internalTangents.push(tangent);
    }
    
    if (internalTangents.length !== 2) {
        return {
            isValid: false,
            alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
            rejectReason: `Не найдено 2 внутренних касательных (найдено ${internalTangents.length})`
        };
    }
    
    // Биссектриса и нормализация
    let angle1 = internalTangents[0].angle;
    let angle2 = internalTangents[1].angle;
    
    let delta = angle2 - angle1;
    if (delta > Math.PI) {
        angle1 += 2 * Math.PI;
        delta = angle2 - angle1;
    } else if (delta < -Math.PI) {
        angle2 += 2 * Math.PI;
        delta = angle2 - angle1;
    }
    
    if (delta < 0) {
        [angle1, angle2] = [angle2, angle1];
        delta = -delta;
    }
    
    const alphaCenter = normalizeAngle((angle1 + angle2) / 2);
    
    // Проверка центрального луча
    const centerDirX = Math.cos(alphaCenter);
    const centerDirY = Math.sin(alphaCenter);
    
    if (!rayIntersectsSegment(P, centerDirX, centerDirY, A, B)) {
        return {
            isValid: false,
            alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
            rejectReason: 'Центральный луч не пересекает гейт'
        };
    }
    
    const distToA = distanceFromPointToRay(A.x, A.y, P.x, P.y, centerDirX, centerDirY);
    const distToB = distanceFromPointToRay(B.x, B.y, P.x, P.y, centerDirX, centerDirY);
    
    if (distToA < bufferRadius - 1e-6 || distToB < bufferRadius - 1e-6) {
        return {
            isValid: false,
            alphaMin: 0, alphaMax: 0, alphaCenter: 0, margin: 0,
            rejectReason: 'Центральный луч пересекает буферную зону'
        };
    }
    
    // Нормализация диапазона
    const halfDelta1 = Math.abs(normalizeAngle(angle1 - alphaCenter));
    const halfDelta2 = Math.abs(normalizeAngle(angle2 - alphaCenter));
    const halfDelta = Math.min(halfDelta1, halfDelta2);
    
    const alphaMin = normalizeAngle(alphaCenter - halfDelta);
    const alphaMax = normalizeAngle(alphaCenter + halfDelta);
    
    const margin = Math.min(distToA, distToB) - bufferRadius;
    
    return {
        isValid: true,
        alphaMin,
        alphaMax,
        alphaCenter,
        margin
    };
}