/**
 * src/renderer/background.ts
 * 
 * Кэш фона: текстура стола, виньетка, ворота, счёт матча.
 */

import { ctx, GameState, GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, LOGICAL_WIDTH, LOGICAL_HEIGHT } from "../state.js";

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

function generateTableFallback(): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = 1200; c.height = 800;
    const x = c.getContext('2d')!;
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

let backgroundCache: HTMLCanvasElement | null = null;
let lastCacheWidth = 0;
let lastCacheHeight = 0;
let lastTextureState = false;
let lastScoreLeft = -1;
let lastScoreRight = -1;
let lastCurrentPlayer = -1;

export function invalidateBackgroundCache(): void {
    backgroundCache = null;
}

export function getBackgroundCache(): HTMLCanvasElement {
    const needsRecreate =
        !backgroundCache ||
        lastCacheWidth !== LOGICAL_WIDTH ||
        lastCacheHeight !== LOGICAL_HEIGHT ||
        lastTextureState !== tableTextureLoaded ||
        lastScoreLeft !== GameState.scoreLeft ||
        lastScoreRight !== GameState.scoreRight ||
        lastCurrentPlayer !== GameState.currentPlayer;

    if (needsRecreate) {
        backgroundCache = document.createElement('canvas');
        backgroundCache.width = LOGICAL_WIDTH;
        backgroundCache.height = LOGICAL_HEIGHT;

        const bgCtx = backgroundCache.getContext('2d')!;

        // 1. Текстура стола
        if (tableTextureLoaded && tableTexture.complete && tableTexture.naturalWidth > 0) {
            bgCtx.drawImage(tableTexture, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        } else {
            bgCtx.drawImage(tableFallback, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }

        // 2. Виньетка
        const vig = bgCtx.createRadialGradient(
            LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH / 3,
            LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2, LOGICAL_WIDTH / 1.7
        );
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.55)");
        bgCtx.fillStyle = vig;
        bgCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

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
        bgCtx.strokeRect(LOGICAL_WIDTH - GOAL_WIDTH, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);
        bgCtx.fillStyle = (GameState.currentPlayer === 2 ? pCol : aCol).replace(')', ', 0.1)').replace('rgb', 'rgba');
        bgCtx.fillRect(LOGICAL_WIDTH - GOAL_WIDTH, GOAL_Y, GOAL_WIDTH, GOAL_HEIGHT);

        // 4. Счёт матча
        bgCtx.fillStyle = "rgba(255,255,255,0.5)";
        bgCtx.font = "bold 84px monospace";
        bgCtx.textAlign = "center";
        bgCtx.fillText(`${GameState.scoreLeft} : ${GameState.scoreRight}`, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 25);

        // Сохраняем состояние
        lastCacheWidth = LOGICAL_WIDTH;
        lastCacheHeight = LOGICAL_HEIGHT;
        lastTextureState = tableTextureLoaded;
        lastScoreLeft = GameState.scoreLeft;
        lastScoreRight = GameState.scoreRight;
        lastCurrentPlayer = GameState.currentPlayer;
    }

    return backgroundCache!;
}