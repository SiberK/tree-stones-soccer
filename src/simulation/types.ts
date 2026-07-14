/**
 * src/simulation/types.ts
 * 
 * Типы и интерфейсы для событийно-ориентированной симуляции.
 */

import { Stone } from "../stone.js";

// ============================================================
// БАЗОВЫЕ ТИПЫ
// ============================================================

/**
 * Точка в 2D пространстве
 */
export interface Point {
    x: number;
    y: number;
}

/**
 * Состояние одного камня в определённый момент времени
 */
export interface StoneState {
    index: number;           // Индекс камня (0, 1, 2)
    x: number;               // Позиция X
    y: number;               // Позиция Y
    vx: number;              // Скорость X
    vy: number;              // Скорость Y
    isOut: boolean;          // Вылетел ли за пределы
    radius: number;          // Радиус камня
}

/**
 * Точка на траверзе камня (ортогональная проекция камня на траекторию)
 */
export interface TraversePoint {
    point: Point;            // Точка на траектории
    distance: number;        // Расстояние от камня до траектории
    t: number;               // Параметр вдоль траектории (время)
}

// ============================================================
// ТИПЫ СОБЫТИЙ
// ============================================================

/**
 * Типы событий в симуляции
 */
export type EventType = 
    | 'SHOT'           // Удар битка
    | 'COLLISION'      // Столкновение двух камней
    | 'OUT'            // Вылет камня за пределы
    | 'CLEAN_PASS'     // Чистый проход через створ
    | 'GOAL'           // Пересечение линии ворот
    | 'STOP';          // Полная остановка всех камней

/**
 * Данные удара битка
 */
export interface ShotData {
    strikerIndex: number;    // Какой камень бил (0, 1, 2)
    force: number;           // Сила удара
    angle: number;           // Угол удара (радианы)
    playerIndex: number;     // Кто бил (1 = игрок, 2 = бот)
}

/**
 * Данные столкновения
 */
export interface CollisionData {
    stone1Index: number;     // Первый камень
    stone2Index: number;     // Второй камень
    collisionPoint: Point;   // Точка столкновения
    impulse: number;         // Сила удара (для звука)
}

/**
 * Данные вылета за пределы
 */
export interface OutData {
    stoneIndex: number;      // Какой камень вылетел
    boundary: 'left' | 'right' | 'top' | 'bottom'; // Через какую границу
}

/**
 * Данные чистого прохода
 */

export interface CleanPassData {
    strikerIndex: number;        // Какой камень прошёл
    gateIntersection: Point;     // Точка пересечения створа
    distanceToA: number;         // Расстояние от точки пересечения до камня A
    distanceToB: number;         // Расстояние от точки пересечения до камня B
    minClearance: number;        // Минимальное расстояние до камней
}

/**
 * Данные гола
 */
export interface GoalData {
    strikerIndex: number;    // Какой камень забил
    goalSide: 'left' | 'right'; // В какие ворота
}

/**
 * Данные остановки
 */
export interface StopData {
    finalPositions: Point[]; // Финальные позиции всех камней
}

/**
 * Объединённый тип данных события
 */
export type EventData = 
    | ShotData 
    | CollisionData 
    | OutData 
    | CleanPassData 
    | GoalData 
    | StopData;

// ============================================================
// СТРУКТУРА СОБЫТИЯ
// ============================================================

/**
 * Одно событие в симуляции
 */
export interface SimulationEvent {
    eventType: EventType;        // Тип события
    timeStart: number;           // Время события (от начала хода)
    timeEnd: number;             // Время следующего события
    eventData: EventData;        // Детали события
    stones: StoneState[];        // Состояние камней ПОСЛЕ события
}

// ============================================================
// СТРУКТУРА ХОДА
// ============================================================

/**
 * Флаги состояния игры
 */
export interface GameStateFlags {
    hasPassedThrough: boolean;   // Был ли чистый проход
    isGoalScored: boolean;       // Был ли гол
    hitObstacle: boolean;        // Было ли столкновение
    lastStrikerIndex: number;    // Кто бил последним (-1 если никто)
}

/**
 * Тип результата хода
 */
export type MoveResultType = 'GOAL' | 'FOUL' | 'OUT' | 'CLEAN_PASS' | 'MISS';

/**
 * Результат хода
 */
export interface MoveResult {
    type: MoveResultType;
    scoreChange?: { left: number; right: number };
    nextPlayer: number;          // Кто ходит следующим (1 = игрок, 2 = бот)
}

/**
 * Полная запись хода
 */
export interface MoveRecord {
    // Метаинформация
    moveId: number;              // ID хода (1, 2, 3...)
    playerIndex: number;         // Кто делал ход (1 = игрок, 2 = бот)
    timestamp: number;           // Реальное время хода (для сети)
    
    // События хода
    events: SimulationEvent[];   // Массив всех событий
    
    // Флаги состояния (на момент окончания хода)
    finalState: GameStateFlags;
    
    // Результат хода
    result: MoveResult;
}

// ============================================================
// ВХОДНЫЕ ДАННЫЕ ДЛЯ СИМУЛЯЦИИ
// ============================================================

/**
 * Начальное состояние для симуляции
 */
export interface SimulationInput {
    stones: StoneState[];        // Начальное состояние камней
    move: ShotData;              // Удар битка
}

/**
 * Кандидат на событие (до выбора ближайшего)
 */
export interface CandidateEvent {
    eventType: EventType;
    time: number;                // Время до события
    data: EventData;
}