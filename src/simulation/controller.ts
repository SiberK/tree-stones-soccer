/**
 * src/simulation/controller.ts
 * 
 * Контроллер симуляции с предварительным расчётом кадров.
 */

import { Stone } from "../stone.js";
import { MoveRecord, SimulationInput, StoneState, ShotData, SimulationEvent, EventType } from "./types.js";
import { simulateMove } from "./engine.js";
import { positionAtTime, velocityAtTime } from "./math.js";

export interface FrameData {
    time: number;
    isEventFrame: boolean;
    eventType?: EventType;
    eventData?: any;
    stones: StoneState[];
}

export interface EventOccurrence {
    eventType: EventType;
    time: number;
    data: any;
    stones: StoneState[];
}

export class SimulationController {
    private currentMove: MoveRecord | null = null;
    private frames: FrameData[] = [];
    private currentFrameIndex: number = 0;
    private playbackTime: number = 0;
    private isPlaying: boolean = false;
    private moveCounter: number = 0;
    private lastEventFrameIndex: number = -1;
    
    public startSimulation(stones: Stone[], move: ShotData): MoveRecord {
        const stoneStates: StoneState[] = stones.map((s, idx) => ({
            index: idx,
            x: s.x,
            y: s.y,
            vx: 0,
            vy: 0,
            isOut: s.isOut,
            radius: s.radius
        }));
        
        const input: SimulationInput = {
            stones: stoneStates,
            move
        };
        
        this.moveCounter++;
        this.currentMove = simulateMove(input, this.moveCounter);
        this.frames = this.precomputeFrames();
        
        this.currentFrameIndex = 0;
        this.playbackTime = 0;
        this.isPlaying = true;
        this.lastEventFrameIndex = -1;
        
        return this.currentMove;
    }
    
    private findSegmentForTime(
        t: number, 
        events: SimulationEvent[]
    ): { prevEvent: SimulationEvent; nextEvent: SimulationEvent } | null {
        for (let i = 0; i < events.length - 1; i++) {
            const prevEvent = events[i];
            const nextEvent = events[i + 1];
            
            if (t >= prevEvent.timeStart && t < nextEvent.timeStart) {
                return { prevEvent, nextEvent };
            }
        }
        
        if (events.length >= 2 && t >= events[events.length - 2].timeStart) {
            return {
                prevEvent: events[events.length - 2],
                nextEvent: events[events.length - 1]
            };
        }
        
        return null;
    }
    
    private precomputeFrames(): FrameData[] {
        if (!this.currentMove) return [];
        
        const frames: FrameData[] = [];
        const events = this.currentMove.events;
        
        if (events.length === 0) return frames;
        
        const totalTime = events[events.length - 1].timeStart;
        
        const eventMap = new Map<number, SimulationEvent>();
        for (const event of events) {
            eventMap.set(Math.round(event.timeStart), event);
        }
        
        for (let t = 0; t <= Math.ceil(totalTime); t += 1) {
            const roundedT = Math.round(t);
            const event = eventMap.get(roundedT);
            
            if (event) {
                frames.push({
                    time: roundedT,
                    isEventFrame: true,
                    eventType: event.eventType,
                    eventData: event.eventData,
                    stones: event.stones.map(s => ({ ...s }))
                });
            } else {
                const segment = this.findSegmentForTime(roundedT, events);
                
                if (segment) {
                    const segmentStart = segment.prevEvent.timeStart;
                    const localTime = roundedT - segmentStart;
                    const frameStones = this.computeFrameState(segment.prevEvent.stones, localTime);
                    
                    frames.push({
                        time: roundedT,
                        isEventFrame: false,
                        stones: frameStones
                    });
                } else {
                    const lastEvent = events[events.length - 1];
                    frames.push({
                        time: roundedT,
                        isEventFrame: false,
                        stones: lastEvent.stones.map(s => ({ ...s }))
                    });
                }
            }
        }
        
        return frames;
    }
    
    private computeFrameState(startState: StoneState[], t: number): StoneState[] {
        return startState.map(stone => {
            if (stone.isOut) return { ...stone };
            if (Math.abs(stone.vx) < 0.001 && Math.abs(stone.vy) < 0.001) return { ...stone };
            
            return {
                index: stone.index,
                x: positionAtTime(stone.x, stone.vx, t),
                y: positionAtTime(stone.y, stone.vy, t),
                vx: velocityAtTime(stone.vx, t),
                vy: velocityAtTime(stone.vy, t),
                isOut: stone.isOut,
                radius: stone.radius
            };
        });
    }
    
    public updatePlayback(deltaTime: number, stones: Stone[]): EventOccurrence[] {
        const occurredEvents: EventOccurrence[] = [];
        
        if (!this.isPlaying || this.frames.length === 0) {
            return occurredEvents;
        }
        
        const maxDelta = 1 / 30;
        const clampedDelta = Math.min(deltaTime, maxDelta);
        this.playbackTime += clampedDelta * 30;
        
        const targetIndex = this.findFrameIndex(this.playbackTime);
        
        for (let i = this.currentFrameIndex + 1; i <= targetIndex; i++) {
            const frame = this.frames[i];
            if (frame.isEventFrame && frame.eventType) {
                occurredEvents.push({
                    eventType: frame.eventType,
                    time: frame.time,
                    data: frame.eventData,
                    stones: frame.stones
                });
                this.lastEventFrameIndex = i;
            }
        }
        
        this.currentFrameIndex = targetIndex;
        const targetFrame = this.frames[targetIndex];
        
        for (let i = 0; i < stones.length; i++) {
            const fs = targetFrame.stones[i];
            stones[i].x = fs.x;
            stones[i].y = fs.y;
            stones[i].vx = fs.vx;
            stones[i].vy = fs.vy;
            stones[i].isOut = fs.isOut;
        }
        
        if (targetIndex >= this.frames.length - 1) {
            this.isPlaying = false;
            
            for (let i = 0; i < stones.length; i++) {
                if (!stones[i].isOut) {
                    stones[i].vx = 0;
                    stones[i].vy = 0;
                }
            }
        }
        
        return occurredEvents;
    }
    
    private findFrameIndex(time: number): number {
        if (this.frames.length === 0) return 0;
        if (time <= this.frames[0].time) return 0;
        if (time >= this.frames[this.frames.length - 1].time) {
            return this.frames.length - 1;
        }
        
        for (let i = 0; i < this.frames.length - 1; i++) {
            if (time >= this.frames[i].time && time < this.frames[i + 1].time) {
                return i;
            }
        }
        
        return this.frames.length - 1;
    }
    
    public isSimulating(): boolean {
        return this.isPlaying;
    }
    
    public getResult(): MoveRecord['result'] | null {
        return this.currentMove?.result || null;
    }
    
    public getFinalState(): MoveRecord['finalState'] | null {
        return this.currentMove?.finalState || null;
    }
}

export const simulationController = new SimulationController();