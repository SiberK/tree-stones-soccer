/**
 * src/pause/history.ts
 * 
 * Управление стеком истории и состоянием камней в режиме паузы.
 */

import { stones } from "../state.js";
import { CachedCandidate, PausedStep } from "../ai/types.js";
import { AIMove } from "../ai/types.js";

export function calculateGateCenter(stonesArr: any[]): { x: number; y: number } {
    const available = stonesArr.filter(s => !s.isOut);
    const sumX = available.reduce((sum, s) => sum + s.x, 0);
    const sumY = available.reduce((sum, s) => sum + s.y, 0);
    return { x: sumX / available.length, y: sumY / available.length };
}

export function applyStoneStates(states: any[]): void {
    for (let i = 0; i < stones.length; i++) {
        if (states[i]) {
            stones[i].x = states[i].x;
            stones[i].y = states[i].y;
            stones[i].vx = states[i].vx;
            stones[i].vy = states[i].vy;
            stones[i].isOut = states[i].isOut;
        }
    }
}

export function candidateToAIMove(c: CachedCandidate): AIMove {
    const striker = stones[c.strikerIndex];
    return {
        stone: striker,
        targetX: striker.x + Math.cos(c.angle) * 1000,
        targetY: striker.y + Math.sin(c.angle) * 1000,
        score: c.currentScore,
        force: c.force,
        isFinalShot: c.metrics.isGoal,
        risk: c.metrics.safetyMargin < 10 ? 0.8 : 0.2,
        type: c.metrics.isGoal ? 'GOAL' : 'PASS',
        stopX: c.stopX,
        stopY: c.stopY,
        blockedByGates: false
    };
}

export function captureStonesState(): any[] {
    return stones.map(s => ({
        x: s.x,
        y: s.y,
        vx: 0,
        vy: 0,
        radius: s.radius,
        color: s.color,
        isOut: s.isOut,
        index: stones.indexOf(s)
    }));
}