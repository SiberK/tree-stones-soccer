/**
 * src/fullscreen.ts
 * 
 * Полноэкранный режим.
 */

export function initFullscreenButton(): void {
    const btn = document.getElementById('fullscreenBtn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        
        if (!isFullscreen) {
            const elem = document.documentElement;
            if (elem.requestFullscreen) {
                elem.requestFullscreen().catch(err => {
                    console.warn('Не удалось войти в полноэкранный режим:', err);
                });
            } else if ((elem as any).webkitRequestFullscreen) {
                (elem as any).webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            }
        }
    });

    const updateButton = () => {
        const isFullscreen = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
        btn.textContent = isFullscreen ? '⛶' : '⛶';
        btn.title = isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим';
    };

    document.addEventListener('fullscreenchange', updateButton);
    document.addEventListener('webkitfullscreenchange', updateButton);
}