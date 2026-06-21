// Параметры физики (константы)
const FRICTION = 0.98;

class Stone {
    constructor(x, y, radius, color) {
        this.x = x; 
        this.y = y;
        this.vx = 0; 
        this.vy = 0;
        this.radius = radius;
        this.color = color;
        this.isOut = false; 
    }

    update(canvasWidth, canvasHeight) {
        // Если камень уже вылетел, его физику больше не считаем
        if (this.isOut) return;

        this.x += this.vx; 
        this.y += this.vy;
        this.vx *= FRICTION; 
        this.vy *= FRICTION;

        // Полная остановка при микроскопической скорости
        if (Math.abs(this.vx) < 0.05) this.vx = 0;
        if (Math.abs(this.vy) < 0.05) this.vy = 0;

        // ПРОВЕРКА ВЫЛЕТА: если центр камня пересёк край стола
        if (this.x < 0 || this.x > canvasWidth || this.y < 0 || this.y > canvasHeight) {
            this.isOut = true;
            this.vx = 0; // Обнуляем скорость вылетевшего мгновенно!
            this.vy = 0;
        }
    }

    draw(ctx) {
        if (this.isOut) return;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color;
        ctx.fill();
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.closePath();
    }
}
