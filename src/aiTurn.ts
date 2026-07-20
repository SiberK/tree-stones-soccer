/**
 * src/aiTurn.ts
 * 
 * Логика хода AI.
 */

import {
	GameState, stones, aiThinkingTime, accuracyEnabled, spreadFactor,MAX_FORCE
} from "./state.js";
import { setPendingAIMove } from "./renderer/index.js";
import { simulationController } from "./simulation/controller.js";
import { ShotData } from "./simulation/types.js";
import { AIMove } from "./ai/types.js";
import { setNeedsRedraw } from "./gameLoop.js";
import { AI } from "./ai/index.js";
import { resolveShotVector } from "./simulation/kinematics.js";

let pendingAIMove: AIMove | null = null;

export function getPendingAIMove(): AIMove | null {
	return pendingAIMove;
}

export function clearPendingAIMove(): void {
	pendingAIMove = null;
	setPendingAIMove(null);
}

export function processAITurn(): void {
	if (GameState.currentPlayer !== 2) return;
	if (GameState.isPaused) return;

	const allStopped = stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1);

	if (allStopped && GameState.resultTimer === 0 && !simulationController.isSimulating()) {
		GameState.aiThinkingTimer++;

		if (GameState.aiThinkingTimer === 1 && !pendingAIMove) {
			GameState.hasPassedThrough = false;
			GameState.hitObstacle = false;
			GameState.isGoalScored = false;

			const startTime = performance.now();
			pendingAIMove = AI.calculateMove(stones);
			const calculationTime = performance.now() - startTime;
			GameState.aiCalculationTime = calculationTime;

			if (pendingAIMove) {
				GameState.aiSelectedStone = pendingAIMove.stone;
				GameState.aiAimTarget = {
					x: pendingAIMove.stopX !== undefined ? pendingAIMove.stopX : pendingAIMove.targetX,
					y: pendingAIMove.stopY !== undefined ? pendingAIMove.stopY : pendingAIMove.targetY
				};
				setPendingAIMove(pendingAIMove);
				setNeedsRedraw(true);
			}
		}

		if (GameState.aiThinkingTimer > aiThinkingTime && pendingAIMove) {
			applyAIMove(pendingAIMove);
		}
	} else {
		if (!allStopped || GameState.resultTimer > 0) {
			GameState.aiThinkingTimer = 0;
			pendingAIMove = null;
			setPendingAIMove(null);
			GameState.aiSelectedStone = null;
			GameState.aiAimTarget = null;
			GameState.aiConsideredMoves = [];
			setNeedsRedraw(true);
		}
	}
}

export function applyAIMove(move: AIMove): void {
	// === НОВОЕ: Сохраняем ход и стартовые координаты для отчёта ===
	GameState.lastAIMove = move;
	GameState.shotInTurnCounter++;

	// Глубокая копия позиций ВСЕХ камней прямо сейчас
	GameState.reportStartPositions = stones.map(s => ({
		name: s.name,
		x: s.x,
		y: s.y,
		isOut: s.isOut
	}));
	const stoneIndex = stones.indexOf(move.stone);

	// Базовый угол (направление на цель)
    // стало:
    const baseAngle = Math.atan2(
        move.targetY - move.stone.y,
        move.targetX - move.stone.x
    );
    const shot = resolveShotVector(
        { force: move.force, angle: baseAngle },
        { accuracyEnabled, spreadFactor, maxForce: MAX_FORCE }
    );
    const finalAngle = shot.angle;

	// ОТЛАДКА
	const angleDeviationDeg = (finalAngle - baseAngle) * 180 / Math.PI;
	console.log(`[AI] Удар: сила=${move.force.toFixed(1)},`
				+ ` угол=${(baseAngle * 180 / Math.PI).toFixed(1)}°,`
				+ ` разброс=${(shot.spread * 180 / Math.PI).toFixed(2)}°,`
				+ ` отклонение=${angleDeviationDeg.toFixed(2)}°,`
				+ ` точность=${accuracyEnabled}`);

	const shotData: ShotData = {
		strikerIndex: stoneIndex,
		force: move.force,
		angle: finalAngle,
		playerIndex: 2
	};

	GameState.lastUsedStriker = move.stone;
	GameState.lastStruckStone = move.stone;

	simulationController.startSimulation(stones, shotData);

	GameState.aiConsideredMoves = [];
	pendingAIMove = null;
	setPendingAIMove(null);
	GameState.aiSelectedStone = null;
	GameState.aiAimTarget = null;
	GameState.aiThinkingTimer = 0;
	setNeedsRedraw(true);
}