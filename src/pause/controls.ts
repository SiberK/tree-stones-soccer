/**
 * src/pause/controls.ts
 * 
 * Управление режимом паузы.
 */

import { GameState, stones, currentWeights, accuracyEnabled, setAccuracyEnabled, LOGICAL_WIDTH, LOGICAL_HEIGHT } from "../state.js";
import { findBestMove, recalculateScores, findBestMoveFromCandidates, buildCachedCandidates } from "../ai/strategy.js";
import { PausedStep } from "../ai/types.js";
import { setPendingAIMove } from "../renderer/index.js"
import { setNeedsRedraw } from "../gameLoop.js";
import { applyStoneStates, calculateGateCenter, candidateToAIMove, captureStonesState } from "./history.js";
import { updatePauseUI } from "./ui.js";

export function enterPause(): void {
	if (GameState.isPaused) return;
	if (GameState.currentPlayer !== 2) return;

	GameState.pausedOriginalStones = captureStonesState();

	const gateCenter = calculateGateCenter(stones);
	const { bestMove, allConsideredMoves, candidates, corridors } =
		findBestMove(stones, gateCenter, GameState.lastUsedStriker);

	if (bestMove) {
		GameState.aiSelectedStone = bestMove.stone;
		GameState.aiAimTarget = { x: bestMove.stopX, y: bestMove.stopY };
		setPendingAIMove(bestMove);
	}

	GameState.aiConsideredMoves = allConsideredMoves;
	GameState.cachedCandidates = candidates;
	(GameState as any).cachedCorridors = corridors;

	GameState.aiThinkingTimer = 0;
	GameState.pausedHistory = [];
	GameState.pausedCurrentStep = 0;

	if (bestMove) {
		const initialStep: PausedStep = {
			stones: GameState.pausedOriginalStones!,
			bestMove: bestMove,
			candidates: candidates,
			stepIndex: 0
		};
		GameState.pausedHistory.push(initialStep);
	}

	GameState.isPaused = true;

	const pausePanel = document.getElementById('pausePanel');
	if (pausePanel) {
		pausePanel.classList.remove('hidden');
	}

	updatePauseUI();
	setNeedsRedraw(true);
}

export function exitPause(): void {
	if (!GameState.isPaused) return;

	if (GameState.pausedOriginalStones) {
		applyStoneStates(GameState.pausedOriginalStones);
	}

	const currentStep = GameState.pausedHistory[GameState.pausedCurrentStep];
	const bestMove = currentStep?.bestMove;

	GameState.isPaused = false;
	GameState.pausedHistory = [];
	GameState.pausedCurrentStep = 0;
	GameState.pausedOriginalStones = null;
	GameState.cachedCandidates = [];
	(GameState as any).cachedCorridors = null;

	const pausePanel = document.getElementById('pausePanel');
	if (pausePanel) {
		pausePanel.classList.add('hidden');
	}

	if (bestMove) {
		import('../aiTurn.js').then(({ applyAIMove }) => {
			applyAIMove(bestMove);
		});
	}

	setNeedsRedraw(true);
}

export function recalculateInPause(): void {
	if (!GameState.isPaused) return;

	const candidates = GameState.cachedCandidates;
	if (!candidates || candidates.length === 0) return;

	recalculateScores(candidates, currentWeights);

	const bestMove = findBestMoveFromCandidates(candidates, stones);

	if (GameState.pausedHistory[GameState.pausedCurrentStep]) {
		GameState.pausedHistory[GameState.pausedCurrentStep].bestMove = bestMove;
	}

	if (bestMove) {
		GameState.aiSelectedStone = bestMove.stone;
		GameState.aiAimTarget = { x: bestMove.stopX, y: bestMove.stopY };
		setPendingAIMove(bestMove);
		GameState.aiConsideredMoves = candidates.map(c => candidateToAIMove(c));
	} else {
		GameState.aiSelectedStone = null;
		GameState.aiAimTarget = null;
		setPendingAIMove(null);
	}

	updatePauseUI();
	setNeedsRedraw(true);
}

