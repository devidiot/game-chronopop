import { COLS, ROWS } from '../game/config';
import type { Engine } from '../game/engine';
import type { Cell, Tile } from '../game/types';
import type { Effects } from './effects';
import { clearGemCache, drawGem } from './gems';

const easeOutCubic = (p: number): number => 1 - Math.pow(1 - p, 3);

/** 가속해서 떨어지다 착지 직전 아주 살짝 파묻혔다 올라오는 곡선 */
function fallEase(p: number): number {
  if (p >= 1) return 1;
  if (p < 0.8) {
    const q = p / 0.8;
    return q * q * 1.03;
  }
  const q = (p - 0.8) / 0.2;
  return 1.03 - 0.03 * (1 - Math.pow(1 - q, 2));
}

interface TileVisual {
  row: number;
  col: number;
  scale: number;
  alpha: number;
  flash: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  /** 캔버스 한 변 길이(CSS px) */
  size = 0;
  cell = 0;
  pad = 0;
  /** 실제로 쓰는 화면 배율 */
  dpr = 1;

  /** 보드 바닥은 변하지 않으므로 한 번 그려두고 복사한다 */
  private background: HTMLCanvasElement | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D 컨텍스트를 만들 수 없습니다');
    this.ctx = ctx;
  }

  /**
   * 정사각 캔버스 크기를 CSS px 기준으로 맞춘다.
   *
   * 화면 배율은 2로 제한한다. 3배(요즘 아이폰)로 그리면 픽셀 수가 2.25배가 되어
   * 발열과 배터리 소모가 크게 늘지만, 눈으로 보이는 차이는 거의 없다.
   */
  resize(size: number): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = size;
    this.dpr = dpr;
    this.pad = size * 0.022;
    this.cell = (size - this.pad * 2) / COLS;

    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 크기가 바뀌면 미리 그려둔 그림들을 다시 만들어야 한다
    clearGemCache();
    this.buildBackground();
  }

  cellCenter(row: number, col: number): { x: number; y: number } {
    return {
      x: this.pad + (col + 0.5) * this.cell,
      y: this.pad + (row + 0.5) * this.cell,
    };
  }

  /** 캔버스 로컬 좌표 → 격자 좌표 */
  pointToCell(x: number, y: number): Cell | null {
    const col = Math.floor((x - this.pad) / this.cell);
    const row = Math.floor((y - this.pad) / this.cell);
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return null;
    return { row, col };
  }

  /** 페이즈에 따라 타일의 시각 상태를 계산한다 */
  private visualFor(engine: Engine, tile: Tile): TileVisual {
    const p = engine.progress;
    const v: TileVisual = {
      row: tile.row,
      col: tile.col,
      scale: 1,
      alpha: 1,
      flash: 0,
    };

    switch (engine.phase) {
      case 'swap':
      case 'swapback': {
        const e = easeOutCubic(p);
        v.row = tile.fromRow + (tile.row - tile.fromRow) * e;
        v.col = tile.fromCol + (tile.col - tile.fromCol) * e;
        break;
      }

      case 'clear': {
        if (tile.clearing) {
          if (p < 0.32) {
            v.scale = 1 + (p / 0.32) * 0.3;
            v.flash = p / 0.32;
          } else {
            const q = (p - 0.32) / 0.68;
            v.scale = 1.3 * (1 - q * 0.9);
            v.alpha = 1 - q;
            v.flash = 1 - q;
          }
        }
        break;
      }

      case 'fall': {
        const e = fallEase(p);
        v.row = tile.fromRow + (tile.row - tile.fromRow) * e;
        break;
      }

      case 'shuffle': {
        const e = easeOutCubic(p);
        v.scale = 0.2 + 0.8 * e;
        v.alpha = 0.15 + 0.85 * e;
        break;
      }

      case 'chance': {
        // 섞기로 바뀐 칸만 튀어나오게 해서 어디가 바뀌었는지 보이게 한다
        if (engine.chanceCells.has(`${tile.row},${tile.col}`)) {
          const e = easeOutCubic(p);
          v.scale = 0.15 + 0.85 * e;
          v.alpha = 0.2 + 0.8 * e;
          v.flash = Math.max(0, 1 - p * 1.7);
        }
        break;
      }

      default:
        break;
    }

    return v;
  }

  draw(engine: Engine, effects: Effects, now: number): void {
    const ctx = this.ctx;
    const { size } = this;

    ctx.clearRect(0, 0, size, size);
    if (this.background) ctx.drawImage(this.background, 0, 0, size, size);

    // 힌트는 두 겹으로 보여준다.
    // 바꿔야 할 두 칸은 또렷하게, 그래서 터질 칸들은 은은하게.
    const hint = engine.getHint();
    const hintSwap = new Set(
      hint ? hint.swap.map((c) => `${c.row},${c.col}`) : [],
    );
    const hintCells = new Set(
      hint ? hint.cells.map((c) => `${c.row},${c.col}`) : [],
    );
    const selected = engine.selected;

    // 보드 밖으로 떨어지는 타일이 삐져나오지 않도록 클리핑
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(
      this.pad * 0.4,
      this.pad * 0.4,
      size - this.pad * 0.8,
      size - this.pad * 0.8,
      this.cell * 0.3,
    );
    ctx.clip();

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = engine.grid[r][c];
        if (!tile) continue;

        const v = this.visualFor(engine, tile);
        const { x, y } = this.cellCenter(v.row, v.col);
        const isSelected = selected?.row === r && selected?.col === c;

        let highlight = 0;
        if (isSelected) {
          highlight = 0.65 + Math.sin(now / 130) * 0.35;
        } else if (hintSwap.has(`${r},${c}`)) {
          highlight = 0.42 + Math.sin(now / 220) * 0.3;
        } else if (hintCells.has(`${r},${c}`)) {
          highlight = 0.16 + Math.sin(now / 220) * 0.12;
        }
        // 폭탄은 그림 자체에 붉은 띠가 있으므로 은은한 후광만 더한다
        if (tile.bomb) {
          highlight = Math.max(highlight, 0.18 + Math.sin(now / 260) * 0.14);
        }

        drawGem(ctx, tile.kind, x, y, this.cell, this.dpr, {
          scale: v.scale * (isSelected ? 1.08 : 1),
          alpha: v.alpha,
          highlight: Math.max(0, highlight),
          flash: v.flash,
          bomb: tile.bomb,
        });
      }
    }

    ctx.restore();

    effects.draw(ctx);
  }

  /** 보드 바닥 — 은은한 체크무늬 홈. 한 번만 그린다. */
  private buildBackground(): void {
    const { size, pad, cell, dpr } = this;
    if (size <= 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const bg = ctx.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, 'rgba(90,130,220,0.10)');
    bg.addColorStop(0.5, 'rgba(40,60,120,0.06)');
    bg.addColorStop(1, 'rgba(160,90,220,0.10)');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, cell * 0.36);
    ctx.fill();

    const inset = cell * 0.07;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = pad + c * cell + inset;
        const y = pad + r * cell + inset;
        const s = cell - inset * 2;
        ctx.fillStyle =
          (r + c) % 2 === 0 ? 'rgba(255,255,255,0.045)' : 'rgba(255,255,255,0.02)';
        ctx.beginPath();
        ctx.roundRect(x, y, s, s, s * 0.28);
        ctx.fill();
      }
    }

    this.background = canvas;
  }
}
