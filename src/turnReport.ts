/**
 * src/turnReport.ts
 * 
 * Генерация подробного отчёта о ходе для отладки.
 */

import { GameState, stones } from "./state.js";
import { AIMove } from "./ai/types.js";

export function generateTurnReport(): void {
	const move = GameState.lastAIMove as AIMove | null;
	const startPositions = GameState.reportStartPositions;

	// === НОВОЕ: Не генерировать отчёт, если данных нет или биток уже не существует ===
	//if (!move || !move.stone || move.stone.isOut) {
	//	console.log(`\n[SHOT REPORT] Пропуск: нет актуальных данных для отчёта\n`);
	//	return;
	//}

	const previousPlayer = move ? 2 : 1;
	const playerLabel = previousPlayer === 2 ? "БОТ" : "ИГРОК";

	console.log(`\n${"=".repeat(60)}`);
	console.log(`[TURN REPORT] Удар #${GameState.shotInTurnCounter} | Игрок: ${previousPlayer} (${playerLabel})`);
	console.log("=".repeat(60));

	// 1. ИСХОДНАЯ ПОЗИЦИЯ (берём из сохранённого снимка)
	console.log("\n[ИСХОДНАЯ ПОЗИЦИЯ]");
	if (startPositions) {
		startPositions.forEach((p: any) => {
			console.log(`  Биток ${p.name}: (${Math.round(p.x)}, ${Math.round(p.y)}) [isOut: ${p.isOut}]`);
		});
	} else {
		stones.forEach((s) => {
			console.log(`  Биток ${s.name}: (${Math.round(s.x)}, ${Math.round(s.y)}) [isOut: ${s.isOut}]`);
		});
	}

	// 2. НАМЕРЕНИЕ	
	if (move) {
		const angleRad = Math.atan2(move.targetY - move.stone.y, move.targetX - move.stone.x);
		const angleDeg = (angleRad * 180 / Math.PI).toFixed(1);
		const stopX = move.stopX !== undefined ? Math.round(move.stopX) : "?";
		const stopY = move.stopY !== undefined ? Math.round(move.stopY) : "?";

		console.log(`\n[НАМЕРЕНИЕ]  Биток: ${move.stone.name}`);
		console.log(`  Угол: ${angleDeg}°,  Сила: ${move.force.toFixed(2)}`);
		console.log(`  Ожидаемая остановка: (${stopX}, ${stopY}),  Оценка: ${Math.round(move.score)},  Тип: ${move.type}`);
	} else {
		console.log("\n[НАМЕРЕНИЕ]  EMERGENCY (нет валидных ходов)");
	}

	// 3. РЕЗУЛЬТАТ
	console.log("\n[РЕЗУЛЬТАТ]");
	console.log(`  Гол: ${GameState.isGoalScored ? "ДА" : "нет"}`);
	console.log(`  Проход через гейт: ${GameState.hasPassedThrough ? "ДА" : "нет"}`);
	console.log(`  Столкновение с препятствием: ${GameState.hitObstacle ? "ДА" : "нет"}`);
	console.log(`  Вылет за стол: ${stones.some(s => s.isOut) ? "ДА" : "нет"}`);

	// 4. ФИНАЛЬНАЯ ПОЗИЦИЯ И ОТКЛОНЕНИЯ
	console.log("\n[ФИНАЛЬНАЯ ПОЗИЦИЯ И ОТКЛОНЕНИЯ]");
	stones.forEach((s) => {
		const fx = Math.round(s.x);
		const fy = Math.round(s.y);
		let deviationStr = "";

		if (move && s === move.stone && move.stopX !== undefined) {
			const dx = s.x - move.stopX;
			const dy = s.y - move.stopY;
			const dist = Math.hypot(dx, dy);
			deviationStr = ` | Отклонение от плана: ${dist.toFixed(1)}px (dx: ${dx.toFixed(1)}, dy: ${dy.toFixed(1)})`;
		}

		console.log(`  Биток ${s.name}: (${fx}, ${fy})${deviationStr}`);
	});

	console.log(`${"=".repeat(60)}\n`);
}