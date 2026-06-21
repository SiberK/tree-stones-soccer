/**
 * src/ai.ts
 * 
 * Модуль искусственного интеллекта для игры «Футбол в три камня».
 * Реализует тактическое мышление бота с учётом физических ограничений,
 * правил игры и симуляции будущих состояний.
 */

import { Stone } from "./stone.js";
import { GameMath, Point } from "./math.js";
import { GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, canvas, GameState, spreadFactor } from "./state.js";

/**
 * Интерфейс описывает один рассчитанный вариант хода.
 */
interface AIMove {
    stone: Stone;           // Какой камень будем бить (биток)
    targetX: number;        // Целевая координата X (для визуализации и расчёта угла)
    targetY: number;        // Целевая координата Y
    score: number;          // Итоговая оценка полезности хода
    force: number;          // Сила удара (0..MAX_FORCE)
    isFinalShot: boolean;   // Это удар на гол?
    risk: number;           // Риск фола (0..1, где 1 — гарантированный фол)
    type: 'GOAL' | 'PASS' | 'EMERGENCY'; // Тип хода для визуализации
}

/**
 * Класс AI реализует логику принятия решений ботом.
 * Все методы статические, состояние хранится в GameState.
 */
export class AI {
    // === ФИЗИЧЕСКИЕ КОНСТАНТЫ ===
    private static readonly MAX_FORCE: number = 15;       // Максимальная сила удара
    private static readonly MIN_FORCE: number = 6;        // Минимальная сила удара
    private static readonly FRICTION_SIM: number = 0.98;  // Коэффициент трения для симуляции
    private static readonly SAFETY_MARGIN: number = 5;    // Запас безопасности при проверке прохода (px)

    /**
     * Главный метод: рассчитывает лучший ход для бота.
     * Перебирает все возможные комбинации (биток + ворота), оценивает их
     * и выбирает оптимальный вариант.
     * 
     * @param stones Массив всех камней на столе
     * @returns Лучший найденный ход или null, если ходов нет
     */
    public static calculateMove(stones: Stone[]): AIMove | null {
        // Фильтруем только камни, которые ещё на столе
        const available: Stone[] = stones.filter(s => !s.isOut);
        if (available.length < 3) return null;

        let bestMove: AIMove | null = null;
        const allConsideredMoves: AIMove[] = []; // Для визуализации "мыслей" бота

        // === ГЛОБАЛЬНЫЙ ПЕРЕБОР: каждый камень как потенциальный биток ===
        for (const striker of available) {
            // Остальные два камня образуют "ворота"
            const gates: Stone[] = available.filter(s => s !== striker);
            if (gates.length !== 2) continue;

            // Центр "створа" между камнями ворот
            const gateCenter: Point = {
                x: (gates[0].x + gates[1].x) / 2,
                y: (gates[0].y + gates[1].y) / 2
            };

            // 1. Пытаемся забить ГОЛ этим камнем
            const goalShot: AIMove | null = this.evaluateGoalShot(striker, gates);
            if (goalShot) {
                allConsideredMoves.push(goalShot);
                if (!bestMove || goalShot.score > bestMove.score) {
                    bestMove = goalShot;
                }
            }

            // 2. Ищем лучшие ТАКТИЧЕСКИЕ ПРОХОДЫ этим камнем
            const tacticalMoves: AIMove[] = this.findBestTacticalMoves(striker, gateCenter, gates, available);
            for (const move of tacticalMoves) {
                allConsideredMoves.push(move);
                if (!bestMove || move.score > bestMove.score) {
                    bestMove = move;
                }
            }
        }

        // === АВАРИЙНЫЙ РЕЖИМ ===
        // Если ни один умный ход не набрал положительную оценку,
        // просто пинаем любой камень в сторону ворот соперника.
        if (!bestMove) {
            console.warn("AI: Нет подходящих ходов. Переход в аварийный режим.");
            const emergencyMove: AIMove | null = this.getEmergencyMove(available);
            if (emergencyMove) {
                allConsideredMoves.push(emergencyMove);
                bestMove = emergencyMove;
            }
        }

        // Сохраняем ВСЕ рассмотренные варианты для отрисовки на экране
        GameState.aiConsideredMoves = allConsideredMoves;

        return bestMove;
    }

