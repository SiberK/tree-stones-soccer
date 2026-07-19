/**
 * src/renderer/ai.ts
 * 
 * Визуализация "мыслей" AI: рассмотренные ходы, индикатор "думает", отладочные точки.
 */

import {
	ctx, GameState, LOGICAL_WIDTH, LOGICAL_HEIGHT,
	stones, aiThinkingTime
} from "../state.js";
import { Stone } from "../stone.js";
import { AIMove } from "../ai/types.js";

let pendingAIMoveGetter: () => AIMove | null = () => null;

export function setAIpendingMoveGetter(getter: () => AIMove | null): void {
	pendingAIMoveGetter = getter;
}

function scoreToColor(score: number): string {
	const minScore = -5000;
	const maxScore = 5000;

	const normalized = (score - minScore) / (maxScore - minScore);
	const clamped = Math.max(0, Math.min(1, normalized));

	const colors = [
		{ r: 128, g: 0, b: 0 },
		{ r: 255, g: 0, b: 0 },
		{ r: 255, g: 165, b: 0 },
		{ r: 255, g: 255, b: 0 },
		{ r: 0, g: 255, b: 0 },
		{ r: 0, g: 255, b: 255 },
		{ r: 135, g: 206, b: 235 },
		{ r: 0, g: 0, b: 255 },
		{ r: 128, g: 0, b: 128 },
	];

	const index = clamped * (colors.length - 1);
	const i = Math.floor(index);
	const t = index - i;

	if (i >= colors.length - 1) {
		return `rgb(${colors[colors.length - 1].r}, ${colors[colors.length - 1].g}, ${colors[colors.length - 1].b})`;
	}

	const c1 = colors[i];
	const c2 = colors[i + 1];

	const r = Math.round(c1.r + (c2.r - c1.r) * t);
	const g = Math.round(c1.g + (c2.g - c1.g) * t);
	const b = Math.round(c1.b + (c2.b - c1.b) * t);

	return `rgb(${r}, ${g}, ${b})`;
}

export function drawAIConsideredMoves(): void {
	const pendingAIMove = pendingAIMoveGetter();

	for (const move of GameState.aiConsideredMoves) {
		const stone = move.stone as Stone;

		const isChosen = (move === pendingAIMove);
		const isBlocked = move.blockedByGates === true;

		// Линия направления
		ctx.beginPath();
		ctx.moveTo(stone.x, stone.y);
		ctx.lineTo(move.targetX, move.targetY);

		const isGoal = move.type === 'GOAL';
		const lineColor = scoreToColor(move.score);
		ctx.strokeStyle = lineColor.replace('rgb', 'rgba').replace(')', ', 0.3)');
		ctx.lineWidth = isGoal ? 3 : 1.5;
		ctx.stroke();

		// Точка остановки
		if (move.stopX !== undefined && move.stopY !== undefined) {
			const color = scoreToColor(move.score);

			const glow = ctx.createRadialGradient(
				move.stopX, move.stopY, 0,
				move.stopX, move.stopY, 10
			);
			glow.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.4)'));
			glow.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0)'));
			ctx.fillStyle = glow;
			ctx.beginPath();
			ctx.arc(move.stopX, move.stopY, 10, 0, Math.PI * 2);
			ctx.fill();

			ctx.beginPath();
			ctx.arc(move.stopX, move.stopY, 5, 0, Math.PI * 2);
			ctx.fillStyle = color;
			ctx.fill();

			if (isChosen) {
				ctx.strokeStyle = "rgba(255, 255, 255, 1)";
				ctx.lineWidth = 4;
				ctx.stroke();
			} else if (isBlocked) {
				ctx.strokeStyle = "rgba(0, 0, 0, 1)";
				ctx.lineWidth = 4;
				ctx.stroke();
			} else {
				ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
				ctx.lineWidth = 1;
				ctx.stroke();
			}

			ctx.strokeStyle = color;
			ctx.lineWidth = 1;
			ctx.beginPath();
			ctx.moveTo(move.stopX - 7, move.stopY);
			ctx.lineTo(move.stopX + 7, move.stopY);
			ctx.moveTo(move.stopX, move.stopY - 7);
			ctx.lineTo(move.stopX, move.stopY + 7);
			ctx.stroke();
		}

		// Процент риска на камне
		if (isChosen) {
			ctx.fillStyle = "white";
			ctx.font = "bold 16px monospace";
		} else if (isBlocked) {
			ctx.fillStyle = "rgba(100, 100, 100, 0.8)";
			ctx.font = "bold 12px monospace";
		} else {
			ctx.fillStyle = "white";
			ctx.font = "bold 14px monospace";
		}

		ctx.textAlign = "center";
		ctx.textBaseline = "middle";

		// ✅ НОВОЕ: номер камня (индекс + 1)
		ctx.fillText(stone.name, stone.x, stone.y);
		
		if (GameState.aiSelectedStone === stone) {
			ctx.beginPath();
			ctx.arc(stone.x, stone.y, stone.radius + 6, 0, Math.PI * 2);
			ctx.strokeStyle = "rgba(255, 255, 255, 1)";
			ctx.lineWidth = 3;
			ctx.stroke();
		}
	}
}

