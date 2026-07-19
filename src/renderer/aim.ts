/**
 * src/renderer/aim.ts
 * 
 * Отрисовка прицеливания для игрока и AI.
 * 
 * Для игрока:
 * - Конус разброса (прозрачность 0.40)
 * - Центральная линия
 * - Тонкая красная линия "рогатки" (реальное положение мыши)
 * - Пунктирная линия траектории к реальной точке остановки
 * - Золотой маркер точки остановки с крестиком
 * - Процент силы и метка MAX при максимуме
 * 
 * Для AI:
 * - Конус разброса
 * - Центральная линия
 */

import {
	ctx, GameState, MAX_FORCE, FORCE_FACTOR, spreadFactor,
	PULL_SENSITIVITY, STOP_THRESHOLD_RATIO
} from "../state.js";
import { Stone } from "../stone.js";
import { calculateStopPosition } from "../simulation/math.js";
import { AIMove } from "../ai/types.js";

let pendingAIMoveGetter: () => AIMove | null = () => null;

export function setPendingAIMoveGetter(getter: () => AIMove | null): void {
	pendingAIMoveGetter = getter;
}

export function drawAimIndicator(
	stone: Stone,
	targetX: number,
	targetY: number,
	isPlayer: boolean
): void {
	if (!stone) return;

	let dx: number, dy: number;
	if (isPlayer) {
		dx = stone.x - GameState.mouseX;
		dy = stone.y - GameState.mouseY;
	} else {
		dx = targetX - stone.x;
		dy = targetY - stone.y;
	}

	const dist = Math.hypot(dx, dy);
	if (dist === 0) return;

	// Отмена прицеливания если мышь внутри камня
	if (isPlayer && dist < stone.radius) return;

	let force: number;
	if (isPlayer) {
		// === ИСПРАВЛЕНО: учитываем PULL_SENSITIVITY ===
		const maxPull = MAX_FORCE / (FORCE_FACTOR * PULL_SENSITIVITY);
		const pull = Math.min(dist, maxPull);
		const ndx = (dx / dist) * pull;
		const ndy = (dy / dist) * pull;
		force = Math.hypot(ndx, ndy) * FORCE_FACTOR * PULL_SENSITIVITY;
	} else {
		const pendingMove = pendingAIMoveGetter();
		force = pendingMove ? pendingMove.force : Math.hypot(dx, dy) * 0.1;
	}

	// Направление УДАРА (противоположно направлению оттягивания)
	const shotAngle = Math.atan2(dy, dx);

	const spreadValue = spreadFactor;
	const spread = (force / MAX_FORCE) * spreadValue;

	const len = force * 13;
	const col = isPlayer ? "rgba(153, 182, 23, 0.40)" : "rgba(255, 166, 0, 0.40)";
	const scol = isPlayer ? "rgba(153, 182, 23, 0.40)" : "rgba(255, 166, 0, 0.40)";

	// === 1. Конус прицеливания ===
	ctx.beginPath();
	ctx.moveTo(stone.x, stone.y);
	ctx.arc(stone.x, stone.y, len, shotAngle - spread, shotAngle + spread);
	ctx.lineTo(stone.x, stone.y);
	ctx.fillStyle = scol;
	ctx.fill();

	// === 2. Центральная линия ===
	ctx.beginPath();
	ctx.moveTo(stone.x, stone.y);
	ctx.lineTo(
		stone.x + Math.cos(shotAngle) * len,
		stone.y + Math.sin(shotAngle) * len
	);
	ctx.strokeStyle = col;
	ctx.lineWidth = 2;
	ctx.stroke();

	// === 3. Для игрока: визуализация реальной точки остановки ===
	if (isPlayer && force > 0.1) {
		const vx = Math.cos(shotAngle) * force;
		const vy = Math.sin(shotAngle) * force;
		const stopPos = calculateStopPosition(
			stone.x, stone.y, vx, vy, stone.radius
		);

		// Тонкая красная линия "рогатки" (реальное оттягивание мыши)
		ctx.beginPath();
		ctx.moveTo(stone.x, stone.y);
		ctx.lineTo(GameState.mouseX, GameState.mouseY);
		ctx.strokeStyle = "rgba(255, 100, 100, 0.5)";
		ctx.lineWidth = 1.5;
		ctx.stroke();

		// Пунктирная линия траектории до точки остановки
		ctx.beginPath();
		ctx.setLineDash([8, 4]);
		ctx.moveTo(stone.x, stone.y);
		ctx.lineTo(stopPos.x, stopPos.y);
		ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
		ctx.lineWidth = 2;
		ctx.stroke();
		ctx.setLineDash([]);

		// Золотой кружок в точке остановки
		ctx.beginPath();
		ctx.arc(stopPos.x, stopPos.y, 9, 0, Math.PI * 2);
		ctx.strokeStyle = "rgba(255, 215, 0, 0.95)";
		ctx.lineWidth = 2.5;
		ctx.stroke();

		// Крестик в центре
		ctx.strokeStyle = "rgba(255, 215, 0, 1)";
		ctx.lineWidth = 2;
		ctx.beginPath();
		ctx.moveTo(stopPos.x - 5, stopPos.y);
		ctx.lineTo(stopPos.x + 5, stopPos.y);
		ctx.moveTo(stopPos.x, stopPos.y - 5);
		ctx.lineTo(stopPos.x, stopPos.y + 5);
		ctx.stroke();

		// Процент силы над маркером
		const forcePercent = Math.round((force / MAX_FORCE) * 100);
		ctx.font = "bold 14px monospace";
		ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
		ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
		ctx.lineWidth = 3;
		ctx.textAlign = "center";
		ctx.textBaseline = "bottom";
		const label = `${forcePercent}%`;
		ctx.strokeText(label, stopPos.x, stopPos.y - 14);
		ctx.fillText(label, stopPos.x, stopPos.y - 14);

		// Метка MAX при достижении максимальной силы
		if (force >= MAX_FORCE * 0.99) {
			ctx.font = "bold 13px sans-serif";
			ctx.fillStyle = "rgba(255, 80, 80, 1)";
			ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
			ctx.lineWidth = 3;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.strokeText("MAX", stopPos.x, stopPos.y + 14);
			ctx.fillText("MAX", stopPos.x, stopPos.y + 14);
		}
	}
	// === 4. Для AI: визуализация точки остановки bestMove ===
	if (!isPlayer && force > 0.1) {
		const pendingMove = pendingAIMoveGetter();
		if (pendingMove && pendingMove.stopX !== undefined && pendingMove.stopY !== undefined) {
			const stopX = pendingMove.stopX;
			const stopY = pendingMove.stopY;

			// Пунктирная линия траектории до точки остановки
			ctx.beginPath();
			ctx.setLineDash([8, 4]);
			ctx.moveTo(stone.x, stone.y);
			ctx.lineTo(stopX, stopY);
			ctx.strokeStyle = "rgba(255, 166, 0, 0.75)";
			ctx.lineWidth = 2;
			ctx.stroke();
			ctx.setLineDash([]);

			// Оранжевый кружок в точке остановки
			ctx.beginPath();
			ctx.arc(stopX, stopY, 9, 0, Math.PI * 2);
			ctx.strokeStyle = "rgba(255, 166, 0, 0.95)";
			ctx.lineWidth = 2.5;
			ctx.stroke();

			// Крестик в центре
			ctx.strokeStyle = "rgba(255, 166, 0, 1)";
			ctx.lineWidth = 2;
			ctx.beginPath();
			ctx.moveTo(stopX - 5, stopY);
			ctx.lineTo(stopX + 5, stopY);
			ctx.moveTo(stopX, stopY - 5);
			ctx.lineTo(stopX, stopY + 5);
			ctx.stroke();

			// Подпись "ВЫБРАН"
			ctx.font = "bold 12px sans-serif";
			ctx.fillStyle = "rgba(255, 166, 0, 1)";
			ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
			ctx.lineWidth = 3;
			ctx.textAlign = "center";
			ctx.textBaseline = "top";
			ctx.strokeText("ВЫБРАН", stopX, stopY + 14);
			ctx.fillText("ВЫБРАН", stopX, stopY + 14);
		}
	}
}