    /**
     * Оценивает возможность удара на гол выбранным камнем.
     * Гол возможен только если траектория от битка до ворот соперника
     * проходит через створ между двумя другими камнями.
     */
    private static evaluateGoalShot(striker: Stone, gates: Stone[]): AIMove | null {
        // Цель — центр левых ворот (x=0)
        const target: Point = { x: 0, y: canvas.height / 2 };

        // Проверяем, проходит ли траектория через ворота
        if (!this.isPathClear(striker, target, gates)) return null;

        // Рассчитываем риск столкновения с камнями ворот
        const angle: number = Math.atan2(target.y - striker.y, target.x - striker.x);
        const risk: number = this.calculateCollisionRisk(striker, angle, gates);

        // Для гола допускаем чуть больший риск (приз слишком велик)
        if (risk > 0.5) return null;

        return {
            stone: striker,
            targetX: target.x,
            targetY: target.y,
            score: 10000,           // Максимальный приоритет
            force: this.MAX_FORCE,  // Бьём максимально сильно
            isFinalShot: true,
            risk: risk,
            type: 'GOAL'
        };
    }

    /**
     * Ищет лучшие тактические проходы: удары, которые продвигают биток
     * к воротам соперника, но не являются голевыми.
     * Генерирует несколько вариантов с разными углами и силами,
     * симулирует будущее положение камня и оценивает его.
     */
    private static findBestTacticalMoves(
        striker: Stone, 
        gateCenter: Point, 
        gates: Stone[], 
        allStones: Stone[]
    ): AIMove[] {
        const moves: AIMove[] = [];

        // Генерируем веер углов вокруг направления на центр ворот
        const anglesOffset: number[] = [-0.25, -0.15, -0.08, 0, 0.08, 0.15, 0.25];
        // И несколько множителей силы для вариативности
        const forceMultipliers: number[] = [0.8, 1.0, 1.2, 1.4];

        const baseDx: number = gateCenter.x - striker.x;
        const baseDy: number = gateCenter.y - striker.y;
        const baseAngle: number = Math.atan2(baseDy, baseDx);
        const distToGate: number = Math.hypot(baseDx, baseDy);

        for (const angleOff of anglesOffset) {
            const currentAngle: number = baseAngle + angleOff;

            // Создаём дальнюю точку цели для проверки прохода
            const tempTarget: Point = {
                x: striker.x + Math.cos(currentAngle) * 1000,
                y: striker.y + Math.sin(currentAngle) * 1000
            };

            // КЛЮЧЕВАЯ ПРОВЕРКА: проходит ли траектория через ворота?
            if (!this.isPathClear(striker, tempTarget, gates)) {
                continue; // Этот угол ведёт к фолу — пропускаем
            }

            // Перебираем разные силы удара
            for (const fMult of forceMultipliers) {
                // Базовая сила зависит от расстояния до ворот
                let force: number = (distToGate * 0.08 + 8) * fMult;
                force = Math.min(this.MAX_FORCE, Math.max(this.MIN_FORCE, force));

                // === СИМУЛЯЦИЯ БУДУЩЕГО ===
                // Предсказываем, где камень остановится после удара
                const futurePos: Point = this.simulateStopPosition(
                    striker.x, striker.y, currentAngle, force
                );

                // Оцениваем, насколько хороша эта будущая позиция
                const positionScore: number = this.evaluateFuturePosition(futurePos, allStones, striker);

                // Рассчитываем риск фола при этом угле
                const risk: number = this.calculateCollisionRisk(striker, currentAngle, gates);

                // Итоговая оценка: позиция минус штраф за риск
                const totalScore: number = positionScore - (risk * 4000);

                // Разрешаем варианты с небольшим минусом (если альтернатив нет)
                if (totalScore > -1000) {
                    moves.push({
                        stone: striker,
                        targetX: tempTarget.x,
                        targetY: tempTarget.y,
                        score: totalScore,
                        force: force,
                        isFinalShot: false,
                        risk: risk,
                        type: 'PASS'
                    });
                }
            }
        }

        return moves;
    }

