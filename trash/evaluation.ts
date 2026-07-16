import { Stone } from "../stone.js";
import { Point } from "../math.js";
import {
	canvas, MAX_FORCE, spreadFactor, alternateStriker, LOGICAL_WIDTH, LOGICAL_HEIGHT,
	advancementBonusFactor, retreatPenaltyFactor, noValidPassesPenalty,
	triangleAcuteBonus, triangleObtusePenalty, nextShotBonus, nextTacticalBonus
} from "../state.js";
import { simulateStopPosition } from "./physics.js";

const SAFETY_MARGIN: number = 5;

export function isPathClear(striker: Stone, target: Point, gates: Stone[]): boolean {
	const bStart: Point = { x: striker.x, y: striker.y };
	const bEnd: Point = { x: target.x, y: target.y };

	const gStart: Point = { x: gates[0].x, y: gates[0].y };
	const gEnd: Point = { x: gates[1].x, y: gates[1].y };

	if (!checkLineIntersection(bStart, bEnd, gStart, gEnd)) {
		return false;
	}

	const minSafeDist: number = striker.radius + gates[0].radius + SAFETY_MARGIN;

	const dx: number = bEnd.x - bStart.x;
	const dy: number = bEnd.y - bStart.y;
	const lenSq: number = dx * dx + dy * dy;

	if (lenSq === 0) return false;

	for (const gateStone of gates) {
		const t: number = ((gateStone.x - bStart.x) * dx + (gateStone.y - bStart.y) * dy) / lenSq;

		if (t < 0 || t > 1) continue;

		const closestX: number = bStart.x + t * dx;
		const closestY: number = bStart.y + t * dy;

		const dist: number = Math.hypot(gateStone.x - closestX, gateStone.y - closestY);

		if (dist < minSafeDist) {
			return false;
		}
	}

	return true;
}
/**
 * Проверяет, достигает ли точка остановки линии ворот между двумя камнями.
 * 
 * Если камень останавливается ДО линии ворот (ближе к striker, чем ворота),
 * он физически не может пройти через них.
 * 
 * @param striker Начальная позиция камня
 * @param stopPos Точка остановки камня
 * @param gates Два камня, образующих ворота
 * @returns true, если камень достигает или пересекает линию ворот
 */
export function hasReachedGates(striker: Stone, stopPos: Point, gates: Stone[]): boolean {
	// Вектор от striker к центру ворот
	const gateCenter: Point = {
		x: (gates[0].x + gates[1].x) / 2,
		y: (gates[0].y + gates[1].y) / 2
	};

	const toGateX = gateCenter.x - striker.x;
	const toGateY = gateCenter.y - striker.y;
	const distToGate = Math.hypot(toGateX, toGateY);

	if (distToGate === 0) return true; // Камень уже в воротах

	// Вектор от striker к точке остановки
	const toStopX = stopPos.x - striker.x;
	const toStopY = stopPos.y - striker.y;
	const distToStop = Math.hypot(toStopX, toStopY);

	// Если точка остановки ближе, чем ворота — камень не дошёл
	if (distToStop < distToGate) {
		return false;
	}

	// Дополнительная проверка: проекция вектора остановки на вектор к воротам
	// Должна быть положительной (камень движется в сторону ворот)
	const dotProduct = toStopX * toGateX + toStopY * toGateY;
	if (dotProduct < 0) {
		return false; // Камень движется в противоположную сторону
	}

	return true;
}
/**
 * Проверка пересечения двух отрезков.
 * Экспортируется для использования в strategy.ts
 */
export function checkLineIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
	const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
	if (Math.abs(det) < 1e-10) return false;

	const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
	const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;

	return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
}

export function calculateCollisionRisk(striker: Stone, angle: number, gates: Stone[], force: number): number {
	const realSpread: number = (force / MAX_FORCE) ** 2 * spreadFactor;

	const gateCenter: Point = {
		x: (gates[0].x + gates[1].x) / 2,
		y: (gates[0].y + gates[1].y) / 2
	};
	const distToGate: number = Math.hypot(gateCenter.x - striker.x, gateCenter.y - striker.y);

	const deviationAtGate: number = distToGate * realSpread;

	const gateWidth: number = Math.hypot(gates[1].x - gates[0].x, gates[1].y - gates[0].y);
	const availableWidth: number = gateWidth - 2 * (striker.radius + gates[0].radius + SAFETY_MARGIN);

	if (availableWidth <= 0) return 1.0;

	const risk: number = Math.min(1.0, deviationAtGate / (availableWidth / 2));

	return risk;
}

