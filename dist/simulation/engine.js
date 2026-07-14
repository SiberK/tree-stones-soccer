/**
 * src/simulation/engine.ts
 *
 * Главный движок событийно-ориентированной симуляции.
 */
import * as SimMath from "./math.js";
/**
 * Симулирует полный ход и возвращает запись всех событий
 */
export function simulateMove(input, moveId) {
    const events = [];
    let currentTime = 0;
    let stones = input.stones.map(s => (Object.assign({}, s)));
    // Флаги состояния
    let hasPassedThrough = false;
    let isGoalScored = false;
    let hitObstacle = false;
    let lastStrikerIndex = -1;
    // Применяем начальный удар
    const move = input.move;
    const striker = stones[move.strikerIndex];
    striker.vx = Math.cos(move.angle) * move.force;
    striker.vy = Math.sin(move.angle) * move.force;
    lastStrikerIndex = move.strikerIndex;
    events.push({
        eventType: 'SHOT',
        timeStart: 0,
        timeEnd: 0, // Будет заполнено позже
        eventData: move,
        stones: stones.map(s => (Object.assign({}, s)))
    });
    // Главный цикл симуляции
    while (true) {
        const candidates = [];
        // 1. Столкновения между всеми парами камней
        for (let i = 0; i < stones.length; i++) {
            for (let j = i + 1; j < stones.length; j++) {
                if (!stones[i].isOut && !stones[j].isOut) {
                    const collisionTime = SimMath.calculateCollisionTime(stones[i], stones[j]);
                    if (collisionTime !== null) {
                        candidates.push({
                            eventType: 'COLLISION',
                            time: collisionTime,
                            data: {
                                stone1Index: i,
                                stone2Index: j,
                                collisionPoint: { x: 0, y: 0 },
                                impulse: 0
                            }
                        });
                    }
                }
            }
        }
        // 2. Вылеты за границы
        for (let i = 0; i < stones.length; i++) {
            if (!stones[i].isOut) {
                const outResult = SimMath.calculateOutTime(stones[i]);
                if (outResult) {
                    candidates.push({
                        eventType: 'OUT',
                        time: outResult.time,
                        data: {
                            stoneIndex: i,
                            boundary: outResult.boundary
                        }
                    });
                }
            }
        }
        // 3. Чистый проход (только в первой итерации)
        if (move.strikerIndex !== -1 && !hasPassedThrough && events.length === 1) {
            const striker = stones[move.strikerIndex];
            const others = stones.filter((_, idx) => idx !== move.strikerIndex && !_.isOut);
            if (others.length === 2) {
                const passResult = SimMath.checkCleanPass(striker, others[0], others[1]);
                if (passResult) {
                    candidates.push({
                        eventType: 'CLEAN_PASS',
                        time: passResult.time,
                        data: {
                            strikerIndex: move.strikerIndex,
                            gateIntersection: passResult.gateIntersection,
                            distanceToA: passResult.distanceToA,
                            distanceToB: passResult.distanceToB,
                            minClearance: passResult.minClearance
                        }
                    });
                }
            }
        }
        // 4. Пересечение ворот (проверяем в каждой итерации)
        if (move.strikerIndex !== -1 && !isGoalScored) {
            const striker = stones[move.strikerIndex];
            const skipGateCheck = events.length > 1;
            const goalResult = SimMath.checkGoal(striker, stones, skipGateCheck);
            if (goalResult) {
                candidates.push({
                    eventType: 'GOAL',
                    time: goalResult.time,
                    data: {
                        strikerIndex: move.strikerIndex,
                        goalSide: goalResult.goalSide
                    }
                });
            }
        }
        // 5. Полная остановка
        let maxStopTime = 0;
        for (const stone of stones) {
            if (!stone.isOut) {
                const stopTime = SimMath.stopTime(stone.vx, stone.vy);
                maxStopTime = Math.max(maxStopTime, stopTime);
            }
        }
        candidates.push({
            eventType: 'STOP',
            time: maxStopTime,
            data: {
                finalPositions: stones.map(s => ({ x: s.x, y: s.y }))
            }
        });
        // Выбираем ближайшее событие
        if (candidates.length === 0)
            break;
        const validCandidates = candidates.filter(c => {
            if (c.eventType === 'STOP')
                return true;
            return c.time > 0.1;
        });
        if (validCandidates.length === 0) {
            break;
        }
        const nextEvent = validCandidates.reduce((min, e) => e.time < min.time ? e : min);
        // Продвигаем все камни на время события
        currentTime += nextEvent.time;
        for (const stone of stones) {
            if (!stone.isOut) {
                stone.x = SimMath.positionAtTime(stone.x, stone.vx, nextEvent.time);
                stone.y = SimMath.positionAtTime(stone.y, stone.vy, nextEvent.time);
                stone.vx = SimMath.velocityAtTime(stone.vx, nextEvent.time);
                stone.vy = SimMath.velocityAtTime(stone.vy, nextEvent.time);
            }
        }
        // Применяем последствия события
        applyEvent(stones, nextEvent, { hasPassedThrough, isGoalScored, hitObstacle });
        // Обновляем флаги
        if (nextEvent.eventType === 'CLEAN_PASS')
            hasPassedThrough = true;
        if (nextEvent.eventType === 'GOAL')
            isGoalScored = true;
        if (nextEvent.eventType === 'COLLISION')
            hitObstacle = true;
        // Сохраняем событие
        events.push({
            eventType: nextEvent.eventType,
            timeStart: currentTime,
            timeEnd: currentTime,
            eventData: nextEvent.data,
            stones: stones.map(s => (Object.assign({}, s)))
        });
        // Если это остановка — конец симуляции
        if (nextEvent.eventType === 'STOP') {
            break;
        }
    }
    // Обновляем timeEnd для всех событий
    for (let i = 0; i < events.length - 1; i++) {
        events[i].timeEnd = events[i + 1].timeStart;
    }
    // Определяем результат хода
    const result = determineResult(hasPassedThrough, isGoalScored, hitObstacle, input.move.playerIndex);
    return {
        moveId,
        playerIndex: input.move.playerIndex,
        timestamp: Date.now(),
        events,
        finalState: {
            hasPassedThrough,
            isGoalScored,
            hitObstacle,
            lastStrikerIndex
        },
        result
    };
}
/**
 * Применяет последствия события к состоянию камней
 */
