import { gemColor } from './gems';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  spark: boolean;
}

interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  color: string;
  size: number;
  bold: boolean;
}

interface Ring {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
}

/** 젬이 터질 때의 파티클·링·플로팅 텍스트를 모아 관리한다. */
/**
 * 파티클 상한.
 * 피버 중에는 한 번에 수십 칸이 터지므로, 상한이 없으면 파티클이 수백 개로
 * 불어나 프레임이 떨어지고 발열이 심해진다. 넘치면 오래된 것부터 버린다.
 */
const MAX_PARTICLES = 260;

export class Effects {
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];

  clear(): void {
    this.particles = [];
    this.texts = [];
    this.rings = [];
  }

  /** 아직 그릴 게 남아 있는가 — 쉬는 동안 프레임을 아끼는 데 쓴다 */
  get busy(): boolean {
    return (
      this.particles.length > 0 || this.texts.length > 0 || this.rings.length > 0
    );
  }

  /** 젬 하나가 터진 자리에 파편을 뿌린다 */
  burst(x: number, y: number, kind: number, size: number, power = 1): void {
    const style = gemColor(kind);
    const count = Math.round(10 * power);

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.6;
      // 속도 단위는 px/ms — 셀 크기에 비례시키되 계수를 작게 잡아야
      // 파편이 한 프레임 만에 화면 밖으로 날아가지 않는다
      const speed = (0.0009 + Math.random() * 0.0023) * size * power;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - size * 0.0007,
        life: 0,
        maxLife: 420 + Math.random() * 280,
        size: size * (0.08 + Math.random() * 0.1),
        color: Math.random() < 0.45 ? style.light : style.base,
        spark: Math.random() < 0.3,
      });
    }

    this.rings.push({
      x,
      y,
      life: 0,
      maxLife: 320,
      radius: size * 0.55 * power,
      color: style.glow,
    });

    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
  }

  /** 폭발 — 파편에 더해 흰 충격파 링을 얹어 일반 매치와 구분한다 */
  blast(x: number, y: number, kind: number, size: number): void {
    this.burst(x, y, kind, size, 1.6);
    this.rings.push({
      x,
      y,
      life: 0,
      maxLife: 400,
      radius: size * 0.8,
      color: 'rgba(255,238,205,0.95)',
    });
  }

  /** 점수/시간 같은 떠오르는 글자 */
  float(
    x: number,
    y: number,
    text: string,
    color: string,
    size = 20,
    bold = true,
  ): void {
    this.texts.push({
      x,
      y,
      vy: -0.028,
      life: 0,
      maxLife: 900,
      text,
      color,
      size,
      bold,
    });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.00025 * dt; // 중력
      p.vx *= Math.pow(0.995, dt); // 공기 저항 (프레임 수와 무관하게)
    }

    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life += dt;
      if (t.life >= t.maxLife) {
        this.texts.splice(i, 1);
        continue;
      }
      t.y += t.vy * dt;
      t.vy *= Math.pow(0.997, dt);
    }

    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life += dt;
      if (r.life >= r.maxLife) this.rings.splice(i, 1);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // 링 웨이브
    for (const r of this.rings) {
      const p = r.life / r.maxLife;
      ctx.globalAlpha = (1 - p) * 0.6;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = Math.max(1, r.radius * 0.18 * (1 - p));
      ctx.beginPath();
      ctx.arc(r.x, r.y, r.radius * (0.4 + p * 1.5), 0, Math.PI * 2);
      ctx.stroke();
    }

    // 파편
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = (1 - t) * (1 - t);
      ctx.fillStyle = p.color;
      if (p.spark) {
        const len = p.size * 2.2 * (1 - t);
        ctx.fillRect(p.x - len / 2, p.y - p.size * 0.18, len, p.size * 0.36);
        ctx.fillRect(p.x - p.size * 0.18, p.y - len / 2, p.size * 0.36, len);
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1 - t * 0.55), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // 떠오르는 글자
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const p = t.life / t.maxLife;
      const pop = p < 0.12 ? 1 + (0.12 - p) * 3 : 1;
      ctx.globalAlpha = p > 0.72 ? (1 - p) / 0.28 : 1;
      ctx.font = `${t.bold ? '800' : '600'} ${t.size * pop}px -apple-system, system-ui, sans-serif`;
      ctx.lineWidth = t.size * 0.24;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineJoin = 'round';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }

    ctx.restore();
  }
}