export function drawAIThoughts(): void {
	const moves = GameState.aiConsideredMoves;
	if (!moves || moves.length === 0) return;

	let bestMove = moves[0];
	for (const move of moves) {
		if (move.score > bestMove.score) {
			bestMove = move;
		}
	}

	const scores = moves.map(m => m.score);
	const minScore = Math.min(...scores);
	const maxScore = Math.max(...scores);
	const scoreRange = maxScore - minScore || 1;

	const sortedMoves = [...moves].sort((a, b) => b.score - a.score);
	const topMoves = sortedMoves.slice(0, 3);

	// Все рассмотренные ходы
	for (const move of moves) {
		const stone = move.stone;
		const endX = move.stopX !== undefined ? move.stopX : move.targetX;
		const endY = move.stopY !== undefined ? move.stopY : move.targetY;

		const normalizedScore = (move.score - minScore) / scoreRange;

		let baseColor: string;
		switch (move.type) {
			case 'GOAL':
				baseColor = '255, 80, 80';
				break;
			case 'EMERGENCY':
				baseColor = '150, 150, 150';
				break;
			case 'PASS':
			default:
				baseColor = '100, 200, 255';
				break;
		}

		const alpha = 0.1 + normalizedScore * 0.4;
		const lineWidth = 1 + normalizedScore * 2;

		ctx.beginPath();
		ctx.moveTo(stone.x, stone.y);
		ctx.lineTo(endX, endY);
		ctx.strokeStyle = `rgba(${baseColor}, ${alpha})`;
		ctx.lineWidth = lineWidth;
		ctx.stroke();

		ctx.beginPath();
		ctx.arc(endX, endY, 2 + normalizedScore * 2, 0, Math.PI * 2);
		ctx.fillStyle = `rgba(${baseColor}, ${alpha})`;
		ctx.fill();
	}

	// Подписи топ-3
	ctx.font = "bold 11px monospace";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	for (let i = 0; i < topMoves.length; i++) {
		const move = topMoves[i];
		const endX = move.stopX !== undefined ? move.stopX : move.targetX;
		const endY = move.stopY !== undefined ? move.stopY : move.targetY;

		const label = `#${i + 1}: ${Math.round(move.score)}`;
		const labelY = endY - 15;

		const metrics = ctx.measureText(label);
		const padding = 4;
		ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
		ctx.fillRect(
			endX - metrics.width / 2 - padding,
			labelY - 8,
			metrics.width + padding * 2,
			16
		);

		ctx.fillStyle = move.type === 'GOAL' ? "#ff6b6b" : "#ffffff";
		ctx.fillText(label, endX, labelY);
	}

	// Подсветка выбранного хода
	if (bestMove && GameState.aiSelectedStone === bestMove.stone) {
		const stone = bestMove.stone;
		const endX = bestMove.stopX !== undefined ? bestMove.stopX : bestMove.targetX;
		const endY = bestMove.stopY !== undefined ? bestMove.stopY : bestMove.targetY;

		ctx.beginPath();
		ctx.moveTo(stone.x, stone.y);
		ctx.lineTo(endX, endY);
		ctx.strokeStyle = "rgba(255, 215, 0, 0.9)";
		ctx.lineWidth = 3;
		ctx.setLineDash([8, 4]);
		ctx.stroke();
		ctx.setLineDash([]);

		ctx.beginPath();
		ctx.arc(endX, endY, 8, 0, Math.PI * 2);
		ctx.strokeStyle = "rgba(255, 215, 0, 1)";
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.beginPath();
		ctx.moveTo(endX - 5, endY);
		ctx.lineTo(endX + 5, endY);
		ctx.moveTo(endX, endY - 5);
		ctx.lineTo(endX, endY + 5);
		ctx.strokeStyle = "rgba(255, 215, 0, 1)";
		ctx.lineWidth = 2;
		ctx.stroke();

		ctx.font = "bold 12px sans-serif";
		ctx.fillStyle = "rgba(255, 215, 0, 1)";
		ctx.fillText("ВЫБРАН", endX, endY + 20);
	}
}

