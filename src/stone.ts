import { FRICTION, STOP_THRESHOLD_RATIO } from "./state.js";

// Загрузка текстуры камня
const stoneImg = new Image();
stoneImg.src = 'assets/stone_tex.jpg';

interface TextureSection {
    sx: number;
    sy: number;
}

export class Stone {
    public x: number; 
    public y: number;
    public startX: number; 
    public startY: number;
    public vx: number; 
    public vy: number;
    public radius: number; 
    public color: string;
    public isOut: boolean;
    
    private shapeOffsets: number[] = [];
    private vertexCount: number = 16;
    private textureSection: TextureSection;

    constructor(x: number, y: number, radius: number, color: string) {
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
            this.shapeOffsets.push(
                (Math.random() - 0.5) * (radius * 0.2)
            );
        }

        this.textureSection = {
            sx: Math.random() * 300,
            sy: Math.random() * 300
        };
    }

    public update(canvasWidth: number, canvasHeight: number): void {
        if (this.isOut) return;

        this.x += this.vx; 
        this.y += this.vy;
        
        // Используем глобальную константу FRICTION
        this.vx *= FRICTION; 
        this.vy *= FRICTION;

        // Порог остановки: процент от радиуса камня
        const stopThreshold = this.radius * STOP_THRESHOLD_RATIO;
        if (Math.hypot(this.vx, this.vy) < stopThreshold) {
            this.vx = 0; 
            this.vy = 0;
        }

        // Вылет за стол (более половины камня)
        if (this.x + this.radius < 0) {
            this.isOut = true;
        }
        else if (this.x - this.radius > canvasWidth) {
            this.isOut = true;
        }
        else if (this.y + this.radius < 0) {
            this.isOut = true;
        }
        else if (this.y - this.radius > canvasHeight) {
            this.isOut = true;
        }

        if (this.isOut) {
            this.vx = 0;
            this.vy = 0;
        }
    }

    private drawStonePath(ctx: CanvasRenderingContext2D, ox: number, oy: number): void {
        ctx.beginPath();
        for (let i = 0; i < this.vertexCount; i++) {
            const angle = (i / this.vertexCount) * Math.PI * 2;
            const r = this.radius + this.shapeOffsets[i];
            const currX = ox + Math.cos(angle) * r;
            const currY = oy + Math.sin(angle) * r;
            
            if (i === 0) {
                ctx.moveTo(currX, currY);
            } else {
                ctx.lineTo(currX, currY);
            }
        }
        ctx.closePath();
    }

    public draw(ctx: CanvasRenderingContext2D): void {
        if (this.isOut) return;

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
            ctx.drawImage(
                stoneImg,
                this.textureSection.sx % (stoneImg.naturalWidth - texSize),
                this.textureSection.sy % (stoneImg.naturalHeight - texSize),
                texSize,
                texSize,
                this.x - this.radius, 
                this.y - this.radius, 
                this.radius * 2, 
                this.radius * 2
            );
        } else {
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        // 3. ОБЪЁМ И СВЕТОТЕНЬ
        const shadowGrad = ctx.createRadialGradient(
            this.x - this.radius * 0.3, 
            this.y - this.radius * 0.3, 
            this.radius * 0.1,
            this.x, 
            this.y, 
            this.radius
        );
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