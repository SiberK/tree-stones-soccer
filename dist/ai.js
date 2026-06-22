/**
 * src/ai.ts
 *
 * Модуль искусственного интеллекта для игры «Футбол в три камня».
 * Реализует тактическое мышление бота с учётом:
 * - Физических ограничений (трение, разброс)
 * - Правил игры (чистый проход, фолы)
 * - Симуляции будущих состояний (оценка на 1-2 хода вперёд)
 * - Квадратичной зависимости разброса от силы удара
 */
import { GameMath } from "./math.js";
import { canvas, GameState, MAX_FORCE, FRICTION, spreadFactor, STONE_RADIUS, STOP_THRESHOLD_RATIO } from "./state.js";
/**
 * Класс AI реализует логику принятия решений ботом.
 * Все методы статические, состояние хранится в GameState.
 */
export class AI {
    /**
     * Главный метод: рассчитывает лучший ход для бота.
     * Перебирает все возможные комбинации (биток + ворота), оценивает их
     * и выбирает оптимальный вариант с учётом будущих ходов.
     *
     * @param stones Массив всех камней на столе
     * @returns Лучший найденный ход или null, если ходов нет
     */
    static calculateMove(stones) {
        // Фильтруем только камни, которые ещё на столе
        const available = stones.filter(s => !s.isOut);
        if (available.length < 3)
            return null;
        let bestMove = null;
        const allConsideredMoves = []; // Для визуализации "мыслей" бота
        // === ГЛОБАЛЬНЫЙ ПЕРЕБОР: каждый камень как потенциальный биток ===
        for (const striker of available) {
            // Остальные два камня образуют "ворота"
            const gates = available.filter(s => s !== striker);
            if (gates.length !== 2)
                continue;
            // Центр "створа" между камнями ворот
            const gateCenter = {
                x: (gates[0].x + gates[1].x) / 2,
                y: (gates[0].y + gates[1].y) / 2
            };
            // 1. Пытаемся забить ГОЛ этим камнем
            const goalShot = this.evaluateGoalShot(striker, gates);
            if (goalShot) {
                allConsideredMoves.push(goalShot);
                if (!bestMove || goalShot.score > bestMove.score) {
                    bestMove = goalShot;
                }
            }
            // 2. Ищем лучшие ТАКТИЧЕСКИЕ ПРОХОДЫ этим камнем
            const tacticalMoves = this.findBestTacticalMoves(striker, gateCenter, gates, available);
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
            const emergencyMove = this.getEmergencyMove(available);
            if (emergencyMove) {
                allConsideredMoves.push(emergencyMove);
                bestMove = emergencyMove;
            }
        }
        // Сохраняем ВСЕ рассмотренные варианты для отрисовки
        GameState.aiConsideredMoves = allConsideredMoves;
        return bestMove;
    }
    /**
     * Оценивает возможность удара на гол выбранным камнем.
     * Гол возможен только если траектория от битка до ворот соперника
     * проходит через створ между двумя другими камнями.
     */
    static evaluateGoalShot(striker, gates) {
        // Цель — центр левых ворот (x=0)
        const target = { x: 0, y: canvas.height / 2 };
        // Проверяем, проходит ли траектория через ворота
        if (!this.isPathClear(striker, target, gates))
            return null;
        // Рассчитываем РЕАЛЬНЫЙ риск столкновения с учётом силы удара
        const angle = Math.atan2(target.y - striker.y, target.x - striker.x);
        const risk = this.calculateCollisionRisk(striker, angle, gates, MAX_FORCE);
        // При большом разбросе ужесточаем требования к голу
        if (risk > 0.4)
            return null;
        // Симулируем точку остановки для визуализации
        const stopPos = this.simulateStopPosition(striker.x, striker.y, angle, MAX_FORCE);
        return {
            stone: striker,
            targetX: target.x,
            targetY: target.y,
            score: 10000, // Максимальный приоритет
            force: MAX_FORCE, // Бьём максимально сильно
            isFinalShot: true,
            risk: risk,
            type: 'GOAL',
            stopX: stopPos.x,
            stopY: stopPos.y
        };
    }
    /**
     * Ищет лучшие тактические проходы: удары, которые продвигают биток
     * к воротам соперника, но не являются голевыми.
     * Генерирует несколько вариантов с разными углами и силами,
     * симулирует будущее положение камня и оценивает его.
     */
    static findBestTacticalMoves(striker, gateCenter, gates, allStones) {
        const moves = [];
        // Генерируем веер углов вокруг направления на центр ворот
        const anglesOffset = [-0.25, -0.15, -0.08, 0, 0.08, 0.15, 0.25];
        // И несколько множителей силы для вариативности
        const forceMultipliers = [0.8, 1.0, 1.2, 1.4];
        const baseDx = gateCenter.x - striker.x;
        const baseDy = gateCenter.y - striker.y;
        const baseAngle = Math.atan2(baseDy, baseDx);
        const distToGate = Math.hypot(baseDx, baseDy);
        for (const angleOff of anglesOffset) {
            const currentAngle = baseAngle + angleOff;
            // Создаём дальнюю точку цели для проверки прохода
            const tempTarget = {
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
                let force = (distToGate * 0.08 + 8) * fMult;
                force = Math.min(MAX_FORCE, Math.max(6, force));
                // === СИМУЛЯЦИЯ БУДУЩЕГО ===
                // Предсказываем, где камень остановится после удара
                const futurePos = this.simulateStopPosition(striker.x, striker.y, currentAngle, force);
                // Оцениваем, насколько хороша эта будущая позиция
                const positionScore = this.evaluateFuturePosition(futurePos, allStones, striker);
                // Рассчитываем РЕАЛЬНЫЙ риск фола при данной силе удара
                const risk = this.calculateCollisionRisk(striker, currentAngle, gates, force);
                // === НОВАЯ ЛОГИКА ОЦЕНКИ ===
                // 1. Квадратичный штраф за риск фола
                // Риск 0.3 → штраф 720, риск 0.5 → 2000, риск 0.8 → 5120
                const riskPenalty = risk * risk * 8000;
                // 2. Квадратичный штраф за избыточную силу
                // Бот предпочитает слабые точные удары сильным неточным
                const forceRatio = force / MAX_FORCE;
                const excessiveForcePenalty = forceRatio * forceRatio * 500;
                // Итоговая оценка: позиция минус штрафы
                const totalScore = positionScore - riskPenalty - excessiveForcePenalty;
                // Разрешаем варианты с небольшим минусом (если альтернатив нет)
                if (totalScore > -1500) {
                    moves.push({
                        stone: striker,
                        targetX: tempTarget.x,
                        targetY: tempTarget.y,
                        score: totalScore,
                        force: force,
                        isFinalShot: false,
                        risk: risk,
                        type: 'PASS',
                        stopX: futurePos.x,
                        stopY: futurePos.y
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
    static isPathClear(striker, target, gates) {
        const bStart = { x: striker.x, y: striker.y };
        const bEnd = { x: target.x, y: target.y };
        // === ПРОВЕРКА 1: Пересекает ли траектория створ ворот? ===
        const gStart = { x: gates[0].x, y: gates[0].y };
        const gEnd = { x: gates[1].x, y: gates[1].y };
        if (!GameMath.checkLineIntersection(bStart, bEnd, gStart, gEnd)) {
            // Траектория не проходит через створ — это промах мимо ворот
            return false;
        }
        // === ПРОВЕРКА 2: Достаточно ли места для пролёта? ===
        const minSafeDist = striker.radius + gates[0].radius + this.SAFETY_MARGIN;
        const dx = bEnd.x - bStart.x;
        const dy = bEnd.y - bStart.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0)
            return false;
        for (const gateStone of gates) {
            // Проекция вектора (striker → gateStone) на вектор удара
            const t = ((gateStone.x - bStart.x) * dx + (gateStone.y - bStart.y) * dy) / lenSq;
            // Если t вне [0, 1], ближайшая точка на линии находится ЗА пределами траектории
            if (t < 0 || t > 1) {
                continue;
            }
            // Вычисляем координаты ближайшей точки на отрезке удара
            const closestX = bStart.x + t * dx;
            const closestY = bStart.y + t * dy;
            // Расстояние от этой точки до центра камня ворот
            const dist = Math.hypot(gateStone.x - closestX, gateStone.y - closestY);
            // Если расстояние меньше безопасного — столкновение неизбежно
            if (dist < minSafeDist) {
                return false;
            }
        }
        return true;
    }
    /**
     * Симулирует движение камня до полной остановки под действием трения.
     * ВАЖНО: использует те же константы, что и реальная физика (stone.ts),
     * чтобы предсказанная точка остановки совпадала с реальной.
     *
     * @param x Начальная координата X
     * @param y Начальная координата Y
     * @param angle Угол удара (радианы)
     * @param force Сила удара
     * @returns Точка остановки
     */
    static simulateStopPosition(x, y, angle, force) {
        let vx = Math.cos(angle) * force;
        let vy = Math.sin(angle) * force;
        let simX = x;
        let simY = y;
        // Порог остановки должен совпадать с тем, что в stone.ts: radius * STOP_THRESHOLD_RATIO
        const stopThreshold = STONE_RADIUS * STOP_THRESHOLD_RATIO;
        // Используем глобальный FRICTION из state.ts
        while (Math.hypot(vx, vy) >= stopThreshold) {
            simX += vx;
            simY += vy;
            vx *= FRICTION;
            vy *= FRICTION;
        }
        return { x: simX, y: simY };
    }
    /**
     * Оценивает будущую позицию камня С УЧЁТОМ СЛЕДУЮЩЕГО ХОДА.
     *
     * Критерии:
     * 1. Камень должен остаться на столе.
     * 2. Чем ближе к воротам соперника, тем лучше.
     * 3. Чем дальше от других камней, тем безопаснее следующий удар.
     * 4. ГЛАВНОЕ: если из этой позиции можно забить гол следующим ударом — огромный бонус!
     */
    static evaluateFuturePosition(pos, allStones, currentStriker) {
        // Штраф за вылет за стол
        if (pos.x < 0 || pos.x > canvas.width || pos.y < 0 || pos.y > canvas.height) {
            return -5000;
        }
        let score = 0;
        // Бонус за продвижение к левым воротам (x=0)
        score += (canvas.width - pos.x) * 3;
        // Остальные камни (те, что не были битком)
        const others = allStones.filter(s => s !== currentStriker);
        // Проверка безопасности относительно других камней
        let minDistToOther = Infinity;
        for (const other of others) {
            const dist = Math.hypot(pos.x - other.x, pos.y - other.y);
            minDistToOther = Math.min(minDistToOther, dist);
        }
        const safeDistance = currentStriker.radius * 4;
        if (minDistToOther < safeDistance) {
            score -= (safeDistance - minDistToOther) * 100;
        }
        else {
            score += 1000;
        }
        // === ГЛАВНОЕ НОВОШЕСТВО: ОЦЕНКА ВОЗМОЖНОСТИ СЛЕДУЮЩЕГО ГОЛА ===
        const nextShotPotential = this.evaluateNextShotPotential(pos, others, currentStriker);
        score += nextShotPotential;
        return score;
    }
    /**
     * Оценивает, насколько хорош будет СЛЕДУЮЩИЙ удар из данной позиции.
     *
     * Логика:
     * - Два других камня образуют "ворота" для следующего удара.
     * - Проверяем, проходит ли линия от новой позиции через эти ворота к створу соперника.
     * - Если проходит и риск низкий — огромный бонус (почти гол в два хода!).
     *
     * @param pos Новая позиция битка после текущего удара
     * @param others Два других камня (они станут "воротами" для следующего удара)
     * @param striker Текущий биток (его радиус нужен для расчётов)
     * @returns Бонус к оценке (может быть очень большим)
     */
    static evaluateNextShotPotential(pos, others, striker) {
        if (others.length !== 2)
            return 0;
        // Создаём "виртуальный камень" в новой позиции для проверки прохода
        const virtualStriker = {
            x: pos.x,
            y: pos.y,
            radius: striker.radius,
        };
        const goalTarget = { x: 0, y: canvas.height / 2 };
        // Проверяем, можно ли из новой позиции пробить через ворота в створ
        const isPathOk = this.isPathClear(virtualStriker, goalTarget, others);
        if (!isPathOk) {
            // Прямой гол из этой позиции невозможен.
            // Оценим тактический потенциал
            return this.evaluateNextTacticalPotential(pos, others, striker);
        }
        // Прямой путь к голу открыт! Оценим риск
        const angle = Math.atan2(goalTarget.y - pos.y, goalTarget.x - pos.x);
        // Для оценки будущего удара предполагаем среднюю силу (70% от максимума)
        const risk = this.calculateCollisionRisk(virtualStriker, angle, others, MAX_FORCE * 0.7);
        if (risk > 0.5) {
            // Путь есть, но слишком рискованный — небольшой бонус
            return 500;
        }
        // ОТЛИЧНО! Из этой позиции можно спокойно забить гол следующим ударом!
        // Чем ниже риск, тем больше бонус
        const bonus = 5000 * (1 - risk);
        return bonus;
    }
    /**
     * Оценивает тактический потенциал следующего удара (если прямой гол невозможен).
     * Проверяет, есть ли из новой позиции хорошие проходы через ворота между камнями.
     */
    static evaluateNextTacticalPotential(pos, others, striker) {
        if (others.length !== 2)
            return 0;
        const virtualStriker = { x: pos.x, y: pos.y, radius: striker.radius };
        // Центр ворот между двумя другими камнями
        const gateCenter = {
            x: (others[0].x + others[1].x) / 2,
            y: (others[0].y + others[1].y) / 2
        };
        // Дальняя точка по направлению от битка через ворота
        const dx = gateCenter.x - pos.x;
        const dy = gateCenter.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0)
            return 0;
        const farTarget = {
            x: pos.x + (dx / dist) * 500,
            y: pos.y + (dy / dist) * 500
        };
        // Проверяем, проходит ли траектория через ворота
        const isPathOk = this.isPathClear(virtualStriker, farTarget, others);
        if (!isPathOk) {
            // Даже тактический проход из этой позиции невозможен — плохо
            return -300;
        }
        // Проход возможен. Оценим его качество
        const angle = Math.atan2(dy, dx);
        const risk = this.calculateCollisionRisk(virtualStriker, angle, others, MAX_FORCE * 0.7);
        // Бонус за возможность сделать хороший тактический ход
        const bonus = 2000 * (1 - risk);
        // Дополнительный бонус, если после этого прохода камень продвинется к воротам
        const futureX = pos.x + (dx / dist) * 150;
        if (futureX < pos.x) {
            return bonus + 500; // Продвижение к воротам
        }
        return bonus;
    }
    /**
     * Рассчитывает РЕАЛЬНЫЙ риск столкновения с учётом силы удара.
     *
     * Чем сильнее удар, тем больше разброс (квадратичная зависимость),
     * и тем выше вероятность, что камень отклонится и заденет ворота.
     *
     * @param striker Бьющий камень
     * @param angle Угол удара
     * @param gates Камни ворот
     * @param force Сила удара (важно для расчёта реального разброса)
     * @returns Вероятность фола (0..1)
     */
    static calculateCollisionRisk(striker, angle, gates, force) {
        // Реальное стандартное отклонение при данной силе (квадратичная зависимость)
        const realSpread = Math.pow((force / MAX_FORCE), 2) * spreadFactor;
        // Преобразуем разброс в "ширину коридора отклонения" на расстоянии до ворот
        const gateCenter = {
            x: (gates[0].x + gates[1].x) / 2,
            y: (gates[0].y + gates[1].y) / 2
        };
        const distToGate = Math.hypot(gateCenter.x - striker.x, gateCenter.y - striker.y);
        // На расстоянии distToGate отклонение составит примерно:
        // deviation = distToGate * tan(spread) ≈ distToGate * spread (для малых углов)
        const deviationAtGate = distToGate * realSpread;
        // Ширина коридора между камнями ворот
        const gateWidth = Math.hypot(gates[1].x - gates[0].x, gates[1].y - gates[0].y);
        // Доступная ширина для пролёта (с учётом радиусов)
        const availableWidth = gateWidth - 2 * (striker.radius + gates[0].radius + this.SAFETY_MARGIN);
        if (availableWidth <= 0) {
            // Коридор слишком узкий даже в идеале
            return 1.0;
        }
        // Риск = отношение "зоны опасности" к доступной ширине
        const risk = Math.min(1.0, deviationAtGate / (availableWidth / 2));
        return risk;
    }
    /**
     * Аварийный ход: используется, когда все умные варианты ведут к фолу или вылету.
     * Просто пинаем ближайший к центру камень в сторону ворот соперника.
     */
    static getEmergencyMove(stones) {
        if (stones.length === 0)
            return null;
        // Выбираем камень, ближайший к центру по вертикали (меньше шанс вылететь)
        const striker = stones.reduce((prev, curr) => Math.abs(curr.y - canvas.height / 2) < Math.abs(prev.y - canvas.height / 2) ? curr : prev);
        const stopPos = this.simulateStopPosition(striker.x, striker.y, Math.atan2(canvas.height / 2 - striker.y, striker.x - 400 - striker.x), 10);
        return {
            stone: striker,
            targetX: striker.x - 400,
            targetY: canvas.height / 2,
            score: -1000,
            force: 10,
            isFinalShot: false,
            risk: 1.0,
            type: 'EMERGENCY',
            stopX: stopPos.x,
            stopY: stopPos.y
        };
    }
    /**
     * Применяет рассчитанный ход с Гауссовым разбросом.
     * Использует квадратичную зависимость разброса от силы удара.
     */
    static executeMove(move) {
        const s = move.stone;
        s.startX = s.x;
        s.startY = s.y;
        const dx = move.targetX - s.x;
        const dy = move.targetY - s.y;
        const angle = Math.atan2(dy, dx);
        // Квадратичная зависимость: при силе 50% разброс будет 25% от spreadFactor
        const spread = Math.pow((move.force / MAX_FORCE), 2) * spreadFactor;
        const finalAngle = GameMath.randomGaussian(angle, spread);
        s.vx = Math.cos(finalAngle) * move.force;
        s.vy = Math.sin(finalAngle) * move.force;
    }
}
/** Запас безопасности при проверке прохода через ворота (px) */
AI.SAFETY_MARGIN = 5;
//# sourceMappingURL=ai.js.map