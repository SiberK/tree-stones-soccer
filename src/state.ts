/**
 * src/state.ts
 * 
 * Глобальное состояние игры и константы.
 */

import { Stone } from "./stone.js";

// ============================================================
// ЛОГИЧЕСКИЕ РАЗМЕРЫ ПОЛЯ (для физики)
// ============================================================

/**
 * Логическая ширина поля (в игровых единицах)
 */
export const LOGICAL_WIDTH = 1200;

/**
 * Логическая высота поля (в игровых единицах)
 */
export const LOGICAL_HEIGHT = 800;

/**
 * Canvas и контекст
 */
export const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d')!;

// Устанавливаем фиксированный размер canvas = логический размер
canvas.width = LOGICAL_WIDTH;
canvas.height = LOGICAL_HEIGHT;

// ============================================================
// КОНСТАНТЫ ПОЛЯ (в логических координатах)
// ============================================================

export const GOAL_Y = 150;
export const GOAL_HEIGHT = 200;
export const GOAL_WIDTH = 40;

/**
 * Радиус камня
 */
export const STONE_RADIUS = 28;

// ============================================================
// НАСТРАИВАЕМЫЕ ПАРАМЕТРЫ
// ============================================================

/**
 * Максимальная сила удара
 */
export let MAX_FORCE = 18;

/**
 * Коэффициент трения (0.90 - сильное трение, 0.99 - слабое трение)
 */
export let FRICTION = 0.98;

/**
 * Включена ли точность удара (разброс)
 */
export let accuracyEnabled = true;

/**
 * Коэффициент разброса (случайное отклонение угла)
 */
export let spreadFactor = 0.1;

/**
 * Время "раздумья" AI в кадрах
 */
export let aiThinkingTime = 60;

/**
 * Включено ли чередование битков
 */
export let alternateStriker = false;

/**
 * Множитель силы удара
 */
export const FORCE_FACTOR = 0.04;

/**
 * Порог остановки (доля радиуса)
 */
export const STOP_THRESHOLD_RATIO = 0.02;

// ============================================================
// ПАРАМЕТРЫ ОЦЕНКИ AI
// ============================================================

/**
 * Бонус за продвижение к воротам
 */
export let advancementBonusFactor = 3000;

/**
 * Штраф за отступление от ворот
 */
export let retreatPenaltyFactor = 0.5;

/**
 * Штраф за отсутствие валидных проходов
 */
export let noValidPassesPenalty = 5000;

/**
 * Бонус за острый угол треугольника (хорошая позиция для гола)
 */
export let triangleAcuteBonus = 2000;

/**
 * Штраф за тупой угол треугольника (плохая позиция)
 */
export let triangleObtusePenalty = 1000;

/**
 * Бонус за возможность следующего удара на гол
 */
export let nextShotBonus = 5000;

/**
 * Бонус за тактическую позицию для следующего хода
 */
export let nextTacticalBonus = 2000;

// ============================================================
// ФУНКЦИИ ДЛЯ ИЗМЕНЕНИЯ НАСТРОЕК
// ============================================================

/**
 * Устанавливает максимальную силу удара
 */
export function setMaxForce(value: number): void {
    MAX_FORCE = value;
    updateMaxDistance();
}

/**
 * Устанавливает коэффициент трения
 */
export function setFriction(value: number): void {
    FRICTION = value;
    updateMaxDistance();
}

/**
 * Устанавливает включение точности удара
 */
export function setAccuracyEnabled(value: boolean): void {
    accuracyEnabled = value;
}

/**
 * Вычисляет максимальное расстояние движения камня
 * Формула: distance = force / K, где K = -ln(friction)
 */
export function calculateMaxDistance(): number {
    if (FRICTION <= 0 || FRICTION >= 1) return 0;
    const K = -Math.log(FRICTION);
    if (K === 0) return 0;
    return MAX_FORCE / K;
}

/**
 * Обновляет отображение максимального расстояния в панели настроек
 */
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
    aiConsideredMoves: []
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
    
    const settings = {
        maxForce: MAX_FORCE,
        friction: FRICTION,
        accuracyEnabled,
        spreadFactor,
        aiThinkingTime,
        alternateStriker
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
    } catch (e) {
        console.error('Ошибка загрузки настроек:', e);
    }
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ КАМНЕЙ
// ============================================================