    /**
     * КЛЮЧЕВАЯ ФУНКЦИЯ: проверяет, может ли биток физически пролететь
     * между двумя камнями ворот без столкновения.
     * 
     * Сначала проверяет, проходит ли траектория через створ ворот (отрезок между камнями).
     * Затем проверяет, достаточно ли места для пролёта с учётом радиусов.
     * 
     * @returns true, если проход возможен; false, если будет фол или промах мимо ворот
     */
    private static isPathClear(striker: Stone, target: Point, gates: Stone[]): boolean {
        const bStart: Point = { x: striker.x, y: striker.y };
        const bEnd: Point = { x: target.x, y: target.y };

        // === ПРОВЕРКА 1: Пересекает ли траектория створ ворот? ===
        // Створ — это отрезок между центрами двух камней ворот
        const gStart: Point = { x: gates[0].x, y: gates[0].y };
        const gEnd: Point = { x: gates[1].x, y: gates[1].y };

        if (!GameMath.checkLineIntersection(bStart, bEnd, gStart, gEnd)) {
            // Траектория не проходит через створ — это промах мимо ворот
            return false;
        }

        // === ПРОВЕРКА 2: Достаточно ли места для пролёта? ===
        // Минимальное безопасное расстояние от центра траектории до центра камня ворот
        // = радиус битка + радиус камня ворот + запас
        const minSafeDist: number = striker.radius + gates[0].radius + this.SAFETY_MARGIN;

        // Вектор удара
        const dx: number = bEnd.x - bStart.x;
        const dy: number = bEnd.y - bStart.y;
        const lenSq: number = dx * dx + dy * dy;

        if (lenSq === 0) return false; // Нулевой вектор — нет движения

        for (const gateStone of gates) {
            // Проекция вектора (striker ? gateStone) на вектор удара
            const t: number = ((gateStone.x - bStart.x) * dx + (gateStone.y - bStart.y) * dy) / lenSq;

            // Если t вне [0, 1], ближайшая точка на линии находится ЗА пределами траектории
            if (t < 0 || t > 1) {
                continue;
            }

            // Вычисляем координаты ближайшей точки на отрезке удара
            const closestX: number = bStart.x + t * dx;
            const closestY: number = bStart.y + t * dy;

            // Расстояние от этой точки до центра камня ворот
            const dist: number = Math.hypot(gateStone.x - closestX, gateStone.y - closestY);

            // Если расстояние меньше безопасного — столкновение неизбежно
            if (dist < minSafeDist) {
                return false;
            }
        }

        return true;
    }

    /**
     * Симулирует движение камня до полной остановки под действием трения.
     * Возвращает координаты точки, где камень остановится.
     * 
     * @param x Начальная координата X
     * @param y Начальная координата Y
     * @param angle Угол удара (радианы)
     * @param force Сила удара
     * @returns Точка остановки
     */
    private static simulateStopPosition(x: number, y: number, angle: number, force: number): Point {
        let vx: number = Math.cos(angle) * force;
        let vy: number = Math.sin(angle) * force;
        let simX: number = x;
        let simY: number = y;

        // Итеративно применяем трение, пока скорость не станет ничтожной
        while (Math.hypot(vx, vy) > 0.5) {
            simX += vx;
            simY += vy;
            vx *= this.FRICTION_SIM;
            vy *= this.FRICTION_SIM;
        }

        return { x: simX, y: simY };
    }

    /**
     * Оценивает, насколько хороша будущая позиция камня для следующего удара.
     * 
     * Критерии:
     * - Бонус за продвижение к воротам соперника (x=0)
     * - Бонус за свободное пространство вокруг (безопасность следующего удара)
     * - Штраф за вылет за стол
     * - Штраф за тесноту (близость к другим камням)
     */
    private static evaluateFuturePosition(pos: Point, allStones: Stone[], currentStriker: Stone): number {
        // Штраф за вылет за стол
        if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) {
            return -5000;
        }

        let score: number = 0;

        // Бонус за продвижение к левым воротам (x=0)
        // Чем левее окажется камень, тем ближе он к голу
        score += (canvas.width - pos.x) * 3;

        // Проверяем безопасность относительно других камней
        const others: Stone[] = allStones.filter(s => s !== currentStriker);
        let minDistToOther: number = Infinity;

        for (const other of others) {
            const dist: number = Math.hypot(pos.x - other.x, pos.y - other.y);
            minDistToOther = Math.min(minDistToOther, dist);
        }

