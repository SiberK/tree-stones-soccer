/**
 * tests/physics.test.ts
 *
 * Тесты чистой кинематики (src/simulation/kinematics.ts). Проверяют свойства
 * связи "сила <-> дистанция": обратимость, граничные значения, монотонность
 * и числовой кейс с актуальными константами игры (FRICTION=0.95, R=28,
 * STOP_THRESHOLD_RATIO=0.02). Модуль чистый (без state/canvas), поэтому
 * запускается в node.
 */

import {
    decayK, stopThreshold, distanceForForce, forceForDistance, spreadAtForce, resolveShotVector
} from "../src/simulation/kinematics.js";


const MAX_FORCE = 30; // из state.ts; литерал, чтобы не тянуть state.ts (а он тянет DOM) в node

declare const process: { exit(code?: number): never };

let passed = 0;
let failed = 0;

function assertClose(actual: number, expected: number, eps: number, msg: string): void {
    const sameSpecial = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));
    if (sameSpecial || Math.abs(actual - expected) <= eps) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL [${msg}]: got ${actual}, expected ${expected} (eps=${eps})`);
    }
}

function assertTrue(cond: boolean, msg: string): void {
    if (cond) { passed++; }
    else { failed++; console.error(`  FAIL [${msg}]: expected true, got false`); }
}

const EPS = 1e-9;
// Актуальные игровые константы (из state.ts) — тестируем на реальных значениях.
const FRICTION = 0.95;
const R = 28;
const RATIO = 0.02; // STOP_THRESHOLD_RATIO

console.log("--- decayK / stopThreshold ---");
assertClose(decayK(FRICTION), -Math.log(FRICTION), EPS, "decayK = -ln(friction)");
assertClose(stopThreshold(R, RATIO), RATIO * R, EPS, "stopThreshold = ratio*R");

console.log("--- граничные значения ---");
assertClose(distanceForForce(stopThreshold(R, RATIO), R, FRICTION, RATIO), 0, EPS, "сила=порог -> дистанция 0");
assertClose(distanceForForce(0, R, FRICTION, RATIO), 0, EPS, "сила 0 -> дистанция 0");
assertClose(forceForDistance(0, R, FRICTION, RATIO), stopThreshold(R, RATIO), EPS, "дистанция 0 -> сила=порог");

console.log("--- обратимость (round-trip) ---");
for (const d of [1, 10, 100, 500, 1000]) {
    const f = forceForDistance(d, R, FRICTION, RATIO);
    const d2 = distanceForForce(f, R, FRICTION, RATIO);
    assertClose(d2, d, 1e-6, `forceForDistance -> distanceForForce, d=${d}`);
}

console.log("--- монотонность ---");
assertTrue(
    forceForDistance(100, R, FRICTION, RATIO) < forceForDistance(200, R, FRICTION, RATIO),
    "больше дистанция -> больше сила"
);
assertTrue(
    distanceForForce(10, R, FRICTION, RATIO) < distanceForForce(20, R, FRICTION, RATIO),
    "больше сила -> больше дистанция"
);

console.log("--- числовой кейс (FRICTION=0.95, R=28, RATIO=0.02) ---");
const K = -Math.log(FRICTION);
const thr = RATIO * R; // 0.56
// force для дистанции 100: 100*K + thr
assertClose(forceForDistance(100, R, FRICTION, RATIO), 100 * K + thr, EPS, "forceForDistance(100)");
// дистанция для силы 5: (5 - thr)/K
assertClose(distanceForForce(5, R, FRICTION, RATIO), (5 - thr) / K, EPS, "distanceForForce(5)");

const SPREAD_FACTOR = 0.1; // spreadFactor из state.ts

console.log("--- spreadAtForce ---");
assertClose(spreadAtForce(MAX_FORCE, MAX_FORCE, 0), 0, EPS, "spreadFactor=0 -> разброс 0 (идеальная точность)");
assertClose(spreadAtForce(0, MAX_FORCE, SPREAD_FACTOR), 0, EPS, "force=0 -> разброс 0");
assertClose(spreadAtForce(MAX_FORCE, MAX_FORCE, SPREAD_FACTOR), SPREAD_FACTOR, EPS, "force=maxForce -> разброс=spreadFactor");
assertClose(spreadAtForce(MAX_FORCE / 2, MAX_FORCE, SPREAD_FACTOR), SPREAD_FACTOR / 4, EPS, "половина силы -> четверть разброса (квадратика)");
assertTrue(
    spreadAtForce(10, MAX_FORCE, SPREAD_FACTOR) < spreadAtForce(20, MAX_FORCE, SPREAD_FACTOR),
    "больше сила -> больше разброс (монотонность)"
);
assertClose(spreadAtForce(15, 30, 0.1), 0.025, EPS, "числовой кейс: (15/30)^2 * 0.1 = 0.025");


console.log("--- resolveShotVector ---");
// точность включена -> разброс нулевой, угол не меняется (детерминированно)
const intent = { force: 20, angle: 1.0 };
const shotAcc = resolveShotVector(intent, { accuracyEnabled: true, spreadFactor: 0.1, maxForce: MAX_FORCE });
assertClose(shotAcc.force, 20, EPS, "сила не меняется");
assertClose(shotAcc.angle, 1.0, EPS, "accuracyEnabled=true -> угол без разброса");

// точность выключена -> угол отклоняется, но в разумных пределах (5 сигм)
const shotSpread = resolveShotVector(intent, { accuracyEnabled: false, spreadFactor: 0.1, maxForce: MAX_FORCE });
const expectedSpread = spreadAtForce(20, MAX_FORCE, 0.1);
assertTrue(
    Math.abs(shotSpread.angle - 1.0) <= 5 * expectedSpread,
    "accuracyEnabled=false -> отклонение в пределах 5 сигм"
);
assertClose(shotSpread.force, 20, EPS, "сила не меняется при разбросе");

console.log(`[TESTS] physics: ${passed} passed, ${failed} failed`);
if (typeof process !== "undefined" && failed > 0) {
    process.exit(1);
}