export function drawAIThinkingIndicator(): void {
	if (GameState.currentPlayer !== 2) return;
	if (GameState.aiThinkingTimer === 0) return;

	const progress = GameState.aiThinkingTimer / aiThinkingTime;

	const dotCount = 3;
	const activeDot = Math.floor((Date.now() / 300) % dotCount);

	const text = "AI думает";
	const dots = ".".repeat(activeDot + 1);

	const calcTimeText = GameState.aiCalculationTime > 0
		? ` (${GameState.aiCalculationTime.toFixed(1)}ms)`
		: "";

	const fullText = text + dots + calcTimeText;

	ctx.font = "bold 18px sans-serif";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";

	const metrics = ctx.measureText(fullText);
	const boxWidth = metrics.width + 40;
	const boxHeight = 36;
	const boxX = LOGICAL_WIDTH / 2 - boxWidth / 2;
	const boxY = LOGICAL_HEIGHT - 60;

	ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
	ctx.fillRect(boxX, boxY, boxWidth, boxHeight);

	ctx.fillStyle = "rgba(255, 215, 0, 0.3)";
	ctx.fillRect(boxX, boxY + boxHeight - 4, boxWidth * progress, 4);

	ctx.fillStyle = "#ffffff";
	ctx.fillText(fullText, LOGICAL_WIDTH / 2, boxY + boxHeight / 2 - 2);
}

export function drawDebugPoints(): void {
	const moves = GameState.aiConsideredMoves;
	if (!moves || moves.length === 0) return;

	const drawnIntersections = new Set<string>();

	for (const move of moves) {
		if (move.gateIntersectionX !== undefined && move.gateIntersectionY !== undefined) {
			const key = `${Math.round(move.gateIntersectionX)},${Math.round(move.gateIntersectionY)}`;

			if (!drawnIntersections.has(key)) {
				drawnIntersections.add(key);

				ctx.beginPath();
				ctx.arc(move.gateIntersectionX, move.gateIntersectionY, 4, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(255, 255, 0, 0.9)";
				ctx.fill();
				ctx.strokeStyle = "rgba(255, 200, 0, 1)";
				ctx.lineWidth = 1.5;
				ctx.stroke();
			}
		}

		if (move.minStopX !== undefined && move.minStopY !== undefined) {
			const size = 3;
			ctx.fillStyle = "rgba(100, 200, 255, 0.8)";
			ctx.fillRect(move.minStopX - size, move.minStopY - size, size * 2, size * 2);
		}

		if (move.maxStopX !== undefined && move.maxStopY !== undefined) {
			const size = 3;
			ctx.fillStyle = "rgba(255, 150, 50, 0.8)";
			ctx.fillRect(move.maxStopX - size, move.maxStopY - size, size * 2, size * 2);
		}
	}

	const drawnRanges = new Set<string>();
	for (const move of moves) {
		if (move.minStopX !== undefined && move.maxStopX !== undefined) {
			const key = `${Math.round(move.minStopX)},${Math.round(move.minStopY)}-${Math.round(move.maxStopX)},${Math.round(move.maxStopY)}`;

			if (!drawnRanges.has(key)) {
				drawnRanges.add(key);

				ctx.beginPath();
				ctx.moveTo(move.minStopX, move.minStopY);
				ctx.lineTo(move.maxStopX, move.maxStopY);
				ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
				ctx.lineWidth = 1;
				ctx.stroke();
			}
		}
	}
}