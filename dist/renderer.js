import { ctx, canvas, GameState, stones, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, MAX_FORCE, FORCE_FACTOR, spreadFactor } from "./state.js";
// Текстуры (локальные для рендерера)
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
    // Разброс одинаковый для игрока и бота — регулируется слайдером
    const spreadValue = spreadFactor;
    const angle = Math.atan2(dy, dx);
    const spread = (force / MAX_FORCE) * spreadValue;
    const len = force * 13;
    const col = isPlayer ? "rgba(255,255,255,0.4)" : "rgba(255,165,0,0.4)";
    const scol = isPlayer ? "rgba(255,255,255,0.13)" : "rgba(255,165,0,0.13)";
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
/**
 * Отрисовка "мыслей" бота: линий направлений и процентов риска на камнях.
 */
function drawAIConsideredMoves() {
    for (const move of GameState.aiConsideredMoves) {
        const stone = move.stone;
        // Рисуем линию направления
        ctx.beginPath();
        ctx.moveTo(stone.x, stone.y);
        ctx.lineTo(move.targetX, move.targetY);
        // Цвет зависит от типа хода: гол - золотой, пас - синий
        const isGoal = move.type === 'GOAL';
        ctx.strokeStyle = isGoal ? "rgba(255, 215, 0, 0.4)" : "rgba(100, 149, 237, 0.2)";
        ctx.lineWidth = isGoal ? 3 : 1;
        ctx.stroke();
        // Рисуем оценку риска прямо на камне
        ctx.fillStyle = "white";
        ctx.font = "bold 30px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        // Форматируем риск: 0.12 -> "12%"
        const riskPercent = Math.round(move.risk * 100);
        ctx.fillText(`${riskPercent}%`, stone.x, stone.y);
        // Если это лучший ход (выбранный), обведем камень жирным оранжевым
        if (GameState.aiSelectedStone === stone) {
            ctx.beginPath();
            ctx.arc(stone.x, stone.y, stone.radius + 6, 0, Math.PI * 2);
            ctx.strokeStyle = "rgba(255, 165, 0, 0.9)";
            ctx.lineWidth = 3;
            ctx.stroke();
        }
    }
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
    // Виньетка
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
    // 4. UI (Счет сделан менее прозрачным)
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
//# sourceMappingURL=renderer.js.map