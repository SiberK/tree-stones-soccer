/**
 * tests/geometry.test.ts
 *
 * Первый тестовый набор проекта. Проверяет УЖЕ вынесенные чистые функции
 * из src/ai/geometry.ts — ту самую угловую арифметику, на которой держится
 * детекция гола и построение коридоров, и которую мы СОБИРАЕМСЯ в будущем
 * реорганизовать. Реорганизация пойдёт ТОЛЬКО когда эти тесты зелёные и
 * остаются зелёными после правки — это и есть страховка от регресса ±180°.
 *
 * ВАЖНО про angleRangeWidth: функция НЕ симметрична. Она возвращает ширину
 * дуги при обходе ОТ min К max в сторону возрастания угла (против часовой в
 * нашей системе). Поэтому angleRangeWidth(a, b) и angleRangeWidth(b, a) в
 * общем случае ДАЮТ РАЗНЫЕ результаты (короткий и длинный путь по кругу).
 * Это НЕ баг — на этом контракте построен buildFreeCorridor и генерация углов
 * в strategy (там порядок min/max подобран так, что возвращается короткий путь).
 * Тесты ниже фиксируют этот контракт явно, чтобы будущая «чистка углов» его
 * не сломала по незнанию.
 *
 * Безопасность: файл лежит в tests/ (вне графа импортов игры) и не выполняется
 * в браузере. Финал обёрнут в guard по typeof process, поэтому даже при
 * случайном попадании в браузерную сборку он не вызовет process.exit.
 * Никаких зависимостей от node:assert / фреймворков — самописный assert,
 * читается как обычный C-assert.
 */

import {
    normalizeAngle,
    angleRangeWidth,
    isAngleInRange,
    distanceToBoundary,
    rayToSegmentDistance
} from "../src/ai/geometry.js";
// Объявление Node-глобала process ТОЛЬКО для типов (аналог extern в C):
// компилятор узнаёт сигнатуру process.exit, но в собранный .js эта строка
// НЕ попадёт, поэтому рантайм-guard `typeof process` ниже работает как прежде.
// Тип never у exit = «функция не возвращается» (как _Noreturn в C11).
declare const process: { exit(code?: number): never };

// ------------------------------------------------------------
// Мини-раннер (без зависимостей)
// ------------------------------------------------------------
let passed = 0;
let failed = 0;

