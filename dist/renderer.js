/**
 * src/renderer.ts
 *
 * Модуль отрисовки игры с оптимизациями:
 * - Кэш фона (текстура + виньетка + счёт)
 * - Кэш камней через спрайты
 * - Встроенный FPS-счётчик
 */
import { ctx, canvas, GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, MAX_FORCE, FORCE_FACTOR, spreadFactor } from "./state.js";
// Текстура стола
const tableTexture = new Image();
tableTexture.src = 'assets/table.jpg';
let tableTextureLoaded = false;
tableTexture.onload = () => {
    tableTextureLoaded = true;
    console.log('✓ Текстура стола загружена:', tableTexture.width, 'x', tableTexture.height);
    invalidateBackgroundCache();
};
tableTexture.onerror = () => {
    console.warn('✗ Не удалось загрузить текстуру стола, используем генеративную');
    tableTextureLoaded = false;
};
function generateTableFallback() {
    const c = document.createElement('canvas');
    c.width = 1200;
    c.height = 800;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, 1200, 800);
    g.addColorStop(0, '#6b4423');
    g.addColorStop(0.5, '#8b5a2b');
    g.addColorStop(1, '#6b4423');
    x.fillStyle = g;
    x.fillRect(0, 0, 1200, 800);
    for (let i = 0; i < 50; i++) {
        x.beginPath();
        x.moveTo(0, Math.random() * 800);
        x.lineTo(1200, Math.random() * 800);
        x.strokeStyle = 'rgba(0,0,0,0.1)';
        x.stroke();
    }
    return c;
}
const tableFallback = generateTableFallback();
let pendingAIMove = null;
export function setPendingAIMove(move) {
    pendingAIMove = move;
}
export function drawGate(x, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.strokeRect(x, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
    ctx.fillStyle = color.replace(')', ', 0.1)').replace('rgb', 'rgba');
    ctx.fillRect(x, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
}
export function drawAimIndicator(stone, targetX, targetY, isPlayer) {
    if (!stone)
        return;
    let dx, dy;
    if (isPlayer) {
        dx = stone.x - GameState.mouseX;
        dy = stone.y - GameState.mouseY;
    }
    else {
        dx = targetX - stone.x;
        dy = targetY - stone.y;
    }
    const dist = Math.hypot(dx, dy);
    if (dist === 0)
        return;
    let force;
    if (isPlayer) {
        const maxPull = MAX_FORCE / FORCE_FACTOR;
        const pull = Math.min(dist, maxPull);
        const ndx = (dx / dist) * pull;
        const ndy = (dy / dist) * pull;
        force = Math.hypot(ndx, ndy) * FORCE_FACTOR;
    }
    else {
        force = pendingAIMove ? pendingAIMove.force : Math.hypot(dx, dy) * 0.1;
    }
    const angle = Math.atan2(dy, dx);
    const spreadValue = spreadFactor;
    const spread = (force / MAX_FORCE) * spreadValue;
    const len = force * 13;
    const col = isPlayer ? "rgba(153, 182, 23, 0.86)" : "rgba(255, 166, 0, 0.86)";
    const scol = isPlayer ? "rgba(153, 182, 23, 0.86)" : "rgba(255, 166, 0, 0.86)";
    ctx.beginPath();
    ctx.moveTo(stone.x, stone.y);
    ctx.arc(stone.x, stone.y, len, angle - spread, angle + spread);
    ctx.lineTo(stone.x, stone.y);
    ctx.fillStyle = scol;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(stone.x, stone.y);
    ctx.lineTo(stone.x + Math.cos(angle) * len, stone.y + Math.sin(angle) * len);
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.stroke();
}
// ============================================================
// КЭШ ФОНА (ОПТИМИЗАЦИЯ)
// ============================================================
let backgroundCache = null;
let lastCacheWidth = 0;
let lastCacheHeight = 0;
let lastTextureState = false;
let lastScoreLeft = -1;
let lastScoreRight = -1;
let lastCurrentPlayer = -1;
/**
 * Сбрасывает кэш фона, чтобы он пересоздался.
 */
function invalidateBackgroundCache() {
    backgroundCache = null;
}
/**
 * Возвращает кэш фона, создавая его при необходимости.
 * Включает: текстуру стола, виньетку, счёт матча.
 * Пересоздаётся только при изменении размера canvas, загрузки текстуры или счёта.
 */
function getBackgroundCache() {
    // Проверяем, нужно ли пересоздать кэш
    const needsRecreate = !backgroundCache ||
        lastCacheWidth !== canvas.width ||
        lastCacheHeight !== canvas.height ||
        lastTextureState !== tableTextureLoaded ||
        lastScoreLeft !== GameState.scoreLeft ||
        lastScoreRight !== GameState.scoreRight ||
        lastCurrentPlayer !== GameState.currentPlayer;
    if (needsRecreate) {
        backgroundCache = document.createElement('canvas');
        backgroundCache.width = canvas.width;
        backgroundCache.height = canvas.height;
        const bgCtx = backgroundCache.getContext('2d');
        // 1. Текстура стола
        if (tableTextureLoaded && tableTexture.complete && tableTexture.naturalWidth > 0) {
            bgCtx.drawImage(tableTexture, 0, 0, canvas.width, canvas.height);
        }
        else {
            bgCtx.drawImage(tableFallback, 0, 0, canvas.width, canvas.height);
        }
        // 2. Виньетка
        const vig = bgCtx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width / 3, canvas.width / 2, canvas.height / 2, canvas.width / 1.7);
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.55)");
        bgCtx.fillStyle = vig;
        bgCtx.fillRect(0, 0, canvas.width, canvas.height);
        // 3. Ворота
        const pCol = '#4CAF50';
        const aCol = '#FF9800';
        bgCtx.strokeStyle = GameState.currentPlayer === 1 ? pCol : aCol;
        bgCtx.lineWidth = 4;
        bgCtx.strokeRect(0, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        bgCtx.fillStyle = (GameState.currentPlayer === 1 ? pCol : aCol).replace(')', ', 0.1)').replace('rgb', 'rgba');
        bgCtx.fillRect(0, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        bgCtx.strokeStyle = GameState.currentPlayer === 2 ? pCol : aCol;
        bgCtx.lineWidth = 4;
        bgCtx.strokeRect(canvas.width - GOAL_WIDTH, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        bgCtx.fillStyle = (GameState.currentPlayer === 2 ? pCol : aCol).replace(')', ', 0.1)').replace('rgb', 'rgba');
        bgCtx.fillRect(canvas.width - GOAL_WIDTH, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        // 4. Счёт матча (теперь в кэше!)
        bgCtx.fillStyle = "rgba(255,255,255,0.5)";
        bgCtx.font = "bold 84px monospace";
        bgCtx.textAlign = "center";
        bgCtx.fillText(`${GameState.scoreLeft} : ${GameState.scoreRight}`, canvas.width / 2, canvas.height / 2 + 25);
        // Сохраняем состояние
        lastCacheWidth = canvas.width;
        lastCacheHeight = canvas.height;
        lastTextureState = tableTextureLoaded;
        lastScoreLeft = GameState.scoreLeft;
        lastScoreRight = GameState.scoreRight;
        lastCurrentPlayer = GameState.currentPlayer;
    }
    return backgroundCache;
}
// ============================================================
// ВСТРОЕННЫЙ FPS-СЧЁТЧИК
// ============================================================
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let currentFPS = 0;
function updateFPS() {
    fpsFrameCount++;
    const now = performance.now();
    if (now - fpsLastTime >= 1000) {
        currentFPS = fpsFrameCount;
        fpsFrameCount = 0;
        fpsLastTime = now;
    }
}
function drawFPS() {
    let color = "#4CAF50";
    if (currentFPS < 50)
        color = "#FFC107";
    if (currentFPS < 30)
        color = "#F44336";
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(10, 10, 110, 40);
    ctx.fillStyle = color;
    ctx.font = "bold 22px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(`${currentFPS} FPS`, 20, 19);
    ctx.restore();
}
// ============================================================
// ОТРИСОВКА AI-ВИЗУАЛИЗАЦИИ (БЕЗ THROTTLING)
// ============================================================
/**
 * Преобразует оценку варианта (totalScore) в цвет по 9-цветной шкале.
 */
function scoreToColor(score) {
    const minScore = -5000;
    const maxScore = 5000;
    const normalized = (score - minScore) / (maxScore - minScore);
    const clamped = Math.max(0, Math.min(1, normalized));
    const colors = [
        { r: 128, g: 0, b: 0 },
        { r: 255, g: 0, b: 0 },
        { r: 255, g: 165, b: 0 },
        { r: 255, g: 255, b: 0 },
        { r: 0, g: 255, b: 0 },
        { r: 0, g: 255, b: 255 },
        { r: 135, g: 206, b: 235 },
        { r: 0, g: 0, b: 255 },
        { r: 128, g: 0, b: 128 },
    ];
    const index = clamped * (colors.length - 1);
    const i = Math.floor(index);
    const t = index - i;
    if (i >= colors.length - 1) {
        return `rgb(${colors[colors.length - 1].r}, ${colors[colors.length - 1].g}, ${colors[colors.length - 1].b})`;
    }
    const c1 = colors[i];
    const c2 = colors[i + 1];
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return `rgb(${r}, ${g}, ${b})`;
}
/**
 * Отрисовка "мыслей" бота.
 * БЕЗ THROTTLING — линии статичны во время "раздумий", мерцание не нужно.
 */
function drawAIConsideredMoves() {
    for (const move of GameState.aiConsideredMoves) {
        const stone = move.stone;
        const isChosen = (move === pendingAIMove);
        const isBlocked = move.blockedByGates === true;
        // Линия направления
        ctx.beginPath();
        ctx.moveTo(stone.x, stone.y);
        ctx.lineTo(move.targetX, move.targetY);
        const isGoal = move.type === 'GOAL';
        const lineColor = scoreToColor(move.score);
        ctx.strokeStyle = lineColor.replace('rgb', 'rgba').replace(')', ', 0.3)');
        ctx.lineWidth = isGoal ? 3 : 1.5;
        ctx.stroke();
        // Точка остановки
        if (move.stopX !== undefined && move.stopY !== undefined) {
            const color = scoreToColor(move.score);
            const glow = ctx.createRadialGradient(move.stopX, move.stopY, 0, move.stopX, move.stopY, 10);
            glow.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.4)'));
            glow.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0)'));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(move.stopX, move.stopY, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(move.stopX, move.stopY, 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            if (isChosen) {
                ctx.strokeStyle = "rgba(255, 255, 255, 1)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            else if (isBlocked) {
                ctx.strokeStyle = "rgba(0, 0, 0, 1)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            else {
                ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(move.stopX - 7, move.stopY);
            ctx.lineTo(move.stopX + 7, move.stopY);
            ctx.moveTo(move.stopX, move.stopY - 7);
            ctx.lineTo(move.stopX, move.stopY + 7);
            ctx.stroke();
        }
        // Процент риска на камне
        if (isChosen) {
            ctx.fillStyle = "white";
            ctx.font = "bold 16px monospace";
        }
        else if (isBlocked) {
            ctx.fillStyle = "rgba(100, 100, 100, 0.8)";
            ctx.font = "bold 12px monospace";
        }
        else {
            ctx.fillStyle = "white";
            ctx.font = "bold 14px monospace";
        }
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const riskPercent = Math.round(move.risk * 100);
        ctx.fillText(`${riskPercent}%`, stone.x, stone.y);
        if (GameState.aiSelectedStone === stone) {
            ctx.beginPath();
            ctx.arc(stone.x, stone.y, stone.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 1)";
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
}
// ============================================================
// ГЛАВНАЯ ФУНКЦИЯ РЕНДЕРА
// ============================================================
export function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 1. Фон из кэша (включает текстуру, виньетку, ворота, счёт)
    const bgCache = getBackgroundCache();
    ctx.drawImage(bgCache, 0, 0);
    // 2. Камни (рисуются ПОВЕРХ фона, включая счёт)
    stones.forEach(s => s.draw(ctx));
    // 3. UI: результат хода
    if (GameState.resultTimer > 0) {
        let tc = "#F44336";
        if (GameState.turnResultText.includes("ПРОХОД"))
            tc = "#4CAF50";
        else if (GameState.turnResultText.includes("ГОЛ"))
            tc = "#FFD700";
        ctx.fillStyle = tc;
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(GameState.turnResultText, canvas.width / 2, 70);
        GameState.resultTimer--;
    }
    else if (stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1)) {
        ctx.fillStyle = GameState.currentPlayer === 1 ? "#4CAF50" : "#FF9800";
        ctx.font = "bold 20px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(GameState.currentPlayer === 1 ? "ВАШ ХОД" : "ХОД КОМПЬЮТЕРА...", canvas.width / 2, 35);
    }
    // 4. Прицелы
    if (GameState.isAiming && GameState.selectedStone && GameState.currentPlayer === 1) {
        drawAimIndicator(GameState.selectedStone, 0, 0, true);
    }
    if (GameState.currentPlayer === 2 && GameState.aiSelectedStone && GameState.aiAimTarget) {
        drawAimIndicator(GameState.aiSelectedStone, GameState.aiAimTarget.x, GameState.aiAimTarget.y, false);
    }
    // 5. Визуализация расчетов ИИ (БЕЗ THROTTLING)
    if (GameState.currentPlayer === 2 && GameState.aiConsideredMoves.length > 0) {
        drawAIConsideredMoves();
    }
    // 6. Встроенный FPS-счётчик
    updateFPS();
    drawFPS();
}
//# sourceMappingURL=renderer.js.map