export function stepForward(): void {
	if (!GameState.isPaused) return;

	const currentStep = GameState.pausedHistory[GameState.pausedCurrentStep];
	if (!currentStep || !currentStep.bestMove) return;

	const bestMove = currentStep.bestMove;

	if (bestMove.stopX < 0 || bestMove.stopX > LOGICAL_WIDTH ||
		bestMove.stopY < 0 || bestMove.stopY > LOGICAL_HEIGHT) {
		return;
	}
	if (bestMove.isFinalShot) {
		return;
	}
	const newStones = stones.map(s => {
		if (s === bestMove.stone) {
			return {
				x: bestMove.stopX,
				y: bestMove.stopY,
				vx: 0,
				vy: 0,
				radius: s.radius,
				color: s.color,
				isOut: false,
				index: stones.indexOf(s)
			};
		}
		return {
			x: s.x,
			y: s.y,
			vx: 0,
			vy: 0,
			radius: s.radius,
			color: s.color,
			isOut: s.isOut,
			index: stones.indexOf(s)
		};
	});

	applyStoneStates(newStones);

	const savedLastUsed = GameState.lastUsedStriker;
	GameState.lastUsedStriker = bestMove.stone;

	const savedAccuracy = accuracyEnabled;
	setAccuracyEnabled(true);

	const gateCenter = calculateGateCenter(stones);
	const { bestMove: nextBest, allConsideredMoves, candidates, corridors } =
		findBestMove(stones, gateCenter, bestMove.stone);

	setAccuracyEnabled(savedAccuracy);

	if (!nextBest || nextBest.type === 'EMERGENCY') {
		GameState.lastUsedStriker = savedLastUsed;
		applyStoneStates(currentStep.stones);

		const deadEndStep: PausedStep = {
			stones: newStones,
			bestMove: null,
			candidates: [],
			stepIndex: currentStep.stepIndex + 1
		};

		GameState.pausedHistory = GameState.pausedHistory.slice(0, GameState.pausedCurrentStep + 1);
		GameState.pausedHistory.push(deadEndStep);
		GameState.pausedCurrentStep++;

		updatePauseUI();
		setNeedsRedraw(true);
		return;
	}

	const newStep: PausedStep = {
		stones: newStones,
		bestMove: nextBest,
		candidates: candidates,
		stepIndex: currentStep.stepIndex + 1
	};

	GameState.pausedHistory = GameState.pausedHistory.slice(0, GameState.pausedCurrentStep + 1);
	GameState.pausedHistory.push(newStep);
	GameState.pausedCurrentStep++;

	GameState.cachedCandidates = candidates;
	(GameState as any).cachedCorridors = corridors;
	GameState.aiConsideredMoves = allConsideredMoves;

	GameState.aiSelectedStone = nextBest.stone;
	GameState.aiAimTarget = { x: nextBest.stopX, y: nextBest.stopY };
	setPendingAIMove(nextBest);

	updatePauseUI();
	setNeedsRedraw(true);
}

export function stepBackward(): void {
	if (!GameState.isPaused) return;
	if (GameState.pausedCurrentStep <= 0) return;

	GameState.pausedCurrentStep--;

	const targetStep = GameState.pausedHistory[GameState.pausedCurrentStep];
	if (!targetStep) return;

	applyStoneStates(targetStep.stones);

	GameState.cachedCandidates = targetStep.candidates;

	recalculateScores(targetStep.candidates, currentWeights);

	const bestMove = findBestMoveFromCandidates(targetStep.candidates, stones);
	targetStep.bestMove = bestMove;

	if (bestMove) {
		GameState.aiSelectedStone = bestMove.stone;
		GameState.aiAimTarget = { x: bestMove.stopX, y: bestMove.stopY };
		setPendingAIMove(bestMove);
		GameState.aiConsideredMoves = targetStep.candidates.map(c => candidateToAIMove(c));
	} else {
		GameState.aiSelectedStone = null;
		GameState.aiAimTarget = null;
		setPendingAIMove(null);
	}

	updatePauseUI();
	setNeedsRedraw(true);
}

export function resetToOriginal(): void {
	if (!GameState.isPaused) return;
	if (!GameState.pausedOriginalStones) return;

	applyStoneStates(GameState.pausedOriginalStones);

	GameState.pausedHistory = [];
	GameState.pausedCurrentStep = 0;

	const gateCenter = calculateGateCenter(stones);
	const { bestMove, allConsideredMoves, candidates, corridors } =
		findBestMove(stones, gateCenter, GameState.lastUsedStriker);

	GameState.cachedCandidates = candidates;
	(GameState as any).cachedCorridors = corridors;
	GameState.aiConsideredMoves = allConsideredMoves;

	if (bestMove) {
		const initialStep: PausedStep = {
			stones: GameState.pausedOriginalStones,
			bestMove: bestMove,
			candidates: candidates,
			stepIndex: 0
		};
		GameState.pausedHistory.push(initialStep);

		GameState.aiSelectedStone = bestMove.stone;
		GameState.aiAimTarget = { x: bestMove.stopX, y: bestMove.stopY };
		setPendingAIMove(bestMove);
	} else {
		GameState.aiSelectedStone = null;
		GameState.aiAimTarget = null;
		setPendingAIMove(null);
	}

	updatePauseUI();
	setNeedsRedraw(true);
}

(window as any).recalculateInPause = recalculateInPause;