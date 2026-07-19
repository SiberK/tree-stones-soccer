/**
 * src/stone.ts
 * 
 * Класс камня с оптимизированной отрисовкой через спрайты.
 * При старте игры генерируются спрайты камней с использованием blur(5px) для теней.
 * Затем спрайты просто копируются в нужную позицию — это очень быстро.
 */

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
	public name: string;

	private shapeOffsets: number[] = [];
	private vertexCount: number = 16;
	private textureSection: TextureSection;

	/** Спрайт камня (offscreen canvas) */
	private sprite: HTMLCanvasElement | null = null;


   constructor(x: number, y: number, radius: number, color: string, name: string = '') {
		this.x = x;
		this.y = y;
		this.startX = x;
		this.startY = y;
		this.vx = 0;
		this.vy = 0;
		this.radius = radius;
		this.color = color;
		this.isOut = false;
		this.name = name;

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

		this.vx *= FRICTION;
		this.vy *= FRICTION;

		const stopThreshold = this.radius * STOP_THRESHOLD_RATIO;
		if (Math.hypot(this.vx, this.vy) < stopThreshold) {
			this.vx = 0;
			this.vy = 0;
		}

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

	/**
	 * Рисует форму камня (неправильный многоугольник).
	 */
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

	/**
	 * Генерирует спрайт камня с использованием blur(5px) для тени.
	 * Вызывается один раз при старте игры.
	 */
	public generateSprite(): void {
		const size = this.radius * 2 + 30; // С запасом для тени
		this.sprite = document.createElement('canvas');
		this.sprite.width = size;
		this.sprite.height = size;

		const spriteCtx = this.sprite.getContext('2d')!;
		const centerX = size / 2;
		const centerY = size / 2;

		// 1. ТЕНЬ С BLUR(5px)
		spriteCtx.save();
		this.drawStonePath(spriteCtx, centerX + 5, centerY + 6);
		spriteCtx.fillStyle = "rgba(0, 0, 0, 0.35)";
		spriteCtx.filter = "blur(5px)";
		spriteCtx.fill();
		spriteCtx.restore();

		// 2. ОСНОВНОЙ КАМЕНЬ
		spriteCtx.save();
		this.drawStonePath(spriteCtx, centerX, centerY);
		spriteCtx.clip();

		// Текстура
		if (stoneImg.complete && stoneImg.naturalWidth > 0) {
			const texSize = 200;
			spriteCtx.drawImage(
				stoneImg,
				this.textureSection.sx % (stoneImg.naturalWidth - texSize),
				this.textureSection.sy % (stoneImg.naturalHeight - texSize),
				texSize,
				texSize,
				centerX - this.radius,
				centerY - this.radius,
				this.radius * 2,
				this.radius * 2
			);
		} else {
			spriteCtx.fillStyle = this.color;
			spriteCtx.fill();
		}

		// 3. ОБЪЁМ И СВЕТОТЕНЬ
		const volGrad = spriteCtx.createRadialGradient(
			centerX - this.radius * 0.3,
			centerY - this.radius * 0.3,
			this.radius * 0.1,
			centerX,
			centerY,
			this.radius
		);
		volGrad.addColorStop(0, "rgba(255, 255, 255, 0.3)");
		volGrad.addColorStop(0.5, "rgba(0, 0, 0, 0)");
		volGrad.addColorStop(1, "rgba(0, 0, 0, 0.5)");
		spriteCtx.fillStyle = volGrad;
		spriteCtx.fill();

		spriteCtx.restore();

		// 4. ОБВОДКА
		this.drawStonePath(spriteCtx, centerX, centerY);
		spriteCtx.strokeStyle = "rgba(0, 0, 0, 0.3)";
		spriteCtx.lineWidth = 1.5;
		spriteCtx.stroke();
	}

	/**
	 * Отрисовка камня через спрайт.
	 */
	public draw(ctx: CanvasRenderingContext2D): void {
		if (this.isOut) return;
		if (!Number.isFinite(this.x) || !Number.isFinite(this.y)) {
			return;
		}

		// Если спрайт ещё не создан — создаём
		if (!this.sprite) {
			this.generateSprite();
		}

		// Рисуем спрайт в текущей позиции
		const size = this.radius * 2 + 30;
		ctx.drawImage(
			this.sprite!,
			this.x - size / 2,
			this.y - size / 2
		);
	}
}