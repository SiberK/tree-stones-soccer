/**
 * src/state.ts
 * 
 * Глобальное состояние игры и константы.
 */

import { Stone } from "./stone.js";
import { Weights, CachedCandidate, PausedStep } from "./ai/types.js";

// ============================================================
// ЛОГИЧЕСКИЕ РАЗМЕРЫ ПОЛЯ (для физики)
// ============================================================

export const LOGICAL_WIDTH = 1200;
export const LOGICAL_HEIGHT = 800;

export const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;

// ============================================================
// КОНСТАНТЫ ПОЛЯ (в логических координатах)
// ============================================================

export const GOAL_HEIGHT = 200;
export const GOAL_Y = (LOGICAL_HEIGHT - GOAL_HEIGHT) / 2;
export const GOAL_WIDTH = 40;
export const STONE_RADIUS = 28;

// ============================================================
// ЧУВСТВИТЕЛЬНОСТЬ РОГАТКИ
// ============================================================

/**
 * Коэффициент чувствительности оттягивания рогатки.
 * При PULL_SENSITIVITY = 5: оттягивание на 1px = 5px в расчёте силы.
 * Максимальное оттягивание: MAX_FORCE / FORCE_FACTOR / PULL_SENSITIVITY
 * При MAX_FORCE=30, FORCE_FACTOR=0.04, PULL_SENSITIVITY=5 → max pull = 150px
 */
export let PULL_SENSITIVITY = 5;

export function setPullSensitivity(value: number): void {
	PULL_SENSITIVITY = Math.max(1, Math.min(20, value));
}

// ============================================================
// НАСТРАИВАЕМЫЕ ПАРАМЕТРЫ
// ============================================================

export let MAX_FORCE = 30;
export let FRICTION = 0.95;
export let accuracyEnabled = true;
export let spreadFactor = 0.1;
export let aiThinkingTime = 60;
export let alternateStriker = false;

export let forceSteps = 6;
export let angleSteps = 6;
export let goalConfidenceThreshold = 0.5;

export const FORCE_FACTOR = 0.04;
export const STOP_THRESHOLD_RATIO = 0.02;

// ============================================================
// ВЕСА ДЛЯ ОЦЕНКИ ХОДОВ AI
// ============================================================

export const DEFAULT_WEIGHTS: Weights = {
	// Существующие
	riskPenalty: 8000,
	forcePenalty: 1000,
	gatesBlockPenalty: 10000,
	advancementBonus: 300,        // 10
	retreatPenalty: 0.5,
	nextShotBonus: 0,
	missGatePenalty: 5000,
	badPositionPenalty: 2000,

	// Новые
	triangleQualityBonus: 10000,
	flexibilityBonus: 2000,
	goalProximityBonus: 150,      // ÷10
	safetyMarginBonus: 1000,
	edgePenalty: 1500,
	largeTrianglePenalty: 1000
};

// Текущие веса (из активного пресета)
export let currentWeights: Weights = { ...DEFAULT_WEIGHTS };

// Активный пресет (1-6)
export let activePreset: number = 1;

// ============================================================
// ФУНКЦИИ ДЛЯ ИЗМЕНЕНИЯ НАСТРОЕК
// ============================================================

export function setMaxForce(value: number): void {
	MAX_FORCE = value;
	updateMaxDistance();
}

export function setFriction(value: number): void {
	FRICTION = value;
	updateMaxDistance();
}

export function setAccuracyEnabled(value: boolean): void {
	accuracyEnabled = value;
}

export function setForceSteps(value: number): void {
	forceSteps = Math.max(3, Math.min(10, Math.round(value)));
}

export function setAngleSteps(value: number): void {
	angleSteps = Math.max(3, Math.min(10, Math.round(value)));
}

export function setGoalConfidenceThreshold(value: number): void {
	goalConfidenceThreshold = Math.max(0, Math.min(1, value));
}

export function setWeight(key: keyof Weights, value: number): void {
	currentWeights[key] = value;
	saveActivePreset();
}

export function calculateMaxDistance(): number {
	if (FRICTION <= 0 || FRICTION >= 1) return 0;
	const K = -Math.log(FRICTION);
	if (K === 0) return 0;
	return MAX_FORCE / K;
}