function assertClose(actual: number, expected: number, eps: number, msg: string): void {
    // Специальные значения сравниваем НЕ через разность: Infinity - Infinity = NaN
    // по IEEE 754, и NaN <= eps всегда false. Поэтому сначала прямое равенство
    // (ловит +Inf==+Inf и -Inf==-Inf) и отдельная проверка пары NaN.
    const sameSpecial = actual === expected || (Number.isNaN(actual) && Number.isNaN(expected));
    if (sameSpecial || Math.abs(actual - expected) <= eps) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL [${msg}]: got ${actual}, expected ${expected} (eps=${eps})`);
    }
}

function assertTrue(cond: boolean, msg: string): void {
    if (cond) {
        passed++;
    } else {
        failed++;
        console.error(`  FAIL [${msg}]: expected true, got false`);
    }
}

function assertFalse(cond: boolean, msg: string): void {
    assertTrue(!cond, msg + " (expected false)");
}

const EPS = 1e-6;
const deg = (d: number): number => (d * Math.PI) / 180;
const group = (name: string): void => console.log(`--- ${name} ---`);

// ------------------------------------------------------------
// normalizeAngle: свёртка в [-π, π]
// ------------------------------------------------------------
group("normalizeAngle");
assertClose(normalizeAngle(0), 0, EPS, "0 остаётся 0");
assertClose(normalizeAngle(Math.PI), Math.PI, EPS, "π остаётся π");
assertClose(normalizeAngle(-Math.PI), -Math.PI, EPS, "-π остаётся -π");
assertClose(normalizeAngle(3 * Math.PI), Math.PI, EPS, "3π -> π");
assertClose(normalizeAngle(2 * Math.PI), 0, EPS, "2π -> 0");
assertClose(normalizeAngle(Math.PI + 0.1), -Math.PI + 0.1, EPS, "чуть больше π -> чуть меньше -π (wrap)");
assertClose(normalizeAngle(-Math.PI - 0.1), Math.PI - 0.1, EPS, "чуть меньше -π -> чуть больше π (wrap)");

// ------------------------------------------------------------
// angleRangeWidth: НАПРАВЛЕННАЯ ширина дуги (контракт несимметричности!)
// ------------------------------------------------------------
group("angleRangeWidth");
assertClose(angleRangeWidth(0, Math.PI / 2), Math.PI / 2, EPS, "0..90° = 90°");
// Несимметричность: обратный порядок даёт ДОПОЛНЕНИЕ до 360°, а не тот же результат.
assertClose(angleRangeWidth(Math.PI / 2, 0), 3 * Math.PI / 2, EPS, "90°..0 (обратно) = 270°, НЕ 90°");
// Wrap-кейс, который кусал стратегию: биток справа, ворота слева.
assertClose(angleRangeWidth(deg(170), deg(-170)), deg(20), EPS, "[170°,-170°] короткий путь = 20°");
assertClose(angleRangeWidth(deg(-170), deg(170)), deg(340), EPS, "[-170°,170°] обратный порядок = 340° (длинный)");

// ------------------------------------------------------------
// isAngleInRange: попадание угла в диапазон, включая wrap
// ------------------------------------------------------------
group("isAngleInRange");
assertTrue(isAngleInRange(deg(45), deg(0), deg(90)), "45° внутри [0,90]");
assertFalse(isAngleInRange(deg(100), deg(0), deg(90)), "100° вне [0,90]");
// Wrap-коридор вокруг 180° (направление влево): [170°, -170°].
assertTrue(isAngleInRange(deg(180), deg(170), deg(-170)), "180° внутри wrap-коридора [170,-170]");
assertFalse(isAngleInRange(deg(0), deg(170), deg(-170)), "0° вне wrap-коридора [170,-170]");
assertTrue(isAngleInRange(deg(170), deg(170), deg(-170)), "граница 170° включена");
assertTrue(isAngleInRange(deg(-170), deg(170), deg(-170)), "граница -170° включена");

// ------------------------------------------------------------
// distanceToBoundary: дистанция до края поля вдоль луча
// ------------------------------------------------------------
group("distanceToBoundary");
const W = 1200, H = 800;
assertClose(distanceToBoundary(600, 400, 1, 0, W, H), 600, EPS, "из центра вправо -> 600");
assertClose(distanceToBoundary(600, 400, -1, 0, W, H), 600, EPS, "из центра влево -> 600");
assertClose(distanceToBoundary(600, 400, 0, -1, W, H), 400, EPS, "из центра вверх -> 400");
assertClose(distanceToBoundary(600, 400, 0, 1, W, H), 400, EPS, "из центра вниз -> 400");
// Биток УЖЕ на границе, луч наружу: дистанция 0 (вылет мгновенный).
assertClose(distanceToBoundary(0, 400, -1, 0, W, H), 0, EPS, "на левом краю наружу -> 0");

// ------------------------------------------------------------
// rayToSegmentDistance: пересечение луча с отрезком
// ------------------------------------------------------------
group("rayToSegmentDistance");
// Луч вправо из (0,0), вертикальный отрезок на x=5 -> пересечение на t=5.
assertClose(rayToSegmentDistance(0, 0, 1, 0, 5, -1, 5, 1), 5, EPS, "луч вправо пересекает x=5 на t=5");
// Параллельный луч и отрезок -> Infinity.
assertClose(rayToSegmentDistance(0, 0, 1, 0, 2, 1, 4, 1), Infinity, EPS, "параллельный отрезок -> Infinity");
// Пересечение «сзади» луча (t<0) -> Infinity.
assertClose(rayToSegmentDistance(5, 0, 1, 0, 2, -1, 2, 1), Infinity, EPS, "отрезок позади луча -> Infinity");

// ------------------------------------------------------------
// Итог
// ------------------------------------------------------------
console.log(`\n[TESTS] geometry: ${passed} passed, ${failed} failed`);
if (typeof process !== "undefined" && failed > 0) {
    process.exit(1);
}