export function spawnAtGates(player: number): void {
    stones.length = 0;
    
    const centerX = LOGICAL_WIDTH / 2;
    const centerY = LOGICAL_HEIGHT/ 2;
    
    // Битки
    const strikerColor = player === 1 ? 'red' : 'blue';
    const strikerX = player === 1 ? centerX - 200 : centerX + 200;
    
    stones.push(new Stone(strikerX, centerY - 50, STONE_RADIUS, strikerColor));
    stones.push(new Stone(strikerX, centerY + 50, STONE_RADIUS, strikerColor));
    
    // Ворота (камни противника)
    const gateColor = player === 1 ? 'blue' : 'red';
    const gateX = player === 1 ? centerX + 100 : centerX - 100;
    
    stones.push(new Stone(gateX, centerY, STONE_RADIUS, gateColor));
}

// ============================================================
// ИНИЦИАЛИЗАЦИЯ ПАНЕЛИ НАСТРОЕК
// ============================================================

/**
 * Инициализирует панель настроек
 */
export function initSettingsPanel(): void {
    const settingsBtn = document.getElementById('settingsBtn');
    const closeSettingsBtn = document.getElementById('closeSettingsBtn');
    const settingsPanel = document.getElementById('settingsPanel');
    
    if (!settingsBtn || !closeSettingsBtn || !settingsPanel) return;
    
    // Открытие/закрытие панели
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.toggle('hidden');
    });
    
    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
    });
    
    // Максимальная сила
    const maxForceSlider = document.getElementById('maxForceSlider') as HTMLInputElement;
    const maxForceValue = document.getElementById('maxForceValue');
    
    if (maxForceSlider && maxForceValue) {
        maxForceSlider.value = MAX_FORCE.toString();
        maxForceValue.textContent = MAX_FORCE.toString();
        
        maxForceSlider.addEventListener('input', () => {
            const value = parseFloat(maxForceSlider.value);
            setMaxForce(value);
            maxForceValue.textContent = value.toString();
            saveSettingsToCookie();
        });
    }
    
    // Трение
    const frictionSlider = document.getElementById('frictionSlider') as HTMLInputElement;
    const frictionValue = document.getElementById('frictionValue');
    
    if (frictionSlider && frictionValue) {
        frictionSlider.value = FRICTION.toString();
        frictionValue.textContent = FRICTION.toFixed(2);
        
        frictionSlider.addEventListener('input', () => {
            const value = parseFloat(frictionSlider.value);
            setFriction(value);
            frictionValue.textContent = value.toFixed(2);
            saveSettingsToCookie();
        });
    }
    
    // Точность
    const accuracyToggle = document.getElementById('accuracyToggle') as HTMLInputElement;
    
    if (accuracyToggle) {
        accuracyToggle.checked = accuracyEnabled;
        
        accuracyToggle.addEventListener('change', () => {
            setAccuracyEnabled(accuracyToggle.checked);
            saveSettingsToCookie();
        });
    }
    
    // Разброс
    const spreadSlider = document.getElementById('spreadSlider') as HTMLInputElement;
    const spreadValue = document.getElementById('spreadValue');
    
    if (spreadSlider && spreadValue) {
        spreadSlider.value = spreadFactor.toString();
        spreadValue.textContent = spreadFactor.toFixed(2);
        
        spreadSlider.addEventListener('input', () => {
            const value = parseFloat(spreadSlider.value);
            spreadFactor = value;
            spreadValue.textContent = value.toFixed(2);
            saveSettingsToCookie();
        });
    }
    
    // Время мысли AI
    const aiThinkingSlider = document.getElementById('aiThinkingSlider') as HTMLInputElement;
    const aiThinkingValue = document.getElementById('aiThinkingValue');
    
    if (aiThinkingSlider && aiThinkingValue) {
        aiThinkingSlider.value = aiThinkingTime.toString();
        aiThinkingValue.textContent = aiThinkingTime.toString();
        
        aiThinkingSlider.addEventListener('input', () => {
            const value = parseInt(aiThinkingSlider.value);
            aiThinkingTime = value;
            aiThinkingValue.textContent = value.toString();
            saveSettingsToCookie();
        });
    }
    
    // Чередование битков
    const alternateStrikerToggle = document.getElementById('alternateStrikerToggle') as HTMLInputElement;
    
    if (alternateStrikerToggle) {
        alternateStrikerToggle.checked = alternateStriker;
        
        alternateStrikerToggle.addEventListener('change', () => {
            alternateStriker = alternateStrikerToggle.checked;
            saveSettingsToCookie();
        });
    }
    
    // Штрафы AI
    initAIPenaltiesSliders();
    
    // Инициализируем максимальное расстояние
    updateMaxDistance();
}

/**
 * Инициализирует слайдеры штрафов AI
 */
export function initAIPenaltiesSliders(): void {
    // Здесь можно добавить инициализацию слайдеров штрафов AI
    // Если они используются в ai/strategy.ts
}