/**
 * src/events.ts
 * 
 * Обработка событий симуляции (столкновения, голы, вылеты).
 */

import { Stone } from "./stone.js";
import { EventOccurrence } from "./simulation/controller.js";
import { addVisualEffect } from "./renderer/index.js";
import { GOAL_Y, GOAL_HEIGHT, GOAL_WIDTH, LOGICAL_WIDTH } from "./state.js";

export function handleOccurredEvents(
    events: EventOccurrence[],
    stones: Stone[]
): void {
    for (const event of events) {
        switch (event.eventType) {
            case 'COLLISION': {
                const data = event.data as any;
                addVisualEffect({
                    type: 'FLASH',
                    x: data.collisionPoint.x,
                    y: data.collisionPoint.y,
                    duration: 15,
                    color: 'rgba(255, 255, 200, 0.8)',
                    radius: 40
                });
                break;
            }
            
            case 'CLEAN_PASS': {
                const data = event.data as any;
                addVisualEffect({
                    type: 'FLASH',
                    x: data.gateIntersection.x,
                    y: data.gateIntersection.y,
                    duration: 20,
                    color: 'rgba(100, 255, 100, 0.8)',
                    radius: 30
                });
                break;
            }
            
            case 'GOAL': {
                const data = event.data as any;
                const goalX = data.goalSide === 'left' ? GOAL_WIDTH : LOGICAL_WIDTH - GOAL_WIDTH;
                const goalY = GOAL_Y + GOAL_HEIGHT / 2;
                
                addVisualEffect({
                    type: 'FLASH',
                    x: goalX,
                    y: goalY,
                    duration: 30,
                    color: 'rgba(255, 215, 0, 1)',
                    radius: 80
                });
                break;
            }
            
            case 'OUT': {
                const data = event.data as any;
                const stone = stones[data.stoneIndex];
                addVisualEffect({
                    type: 'FLASH',
                    x: stone.x,
                    y: stone.y,
                    duration: 15,
                    color: 'rgba(255, 100, 100, 0.6)',
                    radius: 35
                });
                break;
            }
        }
    }
}