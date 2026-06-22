import { ctx, canvas, GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, MAX_FORCE, FORCE_FACTOR, spreadFactor } from "./state.js";
// Текстуры
const tableTexture = new Image();
tableTexture.src = 'assets/table.jpg';
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
    const spread = Math.pow((force / MAX_FORCE), 2) * spreadValue;
    const len = force * 13;
    const col = isPlayer ? "rgba(255,255,255,0.4)" : "rgba(255,165,0,0.4)";
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
export function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    // 1. Фон
    if (tableTexture.complete && tableTexture.naturalWidth > 0) {
        ctx.drawImage(tableTexture, 0, 0, canvas.width, canvas.height);
    }
    else {
        ctx.drawImage(tableFallback, 0, 0, canvas.width, canvas.height);
    }
    const vig = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, canvas.width / 3, canvas.width / 2, canvas.height / 2, canvas.width / 1.7);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 2. Ворота
    const pCol = '#4CAF50';
    const aCol = '#FF9800';
    drawGate(0, GameState.currentPlayer === 1 ? pCol : aCol);
    drawGate(canvas.width - GOAL_WIDTH, GameState.currentPlayer === 2 ? pCol : aCol);
    // 3. Камни
    stones.forEach(s => s.draw(ctx));
    // 4. UI
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "bold 84px monospace";
    ctx.textAlign = "center";
    ctx.fillText(`${GameState.scoreLeft} : ${GameState.scoreRight}`, canvas.width / 2, canvas.height / 2 + 25);
    if (GameState.resultTimer > 0) {
        let tc = "#F44336";
        if (GameState.turnResultText.includes("ПРОХОД"))
            tc = "#4CAF50";
        else if (GameState.turnResultText.includes("ГОЛ"))
            tc = "#FFD700";
        ctx.fillStyle = tc;
        ctx.font = "bold 26px sans-serif";
        ctx.fillText(GameState.turnResultText, canvas.width / 2, 70);
        GameState.resultTimer--;
    }
    else if (stones.every(s => Math.abs(s.vx) < 0.1 && Math.abs(s.vy) < 0.1)) {
        ctx.fillStyle = GameState.currentPlayer === 1 ? "#4CAF50" : "#FF9800";
        ctx.font = "bold 20px sans-serif";
        ctx.fillText(GameState.currentPlayer === 1 ? "ВАШ ХОД" : "ХОД КОМПЬЮТЕРА...", canvas.width / 2, 35);
    }
    // 5. Прицелы
    if (GameState.isAiming && GameState.selectedStone && GameState.currentPlayer === 1) {
        drawAimIndicator(GameState.selectedStone, 0, 0, true);
    }
    if (GameState.currentPlayer === 2 && GameState.aiSelectedStone && GameState.aiAimTarget) {
        drawAimIndicator(GameState.aiSelectedStone, GameState.aiAimTarget.x, GameState.aiAimTarget.y, false);
    }
    // 6. Визуализация расчетов ИИ
    if (GameState.currentPlayer === 2 && GameState.aiConsideredMoves.length > 0) {
        drawAIConsideredMoves();
    }
}
/**
 * Преобразует оценку варианта (totalScore) в цвет по 9-цветной шкале:
 * бордовый → красный → оранжевый → жёлтый → зелёный → бирюзовый → голубой → синий → фиолетовый
 *
 * Диапазон: от -5000 (бордовый) через 0 (зелёный) до +5000 (фиолетовый)
 */
function scoreToColor(score) {
    const minScore = -5000;
    const maxScore = 5000;
    // Нормализуем в диапазон 0..1
    const normalized = (score - minScore) / (maxScore - minScore);
    const clamped = Math.max(0, Math.min(1, normalized));
    // 9-цветная палитра
    const colors = [
        { r: 128, g: 0, b: 0 }, // 0.000 - бордовый
        { r: 255, g: 0, b: 0 }, // 0.125 - красный
        { r: 255, g: 165, b: 0 }, // 0.250 - оранжевый
        { r: 255, g: 255, b: 0 }, // 0.375 - жёлтый
        { r: 0, g: 255, b: 0 }, // 0.500 - зелёный
        { r: 0, g: 255, b: 255 }, // 0.625 - бирюзовый
        { r: 135, g: 206, b: 235 }, // 0.750 - голубой
        { r: 0, g: 0, b: 255 }, // 0.875 - синий
        { r: 128, g: 0, b: 128 }, // 1.000 - фиолетовый
    ];
    // Определяем между какими двумя цветами находимся
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
 *
 * Все точки остановки окрашены по шкале totalScore (от бордового до фиолетового).
 * Специальные варианты выделяются обводкой:
 * - Белый ободок (4px): выбранный ботом вариант
 * - Чёрный ободок (4px): заблокированный вариант
 */
function drawAIConsideredMoves() {
    for (const move of GameState.aiConsideredMoves) {
        const stone = move.stone;
        const isChosen = (move === pendingAIMove);
        const isBlocked = move.blockedByGates === true;
        // === ЛИНИЯ НАПРАВЛЕНИЯ ===
        ctx.beginPath();
        ctx.moveTo(stone.x, stone.y);
        ctx.lineTo(move.targetX, move.targetY);
        const isGoal = move.type === 'GOAL';
        // Цвет линии зависит от score (полупрозрачный)
        const lineColor = scoreToColor(move.score);
        ctx.strokeStyle = lineColor.replace('rgb', 'rgba').replace(')', ', 0.3)');
        ctx.lineWidth = isGoal ? 3 : 1.5;
        ctx.stroke();
        // === ТОЧКА ОСТАНОВКИ ===
        if (move.stopX !== undefined && move.stopY !== undefined) {
            // Цвет точки всегда по шкале (для всех вариантов)
            const color = scoreToColor(move.score);
            // Свечение
            const glow = ctx.createRadialGradient(move.stopX, move.stopY, 0, move.stopX, move.stopY, 10);
            glow.addColorStop(0, color.replace('rgb', 'rgba').replace(')', ', 0.4)'));
            glow.addColorStop(1, color.replace('rgb', 'rgba').replace(')', ', 0)'));
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(move.stopX, move.stopY, 10, 0, Math.PI * 2);
            ctx.fill();
            // Основная точка (цвет по шкале)
            ctx.beginPath();
            ctx.arc(move.stopX, move.stopY, 5, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            // === ОБВОДКА для специальных вариантов ===
            if (isChosen) {
                // Выбранный ботом: белая окружность 4px
                ctx.strokeStyle = "rgba(255, 255, 255, 1)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            else if (isBlocked) {
                // Заблокированный: чёрная окружность 4px
                ctx.strokeStyle = "rgba(0, 0, 0, 1)";
                ctx.lineWidth = 4;
                ctx.stroke();
            }
            else {
                // Обычный вариант: тонкая тёмная обводка для контраста
                ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
                ctx.lineWidth = 1;
                ctx.stroke();
            }
            // Крестик внутри точки
            ctx.strokeStyle = color;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(move.stopX - 7, move.stopY);
            ctx.lineTo(move.stopX + 7, move.stopY);
            ctx.moveTo(move.stopX, move.stopY - 7);
            ctx.lineTo(move.stopX, move.stopY + 7);
            ctx.stroke();
        }
        // === ПРОЦЕНТ РИСКА НА КАМНЕ ===
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
        // Подсветка выбранного камня
        if (GameState.aiSelectedStone === stone) {
            ctx.beginPath();
            ctx.arc(stone.x, stone.y, stone.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 255, 255, 1)";
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
}
//# sourceMappingURL=renderer.js.map