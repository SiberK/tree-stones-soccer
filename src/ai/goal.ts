/**
 * src/ai/goal.ts
 * 
 * Оценка голевой возможности для битка.
 */

import { Stone } from "../stone.js";
import { FreeCorridor, normalizeAngle, angleRangeWidth, isAngleInRange } from "./geometry.js";

export interface GoalEvaluation {
	isPossible: boolean;
	confidence: number;
	goalCorridorMin: number;
	goalCorridorMax: number;
	forceMin: number;
	forceMax: number;
	targetX: number;
	targetY: number;
}

export interface GoalParams {
	goalX: number;
	goalTop: number;
	goalBottom: number;
	maxForce: number;
	friction: number;
	accuracyEnabled: boolean;
	spreadFactor: number;
}

/**
 * Оценивает возможность гола для битка через свободный коридор.
 */
export function evaluateGoalPossibility(
	striker: Stone,
	corridor: FreeCorridor,
	params: GoalParams
): GoalEvaluation {
	const P = { x: striker.x, y: striker.y };
	const R = striker.radius;
	const { goalX, goalTop, goalBottom, maxForce, friction, accuracyEnabled, spreadFactor } = params;

	const thetaTop = Math.atan2(goalTop - P.y, goalX - P.x);
	const thetaBottom = Math.atan2(goalBottom - P.y, goalX - P.x);

	// Быстрый guard: смотрит ли коридор вообще в сторону ворот.
	// isAngleInRange корректно работает с wrap-коридорами, поэтому это надёжно.
	const dirToGoal = Math.atan2(
		goalTop + (goalBottom - goalTop) / 2 - P.y,
		goalX - P.x
	);
	const isPointingToGoal = isAngleInRange(
		normalizeAngle(dirToGoal),
		corridor.alphaMin,
		corridor.alphaMax
	);
	if (!isPointingToGoal) {
		console.log(`[GOAL REJECT] Направление на ворота вне коридора! dirToGoal=${(normalizeAngle(dirToGoal) * 180 / Math.PI).toFixed(1)}°, corridor=[${(corridor.alphaMin * 180 / Math.PI).toFixed(1)}°, ${(corridor.alphaMax * 180 / Math.PI).toFixed(1)}°]`);
		return {
			isPossible: false, confidence: 0,
			goalCorridorMin: 0, goalCorridorMax: 0,
			forceMin: 0, forceMax: 0, targetX: 0, targetY: 0
		};
	}

	// === КЛЮЧ ФИКСА: разворот всех углов в НЕПРЕРЫВНОЕ окно вокруг alphaCenter ===
	// Это устраняет проблему перехода через ±180°: и коридор, и створ ворот
	// становятся обычными отрезками [min, max] с min < max, и пересечение = max()/min().
	const base = corridor.alphaCenter;
	const wrapTo = (angle: number): number => {
		let d = angle - base;
		while (d <= -Math.PI) d += 2 * Math.PI;
		while (d > Math.PI) d -= 2 * Math.PI;
		return base + d;
	};

	// Коридор как непрерывное окно (ширину берём через устойчивую angleRangeWidth)
	const halfCorr = angleRangeWidth(corridor.alphaMin, corridor.alphaMax) / 2;
	const corrLo = base - halfCorr;
	const corrHi = base + halfCorr;

	// Створ ворот, развёрнутый вокруг того же якоря
	const wTop = wrapTo(thetaTop);
	const wBot = wrapTo(thetaBottom);
	const goalLo = Math.min(wTop, wBot);
	const goalHi = Math.max(wTop, wBot);

	const entry = Math.max(corrLo, goalLo);
	const exit = Math.min(corrHi, goalHi);
	const goalCorridorExists = entry <= exit;

	if (!goalCorridorExists) {
		return {
			isPossible: false, confidence: 0,
			goalCorridorMin: 0, goalCorridorMax: 0,
			forceMin: 0, forceMax: 0, targetX: 0, targetY: 0
		};
	}

	// Сохраняем НЕПРЕРЫВНЫЕ границы (возможно вне [-π, π]).
	// Это безопасно: isAngleInRange и angleRangeWidth нормализуют границы внутри себя.
	const goalCorridorMin = entry;
	const goalCorridorMax = exit;
	const goalCorridorWidth = exit - entry; // в непрерывном окне это и есть ширина

	const clampedY = Math.max(goalTop, Math.min(goalBottom, P.y));
	const targetX = goalX < P.x ? -4 * R : goalX + 4 * R;
	const targetY = clampedY;
	const dTarget = Math.hypot(targetX - P.x, targetY - P.y);

	const K = -Math.log(friction);
	const threshold = 0.02 * R;
	const forceMin = dTarget * K + threshold;
	const forceMax = maxForce;

	if (forceMin > forceMax) {
		return {
			isPossible: false, confidence: 0,
			goalCorridorMin: 0, goalCorridorMax: 0,
			forceMin: 0, forceMax: 0, targetX: 0, targetY: 0
		};
	}

	let confidence = 1.0;
	if (!accuracyEnabled) {
		const avgForce = (forceMin + forceMax) / 2;
		const spreadAtForce = Math.pow(avgForce / maxForce, 2) * spreadFactor;
		const effectiveSpread = 2 * spreadAtForce;
		if (goalCorridorWidth < effectiveSpread) {
			confidence = 0;
		} else {
			confidence = (goalCorridorWidth - effectiveSpread) / goalCorridorWidth;
		}
	}

	return {
		isPossible: confidence > 0,
		confidence,
		goalCorridorMin,
		goalCorridorMax,
		forceMin,
		forceMax,
		targetX,
		targetY
	};
}