        // Оценка свободного пространства
        const safeDistance: number = currentStriker.radius * 4; // ~112 px
        
        if (minDistToOther < safeDistance) {
            // Камень остановится в тесноте — следующий удар будет рискованным
            score -= (safeDistance - minDistToOther) * 100;
        } else {
            // Отличная позиция: много свободного места для манёвра
            score += 1000;
        }

        return score;
    }

    /**
     * Рассчитывает риск столкновения битка с камнями ворот при заданном угле удара.
     * Возвращает значение от 0 (нет риска) до 1 (гарантированный фол).
     */
    private static calculateCollisionRisk(striker: Stone, angle: number, gates: Stone[]): number {
        // Берём точку далеко по направлению удара для расчёта расстояния
        const target: Point = {
            x: striker.x + Math.cos(angle) * 200,
            y: striker.y + Math.sin(angle) * 200
        };

        let maxRisk: number = 0;

        for (const gateStone of gates) {
            // Расстояние от центра камня ворот до линии удара
            const dist: number = this.pointToSegmentDist(gateStone, striker, target);
            
            // Безопасное расстояние: сумма радиусов + запас
            const safeDist: number = striker.radius + gateStone.radius + 15;

            if (dist < safeDist) {
                // Чем ближе траектория к камню, тем выше риск
                const risk: number = 1 - (dist / safeDist);
                maxRisk = Math.max(maxRisk, risk);
            }
        }

        return maxRisk;
    }

    /**
     * Вычисляет кратчайшее расстояние от точки до ОТРЕЗКА (не бесконечной линии).
     * Это важно для корректной оценки риска, когда камень находится сбоку от траектории.
     */
    private static pointToSegmentDist(p: Stone, l1: Stone, l2: Point): number {
        const A: number = p.x - l1.x;
        const B: number = p.y - l1.y;
        const C: number = l2.x - l1.x;
        const D: number = l2.y - l1.y;

        const dot: number = A * C + B * D;
        const lenSq: number = C * C + D * D;

        // Параметр проекции точки на линию
        let param: number = lenSq !== 0 ? dot / lenSq : -1;

        // Ограничиваем параметр диапазоном [0, 1] — это и есть отрезок
        param = Math.max(0, Math.min(1, param));

        // Координаты ближайшей точки на отрезке
        const xx: number = l1.x + param * C;
        const yy: number = l1.y + param * D;

        return Math.hypot(p.x - xx, p.y - yy);
    }

    /**
     * Аварийный ход: используется, когда все умные варианты ведут к фолу или вылету.
     * Просто пинаем ближайший к центру камень в сторону ворот соперника.
     */
    private static getEmergencyMove(stones: Stone[]): AIMove | null {
        if (stones.length === 0) return null;

        // Выбираем камень, ближайший к центру по вертикали (меньше шанс вылететь)
        const striker: Stone = stones.reduce((prev, curr) =>
            Math.abs(curr.y - canvas.height / 2) < Math.abs(prev.y - canvas.height / 2) ? curr : prev
        );

        return {
            stone: striker,
            targetX: striker.x - 400, // Бьём сильно влево
            targetY: canvas.height / 2,
            score: -1000,             // Низкая оценка, но лучше, чем ничего
            force: 10,                // Средняя сила
            isFinalShot: false,
            risk: 1.0,                // Мы знаем, что риск высок
            type: 'EMERGENCY'
        };
    }

    /**
     * Применяет рассчитанный ход: задаёт камню скорость с учётом Гауссова разброса.
     * Разброс имитирует неточность "прицела" бота.
     */
    public static executeMove(move: AIMove): void {
        const s: Stone = move.stone;

        // Запоминаем стартовую позицию для расчёта траектории
        s.startX = s.x;
        s.startY = s.y;

        // Базовый угол удара
        const dx: number = move.targetX - s.x;
        const dy: number = move.targetY - s.y;
        const angle: number = Math.atan2(dy, dx);

        // Применяем Гауссово отклонение (чем сильнее удар, тем больше разброс)
        const spread: number = (move.force / this.MAX_FORCE) * spreadFactor;
        const finalAngle: number = GameMath.randomGaussian(angle, spread);

        // Задаём скорость
        s.vx = Math.cos(finalAngle) * move.force;
        s.vy = Math.sin(finalAngle) * move.force;
    }
}