export function evaluateFuturePosition(pos: Point, allStones: Stone[], currentStriker: Stone): number {
	if (pos.x < 0 || pos.x >  LOGICAL_WIDTH  || pos.y < 0 || pos.y > LOGICAL_HEIGHT) {
		return -5000;
	}

	let score: number = 0;

	const normalizedProgress = 1 - (pos.x / LOGICAL_WIDTH);
	const advancementBonus = normalizedProgress * normalizedProgress * 3000;
	score += advancementBonus;

	const backwardMovement = pos.x - currentStriker.x;
	if (backwardMovement > 0) {
		const retreatPenalty = backwardMovement * backwardMovement * 0.5;
		score -= retreatPenalty;
	}

	const others: Stone[] = allStones.filter(s => s !== currentStriker);

	if (others.length === 2) {
		const triangleQuality = evaluateTriangleQuality(pos, others, currentStriker);
		score += triangleQuality;

		const hasValidPasses = checkValidPassesFromPosition(pos, others, currentStriker);
		if (!hasValidPasses) {
			score -= noValidPassesPenalty; // Было 3000
		}
	}

	let minDistToOther: number = Infinity;
	for (const other of others) {
		const dist: number = Math.hypot(pos.x - other.x, pos.y - other.y);
		minDistToOther = Math.min(minDistToOther, dist);
	}

	const safeDistance: number = currentStriker.radius * 4;
	if (minDistToOther < safeDistance) {
		score -= (safeDistance - minDistToOther) * 100;
	} else {
		score += 1000;
	}

	const nextShotPotential: number = evaluateNextShotPotential(pos, others, currentStriker);
	score += nextShotPotential;

	return score;
}

function evaluateTriangleQuality(pos: Point, others: Stone[], striker: Stone): number {
	const p1 = pos;
	const p2 = { x: others[0].x, y: others[0].y };
	const p3 = { x: others[1].x, y: others[1].y };

	const a = Math.hypot(p2.x - p3.x, p2.y - p3.y);
	const b = Math.hypot(p1.x - p3.x, p1.y - p3.y);
	const c = Math.hypot(p1.x - p2.x, p1.y - p2.y);

	const sides = [a, b, c];
	const minSide = Math.min(...sides);
	const avgSide = (a + b + c) / 3;

	let qualityScore = 0;

	const idealMinSide = striker.radius * 2 * 4;

	if (minSide < idealMinSide) {
		const deficit = idealMinSide - minSide;
		qualityScore -= deficit * 5;
	} else {
		const excess = minSide - idealMinSide;
		qualityScore += Math.min(excess * 2, 1000);
	}

	const isAcute = (
		a * a + b * b > c * c &&
		a * a + c * c > b * b &&
		b * b + c * c > a * a
	);

	if (isAcute) {
		qualityScore += triangleAcuteBonus; // Было 1500
	} else {
		const maxAngleCosine = Math.max(
			(a * a + b * b - c * c) / (2 * a * b),
			(a * a + c * c - b * b) / (2 * a * c),
			(b * b + c * c - a * a) / (2 * b * c)
		);

		if (maxAngleCosine < 0) {
			const obtuseness = -maxAngleCosine;
			qualityScore -= obtuseness * triangleObtusePenalty; // Было 2000
		}
	}

	const stdDev = Math.sqrt(
		((a - avgSide) ** 2 + (b - avgSide) ** 2 + (c - avgSide) ** 2) / 3
	);
	const coefficientOfVariation = stdDev / avgSide;

	if (coefficientOfVariation < 0.2) {
		qualityScore += 500;
	} else if (coefficientOfVariation > 0.5) {
		qualityScore -= (coefficientOfVariation - 0.5) * 1000;
	}

	return qualityScore;
}

