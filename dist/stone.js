const FRICTION = 0.98;
// Загрузка текстуры камня
const stoneImg = new Image();
stoneImg.src = 'assets/stone_tex.jpg';
export class Stone {
    constructor(x, y, radius, color) {
        this.shapeOffsets = [];
        this.vertexCount = 16;
        this.x = x;
        this.y = y;
        this.startX = x;
        this.startY = y;
        this.vx = 0;
        this.vy = 0;
        this.radius = radius;
        this.color = color;
        this.isOut = false;
        for (let i = 0; i < this.vertexCount; i++) {
            this.shapeOffsets.push((Math.random() - 0.5) * (radius * 0.2));
        }
        this.textureSection = {
            sx: Math.random() * 300,
            sy: Math.random() * 300
        };
    }
    update(canvasWidth, canvasHeight) {
        if (this.isOut)
            return;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= FRICTION;
        this.vy *= FRICTION;
        const stopThreshold = this.radius * 0.05;
        if (Math.hypot(this.vx, this.vy) < stopThreshold) {
            this.vx = 0;
            this.vy = 0;
        }
        // ✅ ИСПРАВЛЕНО: Вылет если более половины камня за краем стола
        // Левый край
        if (this.x + this.radius < 0) {
            this.isOut = true;
        }
        // Правый край
        else if (this.x - this.radius > canvasWidth) {
            this.isOut = true;
        }
        // Верхний край
        else if (this.y + this.radius < 0) {
            this.isOut = true;
        }
        // Нижний край
        else if (this.y - this.radius > canvasHeight) {
            this.isOut = true;
        }
        if (this.isOut) {
            this.vx = 0;
            this.vy = 0;
        }
    }
    drawStonePath(ctx, ox, oy) {
        ctx.beginPath();
        for (let i = 0; i < this.vertexCount; i++) {
            const angle = (i / this.vertexCount) * Math.PI * 2;
            const r = this.radius + this.shapeOffsets[i];
            const currX = ox + Math.cos(angle) * r;
            const currY = oy + Math.sin(angle) * r;
            if (i === 0) {
                ctx.moveTo(currX, currY);
            }
            else {
                ctx.lineTo(currX, currY);
            }
        }
        ctx.closePath();
    }
    draw(ctx) {
        if (this.isOut)
            return;
        if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
            return;
        }
        // 1. МЯГКАЯ ТЕНЬ ПОД КАМНЕМ
        ctx.save();
        this.drawStonePath(ctx, this.x + 5, this.y + 6);
        ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
        ctx.filter = "blur(5px)";
        ctx.fill();
        ctx.restore();
        // 2. ОСНОВНОЙ КАМЕНЬ С ТЕКСТУРОЙ
        ctx.save();
        this.drawStonePath(ctx, this.x, this.y);
        ctx.clip();
        if (stoneImg.complete && stoneImg.naturalWidth > 0) {
            const texSize = 200;
            ctx.drawImage(stoneImg, this.textureSection.sx % (stoneImg.naturalWidth - texSize), this.textureSection.sy % (stoneImg.naturalHeight - texSize), texSize, texSize, this.x - this.radius, this.y - this.radius, this.radius * 2, this.radius * 2);
        }
        else {
            ctx.fillStyle = this.color;
            ctx.fill();
        }
        // 3. ОБЪЁМ И СВЕТОТЕНЬ
        const shadowGrad = ctx.createRadialGradient(this.x - this.radius * 0.3, this.y - this.radius * 0.3, this.radius * 0.1, this.x, this.y, this.radius);
        shadowGrad.addColorStop(0, "rgba(255, 255, 255, 0.3)");
        shadowGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
        shadowGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
        ctx.fillStyle = shadowGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
    }
}
//# sourceMappingURL=stone.js.map