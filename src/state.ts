import { Stone } from "./stone.js";
import { Point } from "./math.js";

export const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
export const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

// Константы физики и геймплея
export const FORCE_FACTOR: number = 0.12;
export const MAX_FORCE: number = 18;

export const GOAL_Y: number = 280;
export const GOAL_HEIGHT: number = 240;
export const GOAL_WIDTH: number = 30;

// === НАСТРОЙКИ ИГРОКА ===
// Стандартное отклонение Гауссова разброса удара (регулируется слайдером)
// Чем больше значение, тем менее точен удар
export let spreadFactor: number = 0.35;

/**
 * Инициализирует слайдер разброса и привязывает его к переменной spreadFactor.
 * Вызывается один раз при старте игры.
 */
export function initSpreadSlider(): void {
    const slider = document.getElementById('spreadSlider') as HTMLInputElement;
    const valueDisplay = document.getElementById('spreadValue') as HTMLSpanElement;

    if (!slider || !valueDisplay) {
        console.warn('Слайдер разброса не найден в DOM. Используем значение по умолчанию.');
        return;
    }

    // Устанавливаем начальное значение
    slider.value = spreadFactor.toString();
    valueDisplay.textContent = spreadFactor.toFixed(2);

    // Обработчик изменения слайдера
    slider.addEventListener('input', () => {
        spreadFactor = parseFloat(slider.value);
        valueDisplay.textContent = spreadFactor.toFixed(2);
    });
}

// Массив из трех игровых камней
export const stones: Stone[] = [
    new Stone(0, 0, 28, '#999999'),
    new Stone(0, 0, 28, '#bbbbbb'),
    new Stone(0, 0, 28, '#777777')
];

/**
 * Глобальное состояние игры.
 */
export const GameState = {
    selectedStone: null as Stone | null,
    isAiming: false,
    mouseX: 0,
    mouseY: 0,
    
    lastStruckStone: null as Stone | null,
    hasPassedThrough: false,
    hitObstacle: false,
    
    turnResultText: "",
    resultTimer: 0,
    
    scoreLeft: 0,
    scoreRight: 0,
    isGoalScored: false,
    
    currentPlayer: 1,
    
    // Состояние ИИ
    aiThinkingTimer: 0,
    aiAimTarget: null as Point | null,
    aiSelectedStone: null as Stone | null,
    aiConsideredMoves: [] as any[],
};

export const hitSound = new Audio('assets/hit.mp3');
hitSound.addEventListener('error', () => {});

export function spawnAtGates(player: number): void {
    const baseX = player === 1 ? 180 : canvas.width - 180;
    const direction = player === 1 ? 1 : -1;
    const groupOffsetY = (Math.random() - 0.5) * 80;
    const dist1 = 90 + Math.random() * 30;
    const dist2 = 90 + Math.random() * 30;

    stones[0].x = baseX;
    stones[0].y = canvas.height / 2 + groupOffsetY;
    stones[1].x = baseX + (direction * 55);
    stones[1].y = canvas.height / 2 - dist1 + groupOffsetY;
    stones[2].x = baseX + (direction * 55);
    stones[2].y = canvas.height / 2 + dist2 + groupOffsetY;

    stones.forEach(s => { s.vx = 0; s.vy = 0; s.isOut = false; });
    
    GameState.lastStruckStone = null; 
    GameState.hasPassedThrough = false; 
    GameState.hitObstacle = false; 
    GameState.isGoalScored = false;
    GameState.resultTimer = 0;
    GameState.aiAimTarget = null;
    GameState.aiSelectedStone = null;
    GameState.aiConsideredMoves = [];
}