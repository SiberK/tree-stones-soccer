const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const FORCE_FACTOR = 0.12; 
const MAX_FORCE = 15;  

const START_POSITIONS = [
    { x: 250, y: 250 },
    { x: 400, y: 180 },
    { x: 400, y: 320 }
];

const stones = [
    new Stone(START_POSITIONS[0].x, START_POSITIONS[0].y, 18, '#999999'),
    new Stone(START_POSITIONS[1].x, START_POSITIONS[1].y, 18, '#bbbbbb'),
    new Stone(START_POSITIONS[2].x, START_POSITIONS[2].y, 18, '#777777')
];

let selectedStone = null;
let isAiming = false;
let mouseX = 0;
let mouseY = 0;

function getStoneAt(x, y) {
    return stones.find(s => !s.isOut && Math.hypot(s.x - x, s.y - y) < s.radius + 15);
}

function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches.clientX : e.clientX;
    const clientY = e.touches ? e.touches.clientY : e.clientY;
    return {
        x: (clientX - rect.left) * (canvas.width / rect.width),
        y: (clientY - rect.top) * (canvas.height / rect.height)
    };
}

function startAim(e) {
    // Ходить нельзя, если на столе хоть что-то движется
    const isMoving = stones.some(s => s.vx !== 0 || s.vy !== 0);
    if (isMoving) return;

    const pos = getMousePos(e);
    selectedStone = getStoneAt(pos.x, pos.y);
    
    if (selectedStone) {
        isAiming = true;
        mouseX = pos.x;
        mouseY = pos.y;
        if (e.cancelable) e.preventDefault();
    }
}

function moveAim(e) {
    if (!isAiming || !selectedStone) return;
    const pos = getMousePos(e);
    mouseX = pos.x;
    mouseY = pos.y;
    if (e.cancelable) e.preventDefault();
}

function endAim() {
    if (!isAiming || !selectedStone) return;
    isAiming = false;

    let dx = selectedStone.x - mouseX;
    let dy = selectedStone.y - mouseY;
    
    let targetVx = dx * FORCE_FACTOR;
    let targetVy = dy * FORCE_FACTOR;

    let totalForce = Math.hypot(targetVx, targetVy);
    if (totalForce > MAX_FORCE) {
        let angle = Math.atan2(targetVy, targetVx);
        targetVx = Math.cos(angle) * MAX_FORCE;
        targetVy = Math.sin(angle) * MAX_FORCE;
    }

    selectedStone.vx = targetVx;
    selectedStone.vy = targetVy;
    selectedStone = null;
}

function checkCollisions() {
    for (let i = 0; i < stones.length; i++) {
        for (let j = i + 1; j < stones.length; j++) {
            let s1 = stones[i]; let s2 = stones[j];
            if (s1.isOut || s2.isOut) continue;

            let dist = Math.hypot(s1.x - s2.x, s1.y - s2.y);
            if (dist < s1.radius + s2.radius) {
                let overlap = (s1.radius + s2.radius) - dist;
                let nx = (s2.x - s1.x) / dist;
                let ny = (s2.y - s1.y) / dist;
                
                s1.x -= nx * overlap * 0.5; s1.y -= ny * overlap * 0.5;
                s2.x += nx * overlap * 0.5; s2.y += ny * overlap * 0.5;
                
                let kx = s1.vx - s2.vx; let ky = s1.vy - s2.vy;
                s1.vx -= kx; s1.vy -= ky;
                s2.vx += kx; s2.vy += ky;
            }
        }
    }
}

function resetToStart() {
    stones.forEach((s, index) => {
        s.x = START_POSITIONS[index].x;
        s.y = START_POSITIONS[index].y;
        s.vx = 0;
        s.vy = 0;
        s.isOut = false;
    });
}

function gameLoop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Рисуем ворота
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 175, 20, 150); 
    ctx.strokeRect(canvas.width - 20, 175, 20, 150); 

    checkCollisions();
    stones.forEach(s => s.update(canvas.width, canvas.height));
    stones.forEach(s => s.draw(ctx));

    // УСЛОВИЕ СБРОСА: Ждем только те камни, которые остались НА столе
    const anyOut = stones.some(s => s.isOut);
    const remainingStopped = stones.filter(s => !s.isOut).every(s => s.vx === 0 && s.vy === 0);
    
    if (anyOut && remainingStopped) {
        resetToStart();
    }

    // Стрелка прицела
    if (isAiming && selectedStone) {
        let fX = selectedStone.x - mouseX;
        let fY = selectedStone.y - mouseY;
        let currentForce = Math.hypot(fX, fY) * FORCE_FACTOR;

        if (currentForce > MAX_FORCE) {
            let angle = Math.atan2(fY, fX);
            let maxVisualDist = MAX_FORCE / FORCE_FACTOR;
            fX = Math.cos(angle) * maxVisualDist;
            fY = Math.sin(angle) * maxVisualDist;
        }

        ctx.beginPath();
        ctx.moveTo(selectedStone.x, selectedStone.y);
        ctx.lineTo(selectedStone.x + fX, selectedStone.y + fY);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.stroke();
    }

    requestAnimationFrame(gameLoop);
}

canvas.addEventListener('mousedown', startAim);
canvas.addEventListener('mousemove', moveAim);
window.addEventListener('mouseup', endAim);

canvas.addEventListener('touchstart', startAim, { passive: false });
canvas.addEventListener('touchmove', moveAim, { passive: false });
window.addEventListener('touchend', endAim);

gameLoop();
