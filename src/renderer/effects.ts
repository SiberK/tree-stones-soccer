/**
 * src/renderer/effects.ts
 * 
 * Система визуальных эффектов (вспышки при событиях).
 */

import { ctx } from "../state.js";

export interface VisualEffect {
    type: 'FLASH';
    x: number;
    y: number;
    duration: number;
    color: string;
    radius: number;
    currentFrame: number;
}

const activeEffects: VisualEffect[] = [];

export function addVisualEffect(effect: Omit<VisualEffect, 'currentFrame'>): void {
    activeEffects.push({
        ...effect,
        currentFrame: 0
    });
}

export function hasActiveEffects(): boolean {
    return activeEffects.length > 0;
}

export function drawVisualEffects(): void {
    for (let i = activeEffects.length - 1; i >= 0; i--) {
        const effect = activeEffects[i];

        const progress = effect.currentFrame / effect.duration;
        const currentRadius = effect.radius * (0.5 + progress * 0.5);
        const alpha = 1 - progress;

        const colorMatch = effect.color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        let r = 255, g = 255, b = 255, a = alpha;

        if (colorMatch) {
            r = parseInt(colorMatch[1]);
            g = parseInt(colorMatch[2]);
            b = parseInt(colorMatch[3]);
            if (colorMatch[4]) {
                a = parseFloat(colorMatch[4]) * alpha;
            }
        }

        const gradient = ctx.createRadialGradient(
            effect.x, effect.y, 0,
            effect.x, effect.y, currentRadius
        );
        gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a})`);
        gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(effect.x, effect.y, currentRadius, 0, Math.PI * 2);
        ctx.fill();

        effect.currentFrame++;

        if (effect.currentFrame >= effect.duration) {
            activeEffects.splice(i, 1);
        }
    }
}