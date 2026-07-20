/**
 * src/simulation/kinematics.ts
 *
 * Чистая кинематика: связь "сила <-> дистанция остановки" при экспоненциальном
 * трении. ЕДИНЫЙ источник этой формулы для AI (strategy.ts, goal.ts); согласована
 * с симулятором (simulation/math.ts: stopDistance/stopTime), потому что использует
 * ту же модель и ту же константу порога остановки (STOP_THRESHOLD_RATIO из state,
 * передаётся вызывающим кодом явно).
 *
 * Модуль НАМЕРЕННО не импортирует state.ts (и ничего с DOM/canvas), чтобы его
 * можно было тестировать в node без браузера (см. tests/physics.test.ts).
 * Поэтому friction и thresholdRatio передаются явно.
 *
 * Модель: v(t) = v0 * e^(-K*t), K = -ln(friction); останов при v <= thr,
 * thr = thresholdRatio * radius. Дистанция остановки: dMax = (force - thr) / K,
 * где force = начальная скорость (в AI сила численно равна speed).
 */
import { GameMath } from "../math.js";

/** Вектор намерения удара: сила (= начальная скорость) и угол. */
export interface ShotIntent {
    force: number;
    angle: number;
}

/** Факторы точности исполнения удара. */
export interface ShotFactors {
    accuracyEnabled: boolean;
    spreadFactor: number;
    maxForce: number;
}

/** Результат применения физики неточности: итоговый вектор + величина разброса. */
export interface ShotResult {
    force: number;
    angle: number;
    spread: number; // стандартное отклонение разброса (для отладки/лога)
}

/**
 * Применяет физику неточности к вектору намерения удара.
 * ЕДИНЫЙ алгоритм для игрока (input.ts) и бота (aiTurn.ts): при изменении
 * физики разброса (например, зависимость от массы битка в будущем) правка
 * вносится здесь — и у игрока, и у бота меняется одинаково.
 */
export function resolveShotVector(intent: ShotIntent, factors: ShotFactors): ShotResult {
    const spreadValue = factors.accuracyEnabled ? 0 : factors.spreadFactor;
    const spread = spreadAtForce(intent.force, factors.maxForce, spreadValue);
    const finalAngle = GameMath.randomGaussian(intent.angle, spread);
    return { force: intent.force, angle: finalAngle, spread };
}

/** Коэффициент затухания: dMax = (force - thr) / K. */
export function decayK(friction: number): number {
    return -Math.log(friction);
}

/** Порог остановки скорости (та же константа, что в симуляторе). */
export function stopThreshold(radius: number, thresholdRatio: number): number {
    return thresholdRatio * radius;
}

/**
 * Дистанция, на которой остановится биток при данной силе.
 * Обратна к forceForDistance. Согласована со stopDistance в simulation/math.ts.
 */
export function distanceForForce(
    force: number, radius: number, friction: number, thresholdRatio: number
): number {
    const thr = stopThreshold(radius, thresholdRatio);
    if (force <= thr) return 0; // guard как в stopDistance: сила ниже порога -> не едет
    return (force - thr) / decayK(friction);
}

/**
 * Сила, нужная чтобы биток остановился на данной дистанции.
 * Обратна к distanceForForce.
 */
export function forceForDistance(
    distance: number, radius: number, friction: number, thresholdRatio: number
): number {
    return distance * decayK(friction) + stopThreshold(radius, thresholdRatio);
}

/**
 * Угловой разброс (стандартное отклонение, в радианах) для удара данной силы.
 * Это ФИЗИЧЕСКАЯ модель неточности исполнения удара (часть симуляции), а не
 * стратегия AI: симулятор применяет этот разброс к углу при исполнении удара
 * (aiTurn.ts), а AI учитывает его в прогнозах (goal.ts) — по одной и той же
 * формуле, т.е. прогноз и реальность не расходятся.
 *
 * Зависимость квадратичная: сильный удар разбрасывает сильнее.
 * spread = (force / maxForce)^2 * spreadFactor.
 *
 * НА БУДУЩЕЕ: если физика усложнится (масса битка, упругость), разброс может
 * стать зависимым от массы — расширим сигнатуру (или введём объект параметров),
 * сохранив чистоту модуля и единство формулы для AI и симулятора.
 */
export function spreadAtForce(force: number, maxForce: number, spreadFactor: number): number {
    return Math.pow(force / maxForce, 2) * spreadFactor;
}
