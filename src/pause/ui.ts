/**
 * src/pause/ui.ts
 * 
 * Обновление UI панели паузы.
 */

import { GameState, stones, currentWeights, LOGICAL_WIDTH } from "../state.js";
import { CachedCandidate, Weights } from "../ai/types.js";

export function calculateBreakdown(candidate: CachedCandidate, weights: Weights) {
    const m = candidate.metrics;
    
    const triangleQuality = (m.triangleQuality / 10000) * weights.triangleQualityBonus;
    const flexibility = m.flexibilityCount * weights.flexibilityBonus / 2;
    const goalProximity = ((LOGICAL_WIDTH - m.goalDistance) / LOGICAL_WIDTH) * weights.goalProximityBonus;
    const safetyMargin = Math.min(m.safetyMargin, 50) * (weights.safetyMarginBonus / 50);
    const advancement = m.advancement > 0 
        ? (m.advancement / 100) * weights.advancementBonus
        : 0;
    const nextShot = 0;
    
    const edge = m.edgeDistance < 28 
        ? -(28 - m.edgeDistance) * (weights.edgePenalty / 28)
        : 0;
    const largeTriangle = m.triangleAvgSide > 15 * 56
        ? -(m.triangleAvgSide - 15 * 56) * (weights.largeTrianglePenalty / 100)
        : 0;
    const risk = m.corridorWidth < 0.1 ? 0.8 : (m.corridorWidth < 0.3 ? 0.4 : 0.1);
    const riskValue = -risk * weights.riskPenalty;
    const force = -(candidate.force / 30) * weights.forcePenalty;
    const missGate = 0;
    const retreat = m.advancement < 0 
        ? m.advancement * weights.retreatPenalty
        : 0;
    const badPosition = (candidate.stopX < 0 || candidate.stopX > LOGICAL_WIDTH ||
                         candidate.stopY < 0 || candidate.stopY > LOGICAL_WIDTH)
        ? -weights.badPositionPenalty
        : 0;
    
    return {
        bonuses: {
            triangleQuality,
            flexibility,
            goalProximity,
            safetyMargin,
            advancement,
            nextShot
        },
        penalties: {
            risk: riskValue,
            force,
            edge,
            largeTriangle,
            missGate,
            retreat,
            badPosition
        }
    };
}

export function updateBreakdownUI(candidate: CachedCandidate | null | undefined): void {
    if (!candidate) {
        const ids = [
            'brkTriangleQuality', 'brkFlexibility', 'brkGoalProximity',
            'brkSafetyMargin', 'brkAdvancement', 'brkNextShot',
            'brkRisk', 'brkForce', 'brkEdge', 'brkLargeTriangle',
            'brkMissGate', 'brkRetreat', 'brkBadPosition'
        ];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        return;
    }
    
    const breakdown = calculateBreakdown(candidate, currentWeights);
    
    const format = (v: number) => {
        const sign = v >= 0 ? '+' : '';
        return sign + Math.round(v).toString();
    };
    
    const set = (id: string, value: number) => {
        const el = document.getElementById(id);
        if (el) el.textContent = format(value);
    };
    
    set('brkTriangleQuality', breakdown.bonuses.triangleQuality);
    set('brkFlexibility', breakdown.bonuses.flexibility);
    set('brkGoalProximity', breakdown.bonuses.goalProximity);
    set('brkSafetyMargin', breakdown.bonuses.safetyMargin);
    set('brkAdvancement', breakdown.bonuses.advancement);
    set('brkNextShot', breakdown.bonuses.nextShot);
    set('brkRisk', breakdown.penalties.risk);
    set('brkForce', breakdown.penalties.force);
    set('brkEdge', breakdown.penalties.edge);
    set('brkLargeTriangle', breakdown.penalties.largeTriangle);
    set('brkMissGate', breakdown.penalties.missGate);
    set('brkRetreat', breakdown.penalties.retreat);
    set('brkBadPosition', breakdown.penalties.badPosition);
}

export function updateButtonsState(): void {
    const backBtn = document.getElementById('pauseBackBtn') as HTMLButtonElement;
    const resetBtn = document.getElementById('pauseResetBtn') as HTMLButtonElement;
    
    if (backBtn) {
        backBtn.disabled = GameState.pausedCurrentStep <= 0;
    }
    if (resetBtn) {
        resetBtn.disabled = GameState.pausedCurrentStep <= 0;
    }
}

export function updatePauseUI(): void {
    const currentStep = GameState.pausedHistory[GameState.pausedCurrentStep];
    
    const stepLabel = document.getElementById('pauseStepLabel');
    if (stepLabel && currentStep) {
        stepLabel.textContent = `Ход #${currentStep.stepIndex + 1}`;
    }
    
    const deadEndRow = document.getElementById('pauseDeadEndRow');
    const goalRow = document.getElementById('pauseGoalRow');
    
    if (!currentStep || !currentStep.bestMove) {
        if (deadEndRow) deadEndRow.style.display = 'flex';
        if (goalRow) goalRow.style.display = 'none';
        
        const strikerEl = document.getElementById('pauseStrikerIndex');
        const angleEl = document.getElementById('pauseAngle');
        const forceEl = document.getElementById('pauseForce');
        const scoreEl = document.getElementById('pauseScore');
        
        if (strikerEl) strikerEl.textContent = '—';
        if (angleEl) angleEl.textContent = '—';
        if (forceEl) forceEl.textContent = '—';
        if (scoreEl) scoreEl.textContent = '—';
        
        const nextBtn = document.getElementById('pauseNextBtn') as HTMLButtonElement;
        if (nextBtn) nextBtn.disabled = true;
        
        updateBreakdownUI(null);
        updateButtonsState();
        return;
    }
    
    if (deadEndRow) deadEndRow.style.display = 'none';
    
    const bestMove = currentStep.bestMove;
    const angleDeg = (Math.atan2(
        bestMove.targetY - bestMove.stone.y,
        bestMove.targetX - bestMove.stone.x
    ) * 180 / Math.PI).toFixed(1);
    
    if (goalRow) {
		goalRow.style.display = bestMove.isFinalShot ? 'flex' : 'none';
	}
    
    const strikerEl = document.getElementById('pauseStrikerIndex');
    const angleEl = document.getElementById('pauseAngle');
    const forceEl = document.getElementById('pauseForce');
    const scoreEl = document.getElementById('pauseScore');
    
	if (strikerEl) strikerEl.textContent = bestMove.stone.name;
    if (angleEl) angleEl.textContent = `${angleDeg}°`;
    if (forceEl) forceEl.textContent = bestMove.force.toFixed(2);
    if (scoreEl) scoreEl.textContent = Math.round(bestMove.score).toString();
    
    const candidate = currentStep.candidates.find(c => {
        const striker = stones[c.strikerIndex];
        return striker === bestMove.stone && 
               Math.abs(c.force - bestMove.force) < 0.01 &&
               Math.abs(c.stopX - bestMove.stopX) < 0.1 &&
               Math.abs(c.stopY - bestMove.stopY) < 0.1;
    });
    
    updateBreakdownUI(candidate);
    
    const nextBtn = document.getElementById('pauseNextBtn') as HTMLButtonElement;
    if (nextBtn) {
		nextBtn.disabled = bestMove.isFinalShot === true;    
	}
    
    updateButtonsState();
}