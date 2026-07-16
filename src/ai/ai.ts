/**
 * src/ai/ai.ts
 */

import { Stone } from "../stone.js";
import { GameMath } from "../math.js";
import {
	MAX_FORCE,
	GameState,
	spreadFactor,
	alternateStriker,
	accuracyEnabled
} from "../state.js";
import { AIMove } from "./types.js";
import { findBestMove, getEmergencyMove } from "./strategy.js";

export class AI {
	public static calculateMove(stones: Stone[]): AIMove | null {
		const available: Stone[] = stones.filter(s => !s.isOut);
		if (available.length < 3) return null;

		// ВСЕ камни (для построения гейтов)
		const allStonesForEvaluation = available;

		// lastUsedStriker исключаем ТОЛЬКО из кандидатов в битки, но не из гейтов
		const lastUsed = (alternateStriker && GameState.lastUsedStriker)
			? GameState.lastUsedStriker
			: null;

		const gateCenter = this.calculateGateCenter(available);

		// Передаём: все камни + камень, который нельзя использовать как биток
		const { bestMove, allConsideredMoves } = findBestMove(
			allStonesForEvaluation,
			gateCenter,
			lastUsed
		);

		GameState.aiConsideredMoves = allConsideredMoves;

		if (!bestMove) {
			console.warn("AI: Нет подходящих ходов. Переход в аварийный режим.");
			const emergencyMove = getEmergencyMove(available);
			if (emergencyMove) {
				GameState.aiConsideredMoves.push(emergencyMove);
				return emergencyMove;
			}
		}

		return bestMove;
	}

	private static calculateGateCenter(stones: Stone[]): { x: number; y: number } {
		const sumX = stones.reduce((s, st) => s + st.x, 0);
		const sumY = stones.reduce((s, st) => s + st.y, 0);
		return { x: sumX / stones.length, y: sumY / stones.length };
	}

	public static executeMove(move: AIMove): void {
		const s: Stone = move.stone;
		s.startX = s.x;
		s.startY = s.y;

		const dx: number = move.targetX - s.x;
		const dy: number = move.targetY - s.y;
		const angle: number = Math.atan2(dy, dx);

		// Разброс применяется ТОЛЬКО если точность выключена
		const spreadValue = accuracyEnabled ? 0 : spreadFactor;
		const spread: number = (move.force / MAX_FORCE) ** 2 * spreadValue;
		const finalAngle: number = GameMath.randomGaussian(angle, spread);

		// ОТЛАДКА: выводим параметры разброса
		const angleDeviationDeg = (finalAngle - angle) * 180 / Math.PI;
		console.log(`[AI] Удар: сила=${move.force.toFixed(1)}, угол=${(angle * 180 / Math.PI).toFixed(1)}°, разброс=${(spread * 180 / Math.PI).toFixed(2)}°, отклонение=${angleDeviationDeg.toFixed(2)}°, точность=${accuracyEnabled}`);

		s.vx = Math.cos(finalAngle) * move.force;
		s.vy = Math.sin(finalAngle) * move.force;
	}
}