/**
 * Проверяет, является ли конкретный угол+сила голевым ударом.
 */
export function isGoalShot(
    striker: Stone,
    angle: number,
    force: number,
    goalEval: GoalEvaluation,
    goalX: number,
    friction: number
): boolean {
    if (!goalEval.isPossible) return false;
    
    if (!isAngleInRange(angle, goalEval.goalCorridorMin, goalEval.goalCorridorMax)) {
        return false;
    }
    
    const K = -Math.log(friction);
    const threshold = 0.02 * striker.radius;
    const dMax = (force - threshold) / K;
    
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);
    
    if (Math.abs(dirX) < 0.1) {
        if (Math.abs(striker.x - goalX) > striker.radius * 2) {
            return false;
        }
    }
    
    const t = (goalX - striker.x) / dirX;
    if (t < 0) return false;
    
    const intersectionY = striker.y + dirY * t;
    
    const goalTop = goalEval.targetY - 100;
    const goalBottom = goalEval.targetY + 100;
    const tolerance = 50; // Увеличенный допуск
    
    // === НОВОЕ: Проверка попадания в прямоугольник ворот ===
    const goalRectLeft = goalX - 20; // Ширина ворот ~40px
    const goalRectRight = goalX + 20;
    
    // Вычисляем точку остановки
    const stopX = striker.x + dirX * dMax;
    const stopY = striker.y + dirY * dMax;
    
    // Проверяем, попадает ли точка остановки в прямоугольник ворот
    const inGoalRect = (
        stopX >= goalRectLeft && stopX <= goalRectRight &&
        stopY >= goalTop && stopY <= goalBottom
    );
    
    if (inGoalRect) {
        return true; // Гол засчитан!
    }
    // ============================================================
    
    if (intersectionY < goalTop - tolerance || intersectionY > goalBottom + tolerance) {
        if (Math.abs(intersectionY) < 2000) {
            console.log(`[GOAL MISS] Биток пролетает мимо ворот! intersectionY=${intersectionY.toFixed(0)}, goalY=[${goalTop.toFixed(0)}, ${goalBottom.toFixed(0)}]`);
        }
        return false;
    }
    
    const clampedY = Math.max(goalTop, Math.min(goalBottom, intersectionY));
    const dGate = Math.hypot(goalX - striker.x, clampedY - striker.y);
    
    return dMax >= dGate;
}