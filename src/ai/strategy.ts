/**
 * src/ai/strategy.ts
 * 
 * Стратегическая оценка ходов для AI.
 * Все камни равнозначны: любой камень может быть битком, два других — ворота (гейт).
 * 
 * Алгоритм:
 * 1. Для каждого битка строим свободный коридор через касательные к буферным зонам.
 * 2. Оцениваем голевую возможность (только для левых ворот — ворота соперника).
 * 3. Дискретизируем углы и силы в диапазоне.
 * 4. Оцениваем качество позиции после удара (двухходовка).
 * 5. Выбираем лучший ход по комплексной оценке.
 */

import { Stone } from "../stone.js";
import {
	LOGICAL_WIDTH,
	LOGICAL_HEIGHT,
	GOAL_Y,
	GOAL_HEIGHT,
	GOAL_WIDTH,
	MAX_FORCE,
	FRICTION,
	STONE_RADIUS,
	forceSteps,
	angleSteps,
	goalConfidenceThreshold,
	accuracyEnabled,
	spreadFactor
} from "../state.js";
import { Point } from "../math.js";
import { calculateStopPosition } from "../simulation/math.js";
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

(window as any).__strategyModule = {
	getAIPenalties,
	setAIPenalties
};

// ============================================================
// МАТЕМАТИКА СВОБОДНОГО КОРИДОРА
// ============================================================

interface FreeCorridor {
	isValid: boolean;
	alphaMin: number;
	alphaMax: number;
	alphaCenter: number;
	margin: number;
	rejectReason?: string;
}