function applyEvent(stones, event, flags) {
    switch (event.eventType) {
        case 'COLLISION': {
            const data = event.data;
            const s1 = stones[data.stone1Index];
            const s2 = stones[data.stone2Index];
            // Упругое столкновение (упрощённое)
            const dx = s2.x - s1.x;
            const dy = s2.y - s1.y;
            const dist = Math.hypot(dx, dy);
            const nx = dx / dist;
            const ny = dy / dist;
            const dvx = s1.vx - s2.vx;
            const dvy = s1.vy - s2.vy;
            const dvn = dvx * nx + dvy * ny;
            if (dvn > 0) {
                s1.vx -= dvn * nx;
                s1.vy -= dvn * ny;
                s2.vx += dvn * nx;
                s2.vy += dvn * ny;
            }
            data.collisionPoint = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
            data.impulse = Math.abs(dvn);
            break;
        }
        case 'OUT': {
            const data = event.data;
            stones[data.stoneIndex].isOut = true;
            stones[data.stoneIndex].vx = 0;
            stones[data.stoneIndex].vy = 0;
            break;
        }
        case 'GOAL': {
            // Гол не меняет физику, только флаги
            break;
        }
        case 'CLEAN_PASS': {
            // Чистый проход не меняет физику, только флаги
            break;
        }
        case 'STOP': {
            // Останавливаем все камни
            for (const stone of stones) {
                if (!stone.isOut) {
                    stone.vx = 0;
                    stone.vy = 0;
                }
            }
            break;
        }
    }
}
/**
 * Определяет результат хода
 */
function determineResult(hasPassedThrough, isGoalScored, hitObstacle, playerIndex) {
    if (isGoalScored && !hitObstacle) {
        return { type: 'GOAL', nextPlayer: playerIndex === 1 ? 2 : 1 };
    }
    if (hitObstacle) {
        return { type: 'FOUL', nextPlayer: playerIndex === 1 ? 2 : 1 };
    }
    if (hasPassedThrough) {
        return { type: 'CLEAN_PASS', nextPlayer: playerIndex };
    }
    return { type: 'MISS', nextPlayer: playerIndex === 1 ? 2 : 1 };
}
//# sourceMappingURL=engine.js.map