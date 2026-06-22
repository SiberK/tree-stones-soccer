import { Stone } from "../stone.js";
import { Point } from "../math.js";
import { 
    canvas, MAX_FORCE, GameState, alternateStriker, GOAL_WIDTH, GOAL_Y, GOAL_HEIGHT,
    riskPenaltyFactor, forcePenaltyFactor, gatesBlockPenalty, gatesReachPenalty
} from "../state.js";
import { AIMove, MoveEvaluation } from "./types.js";
import { simulateStopPosition } from "./physics.js";
import { isPathClear, calculateCollisionRisk, evaluateFuturePosition, 
	checkLineIntersection, hasReachedGates } from "./evaluation.js";
/**
 * Оценивает возможность удара на гол.
 * 
 * Проверяет ДВА условия:
 * 1. Траектория проходит через ворота между двумя другими камнями
 * 2. Траектория попадает в створ ворот соперника
 * 
 * Целевая точка устанавливается далеко за пределами поля,
 * чтобы линия удара гарантированно пересекла створ ворот.
 */
export function evaluateGoalShot(striker: Stone, gates: Stone[]): AIMove | null {
    // Проверка правила "Чередование битков"
    if (alternateStriker && GameState.lastUsedStriker === striker) {
        return null;
    }

    // === ОПРЕДЕЛЯЕМ ГЕОМЕТРИЮ ВОРОТ СОПЕРНИКА ===
    // Створ ворот — это отрезок на левой стороне поля
    const goalStart: Point = { x: GOAL_WIDTH, y: GOAL_Y };
    const goalEnd: Point = { x: GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT };
    const goalCenter: Point = { x: GOAL_WIDTH, y: GOAL_Y + GOAL_HEIGHT / 2 };

    // === ПРОВЕРКА 1: Проходит ли траектория через ворота между камнями? ===
    // Используем goalCenter как промежуточную цель для проверки isPathClear
    if (!isPathClear(striker, goalCenter, gates)) return null;

    // === ПРОВЕРКА 2: Попадает ли траектория в створ ворот? ===
    // Создаём дальнюю точку цели ЗА пределами поля, чтобы линия гарантированно
    // пересекла створ ворот (если направление правильное)
    const dx = goalCenter.x - striker.x;
    const dy = goalCenter.y - striker.y;
    const dist = Math.hypot(dx, dy);
    
    if (dist === 0) return null; // Камень уже в центре ворот
    
    // Направление от камня к центру ворот
    const dirX = dx / dist;
    const dirY = dy / dist;
    
    // Целевая точка далеко за пределами поля (2000px по направлению удара)
    const farTarget: Point = {
        x: striker.x + dirX * 2000,
        y: striker.y + dirY * 2000
    };

    // Проверяем, пересекает ли линия удара створ ворот
    if (!checkLineIntersection(striker, farTarget, goalStart, goalEnd)) {
        return null; // Траектория не попадает в створ
    }

    // === РАСЧЁТ РИСКА И СОЗДАНИЕ ХОДА ===
    const angle: number = Math.atan2(dy, dx);
    const risk: number = calculateCollisionRisk(striker, angle, gates, MAX_FORCE);

    // При большом разбросе ужесточаем требования к голу
    if (risk > 0.4) return null;

    const stopPos: Point = simulateStopPosition(striker.x, striker.y, angle, MAX_FORCE);

    return {
        stone: striker,
        targetX: farTarget.x,  // Целевая точка далеко за пределами поля
        targetY: farTarget.y,
        score: 10000,
        force: MAX_FORCE,
        isFinalShot: true,
        risk: risk,
        type: 'GOAL',
        stopX: stopPos.x,
        stopY: stopPos.y
    };
}

/**
 * Ищет лучшие тактические проходы.
 * Учитывает ВСЕ варианты, включая те, что не достигают ворот.
 */
