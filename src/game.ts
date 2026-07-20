/**
 * src/game.ts
 * 
 * Главный модуль игры.
 * Тонкий оркестратор, который связывает все модули.
 */

import {
	GameState, stones, canvas,
	spawnAtGates, initSettingsPanel, loadSettingsFromCookie,
	checkCookieConsent, initCookieBanner, initPresets, initPresetButtons,
	cookiesAccepted
} from "./state.js";
import { startAim, moveAim, endAim } from "./input.js";
import { processTurnResult } from "./rules.js";
import { setPendingAIMove } from "./renderer/index.js";
import { simulationController } from "./simulation/controller.js";

import { gameLoop, setNeedsRedraw } from "./gameLoop.js";
import { handleOccurredEvents } from "./events.js";
import { processAITurn } from "./aiTurn.js";
import { initFullscreenButton } from "./fullscreen.js";
import { initPauseButtons } from "./pause/index.js";
import { DEBUG_AI, DEBUG_GOAL, DEBUG_CANDIDATES } from "./debug.js";
// ============================================================
// ОБНОВЛЕНИЕ СОСТОЯНИЯ В ИГРОВОМ ЦИКЛЕ
// ============================================================

function update(deltaTime: number): void {
	if (!GameState.isPaused && simulationController.isSimulating()) {
		const occurredEvents = simulationController.updatePlayback(deltaTime, stones);

		if (occurredEvents.length > 0) {
			handleOccurredEvents(occurredEvents, stones);
			setNeedsRedraw(true);
		}

		if (!simulationController.isSimulating()) {
			const finalState = simulationController.getFinalState();

			if (finalState) {
				GameState.hasPassedThrough = finalState.hasPassedThrough;
				GameState.isGoalScored = finalState.isGoalScored;
				GameState.hitObstacle = finalState.hitObstacle;
			}

			// Запоминаем, кто бил, ДО обработки результата
			const prevPlayer = GameState.currentPlayer;
			if (DEBUG_AI && DEBUG_CANDIDATES) {
				// 1. Генерируем отчёт (динамический импорт чтобы избежать циклических зависимостей)
				import('./turnReport.js').then(({ generateTurnReport }) => {
					generateTurnReport();
				});
			}
			// 2. Обрабатываем результат (при голе сбросит поле)
			processTurnResult();

			// 3. Сброс счётчика ударов при смене игрока
			if (GameState.currentPlayer !== prevPlayer) {
				GameState.shotInTurnCounter = 0;
			}

			setNeedsRedraw(true);
		}
	}

	if (!GameState.isPaused) {
		processAITurn();
	}
}

// ============================================================
// ОБРАБОТЧИКИ ВВОДА
// ============================================================

canvas.addEventListener('mousedown', (e: MouseEvent) => {
	if (GameState.isPaused) return;
	setNeedsRedraw(true);
	startAim(e);
});

window.addEventListener('mousemove', (e: MouseEvent) => {
	if (GameState.isPaused) return;
	if (GameState.isAiming) setNeedsRedraw(true);
	moveAim(e);
});

window.addEventListener('mouseup', (e: MouseEvent) => {
	if (GameState.isPaused) return;
	setNeedsRedraw(true);
	endAim();
});

canvas.addEventListener('touchstart', (e: TouchEvent) => {
	if (GameState.isPaused) return;
	setNeedsRedraw(true);
	startAim(e);
}, { passive: false });

canvas.addEventListener('touchmove', (e: TouchEvent) => {
	if (GameState.isPaused) return;
	if (GameState.isAiming) setNeedsRedraw(true);
	moveAim(e);
}, { passive: false });

window.addEventListener('touchend', (e: TouchEvent) => {
	if (GameState.isPaused) return;
	setNeedsRedraw(true);
	endAim();
});

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

checkCookieConsent();
initCookieBanner();

if (cookiesAccepted) {
	loadSettingsFromCookie();
	initPresets();
}

initSettingsPanel();
initPresetButtons();
initFullscreenButton();
initPauseButtons();

spawnAtGates(1);
setNeedsRedraw(true);
requestAnimationFrame((t) => gameLoop(t, update));