function updateMaxDistance(): void {
	const maxDistanceValue = document.getElementById('maxDistanceValue');
	if (maxDistanceValue) {
		const distance = calculateMaxDistance();
		maxDistanceValue.textContent = Math.round(distance).toString();
	}
}

// ============================================================
// СОСТОЯНИЕ ИГРЫ
// ============================================================

export interface GameStateType {
	currentPlayer: number;
	isAiming: boolean;
	selectedStone: Stone | null;
	mouseX: number;
	mouseY: number;
	scoreLeft: number;
	scoreRight: number;
	hasPassedThrough: boolean;
	hitObstacle: boolean;
	isGoalScored: boolean;
	turnResultText: string;
	resultTimer: number;
	lastStruckStone: Stone | null;
	lastUsedStriker: Stone | null;
	aiThinkingTimer: number;
	aiSelectedStone: Stone | null;
	aiAimTarget: { x: number; y: number } | null;
	aiConsideredMoves: any[];
	aiCalculationTime: number;
	renderTimeAvg: number;

	// === СОСТОЯНИЕ ПАУЗЫ ===
	isPaused: boolean;                              // Режим паузы активен
	pausedOriginalStones: any[] | null;             // Исходная позиция камней
	pausedHistory: PausedStep[];                    // Стек истории для «Далее»/«Назад»
	pausedCurrentStep: number;                      // Текущий шаг в серии
	cachedCandidates: CachedCandidate[];            // Кешированные кандидаты

	// Для отчётов
	lastAIMove: any; // AIMove | null
	shotInTurnCounter: number;
	reportStartPositions: any[] | null;
}

export const GameState: GameStateType = {
	currentPlayer: 1,
	isAiming: false,
	selectedStone: null,
	mouseX: 0,
	mouseY: 0,
	scoreLeft: 0,
	scoreRight: 0,
	hasPassedThrough: false,
	hitObstacle: false,
	isGoalScored: false,
	turnResultText: "",
	resultTimer: 0,
	lastStruckStone: null,
	lastUsedStriker: null,
	aiThinkingTimer: 0,
	aiSelectedStone: null,
	aiAimTarget: null,
	aiConsideredMoves: [],
	aiCalculationTime: 0,
	renderTimeAvg: 0,

	// Пауза
	isPaused: false,
	pausedOriginalStones: null,
	pausedHistory: [],
	pausedCurrentStep: 0,
	cachedCandidates: [],

	// Для отчётов
	lastAIMove: null,
	shotInTurnCounter: 0,
	reportStartPositions: null,
};

export const stones: Stone[] = [];

// ============================================================
// СОГЛАСИЕ НА COOKIES
// ============================================================

export let cookiesAccepted = false;

export function checkCookieConsent(): void {
	const consent = localStorage.getItem('cookieConsent');
	if (consent === 'accepted') {
		cookiesAccepted = true;
	}
}

