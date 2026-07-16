/**
 * src/state.ts
 * 
 * Глобальное состояние игры и константы.
 */

import { Stone } from "./stone.js";

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
// НАСТРАИВАЕМЫЕ ПАРАМЕТРЫ
// ============================================================

export let MAX_FORCE = 30;
export let FRICTION = 0.95;
export let accuracyEnabled = true;
export let spreadFactor = 0.1;
export let aiThinkingTime = 60;
export let alternateStriker = false;

// НОВЫЕ ПАРАМЕТРЫ ДЛЯ ДИСКРЕТИЗАЦИИ И ПОРОГА УВЕРЕННОСТИ
export let forceSteps = 6;          // Количество дискретов силы удара (3-10)
export let angleSteps = 5;          // Количество дискретов направления удара (3-10)
export let goalConfidenceThreshold = 0.5;  // Порог уверенности для гола (0-1)

export const FORCE_FACTOR = 0.04;
export const STOP_THRESHOLD_RATIO = 0.02;

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
    aiCalculationTime: number;      // НОВОЕ: время расчёта AI в мс
    renderTimeAvg: number;          // НОВОЕ: среднее время рендеринга в мс
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
    renderTimeAvg: 0
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
    
    try {
        const strategyModule = (window as any).__strategyModule;
        if (strategyModule) {
            settings.aiPenalties = strategyModule.getAIPenalties();
        }
    } catch (e) {}
    
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
        
        if (settings.aiPenalties) {
            (window as any).__savedAIPenalties = settings.aiPenalties;
        }
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

export function applySavedAIPenalties(): void {
    const savedPenalties = (window as any).__savedAIPenalties;
    if (savedPenalties) {
        import('./ai/strategy.js').then(mod => {
            mod.setAIPenalties(savedPenalties);
        }).catch(e => {
            console.warn('Не удалось применить сохранённые штрафы ИИ:', e);
        });
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
    stones.push(new Stone(x0, y0, STONE_RADIUS, stoneColor));
    stones.push(new Stone(x1, y1, STONE_RADIUS, stoneColor));
    stones.push(new Stone(x2, y2, STONE_RADIUS, stoneColor));
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
    
    // === ШТРАФЫ ИИ ===
    initAIPenaltiesSliders();
    
    updateMaxDistance();
}

export function initAIPenaltiesSliders(): void {
    import('./ai/strategy.js').then(mod => {
        const penalties = mod.getAIPenalties();
        
        bindSlider('riskPenaltySlider', 'riskPenaltyValue', penalties.riskPenalty, 
            (v) => mod.setAIPenalties({ riskPenalty: v }));
        
        bindSlider('forcePenaltySlider', 'forcePenaltyValue', penalties.forcePenalty, 
            (v) => mod.setAIPenalties({ forcePenalty: v }));
        
        bindSlider('gatesBlockPenaltySlider', 'gatesBlockPenaltyValue', penalties.gatesBlockPenalty, 
            (v) => mod.setAIPenalties({ gatesBlockPenalty: v }));
        
        bindSlider('missGatePenaltySlider', 'missGatePenaltyValue', penalties.missGatePenalty, 
            (v) => mod.setAIPenalties({ missGatePenalty: v }));
        
        bindSlider('advancementBonusSlider', 'advancementBonusValue', penalties.advancementBonus, 
            (v) => mod.setAIPenalties({ advancementBonus: v }));
        
        bindSlider('retreatPenaltySlider', 'retreatPenaltyValue', penalties.retreatPenalty, 
            (v) => mod.setAIPenalties({ retreatPenalty: v }), (v) => v.toFixed(1));
        
        bindSlider('nextShotBonusSlider', 'nextShotBonusValue', penalties.nextShotBonus, 
            (v) => mod.setAIPenalties({ nextShotBonus: v }));
        
        bindSlider('badPositionPenaltySlider', 'badPositionPenaltyValue', penalties.badPositionPenalty, 
            (v) => mod.setAIPenalties({ badPositionPenalty: v }));
    }).catch(e => {
        console.warn('Не удалось инициализировать слайдеры штрафов ИИ:', e);
    });
}