function buildFreeCorridor(
	striker: Stone,
	gateA: Stone,
	gateB: Stone
): FreeCorridor {
	const R = striker.radius;
	const bufferRadius = 2.2 * R;  // Запас 0.2R для безопасности
	const P = { x: striker.x, y: striker.y };
	const A = { x: gateA.x, y: gateA.y };
	const B = { x: gateB.x, y: gateB.y };

	// Проверка вырожденного случая
	const distPA = Math.hypot(P.x - A.x, P.y - A.y);
	const distPB = Math.hypot(P.x - B.x, P.y - B.y);

	if (distPA < bufferRadius || distPB < bufferRadius) {
		return {
			isValid: false,
			alphaMin: 0,
			alphaMax: 0,
			alphaCenter: 0,
			margin: 0,
			rejectReason: 'Биток внутри буферной зоны'
		};
	}

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
			alphaMin: 0,
			alphaMax: 0,
			alphaCenter: 0,
			margin: 0,
			rejectReason: 'Биток на отрезке гейта'
		};
	}

	// Построение касательных
	const tangents: { angle: number; source: 'A' | 'B' }[] = [];

	for (const [center, source] of [[A, 'A'], [B, 'B']] as const) {
		const dx = center.x - P.x;
		const dy = center.y - P.y;
		const d = Math.hypot(dx, dy);

		if (d < bufferRadius) {
			return {
				isValid: false,
				alphaMin: 0,
				alphaMax: 0,
				alphaCenter: 0,
				margin: 0,
				rejectReason: 'Биток внутри буферной зоны'
			};
		}

		const alphaC = Math.atan2(dy, dx);
		const beta = Math.asin(bufferRadius / d);

		tangents.push({ angle: normalizeAngle(alphaC - beta), source });
		tangents.push({ angle: normalizeAngle(alphaC + beta), source });
	}

	// Выбор внутренних касательных
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
			alphaMin: 0,
			alphaMax: 0,
			alphaCenter: 0,
			margin: 0,
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

	// Проверка валидности центрального луча
	const centerDirX = Math.cos(alphaCenter);
	const centerDirY = Math.sin(alphaCenter);

	if (!rayIntersectsSegment(P, centerDirX, centerDirY, A, B)) {
		return {
			isValid: false,
			alphaMin: 0,
			alphaMax: 0,
			alphaCenter: 0,
			margin: 0,
			rejectReason: 'Центральный луч не пересекает гейт'
		};
	}

	const distToA = distanceFromPointToRay(A.x, A.y, P.x, P.y, centerDirX, centerDirY);
	const distToB = distanceFromPointToRay(B.x, B.y, P.x, P.y, centerDirX, centerDirY);

	if (distToA < bufferRadius - 1e-6 || distToB < bufferRadius - 1e-6) {
		return {
			isValid: false,
			alphaMin: 0,
			alphaMax: 0,
			alphaCenter: 0,
			margin: 0,
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

function normalizeAngle(angle: number): number {
	while (angle > Math.PI) angle -= 2 * Math.PI;
	while (angle < -Math.PI) angle += 2 * Math.PI;
	return angle;
}

function rayIntersectsSegment(
	P: { x: number; y: number },
	dirX: number,
	dirY: number,
	A: { x: number; y: number },
	B: { x: number; y: number }
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

function distanceFromPointToRay(
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

function isAngleInRange(angle: number, min: number, max: number): boolean {
	const a = normalizeAngle(angle);
	const lo = normalizeAngle(min);
	const hi = normalizeAngle(max);

	if (lo <= hi) {
		return a >= lo && a <= hi;
	} else {
		return a >= lo || a <= hi;
	}
}

function angleRangeWidth(min: number, max: number): number {
	let delta = normalizeAngle(max - min);
	if (delta < 0) delta += 2 * Math.PI;
	return delta;
}

// ============================================================
// ОЦЕНКА ГОЛЕВОЙ ВОЗМОЖНОСТИ
// ============================================================

interface GoalEvaluation {
	isPossible: boolean;
	confidence: number;
	goalCorridorMin: number;
	goalCorridorMax: number;
	forceMin: number;
	forceMax: number;
	targetX: number;
	targetY: number;
}

function evaluateGoalPossibility(
	striker: Stone,
	corridor: FreeCorridor
): GoalEvaluation {
	const P = { x: striker.x, y: striker.y };
	const R = striker.radius;

	const goalX = 0;
	const goalTop = GOAL_Y;
	const goalBottom = GOAL_Y + GOAL_HEIGHT;

	const thetaTop = Math.atan2(goalTop - P.y, goalX - P.x);
	const thetaBottom = Math.atan2(goalBottom - P.y, goalX - P.x);

	let thetaMin = Math.min(thetaTop, thetaBottom);
	let thetaMax = Math.max(thetaTop, thetaBottom);

	let entry = Math.max(corridor.alphaMin, thetaMin);
	let exit = Math.min(corridor.alphaMax, thetaMax);

	const entryNorm = normalizeAngle(entry);
	const exitNorm = normalizeAngle(exit);

	let goalCorridorExists = false;
	let goalCorridorMin = 0;
	let goalCorridorMax = 0;

	if (corridor.alphaMin <= corridor.alphaMax) {
		if (entry <= exit) {
			goalCorridorExists = true;
			goalCorridorMin = entry;
			goalCorridorMax = exit;
		}
	} else {
		if (entry <= exit || entry <= corridor.alphaMax || exit >= corridor.alphaMin) {
			goalCorridorExists = true;
			goalCorridorMin = entry;
			goalCorridorMax = exit;
		}
	}

	if (!goalCorridorExists) {
		return {
			isPossible: false,
			confidence: 0,
			goalCorridorMin: 0,
			goalCorridorMax: 0,
			forceMin: 0,
			forceMax: 0,
			targetX: 0,
			targetY: 0
		};
	}

	const goalCorridorWidth = angleRangeWidth(goalCorridorMin, goalCorridorMax);

	const clampedY = Math.max(goalTop, Math.min(goalBottom, P.y));
	const dGate = Math.hypot(goalX - P.x, clampedY - P.y);

	const targetX = -4 * R;
	const targetY = clampedY;
	const dTarget = Math.hypot(targetX - P.x, targetY - P.y);

	const K = -Math.log(FRICTION);
	const threshold = 0.02 * R;

	const forceMin = dTarget * K + threshold;
	const forceMax = MAX_FORCE;

	if (forceMin > forceMax) {
		return {
			isPossible: false,
			confidence: 0,
			goalCorridorMin: 0,
			goalCorridorMax: 0,
			forceMin: 0,
			forceMax: 0,
			targetX: 0,
			targetY: 0
		};
	}

	let confidence = 1.0;

	if (!accuracyEnabled) {
		const avgForce = (forceMin + forceMax) / 2;
		const spreadAtForce = Math.pow(avgForce / MAX_FORCE, 2) * spreadFactor;
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

// ============================================================
// ОЦЕНКА ХОДА С УЧЁТОМ ПОЗИЦИИ ПОСЛЕ УДАРА
// ============================================================

function evaluateShot(
	striker: Stone,
	angle: number,
	force: number,
	corridor: FreeCorridor,
	goalEval: GoalEvaluation,
	isGoalAttempt: boolean,
	allStones: Stone[],
	strikerIndex: number
): { score: number; stopX: number; stopY: number; isGoal: boolean } {
	const dx = Math.cos(angle);
	const dy = Math.sin(angle);

	const vx = dx * force;
	const vy = dy * force;
	const stopPos = calculateStopPosition(striker.x, striker.y, vx, vy, striker.radius);

	let score = 0;
	let isGoal = false;

	// === ОЦЕНКА ГОЛА ===
	if (isGoalAttempt && goalEval.isPossible) {
		if (isAngleInRange(angle, goalEval.goalCorridorMin, goalEval.goalCorridorMax)) {
			const K = -Math.log(FRICTION);
			const threshold = 0.02 * striker.radius;
			const dMax = (force - threshold) / K;

			const goalX = 0;
			const clampedY = Math.max(GOAL_Y, Math.min(GOAL_Y + GOAL_HEIGHT, striker.y));
			const dGate = Math.hypot(goalX - striker.x, clampedY - striker.y);

			if (dMax >= dGate) {
				isGoal = true;
				score += 20000;
				score += goalEval.confidence * 5000;
			}
		}
	}

	// === БАЗОВАЯ ТАКТИЧЕСКАЯ ОЦЕНКА ===

	// Штраф за вылет за стол
	if (!isGoal) {
		if (stopPos.x < 0 || stopPos.x > LOGICAL_WIDTH ||
			stopPos.y < 0 || stopPos.y > LOGICAL_HEIGHT) {
			score -= 5000;
		}
	}

	// Штраф за риск (узкий коридор текущего удара)
	const corridorWidth = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);
	const risk = corridorWidth < 0.1 ? 0.8 : (corridorWidth < 0.3 ? 0.4 : 0.1);
	score -= risk * currentPenalties.riskPenalty;

	// Бонус за запас прочности коридора
	score += Math.min(corridor.margin, 50) * 20;

	// Штраф за силу (базовый, без множителей)
	score -= (force / MAX_FORCE) * currentPenalties.forcePenalty;

	// === ОЦЕНКА ПОЗИЦИИ ПОСЛЕ УДАРА (двухходовка) ===
	if (!isGoal && !isNaN(stopPos.x) && !isNaN(stopPos.y)) {
		const nextPositionScore = evaluateNextPosition(
			allStones,
			strikerIndex,
			stopPos.x,
			stopPos.y
		);

		// Вес оценки следующей позиции
		score += nextPositionScore * 0.7;
	}

	return { score, stopX: stopPos.x, stopY: stopPos.y, isGoal };
}
/**
 * Оценивает геометрическое качество треугольника из трёх камней.
 * 
 * Хороший треугольник:
 * - Нет острых углов (< 25°) — иначе узкие гейты
 * - Нет вырожденных углов (> 150°) — иначе камни на одной линии
 * - Стороны 5-15 диаметров — не слишком близко и не слишком далеко
 * - Биток "снаружи" гейта (не между камнями)
 * 
 * @returns Оценка от -10000 (ужасный) до +5000 (отличный)
 */
function evaluateTriangleGeometry(
	striker: Stone,
	gateA: Stone,
	gateB: Stone
): number {
	let score = 0;
	const D = striker.radius * 2; // Диаметр

	// Длины сторон
	const a = Math.hypot(gateA.x - gateB.x, gateA.y - gateB.y); // сторона против битка
	const b = Math.hypot(striker.x - gateB.x, striker.y - gateB.y); // сторона против A
	const c = Math.hypot(striker.x - gateA.x, striker.y - gateA.y); // сторона против B

	// === 1. Оценка длин сторон ===
	const minSide = 5 * D;   // 5 диаметров
	const maxSide = 15 * D;  // 15 диаметров
	const optimalSide = 8 * D; // Оптимальная длина

	for (const side of [a, b, c]) {
		if (side < minSide) {
			// Слишком короткая сторона — камни слиплись
			score -= (minSide - side) * 30;
		} else if (side > maxSide) {
			// Слишком длинная сторона — неудобное расстояние
			score -= (side - maxSide) * 10;
		} else {
			// Бонус за близость к оптимальной длине
			const deviation = Math.abs(side - optimalSide);
			score += Math.max(0, 300 - deviation * 2);
		}
	}

	// === 2. Оценка углов (через теорему косинусов) ===
	// Угол при битке (против стороны a)
	const angleAtStriker = Math.acos((b * b + c * c - a * a) / (2 * b * c));
	// Угол при A (против стороны b)
	const angleAtA = Math.acos((a * a + c * c - b * b) / (2 * a * c));
	// Угол при B (против стороны c)
	const angleAtB = Math.acos((a * a + b * b - c * c) / (2 * a * b));

	const angles = [angleAtStriker, angleAtA, angleAtB];
	const MIN_ANGLE = 25 * Math.PI / 180;   // 25°
	const MAX_ANGLE = 140 * Math.PI / 180;  // 140°
	const OPTIMAL_ANGLE = 60 * Math.PI / 180; // 60°

	for (const angle of angles) {
		if (isNaN(angle)) {
			// Вырожденный треугольник (камни на одной линии)
			score -= 5000;
			continue;
		}

		if (angle < MIN_ANGLE) {
			// Слишком острый угол — узкий гейт
			score -= (MIN_ANGLE - angle) * 5000;
		} else if (angle > MAX_ANGLE) {
			// Слишком тупой угол — камни почти на одной линии
			score -= (angle - MAX_ANGLE) * 3000;
		} else {
			// Бонус за близость к оптимальному углу
			const deviation = Math.abs(angle - OPTIMAL_ANGLE);
			score += Math.max(0, 200 - deviation * 300);
		}
	}

	// === 3. Проверка: биток не между камнями гейта ===
	// Биток должен быть "снаружи" гейта (не в полосе между камнями в направлении от центра)
	const gateCenterX = (gateA.x + gateB.x) / 2;
	const gateCenterY = (gateA.y + gateB.y) / 2;
	const distToStriker = Math.hypot(striker.x - gateCenterX, striker.y - gateCenterY);

	// Проекция вектора от центра гейта к битку на перпендикуляр к гейту
	const gateDirX = gateB.x - gateA.x;
	const gateDirY = gateB.y - gateA.y;
	const gateLen = Math.hypot(gateDirX, gateDirY);

	if (gateLen > 1e-6) {
		// Перпендикуляр к гейту
		const perpX = -gateDirY / gateLen;
		const perpY = gateDirX / gateLen;

		// Проекция вектора (центр гейта → биток) на перпендикуляр
		const projX = striker.x - gateCenterX;
		const projY = striker.y - gateCenterY;
		const projOnPerp = Math.abs(projX * perpX + projY * perpY);

		// Если проекция мала — биток в плоскости гейта (плохо для следующего удара)
		if (projOnPerp < 3 * D) {
			score -= (3 * D - projOnPerp) * 100;
		}
	}

	return score;
}
/**
 * Оценивает качество позиции после удара через геометрию треугольника.
 */
function evaluateNextPosition(
	allStones: Stone[],
	strikerIndex: number,
	strikerStopX: number,
	strikerStopY: number
): number {
	// Проверяем, не вылетел ли биток
	if (strikerStopX < 0 || strikerStopX > LOGICAL_WIDTH ||
		strikerStopY < 0 || strikerStopY > LOGICAL_HEIGHT) {
		return -8000; // Очень плохая позиция
	}

	// Создаём копию камней с обновлённой позицией битка
	const simulatedStones = allStones.map((s, idx) => {
		if (idx === strikerIndex) {
			return {
				...s,
				x: strikerStopX,
				y: strikerStopY,
				vx: 0,
				vy: 0
			} as Stone;
		}
		return s;
	});

	const available = simulatedStones.filter(s => !s.isOut);
	if (available.length !== 3) return -5000;

	// === ОСНОВНАЯ ОЦЕНКА: геометрия треугольника ===
	// Перебираем все 3 варианта: каждый камень как потенциальный биток следующего удара
	let bestTriangleScore = -Infinity;
	let hasValidCorridor = false;

	for (let i = 0; i < 3; i++) {
		const nextStriker = available[i];
		const gates = available.filter((_, idx) => idx !== i);

		if (gates.length !== 2) continue;

		// Оценка геометрии треугольника
		const triangleScore = evaluateTriangleGeometry(nextStriker, gates[0], gates[1]);

		// Проверяем, есть ли свободный коридор для следующего удара
		const corridor = buildFreeCorridor(nextStriker, gates[0], gates[1]);

		let corridorBonus = 0;
		if (corridor.isValid) {
			hasValidCorridor = true;
			// Бонус за ширину коридора и запас прочности
			const width = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);
			corridorBonus = width * 1000 + Math.min(corridor.margin, 30) * 50;
		} else {
			// Нет коридора для этого битка — штраф
			corridorBonus = -2000;
		}

		const totalScore = triangleScore + corridorBonus;
		if (totalScore > bestTriangleScore) {
			bestTriangleScore = totalScore;
		}
	}

	// === Штраф, если ни для одного битка нет свободного коридора ===
	if (!hasValidCorridor) {
		bestTriangleScore -= 10000; // Критически плохая позиция
	}

	return bestTriangleScore;
}

// ============================================================
// ОСНОВНЫЕ ФУНКЦИИ
// ============================================================

/**
 * Находит лучший ход среди всех доступных камней.
 * 
 * @param allStones - все камни на поле (для построения гейтов)
 * @param gateCenter - центр створа (ориентир)
 * @param excludedStriker - камень, который нельзя использовать как биток (правило чередования)
 */
export function findBestMove(
	allStones: Stone[],
	gateCenter: Point,
	excludedStriker: Stone | null = null
): { bestMove: AIMove | null; allConsideredMoves: AIMove[] } {
	return findBestMoveInternal(allStones, gateCenter, true, excludedStriker);
}

function findBestMoveInternal(
	allStones: Stone[],
	gateCenter: Point,
	evaluateNextPosition: boolean,
	excludedStriker: Stone | null = null
): { bestMove: AIMove | null; allConsideredMoves: AIMove[] } {
	const availableStones = allStones.filter(s => !s.isOut);
	if (availableStones.length < 3) {
		return { bestMove: null, allConsideredMoves: [] };
	}

	let bestMove: AIMove | null = null;
	let bestScore = -Infinity;
	const allConsideredMoves: AIMove[] = [];
	const firstPassCandidates: AIMove[] = [];

	for (const striker of availableStones) {
		// Правило чередования: пропускаем исключённый камень
		if (excludedStriker && striker === excludedStriker) {
			continue;
		}

		// Гейт = два других камня (могут включать excludedStriker)
		const gates = availableStones.filter(s => s !== striker);
		if (gates.length !== 2) continue;

		const gateA = gates[0];
		const gateB = gates[1];

		// Строим свободный коридор
		const corridor = buildFreeCorridor(striker, gateA, gateB);

		if (!corridor.isValid) {
			continue;
		}

		// Оцениваем голевую возможность (только левые ворота)
		const goalEval = evaluateGoalPossibility(striker, corridor);
		const isGoalAttempt = goalEval.isPossible && goalEval.confidence >= goalConfidenceThreshold;

		const strikerIndex = allStones.indexOf(striker);
		const K = -Math.log(FRICTION);
		const threshold = 0.02 * striker.radius;

		if (isGoalAttempt) {
			// === ГОЛЕВАЯ СТРАТЕГИЯ ===
			const goalWidth = angleRangeWidth(goalEval.goalCorridorMin, goalEval.goalCorridorMax);

			for (let i = 0; i < angleSteps; i++) {
				const t = angleSteps === 1 ? 0.5 : i / (angleSteps - 1);
				const angle = normalizeAngle(goalEval.goalCorridorMin + goalWidth * t);

				for (let j = 0; j < forceSteps; j++) {
					const tForce = forceSteps === 1 ? 0.5 : j / (forceSteps - 1);
					const force = goalEval.forceMin + (goalEval.forceMax - goalEval.forceMin) * tForce;

					const { score, stopX, stopY, isGoal } = evaluateShot(
						striker, angle, force, corridor, goalEval, isGoalAttempt,
						evaluateNextPosition ? allStones : [],
						evaluateNextPosition ? strikerIndex : -1
					);

					const move: AIMove = {
						stone: striker,
						targetX: striker.x + Math.cos(angle) * 1000,
						targetY: striker.y + Math.sin(angle) * 1000,
						score,
						force,
						isFinalShot: isGoal,
						risk: corridor.margin < 10 ? 0.8 : 0.2,
						type: isGoal ? 'GOAL' : 'PASS',
						stopX,
						stopY,
						blockedByGates: false
					};

					firstPassCandidates.push(move);

					if (score > bestScore) {
						bestScore = score;
						bestMove = move;
					}
				}
			}
		} else {
			// === ТАКТИЧЕСКАЯ СТРАТЕГИЯ ===
			const corridorWidth = angleRangeWidth(corridor.alphaMin, corridor.alphaMax);

			for (let i = 0; i < angleSteps; i++) {
				const t = angleSteps === 1 ? 0.5 : i / (angleSteps - 1);
				const angle = normalizeAngle(corridor.alphaMin + corridorWidth * t);

				const dirX = Math.cos(angle);
				const dirY = Math.sin(angle);

				// === НОВОЕ: Точка пересечения с гейтом ===
				const intersection = raySegmentIntersection(
					striker.x, striker.y,
					dirX, dirY,
					gateA.x, gateA.y,
					gateB.x, gateB.y
				);

				if (!intersection) continue;

				const dToGate = intersection.distance;

				// forceMin: пересечь гейт + остановиться через 2R
				const minDistance = dToGate + 2 * striker.radius;
				const forceMin = minDistance * K + threshold;

				// forceMax: не долететь до границы поля на R
				const dToBoundary = distanceToBoundary(striker.x, striker.y, dirX, dirY);
				const maxDistance = dToBoundary - striker.radius;
				const forceMax = Math.min(maxDistance * K + threshold, MAX_FORCE);

				if (forceMin >= forceMax) continue;

				// === НОВОЕ: Точки остановки для forceMin и forceMax ===
				const vxMin = dirX * forceMin;
				const vyMin = dirY * forceMin;
				const minStopPos = calculateStopPosition(striker.x, striker.y, vxMin, vyMin, striker.radius);

				const vxMax = dirX * forceMax;
				const vyMax = dirY * forceMax;
				const maxStopPos = calculateStopPosition(striker.x, striker.y, vxMax, vyMax, striker.radius);

				// ОТЛАДКА: выводим параметры для первого угла
				//if (i === 0) {
				//	const actualMinDistance = Math.hypot(
				//		minStopPos.x - striker.x,
				//		minStopPos.y - striker.y
				//	);
				//	console.log(`[AI Debug] Биток: (${striker.x.toFixed(0)}, ${striker.y.toFixed(0)})`);
				//	console.log(`[AI Debug] Угол ${(angle * 180 / Math.PI).toFixed(1)}°:`);
				//	console.log(`  dToGate (расчёт): ${dToGate.toFixed(2)}`);
				//	console.log(`  forceMin (расчёт): ${forceMin.toFixed(3)}`);
				//	console.log(`  K: ${K.toFixed(4)}, threshold: ${threshold.toFixed(4)}`);
				//	console.log(`  minStopPos: (${minStopPos.x.toFixed(2)}, ${minStopPos.y.toFixed(2)})`);
				//	console.log(`  Реальная дистанция до minStop: ${actualMinDistance.toFixed(2)}`);
				//	console.log(`  Разница: ${(actualMinDistance - dToGate).toFixed(2)}`);
				//}


				for (let j = 0; j < forceSteps; j++) {
					const tForce = forceSteps === 1 ? 0.5 : j / (forceSteps - 1);
					const force = forceMin + (forceMax - forceMin) * tForce;

					const { score, stopX, stopY, isGoal } = evaluateShot(
						striker, angle, force, corridor, goalEval, isGoalAttempt,
						evaluateNextPosition ? allStones : [],
						evaluateNextPosition ? strikerIndex : -1
					);

					const move: AIMove = {
						stone: striker,
						targetX: striker.x + Math.cos(angle) * 1000,
						targetY: striker.y + Math.sin(angle) * 1000,
						score,
						force,
						isFinalShot: isGoal,
						risk: corridor.margin < 10 ? 0.8 : 0.2,
						type: isGoal ? 'GOAL' : 'PASS',
						stopX,
						stopY,
						blockedByGates: false,
						// НОВОЕ: отладочные данные
						gateIntersectionX: intersection.x,
						gateIntersectionY: intersection.y,
						minStopX: minStopPos.x,
						minStopY: minStopPos.y,
						maxStopX: maxStopPos.x,
						maxStopY: maxStopPos.y
					};

					firstPassCandidates.push(move);

					if (score > bestScore) {
						bestScore = score;
						bestMove = move;
					}
				}
			}
		}
	}

	if (evaluateNextPosition) {
		allConsideredMoves.push(...firstPassCandidates);
	}

	return { bestMove, allConsideredMoves };
}

/**
 * Вычисляет точку пересечения луча из P в направлении dir с отрезком AB.
 * Возвращает null, если пересечения нет.
 */
function raySegmentIntersection(
	px: number, py: number,
	dirX: number, dirY: number,
	ax: number, ay: number,
	bx: number, by: number
): { distance: number; x: number; y: number } | null {
	const ABx = bx - ax;
	const ABy = by - ay;

	const det = dirX * ABy - dirY * ABx;
	if (Math.abs(det) < 1e-10) return null;

	const dx = ax - px;
	const dy = ay - py;

	const t = (dx * ABy - dy * ABx) / det;
	const s = (dx * dirY - dy * dirX) / det;

	if (t < 1e-6 || s < -1e-6 || s > 1 + 1e-6) {
		return null;
	}

	return {
		distance: t,
		x: px + dirX * t,
		y: py + dirY * t
	};
}

/**
 * Вычисляет расстояние от точки P (с направлением dir) до отрезка AB.
 * Возвращает Infinity, если луч не пересекает отрезок.
 */
function rayToSegmentDistance(
	px: number, py: number,
	dirX: number, dirY: number,
	ax: number, ay: number,
	bx: number, by: number
): number {
	const ABx = bx - ax;
	const ABy = by - ay;

	const det = dirX * ABy - dirY * ABx;
	if (Math.abs(det) < 1e-10) return Infinity; // Параллельны

	const dx = ax - px;
	const dy = ay - py;

	const t = (dx * ABy - dy * ABx) / det;
	const s = (dx * dirY - dy * dirX) / det;

	// Луч: t >= 0, отрезок: s ∈ [0, 1]
	if (t < 1e-6 || s < -1e-6 || s > 1 + 1e-6) {
		return Infinity;
	}

	return t;
}
function distanceToBoundary(x: number, y: number, dirX: number, dirY: number): number {
	let minT = Infinity;

	if (dirX < 0) {
		const t = -x / dirX;
		if (t > 0) minT = Math.min(minT, t);
	}

	if (dirX > 0) {
		const t = (LOGICAL_WIDTH - x) / dirX;
		if (t > 0) minT = Math.min(minT, t);
	}

	if (dirY < 0) {
		const t = -y / dirY;
		if (t > 0) minT = Math.min(minT, t);
	}

	if (dirY > 0) {
		const t = (LOGICAL_HEIGHT - y) / dirY;
		if (t > 0) minT = Math.min(minT, t);
	}

	return minT === Infinity ? 0 : minT;
}

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