export function initCookieBanner(): void {
	if (cookiesAccepted) return;

	const banner = document.createElement('div');
	banner.innerHTML = `
        <p>Этот сайт использует cookies для сохранения настроек.</p>
        <button id="acceptCookies">Принять</button>
        <button id="declineCookies">Отклонить</button>
    `;
	banner.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 20px;
        border-radius: 10px;
        z-index: 1000;
        display: flex;
        gap: 10px;
        align-items: center;
    `;
	document.body.appendChild(banner);

	document.getElementById('acceptCookies')!.addEventListener('click', () => {
		localStorage.setItem('cookieConsent', 'accepted');
		cookiesAccepted = true;
		banner.remove();
	});

	document.getElementById('declineCookies')!.addEventListener('click', () => {
		banner.remove();
	});
}

// ============================================================
// ПРЕСЕТЫ ВЕСОВ
// ============================================================

/**
 * Сохраняет текущие веса в активный пресет
 */
export function saveActivePreset(): void {
	if (!cookiesAccepted) return;
	localStorage.setItem(`preset_${activePreset}_weights`, JSON.stringify(currentWeights));
}

/**
 * Загружает веса из указанного пресета
 */
export function loadPreset(presetId: number): void {
	if (!cookiesAccepted) return;

	const saved = localStorage.getItem(`preset_${presetId}_weights`);
	if (saved) {
		try {
			currentWeights = { ...DEFAULT_WEIGHTS, ...JSON.parse(saved) };
		} catch (e) {
			console.error('Ошибка загрузки пресета:', e);
			currentWeights = { ...DEFAULT_WEIGHTS };
		}
	} else {
		currentWeights = { ...DEFAULT_WEIGHTS };
	}

	activePreset = presetId;
	localStorage.setItem('activePreset', presetId.toString());
}

/**
 * Инициализирует все пресеты дефолтными значениями (при первом запуске)
 */
export function initPresets(): void {
	if (!cookiesAccepted) return;

	// Загружаем активный пресет
	const savedActive = localStorage.getItem('activePreset');
	if (savedActive) {
		activePreset = parseInt(savedActive, 10);
	}

	// Загружаем веса активного пресета
	loadPreset(activePreset);
}

// ============================================================
// СОХРАНЕНИЕ/ЗАГРУЗКА НАСТРОЕК
// ============================================================

export function saveSettingsToCookie(): void {
	if (!cookiesAccepted) return;

	const settings: any = {
		maxForce: MAX_FORCE,
		friction: FRICTION,
		accuracyEnabled,
		spreadFactor,
		aiThinkingTime,
		alternateStriker,
		forceSteps,
		angleSteps,
		goalConfidenceThreshold
	};

	localStorage.setItem('gameSettings', JSON.stringify(settings));
}

export function loadSettingsFromCookie(): void {
	if (!cookiesAccepted) return;

	const saved = localStorage.getItem('gameSettings');
	if (!saved) return;

	try {
		const settings = JSON.parse(saved);

		if (settings.maxForce !== undefined) setMaxForce(settings.maxForce);
		if (settings.friction !== undefined) setFriction(settings.friction);
		if (settings.accuracyEnabled !== undefined) setAccuracyEnabled(settings.accuracyEnabled);
		if (settings.spreadFactor !== undefined) spreadFactor = settings.spreadFactor;
		if (settings.aiThinkingTime !== undefined) aiThinkingTime = settings.aiThinkingTime;
		if (settings.alternateStriker !== undefined) alternateStriker = settings.alternateStriker;
		if (settings.forceSteps !== undefined) setForceSteps(settings.forceSteps);
		if (settings.angleSteps !== undefined) setAngleSteps(settings.angleSteps);
		if (settings.goalConfidenceThreshold !== undefined) setGoalConfidenceThreshold(settings.goalConfidenceThreshold);
	} catch (e) {
		console.error('Ошибка загрузки настроек:', e);
	}
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ КАМНЕЙ
// ============================================================

export function spawnAtGates(player: number): void {
	stones.length = 0;

	const centerY = LOGICAL_HEIGHT / 2;
	const baseX = player === 1 ? 180 : LOGICAL_WIDTH - 180;
	const direction = player === 1 ? 1 : -1;
	const groupOffsetY = (Math.random() - 0.5) * 80;
	const dist1 = 90 + Math.random() * 30;
	const dist2 = 90 + Math.random() * 30;

	const x0 = baseX;
	const y0 = centerY + groupOffsetY;
	const x1 = baseX + 55 * direction;
	const y1 = centerY - dist1 + groupOffsetY;
	const x2 = baseX + 55 * direction;
	const y2 = centerY + dist2 + groupOffsetY;

	const stoneColor = 'white';
	stones.push(new Stone(x0, y0, STONE_RADIUS, stoneColor, '#1'));
	stones.push(new Stone(x1, y1, STONE_RADIUS, stoneColor, '#2'));
	stones.push(new Stone(x2, y2, STONE_RADIUS, stoneColor, '#3'));
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПАНЕЛИ НАСТРОЕК
// ============================================================

function bindSlider(
	sliderId: string,
	valueId: string,
	initialValue: number,
	onChange: (value: number) => void,
	format: (value: number) => string = (v) => v.toString()
): void {
	const slider = document.getElementById(sliderId) as HTMLInputElement;
	const valueSpan = document.getElementById(valueId);

	if (!slider || !valueSpan) return;

	slider.value = initialValue.toString();
	valueSpan.textContent = format(initialValue);

	slider.addEventListener('input', () => {
		const value = parseFloat(slider.value);
		onChange(value);
		valueSpan.textContent = format(value);
		saveSettingsToCookie();
	});
}

function bindCheckbox(
	checkboxId: string,
	initialValue: boolean,
	onChange: (value: boolean) => void
): void {
	const checkbox = document.getElementById(checkboxId) as HTMLInputElement;
	if (!checkbox) return;

	checkbox.checked = initialValue;
	checkbox.addEventListener('change', () => {
		onChange(checkbox.checked);
		saveSettingsToCookie();
	});
}

function bindWeightSlider(
	sliderId: string,
	valueId: string,
	weightKey: keyof Weights,
	format: (value: number) => string = (v) => v.toString()
): void {
	const slider = document.getElementById(sliderId) as HTMLInputElement;
	const valueSpan = document.getElementById(valueId);

	if (!slider || !valueSpan) return;

	const initialValue = currentWeights[weightKey];
	slider.value = initialValue.toString();
	valueSpan.textContent = format(initialValue);

	slider.addEventListener('input', () => {
		const value = parseFloat(slider.value);
		setWeight(weightKey, value);
		valueSpan.textContent = format(value);
	});
}

export function initSettingsPanel(): void {
	const settingsBtn = document.getElementById('settingsBtn');
	const closeSettingsBtn = document.getElementById('closeSettingsBtn');
	const settingsPanel = document.getElementById('settingsPanel');

	if (!settingsBtn || !closeSettingsBtn || !settingsPanel) return;

	settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
	closeSettingsBtn.addEventListener('click', () => settingsPanel.classList.add('hidden'));

	// === ФИЗИКА ===
	bindSlider('maxForceSlider', 'maxForceValue', MAX_FORCE, setMaxForce);
	bindSlider('frictionSlider', 'frictionValue', FRICTION, setFriction, (v) => v.toFixed(2));
	bindCheckbox('accuracyToggle', accuracyEnabled, setAccuracyEnabled);

	// === РАЗБРОС ===
	bindSlider('spreadSlider', 'spreadValue', spreadFactor, (v) => { spreadFactor = v; }, (v) => v.toFixed(2));

	// === ИИ ===
	bindSlider('aiThinkingSlider', 'aiThinkingValue', aiThinkingTime, (v) => { aiThinkingTime = v; });
	bindCheckbox('alternateStrikerToggle', alternateStriker, (v) => { alternateStriker = v; });

	// === ДИСКРЕТИЗАЦИЯ ===
	bindSlider('forceStepsSlider', 'forceStepsValue', forceSteps, setForceSteps);
	bindSlider('angleStepsSlider', 'angleStepsValue', angleSteps, setAngleSteps);

	// === ПОРОГ УВЕРЕННОСТИ ===
	bindSlider('confidenceSlider', 'confidenceValue', goalConfidenceThreshold,
		setGoalConfidenceThreshold, (v) => v.toFixed(2));

	// === ВЕСА (бонусы — зелёные) ===
	bindWeightSlider('triangleQualityBonusSlider', 'triangleQualityBonusValue', 'triangleQualityBonus');
	bindWeightSlider('flexibilityBonusSlider', 'flexibilityBonusValue', 'flexibilityBonus');
	bindWeightSlider('goalProximityBonusSlider', 'goalProximityBonusValue', 'goalProximityBonus');
	bindWeightSlider('safetyMarginBonusSlider', 'safetyMarginBonusValue', 'safetyMarginBonus');
	bindWeightSlider('advancementBonusSlider', 'advancementBonusValue', 'advancementBonus');
	bindWeightSlider('nextShotBonusSlider', 'nextShotBonusValue', 'nextShotBonus');

	// === ВЕСА (штрафы — красные) ===
	bindWeightSlider('riskPenaltySlider', 'riskPenaltyValue', 'riskPenalty');
	bindWeightSlider('forcePenaltySlider', 'forcePenaltyValue', 'forcePenalty');
	bindWeightSlider('edgePenaltySlider', 'edgePenaltyValue', 'edgePenalty');
	bindWeightSlider('largeTrianglePenaltySlider', 'largeTrianglePenaltyValue', 'largeTrianglePenalty');
	bindWeightSlider('missGatePenaltySlider', 'missGatePenaltyValue', 'missGatePenalty');
	bindWeightSlider('badPositionPenaltySlider', 'badPositionPenaltyValue', 'badPositionPenalty');
	bindWeightSlider('retreatPenaltySlider', 'retreatPenaltyValue', 'retreatPenalty', (v) => v.toFixed(1));

	updateMaxDistance();
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ КНОПОК ПРЕСЕТОВ
// ============================================================

export function initPresetButtons(): void {
	const buttons = document.querySelectorAll('.preset-btn');

	buttons.forEach(btn => {
		const presetId = parseInt((btn as HTMLElement).dataset.preset || '1', 10);

		btn.addEventListener('click', () => {
			// Загружаем пресет
			loadPreset(presetId);

			// Обновляем подсветку
			buttons.forEach(b => b.classList.remove('active'));
			btn.classList.add('active');

			// Обновляем слайдеры весов
			updateWeightSliders();

			// Если в паузе — пересчитываем
			if (GameState.isPaused) {
				// Вызовем глобальную функцию пересчёта (будет определена в game.ts)
				if ((window as any).recalculateInPause) {
					(window as any).recalculateInPause();
				}
			}
		});
	});

	// Подсвечиваем активный пресет
	const activeBtn = document.querySelector(`.preset-btn[data-preset="${activePreset}"]`);
	if (activeBtn) {
		activeBtn.classList.add('active');
	}
}

/**
 * Обновляет значения всех слайдеров весов из currentWeights
 */
export function updateWeightSliders(): void {
	const weightSliders = [
		{ id: 'triangleQualityBonusSlider', valueId: 'triangleQualityBonusValue', key: 'triangleQualityBonus' as keyof Weights },
		{ id: 'flexibilityBonusSlider', valueId: 'flexibilityBonusValue', key: 'flexibilityBonus' as keyof Weights },
		{ id: 'goalProximityBonusSlider', valueId: 'goalProximityBonusValue', key: 'goalProximityBonus' as keyof Weights },
		{ id: 'safetyMarginBonusSlider', valueId: 'safetyMarginBonusValue', key: 'safetyMarginBonus' as keyof Weights },
		{ id: 'advancementBonusSlider', valueId: 'advancementBonusValue', key: 'advancementBonus' as keyof Weights },
		{ id: 'nextShotBonusSlider', valueId: 'nextShotBonusValue', key: 'nextShotBonus' as keyof Weights },
		{ id: 'riskPenaltySlider', valueId: 'riskPenaltyValue', key: 'riskPenalty' as keyof Weights },
		{ id: 'forcePenaltySlider', valueId: 'forcePenaltyValue', key: 'forcePenalty' as keyof Weights },
		{ id: 'edgePenaltySlider', valueId: 'edgePenaltyValue', key: 'edgePenalty' as keyof Weights },
		{ id: 'largeTrianglePenaltySlider', valueId: 'largeTrianglePenaltyValue', key: 'largeTrianglePenalty' as keyof Weights },
		{ id: 'missGatePenaltySlider', valueId: 'missGatePenaltyValue', key: 'missGatePenalty' as keyof Weights },
		{ id: 'badPositionPenaltySlider', valueId: 'badPositionPenaltyValue', key: 'badPositionPenalty' as keyof Weights },
		{ id: 'retreatPenaltySlider', valueId: 'retreatPenaltyValue', key: 'retreatPenalty' as keyof Weights, format: (v: number) => v.toFixed(1) }
	];

	weightSliders.forEach(({ id, valueId, key, format }) => {
		const slider = document.getElementById(id) as HTMLInputElement;
		const valueSpan = document.getElementById(valueId);

		if (slider && valueSpan) {
			const value = currentWeights[key];
			slider.value = value.toString();
			valueSpan.textContent = format ? format(value) : value.toString();
		}
	});
}