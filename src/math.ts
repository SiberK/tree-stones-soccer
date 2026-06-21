export interface Point { 
    x: number; 
    y: number; 
}

export interface Vector2 {
    x: number;
    y: number;
}

export class GameMath {
    /**
     * Генерация случайного числа по нормальному распределению (Гаусс)
     * Использует метод Бокса-Мюллера
     */
    public static randomGaussian(mean: number, stdDev: number): number {
        let u1 = 1 - Math.random();
        let u2 = 1 - Math.random();
        let randStdNormal = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
        return mean + randStdNormal * stdDev;
    }

    /**
     * Проверка пересечения двух отрезков
     * Возвращает true, если отрезки пересекаются строго внутри (не в концах)
     */
    public static checkLineIntersection(a: Point, b: Point, c: Point, d: Point): boolean {
        const det = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
        if (Math.abs(det) < 1e-10) return false; // Параллельные линии

        const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
        const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;

        // Строгое пересечение внутри отрезков (0 < t < 1)
        return (lambda > 0 && lambda < 1) && (gamma > 0 && gamma < 1);
    }

    /**
     * Расстояние между двумя точками
     */
    public static distance(p1: Point, p2: Point): number {
        return Math.hypot(p2.x - p1.x, p2.y - p1.y);
    }

    /**
     * Нормализация вектора
     */
    public static normalize(v: Vector2): Vector2 {
        const len = Math.hypot(v.x, v.y);
        if (len === 0) return { x: 0, y: 0 };
        return { x: v.x / len, y: v.y / len };
    }

    /**
     * Скалярное произведение векторов
     */
    public static dotProduct(v1: Vector2, v2: Vector2): number {
        return v1.x * v2.x + v1.y * v2.y;
    }

    /**
     * Ограничение значения в диапазоне [min, max]
     */
    public static clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }
}