export function findBestTacticalMoves(
    striker: Stone, 
    gateCenter: Point, 
    gates: Stone[], 
    allStones: Stone[]
): MoveEvaluation[] {
    // Проверка правила "Чередование битков"
    if (alternateStriker && GameState.lastUsedStriker === striker) {
        return [];
    }

    const evaluations: MoveEvaluation[] = [];

    const anglesOffset: number[] = [-0.3, -0.2, -0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15, 0.2, 0.3];
    const forceRatios: number[] = [0.1, 0.2, 0.4, 0.6, 0.8, 1.0];

    const baseDx: number = gateCenter.x - striker.x;
    const baseDy: number = gateCenter.y - striker.y;
    const baseAngle: number = Math.atan2(baseDy, baseDx);

    for (const angleOff of anglesOffset) {
        const currentAngle: number = baseAngle + angleOff;

        const tempTarget: Point = {
            x: striker.x + Math.cos(currentAngle) * 1000,
            y: striker.y + Math.sin(currentAngle) * 1000
        };

        // === ПРОВЕРКА 1: проходит ли траектория через ворота? ===
        const passesThroughGates = isPathClear(striker, tempTarget, gates);

        for (const ratio of forceRatios) {
            let force: number = MAX_FORCE * ratio;
            force = Math.max(6, force);

            const futurePos: Point = simulateStopPosition(
                striker.x, striker.y, currentAngle, force
            );

            // === ПРОВЕРКА 2: достигает ли камень линии ворот? ===
            const reachesGates = hasReachedGates(striker, futurePos, gates);

            const positionScore: number = evaluateFuturePosition(futurePos, allStones, striker);
            const risk: number = calculateCollisionRisk(striker, currentAngle, gates, force);

            const riskPenalty: number = risk * risk * riskPenaltyFactor; // Было 4000
            const forceRatio: number = force / MAX_FORCE;
            const excessiveForcePenalty: number = forceRatio * forceRatio * forcePenaltyFactor; // Было 300
			
            // === ШТРАФЫ ЗА БЛОКИРОВКУ ===
            let gatesPenalty = 0;
            let blockedByGates = false;
            
            if (!passesThroughGates) {
                gatesPenalty = gatesBlockPenalty; // Используем переменную из state
                blockedByGates = true;
            } else if (!reachesGates) {
                gatesPenalty = gatesReachPenalty; // Используем переменную из state
                blockedByGates = true;
            }

            const totalScore: number = positionScore - riskPenalty - excessiveForcePenalty - gatesPenalty;

            const move: AIMove = {
                stone: striker,
                targetX: tempTarget.x,
                targetY: tempTarget.y,
                score: totalScore,
                force: force,
                isFinalShot: false,
                risk: risk,
                type: 'PASS',
                stopX: futurePos.x,
                stopY: futurePos.y,
                blockedByGates: blockedByGates
            };

            const rejected = totalScore < -2000 || blockedByGates;

            evaluations.push({
                move,
                positionScore,
                riskPenalty,
                forcePenalty: excessiveForcePenalty,
                totalScore,
                rejected,
                rejectReason: blockedByGates 
                    ? (!reachesGates ? "Не достигает ворот" : "Не проходит через ворота")
                    : (rejected ? `Score ${totalScore.toFixed(0)} < -2000` : undefined),
                blockedByGates
            });
        }
    }

    return evaluations;
}

/**
 * Аварийный ход.
 */
export function getEmergencyMove(stones: Stone[]): AIMove | null {
    // Фильтруем запрещённые камни
    const available = alternateStriker 
        ? stones.filter(s => s !== GameState.lastUsedStriker)
        : stones;
    
    if (available.length === 0) return null;

    const striker: Stone = available.reduce((prev, curr) =>
        Math.abs(curr.y - canvas.height / 2) < Math.abs(prev.y - canvas.height / 2) ? curr : prev
    );

    const stopPos: Point = simulateStopPosition(
        striker.x, striker.y, 
        Math.atan2(canvas.height / 2 - striker.y, striker.x - 400 - striker.x), 
        10
    );

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