import { Stone } from "./stone.js";
import { GameState, MAX_FORCE, hitSound } from "./state.js";
import { GameMath } from "./math.js"; // Убедись, что импортирован для clamp

export class GamePhysics {
    private static readonly BOUNCE_COEFFICIENT: number = 0.7;

    public static checkCollisions(stonesArray: Stone[]): void {
        for (let i = 0; i < stonesArray.length; i++) {
            for (let j = i + 1; j < stonesArray.length; j++) {
                const s1 = stonesArray[i];
                const s2 = stonesArray[j];

                if (s1.isOut || s2.isOut) continue;

                const dist = Math.hypot(s1.x - s2.x, s1.y - s2.y);
                const minDist = s1.radius + s2.radius;

                if (dist < minDist && dist > 0) {
                    // === ИСПРАВЛЕНИЕ ФОЛОВ ===
                    // Фол засчитывается, если один из столкнувшихся камней - тот, который был ударен последним
                    // И этот камень все еще движется (или только начал движение)
                    const isS1Striker = s1 === GameState.lastStruckStone;
                    const isS2Striker = s2 === GameState.lastStruckStone;

                    if (isS1Striker || isS2Striker) {
                        // Дополнительно проверяем, что это не стартовая позиция (камни стоят вплотную)
                        // Если скорость хотя бы одного из них заметна, считаем это ударом
                        if (Math.abs(s1.vx) > 0.1 || Math.abs(s1.vy) > 0.1 || 
                            Math.abs(s2.vx) > 0.1 || Math.abs(s2.vy) > 0.1) {
                            GameState.hitObstacle = true;
                        }
                    }

                    // Физика отскока
                    const overlap = minDist - dist;
                    const nx = (s2.x - s1.x) / dist;
                    const ny = (s2.y - s1.y) / dist;

                    s1.x -= nx * overlap * 0.5;
                    s1.y -= ny * overlap * 0.5;
                    s2.x += nx * overlap * 0.5;
                    s2.y += ny * overlap * 0.5;

                    const dvx = s1.vx - s2.vx;
                    const dvy = s1.vy - s2.vy;
                    const vNormal = dvx * nx + dvy * ny;

                    if (vNormal > 0) {
                        const impulse = (1 + this.BOUNCE_COEFFICIENT) * vNormal / 2;
                        
                        s1.vx -= impulse * nx;
                        s1.vy -= impulse * ny;
                        s2.vx += impulse * nx;
                        s2.vy += impulse * ny;

                        try {
                            hitSound.currentTime = 0;
                            hitSound.volume = GameMath.clamp(vNormal / MAX_FORCE, 0.1, 1.0);
                            hitSound.play().catch(() => {});
                        } catch (e) {}
                    }
                }
            }
        }
    }
}