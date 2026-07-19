/**
 * src/ai/metrics.ts
 * 
 * Вычисление метрик позиции для кандидатов хода.
 * Метрики не зависят от весов.
 */

import { Stone } from "../stone.js";
import { FreeCorridor, buildFreeCorridor, angleRangeWidth } from "./geometry.js";
import { GoalEvaluation, isGoalShot } from "./goal.js";
import { calculateStopPosition } from "../simulation/math.js";
import { CandidateMetrics } from "./types.js";
import { goalConfidenceThreshold } from "../state.js"; 

// И убрать строку
// const { angleRangeWidth } = require('./geometry.js');
export interface MetricsParams {
	logicalWidth: number;
	logicalHeight: number;
	stoneRadius: number;
	goalX: number;           // x-координата ворот противника
	goalCenterY: number;     // y-координата центра ворот
	friction: number;
}

/**
 * Вычисляет метрики для одного кандидата хода.
 */
export function calculateMetrics(
	striker: Stone,
	gateA: Stone,
	gateB: Stone,
	allStones: Stone[],
	angle: number,
	force: number,
	corridor: FreeCorridor,
	goalEval: GoalEvaluation,
	isGoalAttempt: boolean,
	params: MetricsParams
): CandidateMetrics {

	// === ОТЛАДКА: лог для КАЖДОГО кандидата ===
	const willBeGoal = isGoalAttempt && isGoalShot(
		striker, angle, force, goalEval, params.goalX, params.friction
	);

    // Логируем каждый 10-й кандидат или все голы
    if (willBeGoal || (allStones.indexOf(striker) === 0 && Math.random() < 0.1)) {
        console.log(`[GOAL DEBUG] Биток ${striker.name}:`);
        console.log(`  angle=${(angle*180/Math.PI).toFixed(1)}°, force=${force.toFixed(1)}`);
        console.log(`  isGoalAttempt=${isGoalAttempt}, willBeGoal=${willBeGoal}`);
        console.log(`  confidence=${goalEval.confidence.toFixed(2)}, threshold=${goalConfidenceThreshold}`);
        console.log(`  corridor=[${(goalEval.goalCorridorMin*180/Math.PI).toFixed(1)}°, ${(goalEval.goalCorridorMax*180/Math.PI).toFixed(1)}°]`);
    }
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);

	const vx = dx * force;
	const vy = dy * force;
	const stopPos = calculateStopPosition(
		striker.x, striker.y, vx, vy, striker.radius
	);

	const { logicalWidth, logicalHeight, stoneRadius, goalX, goalCenterY, friction } = params;

	// === 1. Качество треугольника (после удара) ===
	let triangleQuality = 0;
	let triangleAvgSide = 0;

	if (!isNaN(stopPos.x) && !isNaN(stopPos.y)) {
		const a = Math.hypot(gateA.x - gateB.x, gateA.y - gateB.y);
		const b = Math.hypot(stopPos.x - gateB.x, stopPos.y - gateB.y);
		const c = Math.hypot(stopPos.x - gateA.x, stopPos.y - gateA.y);

		triangleAvgSide = (a + b + c) / 3;

		// Углы через теорему косинусов
		const angleAtStop = Math.acos(Math.max(-1, Math.min(1, (b * b + c * c - a * a) / (2 * b * c))));
		const angleAtA = Math.acos(Math.max(-1, Math.min(1, (a * a + c * c - b * b) / (2 * a * c))));
		const angleAtB = Math.acos(Math.max(-1, Math.min(1, (a * a + b * b - c * c) / (2 * a * b))));

		const MIN_ANGLE = 25 * Math.PI / 180;
		const MAX_ANGLE = 140 * Math.PI / 180;
		const OPTIMAL_ANGLE = 60 * Math.PI / 180;

		for (const ang of [angleAtStop, angleAtA, angleAtB]) {
			if (isNaN(ang)) {
				triangleQuality -= 2000;
				continue;
			}
			if (ang < MIN_ANGLE) {
				triangleQuality -= (MIN_ANGLE - ang) * 2000;
			} else if (ang > MAX_ANGLE) {
				triangleQuality -= (ang - MAX_ANGLE) * 1000;
			} else {
				const deviation = Math.abs(ang - OPTIMAL_ANGLE);
				triangleQuality += Math.max(0, 500 - deviation * 500);
			}
		}

		// Длины сторон
		const D = stoneRadius * 2;
		const minSide = 5 * D;
		const maxSide = 15 * D;
		const optimalSide = 8 * D;

		for (const side of [a, b, c]) {
			if (side < minSide) {
				triangleQuality -= (minSide - side) * 5;
			} else if (side > maxSide) {
				triangleQuality -= (side - maxSide) * 2;
			} else {
				const deviation = Math.abs(side - optimalSide);
				triangleQuality += Math.max(0, 100 - deviation * 0.5);
			}
		}
	}

	// === 2. Гибкость (валидные битки для следующего удара) ===
	let flexibilityCount = 0;

	if (!isNaN(stopPos.x) && !isNaN(stopPos.y) &&
		stopPos.x >= 0 && stopPos.x <= logicalWidth &&
		stopPos.y >= 0 && stopPos.y <= logicalHeight) {

		const simulatedStones = allStones.map(s => {
			if (s === striker) {
				return { ...s, x: stopPos.x, y: stopPos.y } as Stone;
			}
			return s;
		});

		const available = simulatedStones.filter(s => !s.isOut);

		let validCorridors = 0;
		for (let i = 0; i < available.length; i++) {
			const nextStriker = available[i];
			const gates = available.filter((_, idx) => idx !== i);
			if (gates.length !== 2) continue;

			const nextCorridor = buildFreeCorridor(nextStriker, gates[0], gates[1]);
			if (nextCorridor.isValid) {
				validCorridors++;
			}
		}

		if (validCorridors === 0) flexibilityCount = -2;
		else if (validCorridors === 1) flexibilityCount = 0;
		else if (validCorridors === 2) flexibilityCount = 1;
		else flexibilityCount = 2;
	} else {
		flexibilityCount = -2;
	}

	// === 3. Расстояние до края поля ===
	const edgeDistance = Math.min(
		stopPos.x,
		logicalWidth - stopPos.x,
		stopPos.y,
		logicalHeight - stopPos.y
	);

	// === 4. Расстояние до ворот противника ===
	const goalDistance = Math.hypot(stopPos.x - goalX, stopPos.y - goalCenterY);

	// === 5. Запас прочности коридора ===
	const safetyMargin = Math.max(0, corridor.margin);

	// === 6. Продвижение к воротам ===
	const currentDist = Math.hypot(striker.x - goalX, striker.y - goalCenterY);
	const advancement = currentDist - goalDistance;

	// === 7. Ширина коридора ===
	const corridorWidth = (corridor as any).alphaMax !== undefined
		? Math.abs(((corridor as any).alphaMax - (corridor as any).alphaMin))
		: 0;
	// Используем импортированную функцию
	const finalCorridorWidth = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);

	// === 8. Является ли ход голевым ===
	const isGoal = isGoalAttempt && isGoalShot(
		striker, angle, force, goalEval, goalX, friction
	);

	return {
		triangleQuality,
		flexibilityCount,
		edgeDistance,
		goalDistance,
		safetyMargin,
		triangleAvgSide,
		advancement,
		corridorWidth: finalCorridorWidth,
		isGoal,
		goalConfidence: goalEval.confidence
	};
}