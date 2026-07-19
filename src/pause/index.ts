/**
 * src/pause/index.ts
 * 
 * Экспорт функций паузы и инициализация кнопок.
 */

export { 
    enterPause, 
    exitPause, 
    recalculateInPause, 
    stepForward, 
    stepBackward, 
    resetToOriginal 
} from "./controls.js";

export function initPauseButtons(): void {
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');
    const showBtn = document.getElementById('pauseShowBtn');
    const nextBtn = document.getElementById('pauseNextBtn');
    const backBtn = document.getElementById('pauseBackBtn');
    const resetBtn = document.getElementById('pauseResetBtn');
    
    if (pauseBtn) {
        pauseBtn.addEventListener('click', async () => {
            const { enterPause, exitPause } = await import('./controls.js');
            const { GameState } = await import('../state.js');
            
            if (!GameState.isPaused) {
                enterPause();
            } else {
                exitPause();
            }
        });
    }
    
    if (resumeBtn) {
        resumeBtn.addEventListener('click', async () => {
            const { exitPause } = await import('./controls.js');
            exitPause();
        });
    }
    
    if (showBtn) {
        showBtn.addEventListener('click', async () => {
            const { recalculateInPause } = await import('./controls.js');
            recalculateInPause();
        });
    }
    
    if (nextBtn) {
        nextBtn.addEventListener('click', async () => {
            const { stepForward } = await import('./controls.js');
            stepForward();
        });
    }
    
    if (backBtn) {
        backBtn.addEventListener('click', async () => {
            const { stepBackward } = await import('./controls.js');
            stepBackward();
        });
    }
    
    if (resetBtn) {
        resetBtn.addEventListener('click', async () => {
            const { resetToOriginal } = await import('./controls.js');
            resetToOriginal();
        });
    }
}