function checkValidPassesFromPosition(pos: Point, others: Stone[], striker: Stone): boolean {
	const virtualStriker = { x: pos.x, y: pos.y, radius: striker.radius } as Stone;

	const gateCenter: Point = {
		x: (others[0].x + others[1].x) / 2,
		y: (others[0].y + others[1].y) / 2
	};

	const testAngles = [-0.3, -0.2, -0.1, 0, 0.1, 0.2, 0.3];

	const baseDx = gateCenter.x - pos.x;
	const baseDy = gateCenter.y - pos.y;
	const baseAngle = Math.atan2(baseDy, baseDx);

	for (const angleOff of testAngles) {
		const testAngle = baseAngle + angleOff;
		const farTarget: Point = {
			x: pos.x + Math.cos(testAngle) * 500,
			y: pos.y + Math.sin(testAngle) * 500
		};

		if (isPathClear(virtualStriker, farTarget, others)) {
			return true;
		}
	}

	return false;
}

function evaluateNextShotPotential(pos: Point, others: Stone[], striker: Stone): number {
	if (others.length !== 2) return 0;

	// Если правило включено, следующим битком НЕ сможет быть currentStriker
	const canUseCurrentStriker = !alternateStriker;

	const virtualStrikers: Stone[] = [];

	if (canUseCurrentStriker) {
		virtualStrikers.push({ x: pos.x, y: pos.y, radius: striker.radius } as Stone);
	}
	virtualStrikers.push(others[0], others[1]);

	let bestPotential = -1000;

	for (const vStriker of virtualStrikers) {
		const goalTarget: Point = { x: 0, y: LOGICAL_HEIGHT / 2 };

		const allAvailable = [
			{ x: pos.x, y: pos.y, radius: striker.radius } as Stone,
			others[0],
			others[1]
		];

		const gatesForThisStriker = allAvailable.filter(s => s !== vStriker);

		if (gatesForThisStriker.length < 2) continue;

		if (!isPathClear(vStriker, goalTarget, gatesForThisStriker.slice(0, 2))) continue;

		const angle = Math.atan2(goalTarget.y - vStriker.y, goalTarget.x - vStriker.x);
		const risk = calculateCollisionRisk(vStriker, angle, gatesForThisStriker.slice(0, 2), MAX_FORCE * 0.7);

		if (risk <= 0.5) {
			const bonus = nextShotBonus * (1 - risk); // Было 5000
			bestPotential = Math.max(bestPotential, bonus);
		} else {
			bestPotential = Math.max(bestPotential, 500);
		}
	}

	if (bestPotential < 500) {
		const tacticalPotential = evaluateNextTacticalPotential(pos, others, striker);
		bestPotential = Math.max(bestPotential, tacticalPotential);
	}

	return bestPotential;
}

function evaluateNextTacticalPotential(pos: Point, others: Stone[], striker: Stone): number {
	if (others.length !== 2) return 0;

	const canUseCurrentStriker = !alternateStriker;
	const virtualStrikers: Stone[] = [];

	if (canUseCurrentStriker) {
		virtualStrikers.push({ x: pos.x, y: pos.y, radius: striker.radius } as Stone);
	}
	virtualStrikers.push(others[0], others[1]);

	let bestPotential = -500;

	for (const vStriker of virtualStrikers) {
		const allAvailable = [
			{ x: pos.x, y: pos.y, radius: striker.radius } as Stone,
			others[0],
			others[1]
		];

		const gatesForThisStriker = allAvailable.filter(s => s !== vStriker).slice(0, 2);

		if (gatesForThisStriker.length < 2) continue;

		const gateCenter: Point = {
			x: (gatesForThisStriker[0].x + gatesForThisStriker[1].x) / 2,
			y: (gatesForThisStriker[0].y + gatesForThisStriker[1].y) / 2
		};

		const dx = gateCenter.x - vStriker.x;
		const dy = gateCenter.y - vStriker.y;
		const dist = Math.hypot(dx, dy);
		if (dist === 0) continue;

		const farTarget: Point = {
			x: vStriker.x + (dx / dist) * 500,
			y: vStriker.y + (dy / dist) * 500
		};

		if (!isPathClear(vStriker, farTarget, gatesForThisStriker)) continue;

		const angle = Math.atan2(dy, dx);
		const risk = calculateCollisionRisk(vStriker, angle, gatesForThisStriker, MAX_FORCE * 0.7);

		const bonus = nextTacticalBonus * (1 - risk); // Было 2000
		bestPotential = Math.max(bestPotential, bonus);
	}

	return bestPotential;
}